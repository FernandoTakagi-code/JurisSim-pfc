import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type ActivitySummary = {
  id: string; type: 'DIAGNOSTICO' | 'PERSONALIZADO' | 'AVALIACAO'; startedAt: Date; finalizedAt: Date | null;
  totalQuestions: number; answeredQuestions: number; correctAnswers: number | null;
  incorrectAnswers: number | null; unansweredQuestions: number; overallPercentage: number | null;
};
export type HistoryCursor = { startedAt: string; id: string };
export type StudyTotals = {
  completedActivities: number; completedDiagnostics: number; completedTrails: number; completedExams: number;
  totalQuestions: number; answeredQuestions: number; correctAnswers: number;
  incorrectAnswers: number; unansweredQuestions: number;
};

// Count only the answer belonging to each assigned question, matching the
// existing diagnostic/trail engine. No answer keys or other student's IDs leave this repository.
const counts = Prisma.sql`LEFT JOIN LATERAL (
  SELECT count(*)::int AS total, count(r.id)::int AS answered,
    count(*) FILTER (WHERE r.correta = true)::int AS correct,
    count(*) FILTER (WHERE r.correta = false)::int AS incorrect
  FROM "QuestaoSimulado" q LEFT JOIN "Resposta" r ON r."questaoSimuladoId" = q.id
  WHERE q."simuladoId" = s.id
) c ON true`;
const summary = Prisma.sql`s.id, s.tipo AS type, s."iniciadoEm" AS "startedAt", s."finalizadoEm" AS "finalizedAt",
  c.total AS "totalQuestions", c.answered AS "answeredQuestions",
  CASE WHEN s."finalizadoEm" IS NOT NULL THEN c.correct ELSE NULL END AS "correctAnswers",
  CASE WHEN s."finalizadoEm" IS NOT NULL THEN c.incorrect ELSE NULL END AS "incorrectAnswers",
  (c.total - c.answered)::int AS "unansweredQuestions",
  CASE WHEN s."finalizadoEm" IS NOT NULL AND c.total > 0
    THEN round(100.0 * c.correct / c.total, 2)::float8 ELSE NULL END AS "overallPercentage"`;

export class StudentHistoryRepository {
  async overview(studentId: string) {
    // A consistent snapshot of totals and bounded evolution, with no N+1 reads.
    const [totals, evolution, recent] = await prisma.$transaction([
      prisma.$queryRaw<StudyTotals[]>(Prisma.sql`
        SELECT count(*)::int AS "completedActivities",
          count(*) FILTER (WHERE s.tipo = 'DIAGNOSTICO')::int AS "completedDiagnostics",
          count(*) FILTER (WHERE s.tipo = 'PERSONALIZADO')::int AS "completedTrails",
          count(*) FILTER (WHERE s.tipo = 'AVALIACAO')::int AS "completedExams",
          coalesce(sum(c.total), 0)::int AS "totalQuestions",
          coalesce(sum(c.answered), 0)::int AS "answeredQuestions",
          coalesce(sum(c.correct), 0)::int AS "correctAnswers",
          coalesce(sum(c.incorrect), 0)::int AS "incorrectAnswers",
          coalesce(sum(c.total - c.answered), 0)::int AS "unansweredQuestions"
        FROM "Simulado" s ${counts} WHERE s."alunoId" = ${studentId} AND s."finalizadoEm" IS NOT NULL`),
      prisma.$queryRaw<ActivitySummary[]>(Prisma.sql`
        SELECT ${summary} FROM (
          SELECT * FROM "Simulado" WHERE "alunoId" = ${studentId} AND tipo = 'DIAGNOSTICO'
          AND "finalizadoEm" IS NOT NULL
          AND EXISTS (SELECT 1 FROM "QuestaoSimulado" q WHERE q."simuladoId" = "Simulado".id)
          ORDER BY "finalizadoEm" DESC, id DESC LIMIT 30
        ) s ${counts} ORDER BY s."finalizadoEm" DESC, s.id DESC`),
      this.historyQuery(studentId, 5),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { totals: totals[0], evolution: evolution.reverse(), recentActivities: recent,
      latestDiagnosticId: evolution[evolution.length - 1]?.id ?? null };
  }

  history(studentId: string, limit: number, cursor?: HistoryCursor, diagnosticsOnly = false) {
    return this.historyQuery(studentId, limit + 1, cursor, diagnosticsOnly);
  }

  private historyQuery(studentId: string, limit: number, cursor?: HistoryCursor, diagnosticsOnly = false) {
    return prisma.$queryRaw<ActivitySummary[]>(Prisma.sql`
      SELECT ${summary} FROM (
        SELECT * FROM "Simulado" WHERE "alunoId" = ${studentId}
        ${diagnosticsOnly ? Prisma.sql`AND tipo = 'DIAGNOSTICO'` : Prisma.empty}
        ${cursor ? Prisma.sql`AND ("iniciadoEm", id) < (${cursor.startedAt}::timestamp(3), ${cursor.id})` : Prisma.empty}
        ORDER BY "iniciadoEm" DESC, id DESC LIMIT ${limit}
      ) s ${counts} ORDER BY s."iniciadoEm" DESC, s.id DESC`);
  }
}
