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
    findAttemptForResult: vi.fn().mockResolvedValue(currentAttempt),
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

  it('tentativa finalizada sem questoes retorna conflito controlado sem expor erro interno', async () => {
    const { service } = serviceWith(attempt({ finalizadoEm: new Date(), questoes: [] }));

    await expect(service.getResult('attempt-1', 'student-1')).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 409,
      message: 'O resultado nao pode ser calculado porque esta tentativa nao possui questoes.',
    });
  });

  it('calculo direto com lista vazia lança erro generico', async () => {
    const { analyzeDiagnostic } = await import('./adaptive-engine');

    expect(() => analyzeDiagnostic([])).toThrow('Nao e possivel analisar um diagnostico sem respostas.');
  });

  it('respostas ausentes em vinculos antigos sao contabilizadas como incorretas', async () => {
    const currentAttempt = attempt({
      finalizadoEm: new Date(),
      questoes: [{
        id: 'legacy-link-1', posicao: 1, questaoId: 'question-1', resposta: null,
        questao: { id: 'question-1', enunciado: 'Pergunta', disciplina: 'Civil', assunto: 'Contratos', nivel: 'BASICO', alternativas: [] },
      }],
    });
    const { service } = serviceWith(currentAttempt);

    const { result } = await service.getResult('attempt-1', 'student-1');

    expect(result.totalQuestions).toBe(1);
    expect(result.correctAnswers).toBe(0);
    expect(result.overallPercentage).toBe(0);
  });

  it('consulta resultado apenas para o aluno proprietario e retorna 404 quando nao pertence a ele', async () => {
    const { service, repository } = serviceWith(attempt({ finalizadoEm: new Date() }));
    repository.findAttemptForResult.mockResolvedValueOnce(null as never);

    await expect(service.getResult('attempt-1', 'other-student')).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.findAttemptForResult).toHaveBeenCalledWith('attempt-1', 'other-student');
  });

  it('getTrail continua recuperando a trilha da consulta especifica de resultado', async () => {
    const trail = {
      id: 'trail-1', simuladoId: 'attempt-1', disciplinaPrioritaria: 'Civil', assuntoPrioritario: 'Contratos',
      nivelRecomendado: 'BASICO', quantidadeRecomendada: 15, justificativa: 'Priorize Civil.',
      createdAt: new Date(), simuladoGeradoId: null,
    };
    const { service } = serviceWith(attempt({ finalizadoEm: new Date(), trilhaAdaptativa: trail }));

    await expect(service.getTrail('attempt-1', 'student-1')).resolves.toEqual(trail);
  });
});
