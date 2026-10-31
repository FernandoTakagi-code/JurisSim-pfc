import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isQuestionPracticeSchemaEnabled } from '../config/question-practice-feature';

export type ActivitySummary = {
  id: string; type: 'DIAGNOSTICO' | 'PERSONALIZADO' | 'AVALIACAO' | 'PRATICA'; startedAt: Date; finalizedAt: Date | null;
  totalQuestions: number; answeredQuestions: number; correctAnswers: number | null;
  incorrectAnswers: number | null; unansweredQuestions: number; overallPercentage: number | null;
};
export type HistoryCursor = { startedAt: string; id: string };
export type StudyTotals = {
  completedActivities: number; completedDiagnostics: number; completedTrails: number; completedExams: number; completedPractices: number;
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
const practiceEnabled = isQuestionPracticeSchemaEnabled;
const historyType = () => practiceEnabled()
  ? Prisma.sql`CASE WHEN EXISTS (SELECT 1 FROM "SessaoPratica" p WHERE p."simuladoId" = s.id) THEN 'PRATICA' ELSE s.tipo::text END`
  : Prisma.sql`s.tipo::text`;
const summary = () => Prisma.sql`s.id, ${historyType()} AS type, s."iniciadoEm" AS "startedAt", s."finalizadoEm" AS "finalizedAt",
  c.total AS "totalQuestions", c.answered AS "answeredQuestions",
  CASE WHEN s."finalizadoEm" IS NOT NULL THEN c.correct ELSE NULL END AS "correctAnswers",
  CASE WHEN s."finalizadoEm" IS NOT NULL THEN c.incorrect ELSE NULL END AS "incorrectAnswers",
  (c.total - c.answered)::int AS "unansweredQuestions",
  CASE WHEN s."finalizadoEm" IS NOT NULL AND c.total > 0
    THEN round(100.0 * c.correct / c.total, 2)::float8 ELSE NULL END AS "overallPercentage"`;

export class StudentHistoryRepository {
  async learningSummary(studentId: string) {
    const rows = await prisma.$queryRaw<{ discipline: string; topic: string; total: number; correct: number }[]>(Prisma.sql`
      SELECT q.disciplina AS discipline, q.assunto AS topic, count(*)::int AS total,
        count(*) FILTER (WHERE r.correta)::int AS correct
      FROM "Simulado" s JOIN "QuestaoSimulado" sq ON sq."simuladoId"=s.id
      JOIN "Questao" q ON q.id=sq."questaoId" JOIN "Resposta" r ON r."questaoSimuladoId"=sq.id
      WHERE s."alunoId"=${studentId} AND (s."finalizadoEm" IS NOT NULL OR s.tipo <> 'DIAGNOSTICO')
      GROUP BY q.disciplina, q.assunto`);
    const groups = new Map<string, { discipline: string; topic: string; total: number; correct: number }[]>();
    for (const row of rows) groups.set(row.discipline, [...(groups.get(row.discipline) ?? []), row]);
    const disciplines = [...groups].map(([discipline, items]) => {
      const total = items.reduce((sum, item) => sum + item.total, 0), correct = items.reduce((sum, item) => sum + item.correct, 0);
      return { discipline, total, correct, percentage: total ? Number((100 * correct / total).toFixed(2)) : null };
    }).sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101));
    const topics = rows.filter(row => row.total >= 3).sort((a, b) => a.correct / a.total - b.correct / b.total);
    const trails = await prisma.trilhaAdaptativa.findMany({ where: { simulado: { alunoId: studentId }, simuladoGeradoId: { not: null } },
      select: { id: true, disciplinaPrioritaria: true, assuntoPrioritario: true, simuladoGerado: { select: { id: true, finalizadoEm: true,
        _count: { select: { questoes: true } }, questoes: { select: { resposta: { select: { id: true } } } } } } }, orderBy: { id: 'desc' }, take: 50 });
    return { disciplines, priorityTopic: topics[0] ? { discipline: topics[0].discipline, topic: topics[0].topic,
      total: topics[0].total, percentage: Number((100 * topics[0].correct / topics[0].total).toFixed(2)) } : null,
      trailProgress: trails.map(trail => ({ id: trail.id, discipline: trail.disciplinaPrioritaria, topic: trail.assuntoPrioritario,
        finalizedAt: trail.simuladoGerado?.finalizadoEm ?? null, total: trail.simuladoGerado?._count.questoes ?? 0,
        answered: trail.simuladoGerado?.questoes.filter(question => question.resposta).length ?? 0,
        completed: Boolean(trail.simuladoGerado?.finalizadoEm) })) };
  }
  async overview(studentId: string) {
    // A consistent snapshot of totals and bounded evolution, with no N+1 reads.
    const [totals, evolution, recent] = await prisma.$transaction([
      prisma.$queryRaw<StudyTotals[]>(Prisma.sql`
        SELECT count(*)::int AS "completedActivities",
          count(*) FILTER (WHERE s.tipo = 'DIAGNOSTICO')::int AS "completedDiagnostics",
          count(*) FILTER (WHERE s.tipo = 'PERSONALIZADO' ${practiceEnabled() ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "SessaoPratica" p WHERE p."simuladoId" = s.id)` : Prisma.empty})::int AS "completedTrails",
          count(*) FILTER (WHERE s.tipo = 'AVALIACAO')::int AS "completedExams",
          ${practiceEnabled() ? Prisma.sql`count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "SessaoPratica" p WHERE p."simuladoId" = s.id))::int` : Prisma.sql`0::int`} AS "completedPractices",
          coalesce(sum(c.total), 0)::int AS "totalQuestions",
          coalesce(sum(c.answered), 0)::int AS "answeredQuestions",
          coalesce(sum(c.correct), 0)::int AS "correctAnswers",
          coalesce(sum(c.incorrect), 0)::int AS "incorrectAnswers",
          coalesce(sum(c.total - c.answered), 0)::int AS "unansweredQuestions"
        FROM "Simulado" s ${counts} WHERE s."alunoId" = ${studentId} AND s."finalizadoEm" IS NOT NULL`),
      prisma.$queryRaw<ActivitySummary[]>(Prisma.sql`
        SELECT ${summary()} FROM (
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
      SELECT ${summary()} FROM (
        SELECT * FROM "Simulado" WHERE "alunoId" = ${studentId}
        ${diagnosticsOnly ? Prisma.sql`AND tipo = 'DIAGNOSTICO'` : Prisma.empty}
        ${cursor ? Prisma.sql`AND ("iniciadoEm", id) < (${cursor.startedAt}::timestamp(3), ${cursor.id})` : Prisma.empty}
        ORDER BY "iniciadoEm" DESC, id DESC LIMIT ${limit}
      ) s ${counts} ORDER BY s."iniciadoEm" DESC, s.id DESC`);
  }
}
