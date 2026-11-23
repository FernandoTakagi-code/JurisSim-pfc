import { describe, expect, it } from 'vitest';
import practice60 from '../../../scripts/drafts/authorial-practice-60.draft.json';
import expansion60 from '../../../scripts/drafts/authorial-practice-expansion-60.draft.json';
import { planPilotBatchCompletion } from '../../../src/services/questions/pilot-batch-completion';
import { preparePracticeDraftImport } from '../../../src/services/questions/practice-draft-import';

const files = [practice60, expansion60];
const ADM = 'Direito Administrativo', CIV = 'Direito Civil';

describe('planPilotBatchCompletion', () => {
  it('completa cada disciplina pedida até o alvo, usando rascunhos que ainda não estão no banco', () => {
    const plan = planPilotBatchCompletion(files, { current: { [ADM]: 0, [CIV]: 1 }, existingFingerprints: new Set(), existingStatements: new Set(), disciplines: [ADM, CIV], target: 10 });
    expect(plan.map(p => [p.discipline, p.items.length])).toEqual([[ADM, 10], [CIV, 9]]);
    for (const p of plan) for (const item of p.items) expect(item.question.disciplina).toBe(p.discipline);
    expect(new Set(plan.flatMap(p => p.items.map(i => i.fingerprint))).size).toBe(19);
  });

  it('pula rascunhos cujo conteúdo já existe no banco', () => {
    const { batch, fingerprints } = preparePracticeDraftImport(practice60);
    const admIndexes = batch.questions.map((q, i) => [q, i] as const).filter(([q]) => q.disciplina === ADM).map(([, i]) => i);
    const taken = new Set(admIndexes.map(i => fingerprints[i]));
    const plan = planPilotBatchCompletion(files, { current: { [ADM]: 0 }, existingFingerprints: taken, existingStatements: new Set(), disciplines: [ADM], target: 10 });
    expect(plan[0].items).toHaveLength(10);
    for (const item of plan[0].items) expect(taken.has(item.fingerprint)).toBe(false);
  });

  it('pula rascunhos cujo enunciado já existe (após normalizar espaços e maiúsculas)', () => {
    const { batch } = preparePracticeDraftImport(practice60);
    const first = batch.questions.find(q => q.disciplina === CIV)!;
    const plan = planPilotBatchCompletion(files, { current: { [CIV]: 0 }, existingFingerprints: new Set(), existingStatements: new Set(['  ' + first.enunciado.toUpperCase() + ' ']), disciplines: [CIV], target: 10 });
    expect(plan[0].items.some(i => i.question._draftSlot === first._draftSlot)).toBe(false);
  });

  it('não acrescenta nada quando a disciplina já atingiu o alvo (rodar de novo é seguro)', () => {
    const plan = planPilotBatchCompletion(files, { current: { [ADM]: 10, [CIV]: 12 }, existingFingerprints: new Set(), existingStatements: new Set(), disciplines: [ADM, CIV], target: 10 });
    expect(plan.map(p => p.items.length)).toEqual([0, 0]);
  });

  it('recusa o plano inteiro se faltar rascunho para alguma disciplina', () => {
    const { fingerprints } = preparePracticeDraftImport(practice60);
    const exp = preparePracticeDraftImport(expansion60);
    const all = new Set([...fingerprints, ...exp.fingerprints]);
    expect(() => planPilotBatchCompletion(files, { current: { [ADM]: 0 }, existingFingerprints: all, existingStatements: new Set(), disciplines: [ADM], target: 10 }))
      .toThrow('Rascunhos insuficientes em Direito Administrativo: faltam 10, disponíveis 0.');
  });

  it('recusa disciplina fora das cinco do simulado e alvo inválido', () => {
    expect(() => planPilotBatchCompletion(files, { current: {}, existingFingerprints: new Set(), existingStatements: new Set(), disciplines: ['Direito Tributário'], target: 10 })).toThrow();
    expect(() => planPilotBatchCompletion(files, { current: {}, existingFingerprints: new Set(), existingStatements: new Set(), disciplines: [ADM], target: 0 })).toThrow();
  });
});
