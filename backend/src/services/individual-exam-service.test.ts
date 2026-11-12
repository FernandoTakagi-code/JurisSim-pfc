import { describe, expect, it, vi } from 'vitest';
import { IndividualExamService, type IndividualExamAttempt, type IndividualExamRepository } from './individual-exam-service';
import { PRACTICE_DISCIPLINES } from './question-practice-service';

const pool = () => PRACTICE_DISCIPLINES.flatMap(discipline => Array.from({ length: 7 }, (_, i) => ({ id: `${discipline}-${i}`, discipline })));
const attempt = (completed = false): IndividualExamAttempt => ({ id: 'exam', completed, questions: pool().filter(q => !q.id.endsWith('-6')).map((q, i) => ({ id: q.id, position: i + 1, selectedOptionId: completed ? `${q.id}-A` : null,
  snapshot: { version: 1, statement: `Enunciado ${q.id}`, discipline: q.discipline, topic: 'Assunto', difficulty: 'BASICO', explanation: 'Explicação reservada até entrega.', alternatives: ['A', 'B', 'C', 'D'].map(letter => ({ id: `${q.id}-${letter}`, letter: letter as 'A' | 'B' | 'C' | 'D', text: `Texto ${letter}`, correct: letter === 'A' })) } })) });
const repo = (overrides: Partial<IndividualExamRepository> = {}): IndividualExamRepository => ({ available: vi.fn(async () => pool()), active: vi.fn(async () => null), find: vi.fn(async () => attempt()), create: vi.fn(async () => attempt()), answer: vi.fn(async () => {}), finalize: vi.fn(async () => attempt(true)), ...overrides });

describe('IndividualExamService', () => {
  it('selects 30 distinct unseen eligible candidates, six per discipline, without answer keys', async () => {
    const repository = repo(); const response = await new IndividualExamService(repository, () => 0.25).start('s1');
    const selected = vi.mocked(repository.create).mock.calls[0][1];
    expect(selected).toHaveLength(30); expect(new Set(selected.map(q => q.id)).size).toBe(30);
    for (const d of PRACTICE_DISCIPLINES) expect(selected.filter(q => q.discipline === d)).toHaveLength(6);
    expect(response.attempt.questions[0]).not.toHaveProperty('snapshot');
    expect(response.attempt.questions[0]).not.toHaveProperty('explanation');
    expect(response.attempt.questions[0].alternatives[0]).not.toHaveProperty('correct');
  });
  it('does not fill a discipline shortage with extra questions from other disciplines', async () => {
    const inventory = pool().filter(q => q.discipline !== PRACTICE_DISCIPLINES[0] || Number(q.id.slice(-1)) < 5);
    const repository = repo({ available: vi.fn(async () => inventory) }); const service = new IndividualExamService(repository);
    expect(await service.availability('s1')).toMatchObject({ canStart: false, disciplines: [expect.objectContaining({ available: 5, missing: 1 }), ...PRACTICE_DISCIPLINES.slice(1).map(() => expect.objectContaining({ missing: 0 }))] });
    await expect(service.start('s1')).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('resumes without requiring new inventory and treats duplicate candidate IDs as one', async () => {
    const repository = repo({ active: vi.fn(async () => attempt()), available: vi.fn(async () => []) });
    expect((await new IndividualExamService(repository).start('s1')).resumed).toBe(true);
    expect(repository.available).not.toHaveBeenCalled();
    const duplicate = repo({ available: vi.fn(async () => [pool()[0], pool()[0]]) });
    expect((await new IndividualExamService(duplicate).availability('s1')).disciplines[0].available).toBe(1);
  });
  it('saves answers without correctness or explanation, and validates membership and ownership', async () => {
    const repository = repo({ find: vi.fn(async student => student === 'owner' ? attempt() : null) });
    const service = new IndividualExamService(repository), q = attempt().questions[0];
    await expect(service.answer('other', 'exam', q.id, q.snapshot.alternatives[0].id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.answer('owner', 'exam', 'outside', 'other')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.answer('owner', 'exam', q.id, 'other')).rejects.toMatchObject({ statusCode: 422 });
    expect(await service.answer('owner', 'exam', q.id, q.snapshot.alternatives[0].id)).toEqual({ saved: true, selectedOptionId: q.snapshot.alternatives[0].id });
  });
  it('refuses incomplete delivery and results before submission', async () => {
    const repository = repo(), service = new IndividualExamService(repository);
    await expect(service.finalize('s1', 'exam')).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.getResult('s1', 'exam')).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.finalize).not.toHaveBeenCalled();
  });
  it('scores snapshot answers only after submission, returns discipline results, and blocks later changes', async () => {
    const completed = attempt(true), repository = repo({ find: vi.fn(async () => completed) });
    const service = new IndividualExamService(repository);
    const result = await service.finalize('s1', 'exam');
    expect(result).toMatchObject({ total: 30, correct: 30, percentage: 100 });
    expect(result.disciplines.every(d => d.total === 6 && d.correct === 6)).toBe(true);
    expect(result.answers[0].explanation).toBe(completed.questions[0].snapshot.explanation);
    expect(repository.finalize).not.toHaveBeenCalled();
    await expect(service.answer('s1', 'exam', completed.questions[0].id, completed.questions[0].snapshot.alternatives[1].id)).rejects.toMatchObject({ statusCode: 409 });
  });
});
