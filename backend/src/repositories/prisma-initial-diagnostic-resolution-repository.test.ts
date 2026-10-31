import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PrismaInitialDiagnosticResolutionRepository } from './prisma-initial-diagnostic-resolution-repository';

describe('PrismaInitialDiagnosticResolutionRepository', () => {
  it('reads the frozen question version for a diagnostic in progress', async () => {
    const snapshot = {
      version: 1, statement: 'Enunciado original', discipline: 'Direito Civil', topic: 'Contratos', difficulty: 'BASICO',
      explanation: 'Fundamentação original', alternatives: ['A', 'B', 'C', 'D'].map((letter, index) => ({
        id: `original-${letter}`, letter, text: `Alternativa original ${letter}`, correct: index === 1,
      })),
    };
    const findFirst = vi.fn().mockResolvedValue({
      alunoId: 'student-1', simuladoId: 'attempt-1',
      simulado: { id: 'attempt-1', alunoId: 'student-1', tipo: 'DIAGNOSTICO', finalizadoEm: null,
        questoes: [{ id: 'link-1', posicao: 1, questaoId: 'question-1', conteudoSnapshot: snapshot,
          questao: { id: 'question-1', enunciado: 'Enunciado editado', disciplina: 'Other', assunto: 'Other', nivel: 'AVANCADO',
            fundamentacaoJuridica: 'Fundamentação editada', alternativas: [] }, resposta: null }],
        desempenhosDiagnostico: [], trilhaAdaptativa: null },
    });
    const db = { diagnosticoInicial: { findFirst } } as unknown as PrismaClient;
    const attempt = await new PrismaInitialDiagnosticResolutionRepository(db).findOwnedAttempt('student-1', 'attempt-1');
    expect(attempt?.questions[0]).toMatchObject({ statement: 'Enunciado original', discipline: 'Direito Civil',
      explanation: 'Fundamentação original' });
    expect(attempt?.questions[0].alternatives[1]).toMatchObject({ id: 'original-B', correct: true });
  });
});
