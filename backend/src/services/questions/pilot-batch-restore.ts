import { Prisma, type PrismaClient } from '@prisma/client';
import { INITIAL_DIAGNOSTIC_DISCIPLINES } from '../diagnostics/initial-diagnostic-config';
import { inventorySelect } from '../../repositories/prisma-initial-diagnostic-repository';
import { isDraftPilotQuestion } from './draft-pilot-eligibility';
import { pilotBatchCounts } from './pilot-batch-completion';

export const PILOT_RESTORE_EVENT = 'PILOT_QUESTION_RESTORED';
const DRAFT_MARKER = 'RASCUNHO_PRATICA_EM_REVISAO\n';

type RestoreOptions = { sourceBatchId: string; targetBatchId: string; disciplines: string[]; target: number; operatorId: string };

/** Rascunhos de treino do lote de origem que podem voltar ao piloto: fora de turmas, avaliações e atividades, sem revisão jurídica. */
export function restorableWhere(sourceBatchId: string, disciplines: string[]): Prisma.QuestaoWhereInput {
  return {
    loteImportacaoId: sourceBatchId, disciplina: { in: disciplines }, origem: 'IA', turmaId: null,
    revisaoJuridicaEm: null, revisorJuridicoId: null,
    fonteReferencia: { startsWith: DRAFT_MARKER },
    avaliacoes: { none: {} }, atividades: { none: {} },
  };
}

type Tx = Prisma.TransactionClient;

async function planRestore(tx: Tx, options: RestoreOptions) {
  if (options.sourceBatchId === options.targetBatchId) throw new Error('Os lotes de origem e destino devem ser diferentes.');
  if (!Number.isInteger(options.target) || options.target < 1 || options.target > 60) throw new RangeError('Alvo por disciplina inválido.');
  for (const discipline of options.disciplines) {
    if (!(INITIAL_DIAGNOSTIC_DISCIPLINES as readonly string[]).includes(discipline)) throw new RangeError(`Disciplina fora do simulado: ${discipline}.`);
  }
  const batches = await tx.loteImportacao.findMany({ where: { id: { in: [options.sourceBatchId, options.targetBatchId] } }, select: { id: true } });
  if (batches.length !== 2) throw new Error('Lote de origem ou de destino não encontrado.');
  const current = await pilotBatchCounts(tx, options.targetBatchId, options.disciplines);
  const candidates = await tx.questao.findMany({
    where: restorableWhere(options.sourceBatchId, options.disciplines),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, disciplina: true, nivel: true, assunto: true, publica: true, revisaoPedagogicaEm: true, revisorPedagogicoId: true, liberadaAcervoEm: true, liberadaAcervoPorId: true, loteImportacaoId: true, fonteReferencia: true },
  });
  const plan = options.disciplines.map(discipline => {
    const missing = Math.max(0, options.target - (current[discipline] ?? 0));
    const available = candidates.filter(q => q.disciplina === discipline);
    return { discipline, current: current[discipline] ?? 0, available: available.length, items: available.slice(0, missing) };
  });
  return { current, plan };
}

/** Somente leitura: mostra o que seria devolvido ao piloto. */
export async function previewRestoreToPilot(db: PrismaClient, options: Omit<RestoreOptions, 'operatorId'>) {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return (await planRestore(tx, { ...options, operatorId: '' })).plan;
  });
}

/**
 * Devolve ao lote piloto ativo rascunhos de treino que foram publicados no meio da revisão editorial
 * (sem revisão jurídica). O estado anterior de cada questão fica registrado na auditoria administrativa.
 */
export async function restoreQuestionsToPilot(db: PrismaClient, options: RestoreOptions) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'PILOT_BATCH_COMPLETION:' + options.targetBatchId}))`;
    const operator = await tx.user.findFirst({ where: { id: options.operatorId, deletedAt: null }, select: { id: true, role: true } });
    if (operator?.role !== 'ADMIN') throw new Error('Responsável pela manutenção não autorizado.');
    const { plan } = await planRestore(tx, options);
    const items = plan.flatMap(p => p.items);
    for (const q of items) {
      const previous = { publica: q.publica, revisaoPedagogicaEm: q.revisaoPedagogicaEm, revisorPedagogicoId: q.revisorPedagogicoId,
        liberadaAcervoEm: q.liberadaAcervoEm, liberadaAcervoPorId: q.liberadaAcervoPorId, loteImportacaoId: q.loteImportacaoId };
      await tx.questao.update({ where: { id: q.id }, data: { publica: false, revisaoPedagogicaEm: null, revisorPedagogicoId: null,
        liberadaAcervoEm: null, liberadaAcervoPorId: null, loteImportacaoId: options.targetBatchId } });
      await tx.administrativeEvent.create({ data: { event: PILOT_RESTORE_EVENT, actorId: operator.id, resourceId: q.id,
        result: JSON.stringify({ status: 'SUCCESS', previous, targetBatchId: options.targetBatchId }) } });
    }
    if (items.length) {
      await tx.loteImportacao.update({ where: { id: options.sourceBatchId }, data: { totalQuestoes: { decrement: items.length } } });
      await tx.loteImportacao.update({ where: { id: options.targetBatchId }, data: { totalQuestoes: { increment: items.length } } });
      // Confere com a mesma regra que o simulado usa; qualquer questão recusada desfaz tudo.
      const rows = await tx.questao.findMany({ where: { id: { in: items.map(q => q.id) } }, select: inventorySelect });
      const rejected = rows.filter(row => !isDraftPilotQuestion(row as never, options.targetBatchId));
      if (rejected.length || rows.length !== items.length) throw new Error(`Verificação posterior falhou: ${rejected.length} questão(ões) não seriam aceitas pelo simulado.`);
    }
    const after = await pilotBatchCounts(tx, options.targetBatchId, options.disciplines);
    return {
      items: items.map(q => ({ id: q.id, discipline: q.disciplina, level: q.nivel, topic: q.assunto })),
      moved: Object.fromEntries(plan.map(p => [p.discipline, p.items.length])),
      before: Object.fromEntries(plan.map(p => [p.discipline, p.current])), after,
      shortfall: Object.fromEntries(plan.map(p => [p.discipline, Math.max(0, options.target - p.current - p.items.length)])),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000 });
}
