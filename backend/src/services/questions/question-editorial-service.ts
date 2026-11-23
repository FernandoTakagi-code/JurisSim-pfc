import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../errors/api-error';
import { inventorySelect, hasCompleteContent, toEligibleCandidate, type InventoryRow } from '../../repositories/prisma-initial-diagnostic-repository';
import { INITIAL_DIAGNOSTIC_DISCIPLINES } from '../diagnostics/initial-diagnostic-config';
import { administrationEnabled } from '../../config/institution-feature';

type Actor = { userId: string; role: string };
const select = { ...inventorySelect, autorId: true } as const;
type Row = Prisma.QuestaoGetPayload<{ select: typeof select }>;
export const editorialWritesEnabled = () => process.env.QUESTION_EDITORIAL_WRITES_ENABLED === 'true';
export function editorialDigest(q: InventoryRow & { autorId?: string }) {
  const { id, enunciado, disciplina, assunto, nivel, fundamentacaoJuridica, turmaId, origem,
    fonteNome, fonteReferencia, licencaOuAutorizacao, situacaoDireitos, direitosVerificadosEm,
    direitosVerificadosPorId, oabExame, oabEdicao, oabTipoProva, oabNumeroQuestao, fonteOficialUrl, situacaoQuestaoOficial } = q;
  return createHash('sha256').update(JSON.stringify({ id, autorId: q.autorId, enunciado, disciplina, assunto, nivel,
    fundamentacaoJuridica, turmaId, origem, fonteNome, fonteReferencia, licencaOuAutorizacao, situacaoDireitos,
    direitosVerificadosEm, direitosVerificadosPorId, oabExame, oabEdicao, oabTipoProva, oabNumeroQuestao,
    fonteOficialUrl, situacaoQuestaoOficial,
    alternativas: [...q.alternativas].sort((a, b) => a.id.localeCompare(b.id)).map(a => ({ id: a.id, letra: a.letra, texto: a.texto, correta: a.correta })),
  })).digest('hex');
}
export function editorialIssues(q: InventoryRow): string[] {
  const issues: string[] = [];
  if (!hasCompleteContent(q)) issues.push('Conteúdo incompleto: confira enunciado, justificativa e alternativas A–D com uma única correta.');
  if (!INITIAL_DIAGNOSTIC_DISCIPLINES.includes(q.disciplina as typeof INITIAL_DIAGNOSTIC_DISCIPLINES[number])) issues.push('Disciplina fora do escopo atual de treinos do acervo.');
  if (q.turmaId) issues.push('Questão privada de turma: não pode ser liberada neste acervo global.');
  if (!['IA', 'OAB_OFICIAL'].includes(q.origem ?? '')) issues.push('Origem não habilitada para o acervo global.');
  if (!q.fonteNome?.trim() || !q.fonteReferencia?.trim() || !q.licencaOuAutorizacao?.trim()) issues.push('Fonte, referência e licença/autorização são obrigatórias.');
  if (/PENDENTE/i.test(q.licencaOuAutorizacao ?? '')) issues.push('A declaração de licença/autoria continua pendente.');
  if (q.situacaoQuestaoOficial === 'ANULADA') issues.push('Questão oficial anulada.');
  if (q.origem === 'OAB_OFICIAL') {
    if (q.situacaoQuestaoOficial !== 'VALIDA' || !['AUTORIZADA','DOMINIO_PUBLICO_VERIFICADO'].includes(q.situacaoDireitos ?? '')
      || !q.direitosVerificadosEm || !q.direitosVerificadosPorId || !q.oabExame?.trim() || !q.oabEdicao?.trim()
      || !q.oabTipoProva?.trim() || !Number.isInteger(q.oabNumeroQuestao) || (q.oabNumeroQuestao ?? 0) < 1
      || !/^https?:\/\//i.test(q.fonteOficialUrl ?? '')) issues.push('Identificação oficial e verificação de direitos precisam estar completas.');
  }
  return issues;
}
const events = { legal: 'QUESTION_LEGAL_REVIEW_RECORDED', pedagogical: 'QUESTION_PEDAGOGICAL_REVIEW_RECORDED' } as const;

export class QuestionEditorialService {
  constructor(private readonly db: PrismaClient = prisma) {}
  private async authorize(actor: Actor, write = false) {
    if (!administrationEnabled() || actor.role !== 'ADMIN') throw new ApiError(403, 'Revisão editorial exclusiva da administração habilitada.');
    const user = await this.db.user.findUnique({ where: { id: actor.userId }, select: { role: true, deletedAt: true, emailVerifiedAt: true, accountControl: { select: { suspended: true } } } });
    if (user?.role !== 'ADMIN' || user.deletedAt || !user.emailVerifiedAt || user.accountControl?.suspended) throw new ApiError(403, 'Responsável editorial indisponível.');
    if (write && !editorialWritesEnabled()) throw new ApiError(503, 'Escritas editoriais não autorizadas neste ambiente.');
  }
  async availability(actor: Actor) { await this.authorize(actor); return { writesEnabled: editorialWritesEnabled() }; }
  async list(actor: Actor, page: number, discipline?: string, search?: string) {
    await this.authorize(actor);
    const rows = await this.db.questao.findMany({ where: { turmaId: null, ...(discipline ? { disciplina: discipline } : {}), ...(search ? { OR: [{ assunto: { contains: search, mode: 'insensitive' } }, { enunciado: { contains: search, mode: 'insensitive' } }] } : {}) },
      select, orderBy: [{ disciplina: 'asc' }, { assunto: 'asc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 26 });
    return { items: rows.slice(0, 25).map(q => ({ id: q.id, discipline: q.disciplina, topic: q.assunto,
      private: !q.publica, classScoped: Boolean(q.turmaId), complete: hasCompleteContent(q),
      legalReviewed: Boolean(q.revisaoJuridicaEm && q.revisorJuridicoId), pedagogicalReviewed: Boolean(q.revisaoPedagogicaEm && q.revisorPedagogicoId),
      released: Boolean(q.liberadaAcervoEm && q.liberadaAcervoPorId), issues: editorialIssues(q) })), page, hasMore: rows.length > 25 };
  }
  async detail(actor: Actor, id: string) {
    await this.authorize(actor);
    const q = await this.db.questao.findUnique({ where: { id }, select });
    if (!q || q.turmaId) throw new ApiError(404, 'Questão não encontrada no acervo global.');
    const history = await this.db.administrativeEvent.findMany({ where: { resourceId: id, event: { startsWith: 'QUESTION_EDITORIAL_' } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 30, select: { id: true, event: true, occurredAt: true, actorId: true, result: true } });
    const reviews = await this.db.administrativeEvent.findMany({ where: { resourceId: id, event: { in: Object.values(events) } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 30, select: { id: true, event: true, occurredAt: true, actorId: true, result: true } });
    return { question: q, digest: editorialDigest(q), issues: editorialIssues(q), writesEnabled: editorialWritesEnabled(), history: [...history, ...reviews].sort((a,b) => b.occurredAt.getTime()-a.occurredAt.getTime()) };
  }
  private async mutate(actor: Actor, id: string, digest: string, work: (tx: Prisma.TransactionClient, q: Row) => Promise<void>) {
    await this.authorize(actor, true);
    try { await this.db.$transaction(async tx => {
      const responsible = await tx.user.findFirst({ where: { id: actor.userId, role: 'ADMIN', deletedAt: null, emailVerifiedAt: { not: null },
        OR: [{ accountControl: { is: null } }, { accountControl: { is: { suspended: false } } }] }, select: { id: true } });
      if (!responsible) throw new ApiError(403, 'Responsável editorial indisponível.');
      await tx.$queryRaw`SELECT id FROM "Questao" WHERE id=${id} FOR UPDATE`;
      const q = await tx.questao.findUnique({ where: { id }, select });
      if (!q || q.turmaId) throw new ApiError(404, 'Questão não encontrada no acervo global.');
      if (q.liberadaAcervoEm || q.liberadaAcervoPorId) throw new ApiError(409, 'Questão já liberada: este fluxo não altera conteúdo publicado.');
      if (editorialDigest(q) !== digest) throw new ApiError(409, 'O conteúdo mudou. Reabra a questão antes de registrar a revisão.');
      await work(tx, q);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2034'
        || (e.code === 'P2010' && ['40001','40P01'].includes(String(e.meta?.code))))) throw new ApiError(409, 'A questão foi atualizada por outra operação. Reabra antes de continuar.');
      throw e;
    }
    return { message: 'Operação editorial confirmada pelo servidor.' };
  }
  private async audit(tx: Prisma.TransactionClient, actor: Actor, id: string, event: string, data: object) {
    await tx.administrativeEvent.create({ data: { actorId: actor.userId, resourceId: id, event, result: JSON.stringify({ status: 'SUCCESS', ...data }), severity: 'INFO' } });
  }
  async metadata(actor: Actor, id: string, input: { expectedDigest: string; sourceName: string; sourceReference: string; license: string; evidenceRef: string; origin?: 'IA' | 'OAB_OFICIAL' }) {
    return this.mutate(actor, id, input.expectedDigest, async (tx, q) => {
      if (q.turmaId) throw new ApiError(409, 'Metadados de questões privadas de turma devem ser tratados no módulo responsável.');
      if (input.evidenceRef.trim().length < 8) throw new ApiError(422, 'Documente a correção de fonte e direitos.');
      if (input.sourceName === q.fonteNome && input.sourceReference === q.fonteReferencia && input.license === q.licencaOuAutorizacao && (!input.origin || input.origin === q.origem)) throw new ApiError(409, 'Metadados não foram alterados.');
      await tx.questao.update({ where: { id }, data: { fonteNome: input.sourceName, fonteReferencia: input.sourceReference, licencaOuAutorizacao: input.license,
        ...(input.origin ? { origem: input.origin } : {}),
        revisaoJuridicaEm: null, revisorJuridicoId: null, revisaoPedagogicaEm: null, revisorPedagogicoId: null } });
      await this.audit(tx, actor, id, 'QUESTION_EDITORIAL_METADATA_UPDATED', { priorDigest: input.expectedDigest,
        newDigest: editorialDigest({ ...q, fonteNome: input.sourceName, fonteReferencia: input.sourceReference, licencaOuAutorizacao: input.license, ...(input.origin ? { origem: input.origin } : {}) }),
        evidenceRef: input.evidenceRef, reviewsInvalidated: true });
    });
  }
  async review(actor: Actor, id: string, kind: 'legal' | 'pedagogical', input: { expectedDigest: string; evidenceRef: string; confirmed: true }) {
    return this.mutate(actor, id, input.expectedDigest, async (tx, q) => {
      if (input.confirmed !== true || input.evidenceRef.trim().length < 8) throw new ApiError(422, 'Confirme a revisão efetivamente realizada e sua evidência.');
      if (editorialIssues(q).length) throw new ApiError(409, 'Resolva as pendências de conteúdo, fonte e direitos antes da revisão.');
      const exists = await tx.administrativeEvent.findFirst({ where: { resourceId: id, event: events[kind] }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] });
      if (exists && (kind === 'legal' ? q.revisaoJuridicaEm : q.revisaoPedagogicaEm)) { try { if (JSON.parse(exists.result).digest === input.expectedDigest) throw new ApiError(409, 'Revisão desta versão já registrada.'); } catch (e) { if (e instanceof ApiError) throw e; } }
      await tx.questao.update({ where: { id }, data: kind === 'legal' ? { revisaoJuridicaEm: new Date(), revisorJuridicoId: actor.userId } : { revisaoPedagogicaEm: new Date(), revisorPedagogicoId: actor.userId } });
      await this.audit(tx, actor, id, events[kind], { digest: input.expectedDigest, evidenceRef: input.evidenceRef, confirmed: true });
    });
  }
  async release(actor: Actor, id: string, input: { expectedDigest: string; evidenceRef: string; consentEvidence: string; confirmed: true }) {
    return this.mutate(actor, id, input.expectedDigest, async (tx, q) => {
      if (input.confirmed !== true || input.evidenceRef.trim().length < 8 || input.consentEvidence.trim().length < 8) throw new ApiError(422, 'Confirme a liberação e documente a autorização para publicação global.');
      if (editorialIssues(q).length || !q.revisaoJuridicaEm || !q.revisorJuridicoId || !q.revisaoPedagogicaEm || !q.revisorPedagogicoId) throw new ApiError(409, 'Revisões jurídica e pedagógica válidas são obrigatórias.');
      for (const [kind, event] of Object.entries(events)) {
        const review = await tx.administrativeEvent.findFirst({ where: { resourceId: id, event }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] });
        let evidence: { digest?: string; confirmed?: boolean }; try { evidence = JSON.parse(review?.result ?? '{}'); } catch { evidence = {}; }
        const expectedReviewer = kind === 'legal' ? q.revisorJuridicoId : q.revisorPedagogicoId;
        if (!review || review.actorId !== expectedReviewer || evidence.digest !== input.expectedDigest || evidence.confirmed !== true) throw new ApiError(409, 'As revisões precisam corresponder à versão atual e possuir auditoria.');
        const reviewer = await tx.user.findUnique({ where: { id: expectedReviewer }, select: { role: true, emailVerifiedAt: true, deletedAt: true, accountControl: { select: { suspended: true } } } });
        if (reviewer?.role !== 'ADMIN' || !reviewer.emailVerifiedAt || reviewer.deletedAt || reviewer.accountControl?.suspended) throw new ApiError(409, 'Responsável pela revisão indisponível.');
      }
      const releasedAt = new Date();
      if (!toEligibleCandidate({ ...q, publica: true, liberadaAcervoEm: releasedAt, liberadaAcervoPorId: actor.userId })) throw new ApiError(409, 'A questão não atende aos critérios de elegibilidade do acervo.');
      await tx.questao.update({ where: { id }, data: { publica: true, liberadaAcervoEm: releasedAt, liberadaAcervoPorId: actor.userId } });
      await this.audit(tx, actor, id, 'QUESTION_EDITORIAL_RELEASED', { digest: input.expectedDigest, evidenceRef: input.evidenceRef, consentEvidence: input.consentEvidence });
    });
  }
}
