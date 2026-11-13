import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { isQuestionPracticeSchemaEnabled } from "../config/question-practice-feature";
import { isIndividualExamSchemaEnabled } from "../config/individual-exam-feature";
import { QuestionReviewService } from "../services/question-review-service";

export const PERFORMANCE_KINDS = [
  "diagnostic",
  "practice",
  "individual",
  "class",
  "trail",
] as const;
export type PerformanceKind = (typeof PERFORMANCE_KINDS)[number];
type Counts = {
  assigned: number;
  answered: number;
  correct: number;
  incorrect: number;
  unanswered: number;
};
type TopicRow = Counts & {
  kind: PerformanceKind;
  discipline: string;
  topic: string;
  provisional: boolean;
};
type ModalityRow = { kind: PerformanceKind; activities: number };
const empty = (): Counts => ({
  assigned: 0,
  answered: 0,
  correct: 0,
  incorrect: 0,
  unanswered: 0,
});
const add = (a: Counts, b: Counts) => {
  for (const key of Object.keys(a) as (keyof Counts)[]) a[key] += b[key];
};
const percent = (c: Counts) =>
  c.answered ? Math.round((1000 * c.correct) / c.answered) / 10 : null;
const kindSql =
  () => Prisma.sql`CASE WHEN s.tipo='DIAGNOSTICO' THEN 'diagnostic'
  WHEN s.tipo='AVALIACAO' THEN 'class'
  ${isIndividualExamSchemaEnabled() ? Prisma.sql`WHEN EXISTS (SELECT 1 FROM "SessaoSimuladoIndividual" e WHERE e."simuladoId"=s.id) THEN 'individual'` : Prisma.empty}
  ${isQuestionPracticeSchemaEnabled() ? Prisma.sql`WHEN EXISTS (SELECT 1 FROM "SessaoPratica" p WHERE p."simuladoId"=s.id) THEN 'practice'` : Prisma.empty}
  ELSE 'trail' END`;

export class StudentPerformanceRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  async summary(studentId: string, kind?: PerformanceKind) {
    // Only finished originals. No answer keys and no unfinished-exam feedback.
    const [rows, modalities] = await this.db.$transaction(
      [
        this.db.$queryRaw<TopicRow[]>(Prisma.sql`
        SELECT ${kindSql()} AS kind,
          coalesce(nullif(sq."conteudoSnapshot"->>'discipline',''),q.disciplina) AS discipline,
          coalesce(nullif(sq."conteudoSnapshot"->>'topic',''),q.assunto) AS topic,
          count(*)::int AS assigned, count(r.id)::int AS answered,
          count(*) FILTER (WHERE r.correta=true)::int AS correct,
          count(*) FILTER (WHERE r.correta=false)::int AS incorrect,
          count(*) FILTER (WHERE r.id IS NULL)::int AS unanswered,
          bool_or(sq."conteudoSnapshot"->>'provisional'='true') AS provisional
        FROM "Simulado" s JOIN "QuestaoSimulado" sq ON sq."simuladoId"=s.id
        JOIN "Questao" q ON q.id=sq."questaoId"
        LEFT JOIN "Resposta" r ON r."questaoSimuladoId"=sq.id AND r."simuladoId"=s.id AND r."questaoId"=sq."questaoId"
        WHERE s."alunoId"=${studentId} AND s."finalizadoEm" IS NOT NULL
        GROUP BY 1,2,3`),
        this.db.$queryRaw<
          ModalityRow[]
        >(Prisma.sql`SELECT ${kindSql()} AS kind, count(*)::int AS activities
        FROM "Simulado" s WHERE s."alunoId"=${studentId} AND s."finalizadoEm" IS NOT NULL GROUP BY 1`),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const reviewEnabled =
      process.env.QUESTION_REVIEW_SCHEMA_ENABLED === "true" &&
      process.env.QUESTION_REVIEW_API_ENABLED === "true";
    const reviewTopics = reviewEnabled
      ? await new QuestionReviewService(this.db).reviewTopics(studentId)
      : [];
    const reviewCounts = new Map(
      reviewTopics.map((t) => [
        JSON.stringify([t.discipline, t.topic]),
        t.count,
      ]),
    );
    const filtered = rows.filter((r) => !kind || r.kind === kind);
    const topics = new Map<
      string,
      Counts & { discipline: string; topic: string; provisional: boolean }
    >();
    const totals = empty();
    for (const row of filtered) {
      add(totals, {
        assigned: row.assigned,
        answered: row.answered,
        correct: row.correct,
        incorrect: row.incorrect,
        unanswered: row.unanswered,
      });
      const key = JSON.stringify([row.discipline, row.topic]);
      const item = topics.get(key) ?? {
        ...empty(),
        discipline: row.discipline,
        topic: row.topic,
        provisional: false,
      };
      for (const field of [
        "assigned",
        "answered",
        "correct",
        "incorrect",
        "unanswered",
      ] as const)
        item[field] += row[field];
      item.provisional ||= Boolean(row.provisional);
      topics.set(key, item);
    }
    const topicList = [...topics.values()]
      .map((t) => ({
        ...t,
        percentage: percent(t),
        reviewCount:
          reviewCounts.get(JSON.stringify([t.discipline, t.topic])) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.incorrect - a.incorrect ||
          (a.percentage ?? 101) - (b.percentage ?? 101) ||
          a.topic.localeCompare(b.topic, "pt-BR"),
      );
    const disciplines = [...new Set(topicList.map((t) => t.discipline))]
      .map((discipline) => {
        const counts = empty();
        const items = topicList.filter((t) => t.discipline === discipline);
        for (const item of items)
          add(counts, {
            assigned: item.assigned,
            answered: item.answered,
            correct: item.correct,
            incorrect: item.incorrect,
            unanswered: item.unanswered,
          });
        return { discipline, ...counts, percentage: percent(counts) };
      })
      .sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101));
    return {
      kind: kind ?? "all",
      totals: {
        ...totals,
        percentage: percent(totals),
        activities: modalities
          .filter((m) => !kind || m.kind === kind)
          .reduce((n, m) => n + m.activities, 0),
      },
      modalities: PERFORMANCE_KINDS.map((value) => ({
        kind: value,
        activities: modalities.find((m) => m.kind === value)?.activities ?? 0,
      })),
      disciplines,
      topics: topicList,
      provisional: filtered.some((r) => r.provisional),
      reviewEnabled,
    };
  }
}
