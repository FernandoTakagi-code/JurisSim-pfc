import { AuditAction, Prisma, PrismaClient, TipoMetricaDiagnostico } from '@prisma/client';
import { ApiError } from '../errors/api-error';
import { lockAttempt, saveLockedAnswer } from './attempt-write';
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
export const legacyDiagnosticScope = { tipo: 'DIAGNOSTICO', diagnosticoInicial: null } satisfies Prisma.SimuladoWhereInput;
type Attempt = Prisma.SimuladoGetPayload<{ select: typeof diagnosticAttemptSelect }>;

export class DiagnosticRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  findActiveAttempt(studentId: string) {
    return this.db.simulado.findFirst({ where: { alunoId: studentId, ...legacyDiagnosticScope, finalizadoEm: null },
      orderBy: [{ iniciadoEm: 'desc' }, { id: 'desc' }], select: { id: true, iniciadoEm: true, questoes: { select: { id: true } } } });
  }
  async findStudent(studentId: string) {
    return prisma.user.findUnique({ where: { id: studentId }, select: { id: true } });
  }

  async findQuestionsForDiagnostic(quantity: number) {
    return prisma.questao.findMany({ take: quantity, where: { publica: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  }

  async createAttempt(studentId: string, questionIds: string[]) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${studentId} FOR UPDATE`;
      if (!locked.length) throw new ApiError(404, 'Aluno não encontrado.');
      const active = await tx.simulado.findFirst({ where: { alunoId: studentId, ...legacyDiagnosticScope, finalizadoEm: null },
        orderBy: [{ iniciadoEm: 'desc' }, { id: 'desc' }], select: { id: true, iniciadoEm: true, questoes: { select: { id: true } } } });
      if (active) return active;
      if (!questionIds.length) throw new ApiError(409, 'Nao ha questoes publicas cadastradas para iniciar o diagnostico.');
      const attempt = await tx.simulado.create({
        data: {
          tipo: 'DIAGNOSTICO', alunoId: studentId,
          questoes: { create: questionIds.map((questaoId, index) => ({ questaoId, posicao: index + 1 })) },
        },
        select: { id: true, iniciadoEm: true, questoes: { select: { id: true } } },
      });
      await tx.auditLog.create({ data: { userId: studentId, action: 'DIAGNOSTICO_INICIADO' as AuditAction, resourceId: attempt.id } });
      return attempt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async findAttempt(attemptId: string, studentId: string) {
    return this.db.simulado.findFirst({
      where: { id: attemptId, alunoId: studentId, ...legacyDiagnosticScope },
      select: diagnosticAttemptSelect,
    });
  }

  async findAttemptForResult(attemptId: string, studentId: string) {
    return this.db.simulado.findFirst({
      where: { id: attemptId, alunoId: studentId, ...legacyDiagnosticScope },
      select: diagnosticResultSelect,
    });
  }

  async saveAnswer(simuladoId: string, questaoId: string, questaoSimuladoId: string, alternativaEscolhidaId: string, _correta: boolean, studentId: string) {
    return this.db.$transaction(tx => saveLockedAnswer(tx, { attemptId: simuladoId, studentId, questionId: questaoId,
      linkId: questaoSimuladoId, alternativeId: alternativaEscolhidaId, scope: legacyDiagnosticScope }), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async finalize(attemptId: string, studentId: string, analyze: (attempt: Attempt) => AdaptiveResult) {
    return this.db.$transaction(async (tx) => {
    await lockAttempt(tx, attemptId, studentId);
    const current = await tx.simulado.findFirst({ where: { id: attemptId, alunoId: studentId, ...legacyDiagnosticScope }, select: diagnosticAttemptSelect });
    if (!current) throw new ApiError(404, 'Diagnóstico não encontrado.');
    if (current.finalizadoEm) return current;
    if (!current.questoes.some(q => q.resposta)) throw new ApiError(422, 'Não é possível finalizar um diagnóstico sem respostas.');
    const result = analyze(current);

    const attempt = await tx.simulado.update({
      where: { id: attemptId },
      data: {
        finalizadoEm: new Date(),
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
    await tx.user.update({ where: { id: studentId }, data: { nivelAtual: result.level } });
    await tx.auditLog.create({ data: { userId: studentId, action: 'DIAGNOSTICO_FINALIZADO' as AuditAction, resourceId: attemptId } });
    return attempt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
