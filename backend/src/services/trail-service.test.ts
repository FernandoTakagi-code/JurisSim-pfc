import { describe, expect, it, vi } from 'vitest';
import { TrailService } from './trail-service';

function trilha(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trilha-1', disciplinaPrioritaria: 'Constitucional', assuntoPrioritario: 'Controle de Constitucionalidade',
    nivelRecomendado: 'BASICO', quantidadeRecomendada: 10, simuladoGeradoId: null,
    simulado: { alunoId: 'student-1' },
    ...overrides,
  };
}

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trail-attempt-1', alunoId: 'student-1', finalizadoEm: null,
    questoes: [{ id: 'attempt-question-1', posicao: 1, questaoId: 'question-1', resposta: null, questao: {
      id: 'question-1', enunciado: 'Pergunta', disciplina: 'Constitucional', assunto: 'Controle de Constitucionalidade', nivel: 'BASICO',
      alternativas: [{ id: 'alternative-1', texto: 'Correta', correta: true }],
    } }],
    ...overrides,
  };
}

function serviceWith(options: { trilha?: ReturnType<typeof trilha> | null; attempt?: ReturnType<typeof attempt> | null; questions?: { id: string }[] } = {}) {
  const repository = {
    findTrilha: vi.fn().mockResolvedValue(options.trilha ?? null),
    findQuestionsForTrail: vi.fn().mockResolvedValue(options.questions ?? [{ id: 'question-1' }]),
    createTrailAttempt: vi.fn().mockResolvedValue(options.attempt ?? attempt()),
    findAttempt: vi.fn().mockResolvedValue(options.attempt ?? null),
    saveAnswer: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue(true),
  };
  const students = { updateLevel: vi.fn().mockResolvedValue(undefined) };
  return { service: new TrailService(repository as never, students as never), repository, students };
}

describe('regras da trilha de exercicios', () => {
  it('nao gera trilha inexistente', async () => {
    const { service } = serviceWith({ trilha: null });
    await expect(service.generate('trilha-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('nao gera a mesma trilha duas vezes', async () => {
    const { service } = serviceWith({ trilha: trilha({ simuladoGeradoId: 'simulado-ja-gerado' }) });
    await expect(service.generate('trilha-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('nao gera trilha sem questoes disponiveis', async () => {
    const { service } = serviceWith({ trilha: trilha(), questions: [] });
    await expect(service.generate('trilha-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('cria a sessao de exercicios com o aluno e as questoes certas', async () => {
    const { service, repository } = serviceWith({ trilha: trilha(), questions: [{ id: 'question-1' }, { id: 'question-2' }] });
    await service.generate('trilha-1');
    expect(repository.createTrailAttempt).toHaveBeenCalledWith('student-1', 'trilha-1', ['question-1', 'question-2']);
  });

  it('nao expoe gabarito ao listar exercicios', async () => {
    const { service } = serviceWith({ attempt: attempt() });
    const [question] = await service.getQuestions('trail-attempt-1');
    expect(question.alternatives[0]).toEqual({ id: 'alternative-1', text: 'Correta' });
    expect(question).not.toHaveProperty('correctOption');
  });

  it('impede resposta duplicada', async () => {
    const currentAttempt = attempt() as any;
    currentAttempt.questoes[0].resposta = { questaoId: 'question-1' };
    const { service } = serviceWith({ attempt: currentAttempt });
    await expect(service.answer('trail-attempt-1', 'question-1', 'alternative-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('impede resposta depois de finalizar', async () => {
    const { service } = serviceWith({ attempt: attempt({ finalizadoEm: new Date() }) });
    await expect(service.answer('trail-attempt-1', 'question-1', 'alternative-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('impede resposta de questao fora da trilha', async () => {
    const { service } = serviceWith({ attempt: attempt() });
    await expect(service.answer('trail-attempt-1', 'other-question', 'alternative-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejeita alternativa que nao pertence a questao', async () => {
    const { service } = serviceWith({ attempt: attempt() });
    await expect(service.answer('trail-attempt-1', 'question-1', 'other-alternative')).rejects.toMatchObject({ statusCode: 422 });
  });

  it('impede finalizacao sem respostas', async () => {
    const { service } = serviceWith({ attempt: attempt() });
    await expect(service.finalize('trail-attempt-1')).rejects.toMatchObject({ statusCode: 422 });
  });

  it('reclassifica o nivel do aluno ao finalizar', async () => {
    const currentAttempt = attempt({
      questoes: Array.from({ length: 10 }, (_, index) => ({
        id: `attempt-question-${index}`, posicao: index + 1, questaoId: `question-${index}`,
        resposta: { correta: index < 9 },
        questao: { id: `question-${index}`, enunciado: 'Pergunta', disciplina: 'Constitucional', assunto: 'Controle', nivel: 'BASICO', alternativas: [] },
      })),
    });
    const { service, students } = serviceWith({ attempt: currentAttempt });
    const result = await service.finalize('trail-attempt-1');
    expect(result.level).toBe('AVANCADO');
    expect(students.updateLevel).toHaveBeenCalledWith('student-1', 'AVANCADO');
  });
});