import { AuditAction, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { AdaptiveResult } from '../types/diagnostic';
import type {
  InitialDiagnosticFinalizeOutcome,
  InitialDiagnosticResolutionAttempt,
  InitialDiagnosticResolutionRepository,
} from '../services/initial-diagnostic-resolution-service';
import { readDiagnosticQuestionSnapshot } from '../services/diagnostic-question-snapshot';

const attemptInclude = {
  simulado: {
    include: {
      questoes: {
        orderBy: { posicao: 'asc' as const },
        include: {
          questao: { include: { alternativas: true } },
          resposta: true,
        },
      },
      desempenhosDiagnostico: true,
      trilhaAdaptativa: true,
    },
  },
} satisfies Prisma.DiagnosticoInicialInclude;

type InitialIdentity = Prisma.DiagnosticoInicialGetPayload<{ include: typeof attemptInclude }>;

function toResolutionAttempt(identity: InitialIdentity, studentId: string): InitialDiagnosticResolutionAttempt {
  const simulado = identity.simulado;
  if (identity.alunoId !== studentId || simulado.alunoId !== studentId || simulado.tipo !== 'DIAGNOSTICO') {
    throw new Error('Inconsistência de propriedade no Diagnóstico Inicial.');
  }

  return {
    id: simulado.id,
    state: simulado.finalizadoEm ? 'COMPLETED' : 'IN_PROGRESS',
    finalizedAt: simulado.finalizadoEm,
    questions: simulado.questoes.map(link => {
      const snapshot = readDiagnosticQuestionSnapshot(link.conteudoSnapshot);
      const content = snapshot ?? {
        statement: link.questao.enunciado,
        explanation: link.questao.fundamentacaoJuridica,
        discipline: link.questao.disciplina,
        topic: link.questao.assunto,
        difficulty: link.questao.nivel,
        alternatives: link.questao.alternativas.map(alternative => ({
          id: alternative.id, letter: alternative.letra, text: alternative.texto, correct: alternative.correta,
        })),
      };
      return {
      questionId: link.questaoId,
      position: link.posicao,
      statement: content.statement,
      explanation: content.explanation,
      discipline: content.discipline,
      topic: content.topic,
      difficulty: content.difficulty as InitialDiagnosticResolutionAttempt['questions'][number]['difficulty'],
      alternatives: content.alternatives.map(alternative => ({
        id: alternative.id,
        letter: alternative.letter,
        text: alternative.text,
        correct: alternative.correct,
      })),
      selectedAlternativeId: link.resposta?.alternativaEscolhidaId ?? null,
      answeredAt: link.resposta?.respondidoEm ?? null,
      correct: link.resposta?.correta ?? false,
    }; }),
    performances: simulado.desempenhosDiagnostico,
    trail: simulado.trilhaAdaptativa,
  };
}

function isRecoverablePrismaConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code);
}

function performanceCreates(result: AdaptiveResult) {
  return result.performances.map(performance => ({
    tipo: performance.metricType,
    disciplina: performance.discipline,
    assunto: performance.topic,
    nivel: performance.difficulty,
    acertos: performance.correctAnswers,
    totalQuestoes: performance.totalQuestions,
    percentual: performance.percentage,
  }));
}

function trailCreate(result: AdaptiveResult) {
  return {
    disciplinaPrioritaria: result.trail.priorityDiscipline,
    assuntoPrioritario: result.trail.priorityTopic,
    nivelRecomendado: result.trail.recommendedLevel,
    quantidadeRecomendada: result.trail.recommendedQuantity,
    justificativa: result.trail.reason,
  };
}

export class PrismaInitialDiagnosticResolutionRepository implements InitialDiagnosticResolutionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findOwnedAttempt(studentId: string, attemptId: string): Promise<InitialDiagnosticResolutionAttempt | null> {
    const identity = await this.db.diagnosticoInicial.findFirst({
      where: { alunoId: studentId, simuladoId: attemptId },
      include: attemptInclude,
    });
    return identity ? toResolutionAttempt(identity, studentId) : null;
  }

  async saveOrUpdateAnswer(studentId: string, attemptId: string, questionId: string, alternativeId: string) {
    return this.db.$transaction(async tx => {
      if (!await this.lockOwnedAttempt(tx, studentId, attemptId)) return 'NOT_FOUND' as const;
      const identity = await this.findOwnedAttemptInTransaction(tx, studentId, attemptId);
      if (!identity) return 'NOT_FOUND' as const;
      const attempt = toResolutionAttempt(identity, studentId);
      if (attempt.state === 'COMPLETED') return 'FINALIZED' as const;
      const link = identity.simulado.questoes.find(question => question.questaoId === questionId);
      if (!link) return 'QUESTION_NOT_FOUND' as const;
      const question = attempt.questions.find(item => item.questionId === questionId);
      const alternative = question?.alternatives.find(option => option.id === alternativeId);
      if (!alternative) return 'ALTERNATIVE_NOT_FOUND' as const;

      await tx.resposta.upsert({
        where: { questaoSimuladoId: link.id },
        create: {
          simuladoId: attemptId,
          questaoId: questionId,
          questaoSimuladoId: link.id,
          alternativaEscolhidaId: alternative.id,
          correta: alternative.correct,
        },
        update: {
          alternativaEscolhidaId: alternative.id,
          correta: alternative.correct,
          respondidoEm: new Date(),
        },
        select: { id: true },
      });
      return 'SAVED' as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async finalizeAtomically(
    studentId: string,
    attemptId: string,
    analyze: (attempt: InitialDiagnosticResolutionAttempt) => AdaptiveResult,
  ): Promise<InitialDiagnosticFinalizeOutcome> {
    try {
      return await this.db.$transaction(async tx => {
        if (!await this.lockOwnedAttempt(tx, studentId, attemptId)) return { status: 'NOT_FOUND' } as const;
        const identity = await this.findOwnedAttemptInTransaction(tx, studentId, attemptId);
        if (!identity) return { status: 'NOT_FOUND' } as const;
        const attempt = toResolutionAttempt(identity, studentId);
        if (attempt.state === 'COMPLETED') return { status: 'ALREADY_FINALIZED', attempt } as const;

        const answered = attempt.questions.filter(question => question.selectedAlternativeId !== null).length;
        if (attempt.questions.length !== 30 || answered !== 30) {
          return { status: 'INCOMPLETE', answered, required: 30 } as const;
        }

        const result = analyze(attempt);
        const finalizedAt = new Date();
        await tx.simulado.update({
          where: { id: attemptId },
          data: {
            finalizadoEm: finalizedAt,
            desempenhosDiagnostico: { create: performanceCreates(result) },
            trilhaAdaptativa: { create: trailCreate(result) },
          },
          select: { id: true },
        });
        await tx.user.update({ where: { id: studentId }, data: { nivelAtual: result.level }, select: { id: true } });
        await tx.auditLog.create({
          data: { userId: studentId, action: 'DIAGNOSTICO_FINALIZADO' as AuditAction, resourceId: attemptId },
          select: { id: true },
        });

        const finalized = await this.findOwnedAttemptInTransaction(tx, studentId, attemptId);
        if (!finalized) throw new Error('A tentativa finalizada não pôde ser recuperada.');
        return { status: 'FINALIZED', attempt: toResolutionAttempt(finalized, studentId) } as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isRecoverablePrismaConflict(error)) throw error;
      const winner = await this.findOwnedAttempt(studentId, attemptId);
      if (winner?.state === 'COMPLETED') return { status: 'ALREADY_FINALIZED', attempt: winner };
      throw error;
    }
  }

  private async findOwnedAttemptInTransaction(tx: Prisma.TransactionClient, studentId: string, attemptId: string) {
    return tx.diagnosticoInicial.findFirst({
      where: { alunoId: studentId, simuladoId: attemptId },
      include: attemptInclude,
    });
  }

  private async lockOwnedAttempt(tx: Prisma.TransactionClient, studentId: string, attemptId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT s."id"
      FROM "Simulado" AS s
      INNER JOIN "DiagnosticoInicial" AS d
        ON d."simuladoId" = s."id" AND d."alunoId" = s."alunoId"
      WHERE s."id" = ${attemptId} AND s."alunoId" = ${studentId} AND s."tipo" = 'DIAGNOSTICO'
      FOR UPDATE OF s
    `;
    return rows.length === 1;
  }
}
