import {
  composeInitialDiagnostic,
  type InitialDiagnosticCandidate,
  type InitialDiagnosticCompositionResult,
  type InitialDiagnosticCompositionMode,
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
  provisional?: boolean;
  state: InitialDiagnosticAttemptState;
  /** IDs das questões persistidas na ordem estável da tentativa. */
  orderedQuestionIds: readonly string[];
}

export interface CreateInitialDiagnosticInput {
  studentId: string;
  provisional?: boolean;
  /** A ordem é significativa e deve ser salva como as posições da tentativa. */
  orderedQuestionIds: readonly string[];
}

export interface CreateOrGetInitialDiagnosticResult {
  attempt: InitialDiagnosticAttempt;
  created: boolean;
}

/**
 * Fronteira de persistência dos diagnósticos iniciais.
 *
 * Um adaptador PostgreSQL deve implementar createInitialOrGetExisting de forma atômica:
 * criar o Simulado + a identidade DiagnosticoInicial + todos os vínculos ordenados de questões
 * em uma única transação, garantir um único diagnóstico inicial por aluno com uma restrição única
 * e buscar/retornar a tentativa vencedora em caso de conflito de unicidade. Uma porta com mock pode
 * testar o comportamento do serviço, mas não comprova a concorrência do banco nem as garantias
 * de transação; isso exige testes de integração posteriores em PostgreSQL descartável.
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
    private readonly compositionMode: InitialDiagnosticCompositionMode = 'MISTA_15_15',
    private readonly pilotBatchId?: string,
  ) {}

  async getOrCreate(studentId: string): Promise<InitialDiagnosticServiceResult> {
    const existing = await this.repository.findInitialAttempt(studentId);
    if (existing) return { status: existing.state, attempt: existing, created: false };

    const [inventory, answeredQuestionIds] = await Promise.all([
      this.repository.listEligibleInventory(),
      this.repository.listAnsweredQuestionIds(studentId),
    ]);
    const composition = composeInitialDiagnostic(inventory, answeredQuestionIds, this.random, this.compositionMode, this.pilotBatchId);

    if (composition.status === 'INSUFFICIENT') {
      return { status: 'INSUFFICIENT', shortages: composition.shortages };
    }

    const orderedQuestionIds = composition.questions.map(question => question.id);
    if (orderedQuestionIds.length !== 30 || new Set(orderedQuestionIds).size !== 30) {
      throw new Error('A composição do Diagnóstico Inicial deve conter exatamente 30 questões distintas.');
    }

    // O contrato de persistência trata um vencedor concorrente e retorna essa
    // tentativa, então quem chama nunca recebe uma seleção alternativa ou parcial.
    const provisional = Boolean(this.pilotBatchId && composition.questions.some(q => q.draftPilotBatchId === this.pilotBatchId));
    const persisted = await this.repository.createInitialOrGetExisting({ studentId, orderedQuestionIds,
      ...(provisional ? { provisional: true } : {}) });
    return { status: persisted.attempt.state, attempt: persisted.attempt, created: persisted.created };
  }
}
