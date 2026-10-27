import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors/api-error';
import { QuestionPracticeService, type PracticeAttempt, type PracticeQuestion, type QuestionPracticeRepository } from './question-practice-service';

const question = (id: string, correctId = `${id}-a`): PracticeQuestion => ({
  id, discipline: 'Direito Civil', topic: 'Contratos', level: 'BASICO', statement: `Enunciado original da questão ${id}`,
  explanation: 'Fundamentação revisada.',
  alternatives: ['a', 'b', 'c', 'd'].map(letter => ({ id: `${id}-${letter}`, letter: letter.toUpperCase(), text: `Alternativa ${letter}`, correct: `${id}-${letter}` === correctId })),
});
const attempt = (questions: PracticeQuestion[], selected = false, state: PracticeAttempt['state'] = 'IN_PROGRESS'): PracticeAttempt => ({
  id: 'attempt-1', state, discipline: 'Direito Civil',
  questions: questions.map((item, index) => ({ position: index + 1, question: item, selectedOptionId: selected ? item.alternatives[0].id : null })),
});
function repository(overrides: Partial<QuestionPracticeRepository> = {}): QuestionPracticeRepository {
  return {
    findAttempt: vi.fn(async () => null), findActiveAttempt: vi.fn(async () => null),
    listEligibleQuestions: vi.fn(async () => Array.from({ length: 25 }, (_, index) => question(`q${index}`))),
    listAnsweredQuestionIds: vi.fn(async () => new Set<string>()),
    createAttempt: vi.fn(async (_student, discipline, questions) => ({ ...attempt(questions), discipline })),
    saveAnswer: vi.fn(async () => {}), finalize: vi.fn(async (_student, _id) => attempt([question('q1')], true, 'COMPLETED')),
    ...overrides,
  };
}

describe('QuestionPracticeService', () => {
  it('validates the canonical discipline and supported quantities', async () => {
    const repo = repository(); const service = new QuestionPracticeService(repo);
    await expect(service.start('s1', 'Outra disciplina', 5)).rejects.toMatchObject({ statusCode: 422 });
    await expect(service.start('s1', 'Direito Civil', 7)).rejects.toMatchObject({ statusCode: 422 });
    expect(repo.createAttempt).not.toHaveBeenCalled();
  });

  it('creates a session with the chosen size and distinct questions, without exposing correctness', async () => {
    const repo = repository(); const service = new QuestionPracticeService(repo, () => 0.5);
    const response = await service.start('student-auth', 'Direito Civil', 5);
    expect(repo.createAttempt).toHaveBeenCalledWith('student-auth', 'Direito Civil', expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]));
    const chosen = vi.mocked(repo.createAttempt).mock.calls[0][2];
    expect(chosen).toHaveLength(5); expect(new Set(chosen.map(item => item.id)).size).toBe(5);
    expect(response.attempt.questions[0]).not.toHaveProperty('correct');
    expect(response.attempt.questions[0].alternatives[0]).not.toHaveProperty('correct');
  });

  it('prioritizes unanswered questions and reports shortage without silently lowering quantity', async () => {
    const pool = Array.from({ length: 6 }, (_, index) => question(`q${index}`));
    const repo = repository({ listEligibleQuestions: vi.fn(async () => pool), listAnsweredQuestionIds: vi.fn(async () => new Set(['q0', 'q1'])) });
    const service = new QuestionPracticeService(repo, () => 0);
    await expect(service.start('s1', 'Direito Civil', 5)).rejects.toMatchObject({ statusCode: 409 });
    expect(repo.createAttempt).not.toHaveBeenCalled();
    expect(repo.listAnsweredQuestionIds).toHaveBeenCalledWith('s1', 'Direito Civil');
  });

  it('resumes the active attempt for the same student and discipline', async () => {
    const active = attempt([question('q1')]); const repo = repository({ findActiveAttempt: vi.fn(async () => active) });
    const result = await new QuestionPracticeService(repo).start('s1', 'Direito Civil', 20);
    expect(result.resumed).toBe(true); expect(result.attempt.id).toBe(active.id);
    expect(repo.listEligibleQuestions).not.toHaveBeenCalled();
  });

  it('validates ownership through the repository, question membership and alternative membership', async () => {
    const saved = attempt([question('q1')]);
    const repo = repository({ findAttempt: vi.fn(async (studentId, id) => studentId === 'owner' && id === saved.id ? saved : null) });
    const service = new QuestionPracticeService(repo);
    await expect(service.get('other', saved.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.answer('owner', saved.id, 'outside-question', 'option')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.answer('owner', saved.id, 'q1', 'outside-option')).rejects.toMatchObject({ statusCode: 422 });
    expect(repo.saveAnswer).not.toHaveBeenCalled();
  });

  it('requires all answers before finalization, then returns corrections and explanations', async () => {
    const source = attempt([question('q1')]);
    const completed = attempt([question('q1')], true, 'COMPLETED');
    const repo = repository({ findAttempt: vi.fn(async (_student, _id) => source), finalize: vi.fn(async () => completed) });
    const service = new QuestionPracticeService(repo);
    await expect(service.finalize('s1', source.id)).rejects.toMatchObject({ statusCode: 409 });
    source.questions[0].selectedOptionId = source.questions[0].question.alternatives[0].id;
    const result = await service.finalize('s1', source.id);
    expect(result).toMatchObject({ total: 1, correct: 1, percentage: 100 });
    expect(result.answers[0].explanation).toBe('Fundamentação revisada.');
    expect(result.answers[0].correctOptionId).toBe('q1-a');
  });
});
