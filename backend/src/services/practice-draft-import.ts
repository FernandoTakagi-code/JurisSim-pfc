import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { criarQuestaoSchema, alternativaSchema } from '../schemas/questao-schemas';
import { fingerprintQuestionContent } from './question-fingerprint';

const pendingReview = z.object({ reviewerId: z.null(), reviewedAt: z.null(), evidenceRef: z.null(), status: z.literal('PENDENTE') }).strict();
const questionSchema = criarQuestaoSchema.extend({
  _draftSlot: z.string().regex(/^TRE-(CON|CIV|PEN|ADM|TRA)-\d{2}$/),
  status: z.literal('RASCUNHO_PENDENTE_REVISAO_HUMANA'), eligibleForImport: z.literal(false),
  origem: z.literal('IA'), turmaId: z.null(), habilidade: z.string().min(1), justificativaNivel: z.string().min(1),
  gabarito: z.enum(['A', 'B', 'C', 'D']),
  alternativas: z.array(alternativaSchema.extend({ letra: z.enum(['A', 'B', 'C', 'D']), comentario: z.string().min(1) })).length(4),
  source: z.object({ name: z.string().min(1), licenseOrAuthorization: z.string().min(1), reference: z.array(z.object({ name: z.string().min(1), article: z.string().min(1), url: z.url(), consultedOn: z.iso.date() })).min(1) }),
  legalReview: pendingReview, pedagogicalReview: pendingReview,
  release: z.object({ releasedById: z.null(), releasedAt: z.null(), evidenceRef: z.null(), status: z.literal('PENDENTE') }).strict(),
  preliminaryReview: z.object({ humanApproval: z.literal(false) }).passthrough(),
});
const batchSchema = z.object({
  _draftMetadata: z.object({ eligibleForImport: z.literal(false), importCompatible: z.literal(false), purpose: z.literal('RASCUNHOS_PARA_PRATICA_E_SIMULADOS_INDIVIDUAIS'), publicationStatus: z.literal('NAO_PUBLICADO') }).passthrough(),
  questions: z.array(questionSchema).length(60),
});
const normalized = (value: string) => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('pt-BR');

export function preparePracticeDraftImport(input: unknown) {
  const batch = batchSchema.parse(input);
  for (const q of batch.questions) {
    // Keep the shared CRUD's alternative validation, including normalized duplicates.
    criarQuestaoSchema.parse({ ...q, turmaId: undefined });
    if (q.alternativas.map(a => a.letra).join('') !== 'ABCD' || q.alternativas.find(a => a.correta)?.letra !== q.gabarito) throw new Error('Gabarito ou letras inconsistentes.');
  }
  if (new Set(batch.questions.map(q => q._draftSlot)).size !== 60 || new Set(batch.questions.map(q => normalized(q.enunciado))).size !== 60) throw new Error('Rascunhos duplicados.');
  const fingerprints = batch.questions.map(fingerprintQuestionContent);
  const hash = createHash('sha256').update('JURISSIM_PRACTICE_DRAFT_V1\0').update(JSON.stringify(batch)).digest('hex');
  return { batch, fingerprints, hash };
}

/** Maintenance import only. Private storage is intentionally separate from release. */
export async function importPracticeDrafts(db: PrismaClient, input: unknown, operatorId: string) {
  const { batch, fingerprints, hash } = preparePracticeDraftImport(input);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hash}))`;
    const operator = await tx.user.findFirst({ where: { id: operatorId, deletedAt: null }, select: { id: true, role: true } });
    if (operator?.role !== 'ADMIN') throw new Error('Responsável pela manutenção não autorizado.');
    const existing = await tx.loteImportacao.findFirst({ where: { arquivoHash: hash }, include: { questoes: { select: { id: true, fingerprint: true } } } });
    if (existing) {
      if (existing.questoes.length !== 60 || new Set(existing.questoes.map(q => q.fingerprint)).size !== 60 || existing.questoes.some(q => !q.fingerprint || !fingerprints.includes(q.fingerprint))) throw new Error('Lote existente inconsistente.');
      return { batchId: existing.id, imported: 0, recovered: true, questionIds: existing.questoes.map(q => q.id) };
    }
    const statements = await tx.questao.findMany({ select: { enunciado: true, fingerprint: true } });
    const existingStatements = new Set(statements.map(q => normalized(q.enunciado)));
    if (statements.some(q => q.fingerprint && fingerprints.includes(q.fingerprint)) || batch.questions.some(q => existingStatements.has(normalized(q.enunciado)))) throw new Error('Conteúdo já existente; nenhum registro será sobrescrito.');
    const record = await tx.loteImportacao.create({ data: { administradorId: operator.id, arquivoHash: hash, totalQuestoes: 60 }, select: { id: true } });
    const questionIds: string[] = [];
    for (const [index, q] of batch.questions.entries()) {
      const item = await tx.questao.create({ data: {
        enunciado: q.enunciado, disciplina: q.disciplina, assunto: q.assunto, nivel: q.nivel,
        fundamentacaoJuridica: q.fundamentacaoJuridica, origem: 'IA', publica: false, turmaId: null, autorId: operator.id,
        fingerprint: fingerprints[index], loteImportacaoId: record.id, fonteNome: q.source.name,
        fonteReferencia: `RASCUNHO_PRATICA_EM_REVISAO\n${JSON.stringify({ draftId: q._draftSlot, reference: q.source.reference, habilidade: q.habilidade, justificativaNivel: q.justificativaNivel, comentarios: q.alternativas.map(a => ({ letra: a.letra, comentario: a.comentario })), preliminaryReview: q.preliminaryReview })}`,
        licencaOuAutorizacao: q.source.licenseOrAuthorization,
        alternativas: { create: q.alternativas.map(({ letra, texto, correta }) => ({ letra, texto, correta })) },
      }, select: { id: true } });
      questionIds.push(item.id);
      await tx.auditLog.create({ data: { userId: operator.id, action: 'QUESTAO_CRIADA', resourceId: item.id } });
    }
    return { batchId: record.id, imported: 60, recovered: false, questionIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 });
}
