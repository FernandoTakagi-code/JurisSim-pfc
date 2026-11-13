import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { individualExamInventoryWhere, isIndividualExamPilotQuestion, isIndividualExamSelectable } from './individual-exam-pilot';
import { toEligibleCandidate, type InventoryRow } from '../repositories/prisma-initial-diagnostic-repository';
import { isPracticeSelectable } from './question-practice-pilot';

const batchId = '9218bdec-f4e3-43a1-8b54-cdc40720dea5';
function row(): InventoryRow {
  const q = JSON.parse(readFileSync(resolve(__dirname, '../../scripts/drafts/authorial-practice-60.draft.json'), 'utf8')).questions[0];
  return { ...q, id: 'question', loteImportacaoId: batchId, publica: false, turmaId: null,
    revisaoJuridicaEm: null, revisorJuridicoId: null, revisaoPedagogicaEm: null, revisorPedagogicoId: null, liberadaAcervoEm: null, liberadaAcervoPorId: null,
    fonteReferencia: `RASCUNHO_PRATICA_EM_REVISAO\n${JSON.stringify({ draftId: q._draftSlot, preliminaryReview: q.preliminaryReview, reference: q.source.reference, comentarios: q.alternativas.map((a: any) => ({ letra: a.letra, comentario: a.comentario })) })}`,
    licencaOuAutorizacao: q.source.licenseOrAuthorization, alternativas: q.alternativas.map((a: any, i: number) => ({ ...a, id: `a${i}` })),
  } as InventoryRow;
}
beforeEach(() => { vi.stubEnv('INDIVIDUAL_EXAM_PILOT_ENABLED', 'true'); vi.stubEnv('INDIVIDUAL_EXAM_PILOT_BATCH_ID', batchId); });
afterEach(() => vi.unstubAllEnvs());
it('keeps practice pilot authorization independent from the individual exam pilot', () => {
  vi.stubEnv('QUESTION_PRACTICE_PILOT_ENABLED', 'false');
  expect(isPracticeSelectable(row())).toBe(false);
  vi.stubEnv('QUESTION_PRACTICE_PILOT_ENABLED', 'true'); vi.stubEnv('QUESTION_PRACTICE_PILOT_BATCH_ID', batchId);
  expect(isPracticeSelectable(row())).toBe(true);
  vi.stubEnv('INDIVIDUAL_EXAM_PILOT_ENABLED', 'false');
  expect(isPracticeSelectable(row())).toBe(true);
  expect(toEligibleCandidate(row())).toBeNull();
});
it('selects only the explicit private batch without treating it as human-approved', () => {
  const q = row();
  expect(individualExamInventoryWhere()).toMatchObject({ loteImportacaoId: batchId, publica: false, revisaoJuridicaEm: null });
  expect(isIndividualExamSelectable(q)).toBe(true);
  expect(toEligibleCandidate(q)).toBeNull();
  expect(q.revisaoJuridicaEm).toBeNull();
});
it('selects either allowlisted batch while refusing unrelated private batches', () => {
  const second = '2318bdec-f4e3-43a1-8b54-cdc40720dea5';
  vi.stubEnv('INDIVIDUAL_EXAM_PILOT_BATCH_IDS', `${batchId},${second}`);
  expect(individualExamInventoryWhere()).toMatchObject({ loteImportacaoId: { in: [batchId, second] } });
  expect(isIndividualExamSelectable({ ...row(), loteImportacaoId: second })).toBe(true);
  expect(isIndividualExamSelectable({ ...row(), loteImportacaoId: '3318bdec-f4e3-43a1-8b54-cdc40720dea5' })).toBe(false);
});
it('refuses another batch, public records, partial approvals, malformed provenance and incomplete keys', () => {
  for (const changes of [{ loteImportacaoId: 'another' }, { publica: true }, { revisorJuridicoId: 'invented' }, { fonteReferencia: 'anything' }, { origem: 'OAB_OFICIAL' }, { disciplina: 'Outra' }, { alternativas: row().alternativas.slice(0, 3) }]) expect(isIndividualExamPilotQuestion({ ...row(), ...changes } as InventoryRow)).toBe(false);
});
it('cannot select pending questions when the pilot flag is closed or its batch is invalid', () => {
  vi.stubEnv('INDIVIDUAL_EXAM_PILOT_ENABLED', 'false'); expect(isIndividualExamSelectable(row())).toBe(false);
  vi.stubEnv('INDIVIDUAL_EXAM_PILOT_ENABLED', 'true'); vi.stubEnv('INDIVIDUAL_EXAM_PILOT_BATCH_ID', 'invalid'); expect(isIndividualExamSelectable(row())).toBe(false);
});
