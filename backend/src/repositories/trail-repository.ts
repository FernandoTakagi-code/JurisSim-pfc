import { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '../errors/api-error';
import type { AdaptiveResult } from '../types/diagnostic';
import { lockAttempt, saveLockedAnswer } from './attempt-write';
import { prisma } from '../lib/prisma';
import type { TrailFilter } from '../types/diagnostic';

const trailAttemptDetails = {
  questoes: { orderBy: { posicao: 'asc' }, include: { questao: { include: { alternativas: true } }, resposta: true } },
} satisfies Prisma.SimuladoInclude;
type Attempt = Prisma.SimuladoGetPayload<{ include: typeof trailAttemptDetails }>;
// A generated-trail link is the positive identity of this modality. It does
// not depend on the practice flag or on the optional practice schema.
export const trailScope = { tipo: 'PERSONALIZADO', trilhaOrigem: { isNot: null } } satisfies Prisma.SimuladoWhereInput;

export class TrailRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  async findTrilha(trilhaId: string) {
    return this.db.trilhaAdaptativa.findUnique({
      where: { id: trilhaId },
      include: { simulado: { select: { alunoId: true } } },
    });
  }

  async findQuestionsForTrail(filters: TrailFilter[], quantity: number) {
    const collected: { id: string }[] = [];

    for (const filter of filters) {
      if (collected.length >= quantity) break;
      const found = await prisma.questao.findMany({
        take: quantity - collected.length,
        where: {
          publica: true,
          disciplina: filter.disciplina,
          ...(filter.assunto ? { assunto: filter.assunto } : {}),
          ...(filter.nivel ? { nivel: filter.nivel } : {}),
          id: { notIn: collected.map((question) => question.id) },
        },
        orderBy: { createdAt: 'asc' },
      });
      collected.push(...found);
    }
    return collected;
  }

  async createTrailAttempt(alunoId: string, trilhaId: string, questionIds: string[]) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT t.id FROM "TrilhaAdaptativa" t JOIN "Simulado" s ON s.id = t."simuladoId"
        WHERE t.id = ${trilhaId} AND s."alunoId" = ${alunoId} FOR UPDATE OF t`;
      if (!locked.length) throw new ApiError(404, 'Trilha adaptativa não encontrada.');
      const trail = await tx.trilhaAdaptativa.findUniqueOrThrow({ where: { id: trilhaId }, select: { simuladoGeradoId: true } });
      if (trail.simuladoGeradoId) {
        const existing = await tx.simulado.findFirst({ where: { ...trailScope, id: trail.simuladoGeradoId, alunoId }, include: trailAttemptDetails });
        if (!existing) throw new ApiError(409, 'Vínculo da trilha indisponível.');
        return existing;
      }
      if (!questionIds.length) throw new ApiError(409, 'Não há questões disponíveis para esta trilha.');
      const simulado = await tx.simulado.create({
        data: {
          tipo: 'PERSONALIZADO',
          alunoId,
          questoes: { create: questionIds.map((questaoId, index) => ({ questaoId, posicao: index + 1 })) },
        },
        include: trailAttemptDetails,
      });
      await tx.trilhaAdaptativa.update({ where: { id: trilhaId }, data: { simuladoGeradoId: simulado.id } });
      return simulado;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async findAttempt(attemptId: string) {
    return this.db.simulado.findFirst({ where: { id: attemptId, ...trailScope }, include: trailAttemptDetails });
  }

  async saveAnswer(simuladoId: string, questaoId: string, questaoSimuladoId: string, alternativaEscolhidaId: string, _correta: boolean, studentId: string) {
    return this.db.$transaction(tx => saveLockedAnswer(tx, { attemptId: simuladoId, studentId, questionId: questaoId,
      linkId: questaoSimuladoId, alternativeId: alternativaEscolhidaId, scope: trailScope }), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async finalize(attemptId: string, studentId: string, analyze: (attempt: Attempt) => AdaptiveResult) {
    return this.db.$transaction(async tx => {
      await lockAttempt(tx, attemptId, studentId);
      const attempt = await tx.simulado.findFirst({ where: { id: attemptId, alunoId: studentId, ...trailScope }, include: trailAttemptDetails });
      if (!attempt) throw new ApiError(404, 'Sessão de exercícios não encontrada.');
      if (attempt.finalizadoEm) return attempt;
      if (!attempt.questoes.some(q => q.resposta)) throw new ApiError(422, 'Responda ao menos uma questão antes de finalizar.');
      const result = analyze(attempt);
      const completed = await tx.simulado.update({ where: { id: attemptId }, data: { finalizadoEm: new Date(),
        desempenhosDiagnostico: { create: result.performances.map(p => ({ tipo: p.metricType, disciplina: p.discipline,
          assunto: p.topic, nivel: p.difficulty, acertos: p.correctAnswers, totalQuestoes: p.totalQuestions, percentual: p.percentage })) },
      }, include: trailAttemptDetails });
      await tx.user.update({ where: { id: studentId }, data: { nivelAtual: result.level } });
      return completed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
