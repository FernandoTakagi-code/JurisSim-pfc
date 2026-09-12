import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { DiagnosticService } from './diagnostic-service';

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'attempt-1', finalizadoEm: null,
    questoes: [{ id: 'attempt-question-1', posicao: 1, questaoId: 'question-1', resposta: null, questao: {
      id: 'question-1', enunciado: 'Pergunta', disciplina: 'Civil', assunto: 'Contratos', nivel: 'BASICO',
      alternativas: [{ id: 'alternative-1', texto: 'Correta', correta: true }],
    } }],
    desempenhosDiagnostico: [], trilhaAdaptativa: null,
    ...overrides,
  };
}

function serviceWith(currentAttempt: ReturnType<typeof attempt>) {
  const repository = {
    findAttempt: vi.fn().mockResolvedValue(currentAttempt),
    saveAnswer: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new DiagnosticService(repository as never), repository };
}

describe('regras do diagnostico', () => {
  it('nao expoe gabarito ao listar questoes', async () => {
    const { service } = serviceWith(attempt());
    const [question] = await service.getQuestions('attempt-1', 'student-1');
    expect(question.alternatives[0]).toEqual({ id: 'alternative-1', text: 'Correta' });
    expect(question).not.toHaveProperty('correctOption');
  });

  it('impede resposta duplicada', async () => {
    const currentAttempt = attempt() as any;
    currentAttempt.questoes[0].resposta = { questaoId: 'question-1' };
    const { service } = serviceWith(currentAttempt);
    await expect(service.answer('attempt-1', 'student-1', 'question-1', 'alternative-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('converte violacao de unicidade em resposta duplicada', async () => {
    const { service, repository } = serviceWith(attempt());
    repository.saveAnswer.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicada', { code: 'P2002', clientVersion: '6.19.3' }));
    await expect(service.answer('attempt-1', 'student-1', 'question-1', 'alternative-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('impede resposta depois de finalizar a tentativa', async () => {
    const { service } = serviceWith(attempt({ finalizadoEm: new Date() }));
    await expect(service.answer('attempt-1', 'student-1', 'question-1', 'alternative-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('impede resposta de questao fora da tentativa', async () => {
    const { service } = serviceWith(attempt());
    await expect(service.answer('attempt-1', 'student-1', 'other-question', 'alternative-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejeita alternativa que nao pertence a questao', async () => {
    const { service } = serviceWith(attempt());
    await expect(service.answer('attempt-1', 'student-1', 'question-1', 'other-alternative')).rejects.toMatchObject({ statusCode: 422 });
  });

  it('impede finalizacao sem respostas', async () => {
    const { service } = serviceWith(attempt());
    await expect(service.finalize('attempt-1', 'student-1')).rejects.toMatchObject({ statusCode: 422 });
  });

  it('considera questoes sem resposta como incorretas', async () => {
    const currentAttempt = attempt({
      finalizadoEm: new Date(),
      questoes: Array.from({ length: 20 }, (_, index) => ({
        id: `attempt-question-${index}`, posicao: index + 1, questaoId: `question-${index}`,
        resposta: index === 0 ? { correta: true } : null,
        questao: { id: `question-${index}`, enunciado: 'Pergunta', disciplina: 'Civil', assunto: 'Contratos', nivel: 'BASICO', alternativas: [] },
      })),
    });
    const { service } = serviceWith(currentAttempt);
    const result = await service.getResult('attempt-1', 'student-1');
    expect(result.result.overallPercentage).toBe(5);
  });
});
