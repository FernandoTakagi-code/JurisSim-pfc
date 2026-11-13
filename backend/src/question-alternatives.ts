export const QUESTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

type Alternative = { texto: string; correta: boolean };

/** Shared by the API, business rules and question forms. Letters follow array order. */
export function questionAlternativesError(alternatives: readonly Alternative[]): string | null {
  if (alternatives.length !== QUESTION_LETTERS.length) return 'A questão deve ter exatamente quatro alternativas (A–D).';
  if (alternatives.some(alternative => !alternative.texto.trim())) return 'Preencha o texto de todas as alternativas.';
  const normalized = alternatives.map(alternative => alternative.texto.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR'));
  if (new Set(normalized).size !== alternatives.length) return 'As alternativas devem ter textos diferentes.';
  if (alternatives.filter(alternative => alternative.correta).length !== 1) return 'A questão deve ter exatamente uma alternativa correta';
  return null;
}
