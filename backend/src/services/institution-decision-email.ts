import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';
import { createBrevoEmailTransport, type TransactionalEmailTransport } from './brevo-email-transport';
import { escapeMail } from './email-html';
import { isValidAppUrl } from './app-url';
import { classifyEmailDeliveryFailure } from './email-delivery-failure';
import { assertRestrictedInstitution } from '../config/institution-homologation';
import { emailFrontendUrl } from './email-frontend';

export const decisionEmailEvent = 'INSTITUTION_DECISION_EMAIL';
export const decisionEmailTransitionEvent = 'INSTITUTION_DECISION_EMAIL_TRANSITION';
type State = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN' | 'CANCELLED';
type Delivery = { state: State; status: 'ACTIVE' | 'REJECTED'; reason: string; ownerId: string };
type Failure = { code: 'TRANSPORT_UNAVAILABLE' | 'INVALID_APP_URL' | 'DELIVERY_NOT_ACCEPTED' | 'DELIVERY_INDETERMINATE'; stage: string };
type Transition = { version: 1; sequence: number; attempt: number; state: State; at: string; smtpAttempted: boolean; error?: Failure };
type Projection = { state: State; sequence: number; attempts: number; lastAttemptAt?: string; lastError?: Failure; startedAt?: string; finishedAt?: string };
type Reader = Pick<Prisma.TransactionClient, 'administrativeEvent'>;
const states: State[] = ['PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN', 'CANCELLED'];
const failureCodes = ['TRANSPORT_UNAVAILABLE', 'INVALID_APP_URL', 'DELIVERY_NOT_ACCEPTED', 'DELIVERY_INDETERMINATE'];
const failureStages = ['configuration', 'dns', 'connect', 'greeting', 'starttls', 'authentication', 'smtp', 'request_deadline', 'provider', 'provider_limit', 'unknown'];

function payload(value: string): Delivery | null {
  try {
    const data = JSON.parse(value);
    return states.includes(data.state) && ['ACTIVE', 'REJECTED'].includes(data.status) && typeof data.reason === 'string' && typeof data.ownerId === 'string' ? data : null;
  } catch { return null; }
}

// Sequence, not timestamp/UUID ordering, defines the append-only state stream.
async function project(client: Reader, event: { id: string; institutionId: string | null }, root: Delivery): Promise<Projection> {
  const rows = await client.administrativeEvent.findMany({
    where: { event: decisionEmailTransitionEvent, institutionId: event.institutionId, resourceId: event.id },
    select: { result: true }, take: 1001,
  });
  const unknown: Projection = { state: 'UNKNOWN', sequence: 0, attempts: 0 };
  if (rows.length > 1000) return unknown;
  let transitions: Transition[];
  try {
    transitions = rows.map(row => JSON.parse(row.result));
    if (transitions.some(t => t.version !== 1 || !Number.isSafeInteger(t.sequence) || t.sequence < 1 || !Number.isSafeInteger(t.attempt) || t.attempt < 1 || !states.includes(t.state) || !Number.isFinite(Date.parse(t.at)) || typeof t.smtpAttempted !== 'boolean' || (t.error && (!failureCodes.includes(t.error.code) || !failureStages.includes(t.error.stage))))) return unknown;
  } catch { return unknown; }
  transitions.sort((a, b) => a.sequence - b.sequence);
  let result: Projection = { state: root.state, sequence: 0, attempts: 0 };
  for (const t of transitions) {
    const claim = ['PENDING', 'FAILED'].includes(result.state) && t.attempt === result.attempts + 1 && ['SENDING', 'FAILED', 'CANCELLED'].includes(t.state);
    const completion = result.state === 'SENDING' && t.attempt === result.attempts && ['SENT', 'FAILED', 'UNKNOWN'].includes(t.state);
    if (t.sequence !== result.sequence + 1 || (!claim && !completion)) return unknown;
    result = { state: t.state, sequence: t.sequence, attempts: t.attempt,
      lastAttemptAt: claim ? t.at : result.lastAttemptAt,
      startedAt: claim ? (t.state === 'SENDING' ? t.at : undefined) : result.startedAt,
      finishedAt: t.state === 'SENDING' ? undefined : t.at, lastError: t.error ? { code: t.error.code, stage: t.error.stage } : undefined };
  }
  return result;
}

// The same lock protects EVERY reservation/completion. SMTP is outside the tx.
async function locked<T>(eventId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(710915, hashtext(${eventId}))`;
    return work(tx);
  }, { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 10000 });
}

async function append(tx: Prisma.TransactionClient, event: { id: string; institutionId: string | null; actorId: string | null }, transition: Transition) {
  await tx.administrativeEvent.create({ data: {
    event: decisionEmailTransitionEvent, actorId: event.actorId, institutionId: event.institutionId,
    resourceId: event.id, result: JSON.stringify(transition), severity: transition.state === 'UNKNOWN' ? 'WARN' : 'INFO',
  } });
}

export class InstitutionDecisionEmail {
  constructor(private readonly mail: TransactionalEmailTransport = createBrevoEmailTransport()) {}

  async status(institutionId: string) {
    assertRestrictedInstitution(institutionId);
    const event = await prisma.administrativeEvent.findFirst({ where: { institutionId, event: decisionEmailEvent }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], select: { id: true, result: true, institutionId: true } });
    const data = event && payload(event.result);
    if (!event || !data) return { id: event?.id, state: 'NOT_QUEUED', canRetry: false, attempts: 0 };
    const current = await project(prisma, event, data);
    return { id: event.id, ...current, canRetry: current.state === 'PENDING' || current.state === 'FAILED' };
  }

  async deliver(eventId: string, retry = false, manual?: { institutionId: string; actorId: string }): Promise<string> {
    const claim = await locked(eventId, async tx => {
      const event = await tx.administrativeEvent.findUnique({ where: { id: eventId } });
      const data = event && payload(event.result);
      if (!event || event.event !== decisionEmailEvent || !data || !event.institutionId) {
        if (manual) throw new ApiError(409, 'Notificação indisponível.');
        return { state: 'NOT_QUEUED' };
      }
      assertRestrictedInstitution(event.institutionId);
      if (manual && event.institutionId !== manual.institutionId) throw new ApiError(403, 'Notificação não autorizada.');
      const current = await project(tx, event, data);
      if (current.state !== 'PENDING' && !(retry && current.state === 'FAILED')) {
        if (manual) throw new ApiError(409, 'Envio confirmado, em andamento, indeterminado ou cancelado. Não é seguro reenviar.');
        return { state: current.state };
      }
      const latest = await tx.administrativeEvent.findFirst({ where: { institutionId: event.institutionId, event: decisionEmailEvent }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], select: { id: true } });
      if (manual && latest?.id !== event.id) throw new ApiError(409, 'A decisão foi substituída. Consulte a notificação atual.');
      const institution = await tx.institution.findUnique({ where: { id: event.institutionId }, select: { name: true, status: true, ownerId: true, decisionReason: true } });
      const owner = institution && await tx.user.findUnique({ where: { id: institution.ownerId }, select: { email: true, emailVerifiedAt: true, deletedAt: true } });
      const cancelled = latest?.id !== event.id || !institution || institution.ownerId !== data.ownerId || institution.status !== data.status || institution.decisionReason !== data.reason || !owner?.emailVerifiedAt || !!owner.deletedAt;
      const publicAppUrl=emailFrontendUrl();
      const error: Failure | undefined = cancelled ? undefined : !this.mail.isConfigured ? { code: 'TRANSPORT_UNAVAILABLE', stage: 'configuration' } : !isValidAppUrl(publicAppUrl) ? { code: 'INVALID_APP_URL', stage: 'configuration' } : undefined;
      const state: State = cancelled ? 'CANCELLED' : error ? 'FAILED' : 'SENDING';
      const transition: Transition = { version: 1, sequence: current.sequence + 1, attempt: current.attempts + 1, state, at: new Date().toISOString(), smtpAttempted: false, ...(error ? { error } : {}) };
      if (manual) await tx.administrativeEvent.create({ data: { event: 'INSTITUTION_DECISION_EMAIL_RETRY_REQUESTED', actorId: manual.actorId, institutionId: event.institutionId, resourceId: event.id, result: 'SUCCESS' } });
      await append(tx, event, transition);
      return { state, event, data, institution, owner, transition, appUrl: publicAppUrl };
    }).catch(cause => {
      if (!(cause instanceof ApiError)) console.warn('email.institution.reservation_failed', { deliveryId: eventId, stage: 'reservation', smtpAttempted: false });
      throw cause;
    });
    if (!('event' in claim) || !claim.event || !claim.data || !claim.transition || claim.state !== 'SENDING') return claim.state;
    const { event, data, institution, owner, transition, appUrl } = claim;
    let state: State = 'SENT';
    let error: Failure | undefined;
    try {
      const approved = data.status === 'ACTIVE';
      const title = approved ? 'Solicitação institucional aprovada' : 'Solicitação institucional recusada';
      const explanation = approved ? 'Seu cadastro foi aprovado. O painel depende de vínculo ativo e da disponibilidade institucional autorizada.' : 'Sua solicitação foi recusada. Consulte a justificativa e acompanhe as orientações na sua área institucional.';
      const url = appUrl!.replace(/\/$/, '') + '/instituicoes';
      await this.mail.send({ to: owner!.email, subject: `JurisSim — ${title}`, text: `${title}\n${institution!.name}\n${explanation}\nJustificativa: ${data.reason}\nAcompanhamento: ${url}\nNão compartilhe sua senha.`, html: `<div style="font-family:Arial,sans-serif;color:#18263a;max-width:600px;margin:auto"><header style="background:#101d31;color:#e5b65b;padding:24px;font-size:24px">JurisSim · Educação Jurídica</header><main style="padding:24px"><h1>${escapeMail(title)}</h1><h2>${escapeMail(institution!.name)}</h2><p>${escapeMail(explanation)}</p><h3>Justificativa administrativa</h3><p style="white-space:pre-wrap">${escapeMail(data.reason)}</p><p><a href="${escapeMail(url)}">Acompanhar solicitação</a></p><p>O cadastro não concede privilégios de administrador geral. Nunca solicitamos sua senha por e-mail.</p></main></div>` });
    } catch (cause) {
      const failure = classifyEmailDeliveryFailure(cause);
      state = failure.outcome === 'not_accepted' ? 'FAILED' : 'UNKNOWN';
      error = { code: state === 'FAILED' ? 'DELIVERY_NOT_ACCEPTED' : 'DELIVERY_INDETERMINATE', stage: failureStages.includes(failure.stage) ? failure.stage : 'unknown' };
    }
    try {
      await locked(event.id, async tx => {
        const current = await project(tx, event, data);
        if (current.state !== 'SENDING' || current.sequence !== transition.sequence || current.attempts !== transition.attempt) throw new Error('Delivery reservation changed.');
        await append(tx, event, { ...transition, sequence: current.sequence + 1, state, at: new Date().toISOString(), smtpAttempted: true, ...(error ? { error } : {}) });
      });
    } catch {
      // A failed final append leaves durable SENDING. Never resend blindly.
      console.warn('email.institution.result_persistence_failed', { deliveryId: event.id, stage: 'result_persistence', outcome: 'indeterminate' });
      return 'UNKNOWN';
    }
    return state;
  }

  async retry(institutionId: string, eventId: string, actorId: string) {
    assertRestrictedInstitution(institutionId);
    return this.deliver(eventId, true, { institutionId, actorId });
  }
}
