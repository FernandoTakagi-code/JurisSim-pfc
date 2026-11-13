import { individualExamPilotBatchId } from '../config/individual-exam-feature';
import { toEligibleCandidate, type InventoryRow } from '../repositories/prisma-initial-diagnostic-repository';
import { draftPilotInventoryWhere, isDraftPilotQuestion } from './draft-pilot-eligibility';

// An explicit provisional path, not an approval or a change to the standard bank.
export function individualExamInventoryWhere() { return draftPilotInventoryWhere(individualExamPilotBatchId()); }
export function isIndividualExamPilotQuestion(row: InventoryRow) {
  return isDraftPilotQuestion(row, individualExamPilotBatchId());
}
export function isIndividualExamSelectable(row: InventoryRow) {
  return individualExamPilotBatchId() ? isIndividualExamPilotQuestion(row) : Boolean(toEligibleCandidate(row));
}
