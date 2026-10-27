import { describe, expect, it, vi } from 'vitest';
import {
  INITIAL_DIAGNOSTIC_COMPOSITION,
  composeInitialDiagnostic,
  type InitialDiagnosticCandidate,
} from './initial-diagnostic-composition';
import {
  InitialDiagnosticService,
  type InitialDiagnosticAttempt,
  type InitialDiagnosticRepository,
} from './initial-diagnostic-service';

const studentId = 'student-1';
const fixedRandom = () => 0.5;

function inventory(extraPerSlot = 2): InitialDiagnosticCandidate[] {
  return INITIAL_DIAGNOSTIC_COMPOSITION.flatMap(slot => Array.from({ length: slot.quantity + extraPerSlot }, (_, index) => ({
    id: `${slot.discipline}|${slot.level}|${slot.origin}|${index}`,
    discipline: slot.discipline,
    level: slot.level,
    origin: slot.origin,
    public: true,
    complete: true,
    annulled: false,
    published: true,
    legalReviewApproved: true,
    pedagogicalReviewApproved: true,
    reproductionRightsDocumented: slot.origin === 'OAB_OFICIAL',
  })));
}

function attempt(overrides: Partial<InitialDiagnosticAttempt> = {}): InitialDiagnosticAttempt {
  return { id: 'initial-1', state: 'IN_PROGRESS', orderedQuestionIds: [], ...overrides };
}

function setup(overrides: Partial<InitialDiagnosticRepository> = {}) {
  const repository: InitialDiagnosticRepository = {
    findInitialAttempt: vi.fn().mockResolvedValue(null),
    listEligibleInventory: vi.fn().mockResolvedValue(inventory()),
    listAnsweredQuestionIds: vi.fn().mockResolvedValue(new Set<string>()),
    createInitialOrGetExisting: vi.fn(async ({ studentId: id, orderedQuestionIds }) => ({
      attempt: attempt({ id: 'created-initial', orderedQuestionIds }), created: id === studentId,
    })),
    ...overrides,
  };
  return { repository, service: new InitialDiagnosticService(repository, fixedRandom) };
}

describe('serviço isolado de aplicação do Diagnóstico Inicial', () => {
  it('retorna a mesma tentativa em andamento sem consultar inventário ou persistir outra', async () => {
    const current = attempt({ orderedQuestionIds: ['q1', 'q2'] });
    const { repository, service } = setup({ findInitialAttempt: vi.fn().mockResolvedValue(current) });

    await expect(service.getOrCreate(studentId)).resolves.toEqual({
      status: 'IN_PROGRESS', attempt: current, created: false,
    });
    expect(repository.listEligibleInventory).not.toHaveBeenCalled();
    expect(repository.listAnsweredQuestionIds).not.toHaveBeenCalled();
    expect(repository.createInitialOrGetExisting).not.toHaveBeenCalled();
  });

  it('retorna diagnóstico concluído e não o recria nem o sobrescreve', async () => {
    const completed = attempt({ id: 'historical-initial', state: 'COMPLETED', orderedQuestionIds: ['historic-q'] });
    const { repository, service } = setup({ findInitialAttempt: vi.fn().mockResolvedValue(completed) });

    await expect(service.getOrCreate(studentId)).resolves.toEqual({
      status: 'COMPLETED', attempt: completed, created: false,
    });
    expect(repository.createInitialOrGetExisting).not.toHaveBeenCalled();
  });

  it('envia exatamente 30 IDs distintos e ordenados à persistência', async () => {
    const candidates = inventory();
    const composition = composeInitialDiagnostic(candidates, new Set(), fixedRandom);
    expect(composition.status).toBe('READY');
    if (composition.status !== 'READY') throw new Error('Inventário de teste deve ser suficiente.');

    const { repository, service } = setup({ listEligibleInventory: vi.fn().mockResolvedValue(candidates) });
    const result = await service.getOrCreate(studentId);

    expect(result.status).toBe('IN_PROGRESS');
    const [input] = vi.mocked(repository.createInitialOrGetExisting).mock.calls[0];
    expect(input.studentId).toBe(studentId);
    expect(input.orderedQuestionIds).toHaveLength(30);
    expect(new Set(input.orderedQuestionIds).size).toBe(30);
    expect(input.orderedQuestionIds).toEqual(composition.questions.map(question => question.id));
  });

  it('consulta o histórico respondido e encaminha IDs não respondidos ao compositor', async () => {
    const candidates = inventory();
    const answered = new Set(candidates.slice(0, 5).map(question => question.id));
    const expected = composeInitialDiagnostic(candidates, answered, fixedRandom);
    expect(expected.status).toBe('READY');
    if (expected.status !== 'READY') throw new Error('Inventário de teste deve ser suficiente.');

    const { repository, service } = setup({
      listEligibleInventory: vi.fn().mockResolvedValue(candidates),
      listAnsweredQuestionIds: vi.fn().mockResolvedValue(answered),
    });
    await service.getOrCreate(studentId);

    expect(repository.listAnsweredQuestionIds).toHaveBeenCalledWith(studentId);
    const [input] = vi.mocked(repository.createInitialOrGetExisting).mock.calls[0];
    expect(input.orderedQuestionIds).toEqual(expected.questions.map(question => question.id));
    expect(input.orderedQuestionIds.some(id => !answered.has(id))).toBe(true);
  });

  it('não chama persistência quando falta acervo e devolve os déficits detalhados', async () => {
    const candidates = inventory();
    const insufficient = candidates.filter(question => question.discipline !== 'Direito Penal'
      || question.level !== 'AVANCADO' || question.origin !== 'OAB_OFICIAL'
      || question.id.endsWith('|0'));
    const { repository, service } = setup({ listEligibleInventory: vi.fn().mockResolvedValue(insufficient) });

    const result = await service.getOrCreate(studentId);
    expect(result).toMatchObject({ status: 'INSUFFICIENT' });
    if (result.status === 'INSUFFICIENT') {
      expect(result.shortages).toContainEqual({
        discipline: 'Direito Penal', level: 'AVANCADO', origin: 'OAB_OFICIAL', required: 2, available: 1,
      });
    }
    expect(repository.createInitialOrGetExisting).not.toHaveBeenCalled();
  });

  it('duas chamadas concorrentes convergem pela operação atômica do contrato', async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let entered = 0;
    let winner: InitialDiagnosticAttempt | null = null;
    let physicalCreates = 0;
    const createInitialOrGetExisting = vi.fn(async ({ orderedQuestionIds }: { studentId: string; orderedQuestionIds: readonly string[] }) => {
      entered++;
      if (entered === 2) release();
      await barrier;
      if (winner) return { attempt: winner, created: false };
      winner = attempt({ id: 'race-winner', orderedQuestionIds });
      physicalCreates++;
      return { attempt: winner, created: true };
    });
    const { service } = setup({ createInitialOrGetExisting });

    const [first, second] = await Promise.all([
      service.getOrCreate(studentId),
      service.getOrCreate(studentId),
    ]);

    expect(first.status).toBe('IN_PROGRESS');
    expect(second.status).toBe('IN_PROGRESS');
    if (first.status !== 'INSUFFICIENT' && second.status !== 'INSUFFICIENT') {
      expect(first.attempt.id).toBe('race-winner');
      expect(second.attempt.id).toBe(first.attempt.id);
      expect(first.attempt.orderedQuestionIds).toEqual(second.attempt.orderedQuestionIds);
    }
    expect(physicalCreates).toBe(1);
    expect(createInitialOrGetExisting).toHaveBeenCalledTimes(2);
  });

  it('não altera nem chama gravação para um diagnóstico que já existe', async () => {
    const historical = attempt({ id: 'never-overwrite', state: 'COMPLETED', orderedQuestionIds: ['fixed-question'] });
    const { repository, service } = setup({ findInitialAttempt: vi.fn().mockResolvedValue(historical) });
    const before = structuredClone(historical);

    await service.getOrCreate(studentId);

    expect(historical).toEqual(before);
    expect(repository.createInitialOrGetExisting).not.toHaveBeenCalled();
  });
});
