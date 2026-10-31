import { AuditAction, Prisma, TipoMetricaDiagnostico } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdaptiveResult } from '../types/diagnostic';

export const diagnosticAttemptSelect = {
  id: true,
  alunoId: true,
  iniciadoEm: true,
  finalizadoEm: true,
  questoes: {
    orderBy: { posicao: 'asc' },
    select: {
      id: true,
      posicao: true,
      questaoId: true,
      conteudoSnapshot: true,
      questao: {
        select: {
          id: true,
          enunciado: true,
          disciplina: true,
          assunto: true,
          nivel: true,
          fundamentacaoJuridica: true,
          alternativas: { select: { id: true, letra: true, texto: true, correta: true } },
        },
      },
      resposta: { select: { correta: true, alternativaEscolhidaId: true } },
    },
  },
  desempenhosDiagnostico: {
    select: {
      id: true,
      simuladoId: true,
      tipo: true,
      disciplina: true,
      assunto: true,
      nivel: true,
      acertos: true,
      totalQuestoes: true,
      percentual: true,
    },
  },
  trilhaAdaptativa: {
    select: {
      id: true,
      simuladoId: true,
      disciplinaPrioritaria: true,
      assuntoPrioritario: true,
      nivelRecomendado: true,
      quantidadeRecomendada: true,
      justificativa: true,
      createdAt: true,
      simuladoGeradoId: true,
    },
  },
} satisfies Prisma.SimuladoSelect;

export const diagnosticResultSelect = {
  id: true,
  alunoId: true,
  finalizadoEm: true,
  questoes: {
    orderBy: { posicao: 'asc' },
    select: {
      questao: { select: { disciplina: true, assunto: true, nivel: true } },
      resposta: { select: { correta: true } },
    },
  },
  desempenhosDiagnostico: {
    select: {
      id: true,
      simuladoId: true,
      tipo: true,
      disciplina: true,
      assunto: true,
      nivel: true,
      acertos: true,
      totalQuestoes: true,
      percentual: true,
    },
  },
  trilhaAdaptativa: {
    select: {
      id: true,
      simuladoId: true,
      disciplinaPrioritaria: true,
      assuntoPrioritario: true,
      nivelRecomendado: true,
      quantidadeRecomendada: true,
      justificativa: true,
      createdAt: true,
      simuladoGeradoId: true,
    },
  },
} satisfies Prisma.SimuladoSelect;

export type DiagnosticResultAttempt = Prisma.SimuladoGetPayload<{
  select: typeof diagnosticResultSelect;
}>;

export class DiagnosticRepository {
  async findStudent(studentId: string) {
    return prisma.user.findUnique({ where: { id: studentId }, select: { id: true } });
  }

  async findQuestionsForDiagnostic(quantity: number) {
    return prisma.questao.findMany({ take: quantity, where: { publica: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  }

  async createAttempt(studentId: string, questionIds: string[]) {
    return prisma.$transaction(async (tx) => {
      const attempt = await tx.simulado.create({
        data: {
          tipo: 'DIAGNOSTICO', alunoId: studentId,
          questoes: { create: questionIds.map((questaoId, index) => ({ questaoId, posicao: index + 1 })) },
        },
        select: { id: true, iniciadoEm: true, questoes: { select: { id: true } } },
      });
      await tx.auditLog.create({ data: { userId: studentId, action: 'DIAGNOSTICO_INICIADO' as AuditAction, resourceId: attempt.id } });
      return attempt;
    });
  }

  async findAttempt(attemptId: string, studentId: string) {
    return prisma.simulado.findFirst({
      where: { id: attemptId, alunoId: studentId, tipo: 'DIAGNOSTICO' },
      select: diagnosticAttemptSelect,
    });
  }

  async findAttemptForResult(attemptId: string, studentId: string) {
    return prisma.simulado.findFirst({
      where: { id: attemptId, alunoId: studentId, tipo: 'DIAGNOSTICO' },
      select: diagnosticResultSelect,
    });
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
      select: diagnosticAttemptSelect,
    });
    await tx.auditLog.create({ data: { userId: studentId, action: 'DIAGNOSTICO_FINALIZADO' as AuditAction, resourceId: attemptId } });
    return attempt;
    });
  }
}
