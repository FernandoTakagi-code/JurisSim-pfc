import { Prisma, type PrismaClient } from '@prisma/client';
import { INITIAL_DIAGNOSTIC_DISCIPLINES } from '../diagnostics/initial-diagnostic-config';
import { draftPilotInventoryWhere } from './draft-pilot-eligibility';
import {
  normalizedStatement, practiceDraftQuestionData, preparePracticeDraftImport, type PracticeDraftQuestion,
} from './practice-draft-import';

export type CompletionItem = { question: PracticeDraftQuestion; fingerprint: string };
export type CompletionPlan = { discipline: string; current: number; items: CompletionItem[] }[];
type PlanInput = {
  current: Record<string, number>;
  existingFingerprints: ReadonlySet<string>;
  existingStatements: ReadonlySet<string>;
  disciplines: string[];
  target: number;
};

/**
 * Escolhe rascunhos de treino para completar o lote piloto até `target` questões por disciplina.
 * Só usa rascunhos cujo conteúdo ainda não está no banco; falta de rascunho recusa o plano inteiro.
 */
export function planPilotBatchCompletion(draftFiles: unknown[], input: PlanInput): CompletionPlan {
  if (!Number.isInteger(input.target) || input.target < 1 || input.target > 60) throw new RangeError('Alvo por disciplina inválido.');
  for (const discipline of input.disciplines) {
    if (!(INITIAL_DIAGNOSTIC_DISCIPLINES as readonly string[]).includes(discipline)) throw new RangeError(`Disciplina fora do simulado: ${discipline}.`);
  }
  const statements = new Set([...input.existingStatements].map(normalizedStatement));
  const pool: CompletionItem[] = [];
  const seen = new Set<string>();
  for (const file of draftFiles) {
    const { batch, fingerprints } = preparePracticeDraftImport(file);
    batch.questions.forEach((question, index) => {
      const fingerprint = fingerprints[index];
      if (seen.has(fingerprint) || input.existingFingerprints.has(fingerprint) || statements.has(normalizedStatement(question.enunciado))) return;
      seen.add(fingerprint);
      pool.push({ question, fingerprint });
    });
  }
  return input.disciplines.map(discipline => {
    const current = input.current[discipline] ?? 0;
    const missing = Math.max(0, input.target - current);
    const available = pool.filter(item => item.question.disciplina === discipline);
    if (available.length < missing) throw new Error(`Rascunhos insuficientes em ${discipline}: faltam ${missing}, disponíveis ${available.length}.`);
    return { discipline, current, items: available.slice(0, missing) };
  });
}

/** Conta as questões do lote que o simulado individual realmente aceita (mesmo filtro do piloto). */
export async function pilotBatchCounts(db: Pick<PrismaClient, 'questao'>, batchId: string, disciplines: string[]) {
  const counts: Record<string, number> = {};
  for (const discipline of disciplines) {
    counts[discipline] = await db.questao.count({ where: { ...draftPilotInventoryWhere(batchId), disciplina: discipline } });
  }
  return counts;
}

/** Acrescenta ao lote piloto ativo os rascunhos que faltam, em uma única transação. Nada é publicado ou aprovado. */
export async function completePilotBatch(db: PrismaClient, draftFiles: unknown[], options: { batchId: string; operatorId: string; disciplines: string[]; target: number }) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'PILOT_BATCH_COMPLETION:' + options.batchId}))`;
    const operator = await tx.user.findFirst({ where: { id: options.operatorId, deletedAt: null }, select: { id: true, role: true } });
    if (operator?.role !== 'ADMIN') throw new Error('Responsável pela manutenção não autorizado.');
    const batch = await tx.loteImportacao.findUnique({ where: { id: options.batchId }, select: { id: true, totalQuestoes: true } });
    if (!batch) throw new Error('Lote piloto não encontrado.');
    const existing = await tx.questao.findMany({ select: { enunciado: true, fingerprint: true } });
    const plan = planPilotBatchCompletion(draftFiles, {
      current: await pilotBatchCounts(tx, options.batchId, options.disciplines),
      existingFingerprints: new Set(existing.flatMap(q => q.fingerprint ? [q.fingerprint] : [])),
      existingStatements: new Set(existing.map(q => q.enunciado)),
      disciplines: options.disciplines, target: options.target,
    });
    const created: { discipline: string; draftId: string; id: string }[] = [];
    for (const { discipline, items } of plan) {
      for (const { question, fingerprint } of items) {
        const row = await tx.questao.create({ data: practiceDraftQuestionData(question, fingerprint, options.batchId, operator.id), select: { id: true } });
        await tx.auditLog.create({ data: { userId: operator.id, action: 'QUESTAO_CRIADA', resourceId: row.id } });
        created.push({ discipline, draftId: question._draftSlot, id: row.id });
      }
    }
    if (created.length) await tx.loteImportacao.update({ where: { id: batch.id }, data: { totalQuestoes: batch.totalQuestoes + created.length } });
    const after = await pilotBatchCounts(tx, options.batchId, options.disciplines);
    for (const discipline of options.disciplines) {
      if (after[discipline] < options.target) throw new Error(`Verificação posterior falhou em ${discipline}: ${after[discipline]} de ${options.target}.`);
    }
    return { batchId: batch.id, added: created.length, created, before: Object.fromEntries(plan.map(p => [p.discipline, p.current])), after };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 });
}
