import { expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), trilhaAdaptativa: { findMany: vi.fn() } }));
vi.mock('../lib/prisma', () => ({ prisma: db }));
import { StudentHistoryRepository } from './student-history-repository';

it('exposes the owned persisted attempt separately from its recommendation without writes', async () => {
  db.$queryRaw.mockResolvedValue([]);
  db.trilhaAdaptativa.findMany.mockResolvedValue([{
    id: 'recommendation', disciplinaPrioritaria: 'Direito Civil', assuntoPrioritario: null,
    simuladoGerado: { id: 'persisted-attempt', finalizadoEm: null,
      _count: { questoes: 2 }, questoes: [{ resposta: { id: 'answer' } }, { resposta: null }] },
  }]);
  const result = await new StudentHistoryRepository().learningSummary('owner');
  expect(db.trilhaAdaptativa.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { simulado: { alunoId: 'owner' }, simuladoGeradoId: { not: null } },
  }));
  expect(result.trailProgress).toEqual([expect.objectContaining({
    id: 'recommendation', attemptId: 'persisted-attempt', answered: 1, total: 2, completed: false,
  })]);
});
