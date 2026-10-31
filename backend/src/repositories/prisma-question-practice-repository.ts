import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { inventorySelect, inventoryWhere, toEligibleCandidate, type InventoryRow } from './prisma-initial-diagnostic-repository';
import type { PracticeAttempt, PracticeQuestion, QuestionPracticeRepository } from '../services/question-practice-service';
import type { Level } from '../types/diagnostic';

type SessionRow = { id: string; simuladoId: string; alunoId: string; disciplina: string; assunto?: string | null; finalizadoEm: Date | null };
type AttemptRow = Prisma.SimuladoGetPayload<{ select: {
  id: true; finalizadoEm: true; questoes: { orderBy: { posicao: 'asc' }; select: {
    posicao: true; questao: { select: { id: true; disciplina: true; assunto: true; nivel: true; enunciado: true; fundamentacaoJuridica: true; alternativas: { orderBy: { letra: 'asc' }; select: { id: true; letra: true; texto: true; correta: true } } } }; resposta: { select: { alternativaEscolhidaId: true } };
  } };
} }>;

const attemptSelect = {
  id: true,
  finalizadoEm: true,
  questoes: {
    orderBy: { posicao: 'asc' as const },
    select: {
      posicao: true,
      questao: { select: {
        id: true, disciplina: true, assunto: true, nivel: true, enunciado: true,
        fundamentacaoJuridica: true,
        alternativas: { orderBy: { letra: 'asc' as const }, select: { id: true, letra: true, texto: true, correta: true } },
      } },
      resposta: { select: { alternativaEscolhidaId: true } },
    },
  },
} as const satisfies Prisma.SimuladoSelect;

function questionFromRow(row: InventoryRow): PracticeQuestion | null {
  if (!toEligibleCandidate(row)) return null;
  return {
    id: row.id, discipline: row.disciplina, topic: row.assunto, level: row.nivel,
    statement: row.enunciado, explanation: row.fundamentacaoJuridica,
    alternatives: row.alternativas.map(alternative => ({
      id: alternative.id, letter: alternative.letra!, text: alternative.texto, correct: alternative.correta,
    })),
  };
}

function mapAttempt(row: AttemptRow, discipline: string): PracticeAttempt {
  return {
    id: row.id, state: row.finalizadoEm ? 'COMPLETED' : 'IN_PROGRESS', discipline,
    questions: row.questoes.map(item => ({
      position: item.posicao,
      question: {
        id: item.questao.id, discipline: item.questao.disciplina, topic: item.questao.assunto,
        level: item.questao.nivel, statement: item.questao.enunciado,
        explanation: item.questao.fundamentacaoJuridica,
        alternatives: item.questao.alternativas.map(option => ({ id: option.id, letter: option.letra ?? '', text: option.texto, correct: option.correta })),
      },
      selectedOptionId: item.resposta?.alternativaEscolhidaId ?? null,
    })),
  };
}

export class PrismaQuestionPracticeRepository implements QuestionPracticeRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async updateLevel(studentId: string, level: Level): Promise<void> {
    await this.db.user.update({ where: { id: studentId }, data: { nivelAtual: level } });
  }

  async listEligibleQuestions(discipline: string, topic?: string | null): Promise<PracticeQuestion[]> {
    const rows = await this.db.questao.findMany({ where: { ...inventoryWhere, disciplina: discipline, ...(topic ? { assunto: topic } : {}) }, select: inventorySelect });
    return rows.flatMap(row => { const question = questionFromRow(row); return question ? [question] : []; });
  }

  async listAnsweredQuestionIds(studentId: string, discipline: string, topic?: string | null): Promise<ReadonlySet<string>> {
    const eligible = await this.db.questao.findMany({
      where: { ...inventoryWhere, disciplina: discipline, ...(topic ? { assunto: topic } : {}) }, select: { id: true },
    });
    if (!eligible.length) return new Set();
    const answers = await this.db.resposta.findMany({
      where: { simulado: { alunoId: studentId }, questaoId: { in: eligible.map(question => question.id) } },
      select: { questaoId: true }, distinct: ['questaoId'],
    });
    return new Set(answers.map(answer => answer.questaoId));
  }

  async findAttempt(studentId: string, attemptId: string): Promise<PracticeAttempt | null> {
    const session = await this.findSession(studentId, attemptId);
    if (!session) return null;
    const row = await this.db.simulado.findFirst({
      where: { id: session.simuladoId, alunoId: studentId, tipo: 'PERSONALIZADO' }, select: attemptSelect,
    });
    return row ? { ...mapAttempt(row, session.disciplina), topic: session.assunto ?? null } : null;
  }

  async findActiveAttempt(studentId: string, discipline: string, topic?: string | null): Promise<PracticeAttempt | null> {
    const rows = await this.db.$queryRaw<SessionRow[]>`
      SELECT p."id", p."simuladoId", p."alunoId", p."disciplina", p."assunto", s."finalizadoEm"
      FROM "SessaoPratica" p JOIN "Simulado" s ON s."id" = p."simuladoId" AND s."alunoId" = p."alunoId"
      WHERE p."alunoId" = ${studentId} AND p."disciplina" = ${discipline} AND s."finalizadoEm" IS NULL
        AND (${topic ?? null}::text IS NULL OR EXISTS (SELECT 1 FROM "QuestaoSimulado" q JOIN "Questao" x ON x.id=q."questaoId" WHERE q."simuladoId"=s.id AND x.assunto=${topic ?? null}))
      ORDER BY p."criadaEm" ASC LIMIT 1`;
    return rows[0] ? this.findAttempt(studentId, rows[0].simuladoId) : null;
  }

  async createAttempt(studentId: string, discipline: string, topic: string | null, questions: PracticeQuestion[]): Promise<PracticeAttempt> {
    if (!questions.length || new Set(questions.map(question => question.id)).size !== questions.length) {
      throw new Error('Practice attempt requires distinct questions.');
    }
    const sessionId = randomUUID();
    const result = await this.db.$transaction(async tx => {
      // Serialize starts per student without adding a global active-session
      // constraint; retries from concurrent POSTs converge on one attempt.
      const lockedStudent = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${studentId} FOR UPDATE`;
      if (!lockedStudent.length) throw new Error('Practice student not found.');
      const active = await tx.$queryRaw<{ simuladoId: string }[]>`
        SELECT p."simuladoId" FROM "SessaoPratica" p JOIN "Simulado" s ON s."id" = p."simuladoId" AND s."alunoId" = p."alunoId"
        WHERE p."alunoId" = ${studentId} AND p."disciplina" = ${discipline} AND s."finalizadoEm" IS NULL
          AND (${topic}::text IS NULL OR EXISTS (SELECT 1 FROM "QuestaoSimulado" q JOIN "Questao" x ON x.id=q."questaoId" WHERE q."simuladoId"=s.id AND x.assunto=${topic}))
        ORDER BY p."criadaEm" ASC LIMIT 1`;
      if (active[0]) return active[0].simuladoId;
      const simulado = await tx.simulado.create({ data: { tipo: 'PERSONALIZADO', alunoId: studentId }, select: { id: true } });
      await tx.questaoSimulado.createMany({ data: questions.map((question, index) => ({ simuladoId: simulado.id, questaoId: question.id, posicao: index + 1 })) });
      await tx.$executeRaw`
        INSERT INTO "SessaoPratica" ("id", "simuladoId", "alunoId", "disciplina", "assunto", "criadaEm")
        VALUES (${sessionId}, ${simulado.id}, ${studentId}, ${discipline}, ${topic}, CURRENT_TIMESTAMP)`;
      return simulado.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    const created = await this.findAttempt(studentId, result);
    if (!created) throw new Error('Could not recover newly created practice attempt.');
    return created;
  }

  async saveAnswer(studentId: string, attemptId: string, questionId: string, alternativeId: string) {
    return this.db.$transaction(async tx => {
      const session = await tx.$queryRaw<SessionRow[]>`
        SELECT p."id", p."simuladoId", p."alunoId", p."disciplina", s."finalizadoEm"
        FROM "SessaoPratica" p JOIN "Simulado" s ON s."id" = p."simuladoId" AND s."alunoId" = p."alunoId"
        WHERE p."alunoId" = ${studentId} AND p."simuladoId" = ${attemptId} FOR UPDATE OF s`;
      if (!session[0]) throw new Error('Practice attempt not found.');
      if (session[0].finalizadoEm) throw new Error('Practice attempt already completed.');
      const link = await tx.questaoSimulado.findFirst({ where: { simuladoId: attemptId, questaoId: questionId }, select: { id: true } });
      const alternative = await tx.alternativa.findFirst({ where: { id: alternativeId, questaoId: questionId }, select: { id: true, correta: true } });
      if (!link || !alternative) throw new Error('Invalid practice answer relation.');
      const saved = await tx.resposta.upsert({
        where: { questaoSimuladoId: link.id },
        create: { simuladoId: attemptId, questaoId: questionId, questaoSimuladoId: link.id, alternativaEscolhidaId: alternative.id, correta: alternative.correta },
        update: { alternativaEscolhidaId: alternative.id, correta: alternative.correta, respondidoEm: new Date() },
      });
      const [progress, question, totalQuestions, priorAnswers] = await Promise.all([
        tx.questaoSimulado.count({ where: { simuladoId: attemptId, resposta: { isNot: null } } }),
        tx.questao.findUnique({ where: { id: questionId }, select: { fundamentacaoJuridica: true, disciplina: true, assunto: true } }),
        tx.questaoSimulado.count({ where: { simuladoId: attemptId } }),
        tx.resposta.findMany({ where: { simulado: { alunoId: studentId }, questaoSimulado: { simuladoId: { not: attemptId } } }, orderBy: { respondidoEm: 'desc' }, take: 20,
          select: { correta: true, questao: { select: { disciplina: true, assunto: true } } } }),
      ]);
      const recent = [...priorAnswers.map(row => row.correta), saved.correta].slice(0, 10);
      const recentConsistency = recent.length >= 3 ? Number((100 * Math.max(recent.filter(Boolean).length, recent.filter(value => !value).length) / recent.length).toFixed(2)) : null;
      const topicCounts = new Map<string, { total: number; correct: number; discipline: string; topic: string }>();
      for (const row of priorAnswers) {
        const key = `${row.questao.disciplina}\u0000${row.questao.assunto}`;
        const value = topicCounts.get(key) ?? { total: 0, correct: 0, discipline: row.questao.disciplina, topic: row.questao.assunto };
        value.total++; if (row.correta) value.correct++;
        topicCounts.set(key, value);
      }
      const weak = [...topicCounts.values()].sort((a, b) => a.correct / a.total - b.correct / b.total)[0];
      return { correct: saved.correta, explanation: question?.fundamentacaoJuridica ?? '', selectedOptionId: alternativeId,
        answeredCount: progress, totalQuestions,
        consistency: recentConsistency,
        recommendation: weak ? `Próximo foco: ${weak.topic} (${weak.discipline}), com ${Number(100 * weak.correct / weak.total).toFixed(2)}% no histórico disponível.` : 'Ainda não há histórico suficiente para recomendar outro assunto.' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async finalize(studentId: string, attemptId: string): Promise<PracticeAttempt> {
    await this.db.$transaction(async tx => {
      const session = await tx.$queryRaw<SessionRow[]>`
        SELECT p."id", p."simuladoId", p."alunoId", p."disciplina", s."finalizadoEm"
        FROM "SessaoPratica" p JOIN "Simulado" s ON s."id" = p."simuladoId" AND s."alunoId" = p."alunoId"
        WHERE p."alunoId" = ${studentId} AND p."simuladoId" = ${attemptId} FOR UPDATE OF s`;
      if (!session[0]) throw new Error('Practice attempt not found.');
      if (session[0].finalizadoEm) return;
      const unanswered = await tx.questaoSimulado.count({ where: { simuladoId: attemptId, resposta: null } });
      if (unanswered !== 0) throw new Error('Practice attempt has unanswered questions.');
      await tx.simulado.updateMany({ where: { id: attemptId, alunoId: studentId, tipo: 'PERSONALIZADO', finalizadoEm: null }, data: { finalizadoEm: new Date() } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const result = await this.findAttempt(studentId, attemptId);
    if (!result) throw new Error('Practice attempt not found after finalization.');
    return result;
  }

  private async findSession(studentId: string, attemptId: string): Promise<SessionRow | null> {
    const rows = await this.db.$queryRaw<SessionRow[]>`
      SELECT p."id", p."simuladoId", p."alunoId", p."disciplina", s."finalizadoEm"
      FROM "SessaoPratica" p JOIN "Simulado" s ON s."id" = p."simuladoId" AND s."alunoId" = p."alunoId"
      WHERE p."alunoId" = ${studentId} AND p."simuladoId" = ${attemptId} LIMIT 1`;
    return rows[0] ?? null;
  }
}
