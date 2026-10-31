import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { DiagnosticService } from './diagnostic-service';

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'attempt-1', finalizadoEm: null,
    questoes: [{ id: 'attempt-question-1', posicao: 1, questaoId: 'question-1', resposta: null, questao: {
      id: 'question-1', enunciado: 'Pergunta', disciplina: 'Civil', assunto: 'Contratos', nivel: 'BASICO',
      fundamentacaoJuridica: 'Base jurídica registrada.',
      alternativas: [{ id: 'alternative-1', letra: 'A', texto: 'Correta', correta: true }],
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

  it('confirms a pre-finalization answer without returning its correctness or explanation', async () => {
    const { service } = serviceWith(attempt());
    const response = await service.answer('attempt-1', 'student-1', 'question-1', 'alternative-1');
    expect(response).toEqual({ message: 'Resposta registrada.' });
    expect(JSON.stringify(response)).not.toMatch(/correct|explanation|gabarito/i);
  });

  it('returns answer key and rationale in position order only after completion', async () => {
    const finished = attempt({ finalizadoEm: new Date(), questoes: [
      { id: 'link-1', posicao: 1, questaoId: 'question-1', conteudoSnapshot: null,
        resposta: { correta: true, alternativaEscolhidaId: 'alternative-1' }, questao: {
          id: 'question-1', enunciado: 'Pergunta completa', disciplina: 'Civil', assunto: 'Contratos', nivel: 'BASICO',
          fundamentacaoJuridica: 'Fundamento disponível.', alternativas: [{ id: 'alternative-1', letra: 'A', texto: 'A correta', correta: true }],
        } },
      { id: 'link-2', posicao: 2, questaoId: 'question-2', conteudoSnapshot: null,
        resposta: null, questao: {
          id: 'question-2', enunciado: 'Pergunta sem resposta', disciplina: 'Civil', assunto: 'Contratos', nivel: 'BASICO',
          fundamentacaoJuridica: '', alternativas: [{ id: 'alternative-2', letra: 'B', texto: 'B correta', correta: true }],
        } },
    ] });
    const { service } = serviceWith(finished);
    const review = await service.getReview('attempt-1', 'student-1');
    expect(review.questions.map(question => question.position)).toEqual([1, 2]);
    expect(review).toMatchObject({ total: 2, correct: 1, incorrect: 0, unanswered: 1 });
    expect(review.questions[0]).toMatchObject({ selectedAlternativeId: 'alternative-1', correct: true, explanation: 'Fundamento disponível.', snapshotAvailable: false });
    expect(review.questions[1]).toMatchObject({ selectedAlternativeId: null, correct: null, explanation: null });
  });

  it('uses the question snapshot captured for that attempt instead of later edits', async () => {
    const finished = attempt({ finalizadoEm: new Date(), questoes: [{
      id: 'link-1', posicao: 1, questaoId: 'question-1', resposta: { correta: false, alternativaEscolhidaId: 'old-B' },
      conteudoSnapshot: { version: 1, statement: 'Enunciado histórico', discipline: 'Civil', topic: 'Contratos', difficulty: 'BASICO',
        explanation: 'Fundamentação histórica', alternatives: ['A', 'B', 'C', 'D'].map((letter, index) => ({
          id: `old-${letter}`, letter, text: `Opção histórica ${letter}`, correct: index === 0,
        })) },
      questao: { id: 'question-1', enunciado: 'Texto atualizado', disciplina: 'Civil', assunto: 'Atualizado', nivel: 'AVANCADO',
        fundamentacaoJuridica: 'Texto atualizado', alternativas: [] },
    }] });
    const { service } = serviceWith(finished);
    const review = await service.getReview('attempt-1', 'student-1');
    expect(review.questions[0]).toMatchObject({ statement: 'Enunciado histórico', topic: 'Contratos',
      explanation: 'Fundamentação histórica', selectedAlternativeId: 'old-B', correct: false, snapshotAvailable: true });
    expect(review.questions[0].alternatives[0]).toMatchObject({ id: 'old-A', correct: true });
  });

  it('does not return any answer key for an in-progress diagnostic review', async () => {
    const { service } = serviceWith(attempt());
    await expect(service.getReview('attempt-1', 'student-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns 404 for a review requested by another student', async () => {
    const { service, repository } = serviceWith(attempt({ finalizadoEm: new Date() }));
    repository.findAttempt.mockResolvedValueOnce(null as never);
    await expect(service.getReview('attempt-1', 'other-student')).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.findAttempt).toHaveBeenCalledWith('attempt-1', 'other-student');
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
    repository.findAttempt.mockResolvedValueOnce(null as never);

    await expect(service.getResult('attempt-1', 'other-student')).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.findAttempt).toHaveBeenCalledWith('attempt-1', 'other-student');
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
