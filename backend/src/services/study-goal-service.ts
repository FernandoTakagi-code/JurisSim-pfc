import { Prisma, type MetaDiaria } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';

export type GoalInput = { date: string; targetQuestions: number };
type Tx = Prisma.TransactionClient;
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

async function counts(tx: Tx, studentId: string, days: string[]) {
  if (!days.length) return new Map<string, number>();
  const ordered = [...new Set(days)].sort();
  const rows = await tx.$queryRaw<{ day: string; total: number }[]>(Prisma.sql`
    SELECT to_char((r."respondidoEm" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
      count(*)::int AS total
    FROM "Resposta" r JOIN "Simulado" s ON s.id = r."simuladoId"
    JOIN "QuestaoSimulado" q ON q.id = r."questaoSimuladoId" AND q."simuladoId" = s.id AND q."questaoId" = r."questaoId"
    WHERE s."alunoId" = ${studentId}
      AND r."respondidoEm" >= ((${ordered[0]}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
      AND r."respondidoEm" < (((${ordered[ordered.length - 1]}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
    GROUP BY day`);
  return new Map(rows.map(row => [row.day, row.total]));
}
function dto(goal: MetaDiaria, count: number) {
  // Completed goals retain the real count verified at completion. Pending goals
  // reflect the responses currently recorded for their calendar day.
  const resolvedQuestions = goal.cumprida ? goal.questoesResolvidas : count;
  return { id: goal.id, date: dayOf(goal.data), targetQuestions: goal.metaQuestoes,
    resolvedQuestions, completed: goal.cumprida, canComplete: !goal.cumprida && resolvedQuestions >= goal.metaQuestoes,
    progressPercentage: Math.min(100, Number((resolvedQuestions / goal.metaQuestoes * 100).toFixed(2))) };
}
async function mutate<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2034') {
        if (retry < 2) continue;
        throw new ApiError(409, 'A meta foi alterada durante a operação. Tente novamente.');
      }
      throw cause;
    }
  }
}

export class StudyGoalService {
  list(studentId: string, page: number, status?: 'pending' | 'completed') {
    return prisma.$transaction(async tx => {
      const goals = await tx.metaDiaria.findMany({ where: { alunoId: studentId, ...(status ? { cumprida: status === 'completed' } : {}) },
        orderBy: [{ data: 'desc' }, { id: 'desc' }], take: 21, skip: (page - 1) * 20 });
      const real = await counts(tx, studentId, goals.filter(goal => !goal.cumprida).map(goal => dayOf(goal.data)));
      return { items: goals.slice(0, 20).map(goal => dto(goal, real.get(dayOf(goal.data)) ?? 0)), page, hasMore: goals.length > 20,
        timezone: 'America/Sao_Paulo' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  create(studentId: string, input: GoalInput) {
    return mutate(async tx => {
      const count = (await counts(tx, studentId, [input.date])).get(input.date) ?? 0;
      return dto(await tx.metaDiaria.create({ data: { alunoId: studentId, data: new Date(input.date + 'T00:00:00.000Z'),
        metaQuestoes: input.targetQuestions, questoesResolvidas: count } }), count);
    });
  }
  private async own(tx: Tx, studentId: string, id: string) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "MetaDiaria" WHERE id = ${id} AND "alunoId" = ${studentId} FOR UPDATE`);
    const goal = await tx.metaDiaria.findFirst({ where: { id, alunoId: studentId } });
    if (!goal) throw new ApiError(404, 'Meta indisponível para esta conta.');
    return goal;
  }
  update(studentId: string, id: string, input: Partial<GoalInput>) {
    return mutate(async tx => {
      const goal = await this.own(tx, studentId, id);
      if (goal.cumprida) throw new ApiError(409, 'Metas concluídas permanecem somente para consulta.');
      const date = input.date ?? dayOf(goal.data), count = (await counts(tx, studentId, [date])).get(date) ?? 0;
      return dto(await tx.metaDiaria.update({ where: { id }, data: { data: new Date(date + 'T00:00:00.000Z'),
        metaQuestoes: input.targetQuestions ?? goal.metaQuestoes, questoesResolvidas: count } }), count);
    });
  }
  complete(studentId: string, id: string) {
    return mutate(async tx => {
      const goal = await this.own(tx, studentId, id);
      if (goal.cumprida) return dto(goal, goal.questoesResolvidas);
      const count = (await counts(tx, studentId, [dayOf(goal.data)])).get(dayOf(goal.data)) ?? 0;
      if (count < goal.metaQuestoes) throw new ApiError(409, 'A quantidade de questões registrada ainda não atingiu esta meta.');
      return dto(await tx.metaDiaria.update({ where: { id }, data: { cumprida: true, questoesResolvidas: count } }), count);
    });
  }
}
