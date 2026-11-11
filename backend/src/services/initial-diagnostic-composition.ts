import { isEligiblePublicQuestion, type QuestionCandidate, type QuestionLevel, type QuestionOrigin } from './question-eligibility';
import { INITIAL_DIAGNOSTIC_DISCIPLINES } from './initial-diagnostic-config';

export { INITIAL_DIAGNOSTIC_DISCIPLINES } from './initial-diagnostic-config';

export type InitialDiagnosticDiscipline = typeof INITIAL_DIAGNOSTIC_DISCIPLINES[number];

export interface InitialDiagnosticCandidate extends QuestionCandidate {
  discipline: string;
  /** Only an explicitly selected provisional batch may carry this marker. */
  draftPilotBatchId?: string;
}

export interface InitialDiagnosticSlot {
  discipline: InitialDiagnosticDiscipline;
  level: QuestionLevel;
  origin: Exclude<QuestionOrigin, 'PROFESSOR'>;
  quantity: number;
}

export const INITIAL_DIAGNOSTIC_COMPOSITION: readonly InitialDiagnosticSlot[] = Object.freeze(
  INITIAL_DIAGNOSTIC_DISCIPLINES.flatMap((discipline) => [
    { discipline, level: 'BASICO' as const, origin: 'IA' as const, quantity: 2 },
    { discipline, level: 'INTERMEDIARIO' as const, origin: 'IA' as const, quantity: 1 },
    { discipline, level: 'INTERMEDIARIO' as const, origin: 'OAB_OFICIAL' as const, quantity: 1 },
    { discipline, level: 'AVANCADO' as const, origin: 'OAB_OFICIAL' as const, quantity: 2 },
  ]),
);

export type InitialDiagnosticCompositionMode = 'MISTA_15_15' | 'AUTORAL_30';

export function parseInitialDiagnosticCompositionMode(value?: string): InitialDiagnosticCompositionMode {
  const mode = value?.trim() || 'MISTA_15_15';
  if (mode !== 'MISTA_15_15' && mode !== 'AUTORAL_30') {
    throw new RangeError('Composição inválida: use MISTA_15_15 ou AUTORAL_30.');
  }
  return mode;
}

const authorialComposition: readonly InitialDiagnosticSlot[] = Object.freeze(
  INITIAL_DIAGNOSTIC_DISCIPLINES.flatMap(discipline =>
    (['BASICO', 'INTERMEDIARIO', 'AVANCADO'] as const).map(level =>
      ({ discipline, level, origin: 'IA' as const, quantity: 2 }))),
);

export function getInitialDiagnosticComposition(mode: InitialDiagnosticCompositionMode): readonly InitialDiagnosticSlot[] {
  // Validate at runtime too: scripts receive untrusted command-line strings.
  return parseInitialDiagnosticCompositionMode(mode) === 'AUTORAL_30'
    ? authorialComposition : INITIAL_DIAGNOSTIC_COMPOSITION;
}

export interface InitialDiagnosticShortage {
  discipline: InitialDiagnosticDiscipline;
  level: QuestionLevel;
  origin: Exclude<QuestionOrigin, 'PROFESSOR'>;
  required: number;
  available: number;
}

export type InitialDiagnosticCompositionResult =
  | {
      status: 'READY';
      questions: InitialDiagnosticCandidate[];
      repeatedFromHistory: string[];
    }
  | {
      status: 'INSUFFICIENT';
      questions: [];
      repeatedFromHistory: [];
      shortages: InitialDiagnosticShortage[];
    };

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError('A função de sorteio deve retornar um número entre 0 (inclusivo) e 1 (exclusivo).');
    }
    const swapIndex = Math.floor(value * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

/**
 * Composes a 30-question diagnostic using the explicitly selected policy.
 * Eligibility and review requirements remain independent of that policy.
 * The caller must persist the returned ordered IDs when creating an
 * attempt; refreshes must read that attempt instead of calling this selector.
 * No partial attempt is returned if any of the 30 slots lacks inventory.
 */
export function composeInitialDiagnostic(
  inventory: readonly InitialDiagnosticCandidate[],
  previouslyAnsweredIds: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
  mode: InitialDiagnosticCompositionMode = 'MISTA_15_15',
  pilotBatchId?: string,
): InitialDiagnosticCompositionResult {
  if (pilotBatchId && mode !== 'AUTORAL_30') throw new Error('Piloto exige composição autoral.');
  const slots = getInitialDiagnosticComposition(mode);
  const seenIds = new Set<string>();
  const eligible = inventory.filter((question) => {
    const pilotEligible = Boolean(pilotBatchId && question.draftPilotBatchId === pilotBatchId
      && question.origin === 'IA' && question.public && question.complete && !question.annulled);
    if (seenIds.has(question.id) || (!isEligiblePublicQuestion(question) && !pilotEligible)) return false;
    if (!INITIAL_DIAGNOSTIC_DISCIPLINES.includes(question.discipline as InitialDiagnosticDiscipline)) return false;
    seenIds.add(question.id);
    return true;
  });

  const shortages: InitialDiagnosticShortage[] = [];
  for (const slot of slots) {
    const available = eligible.filter((question) => question.discipline === slot.discipline
      && question.level === slot.level && question.origin === slot.origin).length;
    if (available < slot.quantity) {
      shortages.push({ discipline: slot.discipline, level: slot.level, origin: slot.origin,
        required: slot.quantity, available });
    }
  }

  if (shortages.length) {
    return { status: 'INSUFFICIENT', questions: [], repeatedFromHistory: [], shortages };
  }

  const selected: InitialDiagnosticCandidate[] = [];
  const repeatedFromHistory: string[] = [];
  const selectedIds = new Set<string>();

  for (const slot of slots) {
    const candidates = eligible.filter((question) => question.discipline === slot.discipline
      && question.level === slot.level && question.origin === slot.origin && !selectedIds.has(question.id));
    const unseen = shuffle(candidates.filter((question) => !previouslyAnsweredIds.has(question.id)), random);
    const seen = shuffle(candidates.filter((question) => previouslyAnsweredIds.has(question.id)), random);
    const chosen = [...unseen, ...seen].slice(0, slot.quantity);

    // Inventory was checked above; this guards against accidental policy drift.
    if (chosen.length !== slot.quantity) {
      throw new Error(`A composição mudou durante a seleção: ${slot.discipline}/${slot.level}/${slot.origin}.`);
    }
    for (const question of chosen) {
      selectedIds.add(question.id);
      selected.push(question);
      if (previouslyAnsweredIds.has(question.id)) repeatedFromHistory.push(question.id);
    }
  }

  return { status: 'READY', questions: selected, repeatedFromHistory };
}
