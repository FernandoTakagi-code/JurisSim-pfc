import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors/api-error';
import { DiagnosticService } from './diagnostic-service';
import { TrailService } from './trail-service';

describe('start recovery after concurrent commits', () => {
  it('returns the diagnostic committed by another request even if the inventory query returned empty', async () => {
    const winner = { id: 'already-created', questoes: [{ id: 'link' }] };
    const repository = {
      findStudent: vi.fn().mockResolvedValue({ id: 'student' }),
      findActiveAttempt: vi.fn().mockResolvedValue(null),
      findQuestionsForDiagnostic: vi.fn().mockResolvedValue([]),
      createAttempt: vi.fn().mockResolvedValue(winner),
    };
    await expect(new DiagnosticService(repository as never).start('student', 30)).resolves.toBe(winner);
    expect(repository.createAttempt).toHaveBeenCalledWith('student', []);
  });

  it('lets the locked trail repository return the concurrent winner before rejecting empty inventory', async () => {
    const winner = { id: 'already-generated', alunoId: 'student' };
    const repository = {
      findTrilha: vi.fn().mockResolvedValue({ id: 'recommendation', simulado: { alunoId: 'student' },
        simuladoGeradoId: null, disciplinaPrioritaria: 'Civil', assuntoPrioritario: 'Contratos',
        nivelRecomendado: 'BASICO', quantidadeRecomendada: 15 }),
      findQuestionsForTrail: vi.fn().mockResolvedValue([]),
      createTrailAttempt: vi.fn().mockResolvedValue(winner),
    };
    await expect(new TrailService(repository as never).generate('recommendation', 'student')).resolves.toBe(winner);
    expect(repository.createTrailAttempt).toHaveBeenCalledWith('student', 'recommendation', []);
  });

  it('propagates the repository conflict when there is neither inventory nor a winning attempt', async () => {
    const repository = {
      findStudent: vi.fn().mockResolvedValue({ id: 'student' }),
      findActiveAttempt: vi.fn().mockResolvedValue(null),
      findQuestionsForDiagnostic: vi.fn().mockResolvedValue([]),
      createAttempt: vi.fn().mockRejectedValue(new ApiError(409, 'Inventário indisponível.')),
    };
    await expect(new DiagnosticService(repository as never).start('student', 30)).rejects.toMatchObject({ statusCode: 409 });
  });
});
