import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { inventorySelect, inventoryWhere, toEligibleCandidate, type InventoryRow } from './prisma-initial-diagnostic-repository';
import type { PracticeAttempt, PracticeQuestion, QuestionPracticeRepository } from '../services/question-practice-service';

type SessionRow = { id: string; simuladoId: string; alunoId: string; disciplina: string; finalizadoEm: Date | null };
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

  async listEligibleQuestions(discipline: string): Promise<PracticeQuestion[]> {
    const rows = await this.db.questao.findMany({ where: { ...inventoryWhere, disciplina: discipline }, select: inventorySelect });
    return rows.flatMap(row => { const question = questionFromRow(row); return question ? [question] : []; });
  }

  async listAnsweredQuestionIds(studentId: string, discipline: string): Promise<ReadonlySet<string>> {
    const eligible = await this.db.questao.findMany({
      where: { ...inventoryWhere, disciplina: discipline }, select: { id: true },
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
    return row ? mapAttempt(row, session.disciplina) : null;
  }

  async findActiveAttempt(studentId: string, discipline: string): Promise<PracticeAttempt | null> {
    const rows = await this.db.$queryRaw<SessionRow[]>`
      SELECT p."id", p."simuladoId", p."alunoId", p."disciplina", s."finalizadoEm"
      FROM "SessaoPratica" p JOIN "Simulado" s ON s."id" = p."simuladoId" AND s."alunoId" = p."alunoId"
      WHERE p."alunoId" = ${studentId} AND p."disciplina" = ${discipline} AND s."finalizadoEm" IS NULL
      ORDER BY p."criadaEm" ASC LIMIT 1`;
    return rows[0] ? this.findAttempt(studentId, rows[0].simuladoId) : null;
  }

  async createAttempt(studentId: string, discipline: string, questions: PracticeQuestion[]): Promise<PracticeAttempt> {
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
        ORDER BY p."criadaEm" ASC LIMIT 1`;
      if (active[0]) return active[0].simuladoId;
      const simulado = await tx.simulado.create({ data: { tipo: 'PERSONALIZADO', alunoId: studentId }, select: { id: true } });
      await tx.questaoSimulado.createMany({ data: questions.map((question, index) => ({ simuladoId: simulado.id, questaoId: question.id, posicao: index + 1 })) });
      await tx.$executeRaw`
        INSERT INTO "SessaoPratica" ("id", "simuladoId", "alunoId", "disciplina", "criadaEm")
        VALUES (${sessionId}, ${simulado.id}, ${studentId}, ${discipline}, CURRENT_TIMESTAMP)`;
      return simulado.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    const created = await this.findAttempt(studentId, result);
    if (!created) throw new Error('Could not recover newly created practice attempt.');
    return created;
  }

  async saveAnswer(studentId: string, attemptId: string, questionId: string, alternativeId: string): Promise<void> {
    await this.db.$transaction(async tx => {
      const session = await tx.$queryRaw<SessionRow[]>`
        SELECT p."id", p."simuladoId", p."alunoId", p."disciplina", s."finalizadoEm"
        FROM "SessaoPratica" p JOIN "Simulado" s ON s."id" = p."simuladoId" AND s."alunoId" = p."alunoId"
        WHERE p."alunoId" = ${studentId} AND p."simuladoId" = ${attemptId} FOR UPDATE OF s`;
      if (!session[0]) throw new Error('Practice attempt not found.');
      if (session[0].finalizadoEm) throw new Error('Practice attempt already completed.');
      const link = await tx.questaoSimulado.findFirst({ where: { simuladoId: attemptId, questaoId: questionId }, select: { id: true } });
      const alternative = await tx.alternativa.findFirst({ where: { id: alternativeId, questaoId: questionId }, select: { id: true, correta: true } });
      if (!link || !alternative) throw new Error('Invalid practice answer relation.');
      await tx.resposta.upsert({
        where: { questaoSimuladoId: link.id },
        create: { simuladoId: attemptId, questaoId: questionId, questaoSimuladoId: link.id, alternativaEscolhidaId: alternative.id, correta: alternative.correta },
        update: { alternativaEscolhidaId: alternative.id, correta: alternative.correta, respondidoEm: new Date() },
      });
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
