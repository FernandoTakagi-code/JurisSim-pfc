import {
  composeInitialDiagnostic,
  type InitialDiagnosticCandidate,
  type InitialDiagnosticCompositionResult,
} from './initial-diagnostic-composition';

export type InitialDiagnosticAttemptState = 'IN_PROGRESS' | 'COMPLETED';

export class InitialDiagnosticServiceUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = 'INITIAL_DIAGNOSTIC_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'InitialDiagnosticServiceUnavailableError';
  }
}

export interface InitialDiagnosticAttempt {
  id: string;
  state: InitialDiagnosticAttemptState;
  /** Persisted question IDs in their stable attempt order. */
  orderedQuestionIds: readonly string[];
}

export interface CreateInitialDiagnosticInput {
  studentId: string;
  /** The order is significant and must be saved as the attempt's positions. */
  orderedQuestionIds: readonly string[];
}

export interface CreateOrGetInitialDiagnosticResult {
  attempt: InitialDiagnosticAttempt;
  created: boolean;
}

/**
 * Persistence boundary for initial diagnostics.
 *
 * A PostgreSQL adapter must implement createInitialOrGetExisting atomically:
 * create Simulado + DiagnosticoInicial identity + all ordered question links
 * in one transaction, enforce one initial per student with a unique constraint,
 * and fetch/return the winning attempt on uniqueness conflict. A mocked port can
 * test service behavior but cannot prove database concurrency or transaction
 * guarantees; those require later disposable-PostgreSQL integration tests.
 */
export interface InitialDiagnosticRepository {
  findInitialAttempt(studentId: string): Promise<InitialDiagnosticAttempt | null>;
  listEligibleInventory(): Promise<InitialDiagnosticCandidate[]>;
  listAnsweredQuestionIds(studentId: string): Promise<ReadonlySet<string>>;
  createInitialOrGetExisting(input: CreateInitialDiagnosticInput): Promise<CreateOrGetInitialDiagnosticResult>;
}

export type InitialDiagnosticServiceResult =
  | {
      status: 'IN_PROGRESS' | 'COMPLETED';
      attempt: InitialDiagnosticAttempt;
      created: boolean;
    }
  | {
      status: 'INSUFFICIENT';
      shortages: Extract<InitialDiagnosticCompositionResult, { status: 'INSUFFICIENT' }>['shortages'];
    };

export class InitialDiagnosticService {
  constructor(
    private readonly repository: InitialDiagnosticRepository,
    private readonly random: () => number = Math.random,
  ) {}

  async getOrCreate(studentId: string): Promise<InitialDiagnosticServiceResult> {
    const existing = await this.repository.findInitialAttempt(studentId);
    if (existing) return { status: existing.state, attempt: existing, created: false };

    const [inventory, answeredQuestionIds] = await Promise.all([
      this.repository.listEligibleInventory(),
      this.repository.listAnsweredQuestionIds(studentId),
    ]);
    const composition = composeInitialDiagnostic(inventory, answeredQuestionIds, this.random);

    if (composition.status === 'INSUFFICIENT') {
      return { status: 'INSUFFICIENT', shortages: composition.shortages };
    }

    const orderedQuestionIds = composition.questions.map(question => question.id);
    if (orderedQuestionIds.length !== 30 || new Set(orderedQuestionIds).size !== 30) {
      throw new Error('A composição do Diagnóstico Inicial deve conter exatamente 30 questões distintas.');
    }

    // The persistence contract handles a concurrent winner and returns that
    // attempt, so the caller never receives an alternative or partial selection.
    const persisted = await this.repository.createInitialOrGetExisting({ studentId, orderedQuestionIds });
    return { status: persisted.attempt.state, attempt: persisted.attempt, created: persisted.created };
  }
}
