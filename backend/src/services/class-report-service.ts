import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';

type Actor = { userId: string; role: string };
type Tx = Prisma.TransactionClient;
// Every report uses current enrollment AND the exam's target class. Membership
// in another class never grants access to personal diagnostics or other exams.
function scope(classId: string, studentId?: string) {
  return Prisma.sql`
    WITH roster AS MATERIALIZED (
      SELECT u.id, u.nome FROM "User" u JOIN "_AlunoTurmas" m ON m."B" = u.id
      WHERE m."A" = ${classId} AND u.role = 'ALUNO' AND u."deletedAt" IS NULL
      ${studentId ? Prisma.sql`AND u.id = ${studentId}` : Prisma.empty}
    ), exams AS MATERIALIZED (
      SELECT a.id, a.titulo, a."publishedAt" FROM "Avaliacao" a
      JOIN "_AvaliacaoToTurma" t ON t."A" = a.id
      WHERE t."B" = ${classId} AND a."publishedAt" IS NOT NULL
    ), attempts AS MATERIALIZED (
      SELECT s.id, s."alunoId", s."avaliacaoId", s."iniciadoEm", s."finalizadoEm",
        (s."finalizadoEm" IS NULL AND s."tempoLimiteSegundos" IS NOT NULL
          AND s."iniciadoEm" + s."tempoLimiteSegundos" * interval '1 second' <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) AS expired,
        c.total, c.correct, c.incorrect, c.unanswered,
        CASE WHEN s."finalizadoEm" IS NOT NULL AND c.total > 0 THEN 100.0 * c.correct / c.total ELSE NULL END AS score,
        CASE WHEN s."finalizadoEm" IS NOT NULL AND c.total > 0 THEN 100.0 * c.incorrect / c.total ELSE NULL END AS error_score,
        CASE WHEN s."finalizadoEm" IS NOT NULL AND c.total > 0 THEN 100.0 * c.unanswered / c.total ELSE NULL END AS blank_score
      FROM "Simulado" s JOIN roster r ON r.id = s."alunoId" JOIN exams e ON e.id = s."avaliacaoId"
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS total, count(*) FILTER (WHERE a.correta = true)::int AS correct,
          count(*) FILTER (WHERE a.correta = false)::int AS incorrect,
          count(*) FILTER (WHERE a.id IS NULL)::int AS unanswered
        FROM "QuestaoSimulado" q LEFT JOIN "Resposta" a ON a."questaoSimuladoId" = q.id
        WHERE q."simuladoId" = s.id AND s."finalizadoEm" IS NOT NULL
      ) c ON true WHERE s.tipo = 'AVALIACAO'
    ), per_exam AS MATERIALIZED (
      SELECT e.id, e.titulo AS title, e."publishedAt", count(a.id)::int AS started,
        count(a.id) FILTER (WHERE a."finalizadoEm" IS NOT NULL)::int AS completed,
        count(a.id) FILTER (WHERE a."finalizadoEm" IS NULL AND NOT a.expired)::int AS in_progress,
        count(a.id) FILTER (WHERE a.expired)::int AS expired,
        round(avg(a.score), 2) AS mean_score, round(avg(a.error_score), 2) AS mean_error,
        round(avg(a.blank_score), 2) AS mean_blank,
        round(avg(a.correct) FILTER (WHERE a."finalizadoEm" IS NOT NULL), 2) AS mean_correct_answers,
        round(avg(a.incorrect) FILTER (WHERE a."finalizadoEm" IS NOT NULL), 2) AS mean_incorrect_answers
      FROM exams e LEFT JOIN attempts a ON a."avaliacaoId" = e.id GROUP BY e.id, e.titulo, e."publishedAt"
    )`;
}
const examJson = Prisma.sql`jsonb_build_object('id', p.id, 'title', p.title, 'publishedAt', p."publishedAt" AT TIME ZONE 'UTC',
  'started', p.started, 'completed', p.completed, 'inProgress', p.in_progress, 'expired', p.expired,
  'meanPercentage', p.mean_score, 'meanIncorrectPercentage', p.mean_error, 'meanUnansweredPercentage', p.mean_blank,
  'meanCorrectAnswers', p.mean_correct_answers, 'meanIncorrectAnswers', p.mean_incorrect_answers)`;
const totalsJson = Prisma.sql`jsonb_build_object(
  'enrolledStudents', (SELECT count(*) FROM roster), 'publishedExams', (SELECT count(*) FROM exams),
  'participants', count(DISTINCT a."alunoId"), 'startedAttempts', count(a.id),
  'completedAttempts', count(a.id) FILTER (WHERE a."finalizadoEm" IS NOT NULL),
  'inProgressAttempts', count(a.id) FILTER (WHERE a."finalizadoEm" IS NULL AND NOT a.expired),
  'expiredAttempts', count(a.id) FILTER (WHERE a.expired),
  'participationPercentage', CASE WHEN (SELECT count(*) FROM roster) > 0 AND (SELECT count(*) FROM exams) > 0
    THEN round(100.0 * count(DISTINCT a."alunoId") / (SELECT count(*) FROM roster), 2) ELSE NULL END,
  'meanPercentage', round(avg(a.score), 2), 'meanIncorrectPercentage', round(avg(a.error_score), 2),
  'meanUnansweredPercentage', round(avg(a.blank_score), 2),
  'meanCorrectAnswers', round(avg(a.correct) FILTER (WHERE a."finalizadoEm" IS NOT NULL), 2),
  'meanIncorrectAnswers', round(avg(a.incorrect) FILTER (WHERE a."finalizadoEm" IS NOT NULL), 2),
  'correctAnswers', coalesce(sum(a.correct) FILTER (WHERE a."finalizadoEm" IS NOT NULL), 0),
  'incorrectAnswers', coalesce(sum(a.incorrect) FILTER (WHERE a."finalizadoEm" IS NOT NULL), 0),
  'unansweredQuestions', coalesce(sum(a.unanswered) FILTER (WHERE a."finalizadoEm" IS NOT NULL), 0))`;

export class ClassReportService {
  async classes(actor: Actor, page: number) {
    if (!['PROFESSOR', 'ADMIN'].includes(actor.role)) throw new ApiError(403, 'Relatórios exclusivos de professores.');
    const items = await prisma.turma.findMany({ where: { professores: { some: { id: actor.userId } } },
      select: { id: true, nome: true, archivedAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21, skip: (page - 1) * 20 });
    return { items: items.slice(0, 20), page, hasMore: items.length > 20 };
  }
  private async authorize(tx: Tx, actor: Actor, classId: string) {
    if (!['PROFESSOR', 'ADMIN'].includes(actor.role)) throw new ApiError(403, 'Relatórios exclusivos de professores responsáveis pela turma.');
    const turma = await tx.turma.findFirst({ where: { id: classId, professores: { some: { id: actor.userId } } },
      select: { id: true, nome: true, archivedAt: true } });
    if (!turma) throw new ApiError(404, 'Turma indisponível para relatórios desta conta.');
    return turma;
  }
  report(actor: Actor, classId: string, page: number, examPage: number) {
    return prisma.$transaction(async tx => {
      const turma = await this.authorize(tx, actor, classId);
      const [row] = await tx.$queryRaw<{ report: Record<string, unknown> }[]>(Prisma.sql`${scope(classId)}
        SELECT jsonb_build_object('summary', (SELECT ${totalsJson} FROM attempts a),
          'exams', (SELECT coalesce(jsonb_agg(v.item ORDER BY v."publishedAt" DESC, v.id DESC), '[]'::jsonb) FROM (
            SELECT ${examJson} AS item, p."publishedAt", p.id FROM per_exam p ORDER BY p."publishedAt" DESC, p.id DESC LIMIT 21 OFFSET ${(examPage - 1) * 20}
          ) v),
          'students', (SELECT coalesce(jsonb_agg(v.item ORDER BY v.nome, v.id), '[]'::jsonb) FROM (
            SELECT r.id, r.nome, jsonb_build_object('id', r.id, 'name', r.nome, 'started', count(a.id),
              'completed', count(a.id) FILTER (WHERE a."finalizadoEm" IS NOT NULL),
              'meanPercentage', round(avg(a.score), 2)) AS item
            FROM roster r LEFT JOIN attempts a ON a."alunoId" = r.id GROUP BY r.id, r.nome
            ORDER BY r.nome, r.id LIMIT 21 OFFSET ${(page - 1) * 20}
          ) v),
          'evolution', (SELECT coalesce(jsonb_agg(v.item ORDER BY v."publishedAt", v.id), '[]'::jsonb) FROM (
            SELECT ${examJson} AS item, p."publishedAt", p.id FROM per_exam p WHERE p.mean_score IS NOT NULL
            ORDER BY p."publishedAt" DESC, p.id DESC LIMIT 30
          ) v)) AS report`);
      const students = row.report.students as unknown[], exams = row.report.exams as unknown[];
      return { turma, ...row.report, students: { items: students.slice(0, 20), page, hasMore: students.length > 20 },
        exams: { items: exams.slice(0, 20), page: examPage, hasMore: exams.length > 20 } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  individual(actor: Actor, classId: string, studentId: string, page: number) {
    return prisma.$transaction(async tx => {
      const turma = await this.authorize(tx, actor, classId);
      const student = await tx.user.findFirst({ where: { id: studentId, role: 'ALUNO', deletedAt: null,
        turmasComoAluno: { some: { id: classId } } }, select: { id: true, nome: true } });
      if (!student) throw new ApiError(404, 'Aluno não matriculado nesta turma.');
      const [row] = await tx.$queryRaw<{ report: Record<string, unknown> }[]>(Prisma.sql`${scope(classId, studentId)}
        SELECT jsonb_build_object('summary', (SELECT ${totalsJson} FROM attempts a),
          'attempts', (SELECT coalesce(jsonb_agg(v.item ORDER BY v."iniciadoEm" DESC, v.id DESC), '[]'::jsonb) FROM (
            SELECT a.id, a."iniciadoEm", jsonb_build_object('id', a.id, 'examId', e.id, 'title', e.titulo,
              'startedAt', a."iniciadoEm" AT TIME ZONE 'UTC', 'finalizedAt', a."finalizadoEm" AT TIME ZONE 'UTC',
              'status', CASE WHEN a."finalizadoEm" IS NOT NULL THEN 'COMPLETED' WHEN a.expired THEN 'EXPIRED' ELSE 'IN_PROGRESS' END,
              'percentage', round(a.score, 2), 'correctAnswers', CASE WHEN a."finalizadoEm" IS NOT NULL THEN a.correct ELSE NULL END,
              'incorrectAnswers', CASE WHEN a."finalizadoEm" IS NOT NULL THEN a.incorrect ELSE NULL END,
              'unansweredQuestions', CASE WHEN a."finalizadoEm" IS NOT NULL THEN a.unanswered ELSE NULL END) AS item
            FROM attempts a JOIN exams e ON e.id = a."avaliacaoId" ORDER BY a."iniciadoEm" DESC, a.id DESC LIMIT 21 OFFSET ${(page - 1) * 20}
          ) v),
          'evolution', (SELECT coalesce(jsonb_agg(v.item ORDER BY v."finalizadoEm", v.id), '[]'::jsonb) FROM (
            SELECT a.id, a."finalizadoEm", jsonb_build_object('id', a.id, 'title', e.titulo, 'meanPercentage', round(a.score, 2),
              'publishedAt', a."finalizadoEm" AT TIME ZONE 'UTC') AS item
            FROM attempts a JOIN exams e ON e.id = a."avaliacaoId" WHERE a.score IS NOT NULL
            ORDER BY a."finalizadoEm" DESC, a.id DESC LIMIT 30
          ) v)) AS report`);
      const attempts = row.report.attempts as unknown[];
      return { turma, student, ...row.report, attempts: { items: attempts.slice(0, 20), page, hasMore: attempts.length > 20 } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
