import { questionPracticePilotBatchId } from '../config/question-practice-feature';
import { toEligibleCandidate, type InventoryRow } from '../repositories/prisma-initial-diagnostic-repository';
import { draftPilotInventoryWhere, isDraftPilotQuestion } from './draft-pilot-eligibility';
export function practiceInventoryWhere() { return draftPilotInventoryWhere(questionPracticePilotBatchId()); }
export function isPracticePilotQuestion(row: InventoryRow) { return isDraftPilotQuestion(row, questionPracticePilotBatchId()); }
export function isPracticeSelectable(row: InventoryRow) { return questionPracticePilotBatchId() ? isPracticePilotQuestion(row) : Boolean(toEligibleCandidate(row)); }
