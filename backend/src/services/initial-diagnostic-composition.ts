import { isEligiblePublicQuestion, type QuestionCandidate, type QuestionLevel, type QuestionOrigin } from './question-eligibility';
import { INITIAL_DIAGNOSTIC_DISCIPLINES } from './initial-diagnostic-config';

export { INITIAL_DIAGNOSTIC_DISCIPLINES } from './initial-diagnostic-config';

export type InitialDiagnosticDiscipline = typeof INITIAL_DIAGNOSTIC_DISCIPLINES[number];

export interface InitialDiagnosticCandidate extends QuestionCandidate {
  discipline: string;
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
 * Composes the approved initial 30-question diagnostic from an in-memory
 * inventory. The caller must persist the returned ordered IDs when creating an
 * attempt; refreshes must read that attempt instead of calling this selector.
 * No partial attempt is returned if any of the 30 slots lacks inventory.
 */
export function composeInitialDiagnostic(
  inventory: readonly InitialDiagnosticCandidate[],
  previouslyAnsweredIds: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): InitialDiagnosticCompositionResult {
  const seenIds = new Set<string>();
  const eligible = inventory.filter((question) => {
    if (seenIds.has(question.id) || !isEligiblePublicQuestion(question)) return false;
    if (!INITIAL_DIAGNOSTIC_DISCIPLINES.includes(question.discipline as InitialDiagnosticDiscipline)) return false;
    seenIds.add(question.id);
    return true;
  });

  const shortages: InitialDiagnosticShortage[] = [];
  for (const slot of INITIAL_DIAGNOSTIC_COMPOSITION) {
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

  for (const slot of INITIAL_DIAGNOSTIC_COMPOSITION) {
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
