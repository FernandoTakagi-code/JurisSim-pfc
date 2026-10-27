import { describe, expect, it } from 'vitest';
import {
  INITIAL_DIAGNOSTIC_COMPOSITION,
  INITIAL_DIAGNOSTIC_DISCIPLINES,
  composeInitialDiagnostic,
  type InitialDiagnosticCandidate,
} from './initial-diagnostic-composition';

function makeInventory(extraPerSlot = 2): InitialDiagnosticCandidate[] {
  const questions: InitialDiagnosticCandidate[] = [];
  for (const slot of INITIAL_DIAGNOSTIC_COMPOSITION) {
    for (let index = 0; index < slot.quantity + extraPerSlot; index++) {
      const id = `${slot.discipline}|${slot.level}|${slot.origin}|${index}`;
      questions.push({
        id,
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
      });
    }
  }
  return questions;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function ready(inventory = makeInventory(), answered = new Set<string>(), seed = 123) {
  const result = composeInitialDiagnostic(inventory, answered, seededRandom(seed));
  expect(result.status).toBe('READY');
  if (result.status !== 'READY') throw new Error('Fixture deveria compor um diagnóstico completo.');
  return result;
}

describe('composição e rotação do Diagnóstico Inicial definitivo', () => {
  it('seleciona exatamente 30 questões', () => {
    expect(ready().questions).toHaveLength(30);
  });

  it('seleciona exatamente seis questões de cada disciplina aprovada', () => {
    const result = ready();
    for (const discipline of INITIAL_DIAGNOSTIC_DISCIPLINES) {
      expect(result.questions.filter(question => question.discipline === discipline)).toHaveLength(6);
    }
    expect(new Set(result.questions.map(question => question.discipline))).toEqual(new Set(INITIAL_DIAGNOSTIC_DISCIPLINES));
  });

  it('respeita a distribuição por origem e dificuldade em cada disciplina', () => {
    const { questions } = ready();
    for (const discipline of INITIAL_DIAGNOSTIC_DISCIPLINES) {
      const inDiscipline = questions.filter(question => question.discipline === discipline);
      expect(inDiscipline.filter(question => question.level === 'BASICO' && question.origin === 'IA')).toHaveLength(2);
      expect(inDiscipline.filter(question => question.level === 'INTERMEDIARIO' && question.origin === 'IA')).toHaveLength(1);
      expect(inDiscipline.filter(question => question.level === 'INTERMEDIARIO' && question.origin === 'OAB_OFICIAL')).toHaveLength(1);
      expect(inDiscipline.filter(question => question.level === 'AVANCADO' && question.origin === 'OAB_OFICIAL')).toHaveLength(2);
    }
  });

  it('não repete IDs dentro da tentativa e faz rotação entre questões elegíveis', () => {
    const inventory = makeInventory();
    const first = ready(inventory, new Set(), 1);
    const second = ready(inventory, new Set(), 2);
    expect(new Set(first.questions.map(question => question.id)).size).toBe(30);
    expect(second.questions.map(question => question.id)).not.toEqual(first.questions.map(question => question.id));
  });

  it('prioriza as questões ainda não respondidas antes de reutilizar as vistas', () => {
    const inventory = makeInventory();
    const answered = new Set<string>();
    // Leave exactly one unseen candidate per required category. For categories
    // requiring two questions, one previous question must be reused.
    for (const slot of INITIAL_DIAGNOSTIC_COMPOSITION) {
      const category = inventory.filter(question => question.discipline === slot.discipline
        && question.level === slot.level && question.origin === slot.origin);
      for (const question of category.slice(0, -1)) answered.add(question.id);
    }
    const result = ready(inventory, answered, 5);
    expect(result.questions.some(question => !answered.has(question.id))).toBe(true);
    expect(result.repeatedFromHistory).toHaveLength(10);
    for (const slot of INITIAL_DIAGNOSTIC_COMPOSITION) {
      const selected = result.questions.filter(question => question.discipline === slot.discipline
        && question.level === slot.level && question.origin === slot.origin);
      expect(selected.some(question => !answered.has(question.id))).toBe(true);
    }
  });

  it('não devolve tentativa parcial e informa a categoria insuficiente', () => {
    const inventory = makeInventory();
    const scarceCategory = inventory.filter(question => question.discipline === 'Direito Penal'
      && question.level === 'AVANCADO' && question.origin === 'OAB_OFICIAL');
    const retainedId = scarceCategory[0].id;
    const reducedInventory = inventory.filter(question => question.discipline !== 'Direito Penal'
      || question.level !== 'AVANCADO' || question.origin !== 'OAB_OFICIAL' || question.id === retainedId);
    const result = composeInitialDiagnostic(reducedInventory, new Set(), seededRandom(1));
    expect(result.status).toBe('INSUFFICIENT');
    if (result.status !== 'INSUFFICIENT') throw new Error('Esperava inventário insuficiente.');
    expect(result.questions).toEqual([]);
    expect(result.shortages).toEqual([{
      discipline: 'Direito Penal', level: 'AVANCADO', origin: 'OAB_OFICIAL', required: 2, available: 1,
    }]);
  });

  it('exclui questões anuladas, incompletas, não publicadas, sem direitos e particulares', () => {
    const inventory = makeInventory();
    const from = (discipline: string, level: InitialDiagnosticCandidate['level'], origin: InitialDiagnosticCandidate['origin']) =>
      inventory.find(question => question.discipline === discipline && question.level === level && question.origin === origin)!;
    const altered: InitialDiagnosticCandidate[] = [
      { ...from('Direito Constitucional', 'BASICO', 'IA'), id: 'invalid-annulled', annulled: true },
      { ...from('Direito Constitucional', 'BASICO', 'IA'), id: 'invalid-incomplete', complete: false },
      { ...from('Direito Constitucional', 'BASICO', 'IA'), id: 'invalid-unpublished', published: false },
      { ...from('Direito Constitucional', 'BASICO', 'IA'), id: 'invalid-private', public: false },
      { ...from('Direito Constitucional', 'BASICO', 'IA'), id: 'invalid-professor', origin: 'PROFESSOR' },
      { ...from('Direito Constitucional', 'INTERMEDIARIO', 'OAB_OFICIAL'), id: 'invalid-rights', reproductionRightsDocumented: false },
      { ...from('Direito Constitucional', 'BASICO', 'IA'), id: 'invalid-legal-review', legalReviewApproved: false },
      { ...from('Direito Constitucional', 'BASICO', 'IA'), id: 'invalid-pedagogical-review', pedagogicalReviewApproved: false },
    ];
    const result = composeInitialDiagnostic([...inventory, ...altered], new Set(), seededRandom(3));
    expect(result.status).toBe('READY');
    if (result.status === 'READY') {
      expect(result.questions).toHaveLength(30);
      expect(result.questions.every(question => !question.id.startsWith('invalid-'))).toBe(true);
    }
  });

  it('é reprodutível quando recebe o mesmo sorteador e inventário', () => {
    const inventory = makeInventory();
    expect(ready(inventory, new Set(), 42).questions.map(question => question.id))
      .toEqual(ready(inventory, new Set(), 42).questions.map(question => question.id));
  });
});
