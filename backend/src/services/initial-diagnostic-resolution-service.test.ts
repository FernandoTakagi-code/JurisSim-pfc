import { describe, expect, it, vi } from 'vitest';
import {
  InitialDiagnosticResolutionService,
  type InitialDiagnosticResolutionAttempt,
  type InitialDiagnosticResolutionRepository,
} from './initial-diagnostic-resolution-service';

const studentId = 'student-owner';
const attemptId = 'attempt-initial';
const disciplines = [
  'Direito Constitucional', 'Direito Civil', 'Direito Penal', 'Direito Administrativo', 'Direito do Trabalho',
] as const;

function makeAttempt(overrides: Partial<InitialDiagnosticResolutionAttempt> = {}): InitialDiagnosticResolutionAttempt {
  const questions = disciplines.flatMap(discipline => Array.from({ length: 6 }, (_, offset) => {
    const position = disciplines.indexOf(discipline) * 6 + offset + 1;
    const options = ['A', 'B', 'C', 'D'] as const;
    return {
      questionId: `question-${position}`,
      position,
      statement: `Enunciado jurídico da questão ${position} para teste.`,
      discipline,
      topic: `Assunto ${position}`,
      difficulty: 'INTERMEDIARIO' as const,
      alternatives: options.map((letter, index) => ({
        id: `alternative-${position}-${letter}`,
        letter,
        text: `Alternativa ${letter} da questão ${position}`,
        correct: index === 0,
      })),
      selectedAlternativeId: `alternative-${position}-A`,
      answeredAt: new Date('2026-10-20T12:00:00Z'),
      correct: true,
    };
  }));
  return { id: attemptId, state: 'IN_PROGRESS', finalizedAt: null, questions, performances: [], trail: null, ...overrides };
}

function setup(overrides: Partial<InitialDiagnosticResolutionRepository> = {}) {
  const repository: InitialDiagnosticResolutionRepository = {
    findOwnedAttempt: vi.fn().mockResolvedValue(makeAttempt()),
    saveOrUpdateAnswer: vi.fn().mockResolvedValue('SAVED'),
    finalizeAtomically: vi.fn().mockImplementation(async (_studentId, _attemptId, analyze) => ({
      status: 'FINALIZED', attempt: makeAttempt({ state: 'COMPLETED', finalizedAt: new Date('2026-10-20T12:30:00Z') }),
      result: analyze(makeAttempt()),
    })),
    ...overrides,
  };
  return { repository, service: new InitialDiagnosticResolutionService(repository) };
}

describe('initial diagnostic resolution service', () => {
  it('returns the fixed 30-question order and never exposes correctness', async () => {
    const { repository, service } = setup();
    const questions = await service.getQuestions(studentId, attemptId);
    expect(repository.findOwnedAttempt).toHaveBeenCalledWith(studentId, attemptId);
    expect(questions).toHaveLength(30);
    expect(questions.map(question => question.position)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(questions[0].alternatives.map(option => option.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(questions[0]).toEqual(expect.not.objectContaining({ correct: expect.anything(), answer: expect.anything() }));
    expect(JSON.stringify(questions)).not.toContain('"correct"');
  });

  it('returns only the authenticated attempt answers without a key', async () => {
    const { service } = setup();
    const result = await service.getAnswers(studentId, attemptId);
    expect(result).toMatchObject({ attemptId, answered: 30, total: 30 });
    expect(result.answers[0]).toEqual({ questionId: 'question-1', selectedOptionId: 'alternative-1-A', respondedAt: new Date('2026-10-20T12:00:00Z') });
    expect(JSON.stringify(result)).not.toContain('correct');
  });

  it('allows saving or changing an answer through the unique question link', async () => {
    const { repository, service } = setup();
    await expect(service.saveAnswer(studentId, attemptId, 'question-2', 'alternative-2-C')).resolves.toMatchObject({ questionId: 'question-2' });
    expect(repository.saveOrUpdateAnswer).toHaveBeenCalledWith(studentId, attemptId, 'question-2', 'alternative-2-C');
  });

  it.each([
    ['NOT_FOUND', 404], ['FINALIZED', 409], ['QUESTION_NOT_FOUND', 404], ['ALTERNATIVE_NOT_FOUND', 422],
  ] as const)('maps answer outcome %s to a controlled error', async (status, expectedStatus) => {
    const { service } = setup({ saveOrUpdateAnswer: vi.fn().mockResolvedValue(status) });
    await expect(service.saveAnswer(studentId, attemptId, 'question-1', 'wrong-option'))
      .rejects.toMatchObject({ statusCode: expectedStatus });
  });

  it('does not finalize when any of the 30 answers is missing', async () => {
    const { service, repository } = setup({
      finalizeAtomically: vi.fn().mockResolvedValue({ status: 'INCOMPLETE', answered: 29, required: 30 }),
    });
    await expect(service.finalize(studentId, attemptId)).rejects.toMatchObject({ statusCode: 422 });
    expect(repository.finalizeAtomically).toHaveBeenCalledWith(studentId, attemptId, expect.any(Function));
  });

  it('finalizes idempotently and returns discipline metrics and adaptive data', async () => {
    let stored = makeAttempt();
    const finalizeAtomically = vi.fn(async (_studentId: string, _attemptId: string, analyze: (attempt: InitialDiagnosticResolutionAttempt) => ReturnType<typeof import('./adaptive-engine').analyzeDiagnostic>) => {
      const wasComplete = stored.state === 'COMPLETED';
      const result = analyze(stored);
      stored = { ...stored, state: 'COMPLETED', finalizedAt: stored.finalizedAt ?? new Date('2026-10-20T12:30:00Z') };
      return { status: wasComplete ? 'ALREADY_FINALIZED' as const : 'FINALIZED' as const, attempt: stored, result };
    });
    const { service } = setup({ finalizeAtomically });
    const first = await service.finalize(studentId, attemptId);
    const second = await service.finalize(studentId, attemptId);
    expect(first).toMatchObject({ correctAnswers: 30, totalQuestions: 30, overallPercentage: 100, unansweredQuestions: 0 });
    expect(first.performances).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: 'DISCIPLINA', disciplina: 'Direito Civil' })]));
    expect(first.trail).toBeTruthy();
    expect(second.finalizedAt).toEqual(first.finalizedAt);
    expect(finalizeAtomically).toHaveBeenCalledTimes(2);
  });

  it('withholds the result until the attempt is complete', async () => {
    const { service } = setup();
    await expect(service.getResult(studentId, attemptId)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('enforces ownership through repository lookup and hides non-owned attempts', async () => {
    const findOwnedAttempt = vi.fn().mockResolvedValue(null);
    const { service } = setup({ findOwnedAttempt });
    await expect(service.getQuestions(studentId, attemptId)).rejects.toMatchObject({ statusCode: 404 });
    expect(findOwnedAttempt).toHaveBeenCalledWith(studentId, attemptId);
  });
});
