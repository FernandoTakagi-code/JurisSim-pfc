import { individualExamPilotBatchIds } from '../../config/individual-exam-feature';
import { toEligibleCandidate, type InventoryRow } from '../../repositories/prisma-initial-diagnostic-repository';
import { draftPilotInventoryWhere, isDraftPilotQuestion } from '../questions/draft-pilot-eligibility';

// Um caminho provisório explícito, não uma aprovação nem uma alteração no banco padrão.
export function individualExamInventoryWhere() { return draftPilotInventoryWhere(individualExamPilotBatchIds()); }
export function isIndividualExamPilotQuestion(row: InventoryRow) {
  return isDraftPilotQuestion(row, individualExamPilotBatchIds());
}
export function isIndividualExamSelectable(row: InventoryRow) {
  return individualExamPilotBatchIds().length ? isIndividualExamPilotQuestion(row) : Boolean(toEligibleCandidate(row));
}
