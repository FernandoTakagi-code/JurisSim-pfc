import { Prisma } from '@prisma/client';
import { ApiError } from '../errors/api-error';

// Answer and completion writers take the same row lock. READ COMMITTED lets a
// waiter observe the winner after the lock is acquired, including safe retries.
export async function lockAttempt(tx: Prisma.TransactionClient, id: string, studentId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Simulado" WHERE id = ${id} AND "alunoId" = ${studentId} FOR UPDATE`;
  if (!rows.length) throw new ApiError(404, 'Tentativa indisponível para esta conta.');
}

export async function saveLockedAnswer(tx: Prisma.TransactionClient, input: {
  attemptId: string; studentId: string; questionId: string; linkId: string; alternativeId: string;
  scope: Prisma.SimuladoWhereInput;
}) {
  await lockAttempt(tx, input.attemptId, input.studentId);
  const attempt = await tx.simulado.findFirst({ where: {
    ...input.scope, id: input.attemptId, alunoId: input.studentId,
  }, select: { finalizadoEm: true } });
  if (!attempt) throw new ApiError(404, 'Modalidade de tentativa indisponível.');
  if (attempt.finalizadoEm) throw new ApiError(409, 'Esta tentativa já foi finalizada.');
  const link = await tx.questaoSimulado.findFirst({ where: {
    id: input.linkId, simuladoId: input.attemptId, questaoId: input.questionId,
  }, select: { resposta: { select: { alternativaEscolhidaId: true } } } });
  if (!link) throw new ApiError(404, 'A questão não pertence a esta tentativa.');
  const option = await tx.alternativa.findFirst({ where: { id: input.alternativeId, questaoId: input.questionId }, select: { correta: true } });
  if (!option) throw new ApiError(422, 'A alternativa não pertence a esta questão.');
  if (link.resposta) {
    if (link.resposta.alternativaEscolhidaId === input.alternativeId) return;
    throw new ApiError(409, 'Esta questão já foi respondida.');
  }
  await tx.resposta.create({ data: { simuladoId: input.attemptId, questaoId: input.questionId,
    questaoSimuladoId: input.linkId, alternativaEscolhidaId: input.alternativeId, correta: option.correta } });
}
