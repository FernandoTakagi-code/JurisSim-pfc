import { Prisma, TipoMetricaDiagnostico } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdaptiveResult } from '../types/diagnostic';

const attemptDetails = {
  questoes: { orderBy: { posicao: 'asc' }, include: { questao: { include: { alternativas: true } }, resposta: true } },
  desempenhosDiagnostico: true,
  trilhaAdaptativa: true,
} satisfies Prisma.SimuladoInclude;

export class DiagnosticRepository {
  async findStudent(studentId: string) {
    return prisma.user.findUnique({ where: { id: studentId }, select: { id: true } });
  }

  async findQuestionsForDiagnostic(quantity: number) {
    return prisma.questao.findMany({ take: quantity, where: { publica: true }, orderBy: { createdAt: 'asc' } });
  }

  async createAttempt(studentId: string, questionIds: string[]) {
    return prisma.simulado.create({
      data: {
        tipo: 'DIAGNOSTICO', alunoId: studentId,
        questoes: { create: questionIds.map((questaoId, index) => ({ questaoId, posicao: index + 1 })) },
      },
      include: attemptDetails,
    });
  }

  async findAttempt(attemptId: string) {
    return prisma.simulado.findFirst({ where: { id: attemptId, tipo: 'DIAGNOSTICO' }, include: attemptDetails });
  }

  async saveAnswer(simuladoId: string, questaoId: string, questaoSimuladoId: string, alternativaEscolhidaId: string, correta: boolean) {
    return prisma.resposta.create({ data: { simuladoId, questaoId, questaoSimuladoId, alternativaEscolhidaId, correta } });
  }

  async finalize(attemptId: string, result: AdaptiveResult) {
    const markedAsFinalized = await prisma.simulado.updateMany({
      where: { id: attemptId, tipo: 'DIAGNOSTICO', finalizadoEm: null },
      data: { finalizadoEm: new Date() },
    });
    if (markedAsFinalized.count === 0) return null;

    return prisma.simulado.update({
      where: { id: attemptId },
      data: {
        desempenhosDiagnostico: {
          create: result.performances.map((performance) => ({
            tipo: performance.metricType as TipoMetricaDiagnostico,
            disciplina: performance.discipline,
            assunto: performance.topic,
            nivel: performance.difficulty,
            acertos: performance.correctAnswers,
            totalQuestoes: performance.totalQuestions,
            percentual: performance.percentage,
          })),
        },
        trilhaAdaptativa: {
          create: {
            disciplinaPrioritaria: result.trail.priorityDiscipline,
            assuntoPrioritario: result.trail.priorityTopic,
            nivelRecomendado: result.trail.recommendedLevel,
            quantidadeRecomendada: result.trail.recommendedQuantity,
            justificativa: result.trail.reason,
          },
        },
      },
      include: attemptDetails,
    });
  }
}
