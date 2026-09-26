import { AuditAction, Prisma, TipoMetricaDiagnostico } from '@prisma/client';
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
    return prisma.$transaction(async (tx) => {
      const attempt = await tx.simulado.create({
        data: {
          tipo: 'DIAGNOSTICO', alunoId: studentId,
          questoes: { create: questionIds.map((questaoId, index) => ({ questaoId, posicao: index + 1 })) },
        },
        include: attemptDetails,
      });
      await tx.auditLog.create({ data: { userId: studentId, action: 'DIAGNOSTICO_INICIADO' as AuditAction, resourceId: attempt.id } });
      return attempt;
    });
  }

  async findAttempt(attemptId: string, studentId: string) {
    return prisma.simulado.findFirst({ where: { id: attemptId, alunoId: studentId, tipo: 'DIAGNOSTICO' }, include: attemptDetails });
  }

  async saveAnswer(simuladoId: string, questaoId: string, questaoSimuladoId: string, alternativaEscolhidaId: string, correta: boolean) {
    return prisma.resposta.create({ data: { simuladoId, questaoId, questaoSimuladoId, alternativaEscolhidaId, correta } });
  }

  async finalize(attemptId: string, studentId: string, result: AdaptiveResult) {
    return prisma.$transaction(async (tx) => {
    const markedAsFinalized = await tx.simulado.updateMany({
      where: { id: attemptId, tipo: 'DIAGNOSTICO', finalizadoEm: null },
      data: { finalizadoEm: new Date() },
    });
    if (markedAsFinalized.count === 0) return null;

    const attempt = await tx.simulado.update({
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
    await tx.auditLog.create({ data: { userId: studentId, action: 'DIAGNOSTICO_FINALIZADO' as AuditAction, resourceId: attemptId } });
    return attempt;
    });
  }
}
