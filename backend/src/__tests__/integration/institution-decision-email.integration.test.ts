// Runs only inside the harness-owned disposable PostgreSQL cluster.
// Never loads .env and never creates a real SMTP connection.
import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const smtp = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: smtp.createTransport } }));
import { prisma } from '../../lib/prisma';
import { assertDisposableDatabase } from './disposable-database';
import { InstitutionService } from '../../services/institution-service';
import { InstitutionDecisionEmail, decisionEmailEvent, decisionEmailTransitionEvent } from '../../services/institution-decision-email';
import { createBrevoSmtpTransport } from '../../services/brevo-email-transport';
import { institutionRequestSchema, representationDeclarationVersion } from '../../services/institution-registration-validation';
import { institutionApplication } from '../fixtures/institution-request';
import { noWebsiteDeclaration, validRegistrationNumber } from '../../institution-registration';

let ownerId: string, adminId: string, institutionId: string, email: string;
let serial = 0;
const reason = 'Decisão fictícia em PostgreSQL isolado.';
const mail = () => createBrevoSmtpTransport('smtp@example.invalid', 'isolated-not-a-real-key');
beforeAll(async () => { await assertDisposableDatabase(prisma); });
beforeEach(async () => {
  await assertDisposableDatabase(prisma);
  vi.stubEnv('INSTITUTIONS_ENABLED', 'true'); vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED', 'false'); vi.stubEnv('APP_PUBLIC_URL', 'https://app.example.invalid');
  smtp.sendMail.mockReset(); smtp.createTransport.mockReset();
  smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail });
  email = `owner-${randomUUID()}@example.invalid`;
  const owner = await prisma.user.create({ data: { nome: 'Responsável fictício', email, role: 'ALUNO', emailVerifiedAt: new Date(), registrationIntent: 'INSTITUTION' } }); ownerId = owner.id;
  const admin = await prisma.user.create({ data: { nome: 'ADMIN fictício', email: `admin-${randomUUID()}@example.invalid`, role: 'ADMIN', emailVerifiedAt: new Date() } }); adminId = admin.id;
  const base = '120000000' + String(++serial).padStart(3, '0');
  const cnpj = Array.from({ length: 100 }, (_, n) => base + String(n).padStart(2, '0')).find(validRegistrationNumber)!;
  const { noWebsite: _website, ...fields } = institutionRequestSchema.parse({ ...institutionApplication, name: `Instituição fictícia de e-mail ${randomUUID()}`, registrationNumber: cnpj });
  const institution = await prisma.institution.create({ data: { ...fields, ownerId, email, status: 'PENDING', description: noWebsiteDeclaration, representationDeclarationVersion, representationDeclaredAt: new Date() } }); institutionId = institution.id;
  smtp.sendMail.mockResolvedValue({ accepted: [email], rejected: [] });
});
afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); });
async function rootFor(status: 'ACTIVE' | 'REJECTED' = 'REJECTED') {
  await prisma.institution.update({ where: { id: institutionId }, data: { status, decisionReason: reason } });
  return prisma.administrativeEvent.create({ data: { event: decisionEmailEvent, institutionId, actorId: adminId, resourceId: institutionId, result: JSON.stringify({ state: 'PENDING', status, reason, ownerId }) } });
}
async function roots() { return prisma.administrativeEvent.findMany({ where: { institutionId, event: decisionEmailEvent } }); }
async function states(eventId: string) {
  const rows = await prisma.administrativeEvent.findMany({ where: { institutionId, resourceId: eventId, event: decisionEmailTransitionEvent } });
  return rows.map(row => JSON.parse(row.result)).sort((a, b) => a.sequence - b.sequence);
}
it('keeps the actual append-only PostgreSQL trigger enabled and rejects mutation', async () => {
  const root = await rootFor();
  const triggers = await prisma.$queryRaw<{ enabled: boolean }[]>`SELECT tgenabled <> 'D' AS enabled FROM pg_trigger WHERE tgrelid='public."AdministrativeEvent"'::regclass AND tgname='AdministrativeEvent_immutable'`;
  expect(triggers).toEqual([{ enabled: true }]);
  await expect(prisma.administrativeEvent.update({ where: { id: root.id }, data: { result: 'forbidden' } })).rejects.toThrow(/append-only/);
  await expect(prisma.administrativeEvent.delete({ where: { id: root.id } })).rejects.toThrow(/approved retention/);
  expect((await prisma.administrativeEvent.findUniqueOrThrow({ where: { id: root.id } })).result).toBe(root.result);
});
it.each(['ACTIVE', 'REJECTED'] as const)('%s automatically sends simulated Brevo SMTP only AFTER decision and reservation commits', async decision => {
  smtp.sendMail.mockImplementation(async () => {
    expect((await prisma.institution.findUniqueOrThrow({ where: { id: institutionId } })).status).toBe(decision);
    expect(await new InstitutionDecisionEmail(mail()).status(institutionId)).toMatchObject({ state: 'SENDING', canRetry: false, attempts: 1 });
    return { accepted: [email], rejected: [] };
  });
  const result = await new InstitutionService(mail()).decide({ userId: adminId, role: 'ADMIN' }, institutionId, decision, reason);
  expect(result.decisionEmail).toBe('SENT'); expect(smtp.sendMail).toHaveBeenCalledTimes(1);
  expect(smtp.sendMail.mock.calls[0][0].subject).toContain(decision === 'ACTIVE' ? 'aprovada' : 'recusada');
  const [root] = await roots(); expect(JSON.parse(root!.result).state).toBe('PENDING');
  expect((await states(root!.id)).map(s => s.state)).toEqual(['SENDING', 'SENT']);
  expect((await prisma.institutionalMembership.count({ where: { institutionId, active: true } }))).toBe(decision === 'ACTIVE' ? 1 : 0);
});
it('connection failure preserves approval, records a sanitized failure and permits explicit recovery', async () => {
  smtp.sendMail.mockRejectedValueOnce(Object.assign(new Error('secret must never enter audit'), { code: 'ECONNREFUSED' }));
  const result = await new InstitutionService(mail()).decide({ userId: adminId, role: 'ADMIN' }, institutionId, 'ACTIVE', reason);
  expect(result.decisionEmail).toBe('FAILED');
  expect((await prisma.institution.findUniqueOrThrow({ where: { id: institutionId } })).status).toBe('ACTIVE');
  const [root] = await roots(); const service = new InstitutionDecisionEmail(mail());
  expect(await service.status(institutionId)).toMatchObject({ state: 'FAILED', canRetry: true, lastError: { code: 'DELIVERY_NOT_ACCEPTED', stage: 'connect' } });
  expect(JSON.stringify(await states(root!.id))).not.toContain('secret');
  smtp.sendMail.mockResolvedValue({ accepted: [email], rejected: [] });
  expect(await service.retry(institutionId, root!.id, adminId)).toBe('SENT');
  expect(await service.status(institutionId)).toMatchObject({ state: 'SENT', attempts: 2, canRetry: false });
});
it('concurrent real PostgreSQL reservations permit only one SMTP send across service instances', async () => {
  const root = await rootFor();
  await Promise.all(Array.from({ length: 10 }, () => new InstitutionDecisionEmail(mail()).deliver(root.id)));
  expect(smtp.sendMail).toHaveBeenCalledTimes(1);
  expect((await states(root.id)).map(s => s.state)).toEqual(['SENDING', 'SENT']);
  expect((await prisma.administrativeEvent.findUniqueOrThrow({ where: { id: root.id } })).result).toBe(root.result);
});
it('concurrent recovery of a legacy PENDING event never duplicates SMTP or retry audit', async () => {
  const root = await rootFor();
  await Promise.allSettled(Array.from({ length: 10 }, () => new InstitutionDecisionEmail(mail()).retry(institutionId, root.id, adminId)));
  expect(smtp.sendMail).toHaveBeenCalledTimes(1);
  expect(await prisma.administrativeEvent.count({ where: { institutionId, resourceId: root.id, event: 'INSTITUTION_DECISION_EMAIL_RETRY_REQUESTED' } })).toBe(1);
});
it('indeterminate SMTP result is auditable and blocks any repeated send', async () => {
  const root = await rootFor(); smtp.sendMail.mockRejectedValue(Object.assign(new Error('unknown after DATA'), { command: 'DATA' }));
  const service = new InstitutionDecisionEmail(mail()); expect(await service.deliver(root.id)).toBe('UNKNOWN');
  expect(await service.status(institutionId)).toMatchObject({ state: 'UNKNOWN', canRetry: false });
  await expect(service.retry(institutionId, root.id, adminId)).rejects.toMatchObject({ statusCode: 409 });
  await service.deliver(root.id); expect(smtp.sendMail).toHaveBeenCalledTimes(1);
});
it('status queries are read-only and never start recovery of a pending event', async () => {
  const root = await rootFor(); const service = new InstitutionDecisionEmail(mail());
  expect(await service.status(institutionId)).toMatchObject({ id: root.id, state: 'PENDING', attempts: 0, canRetry: true });
  expect(await states(root.id)).toEqual([]); expect(smtp.sendMail).not.toHaveBeenCalled();
});
