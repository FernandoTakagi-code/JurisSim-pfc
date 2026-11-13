import { questionPracticePilotBatchIds } from '../config/question-practice-feature';
import { toEligibleCandidate, type InventoryRow } from '../repositories/prisma-initial-diagnostic-repository';
import { draftPilotInventoryWhere, isDraftPilotQuestion } from './draft-pilot-eligibility';
export function practiceInventoryWhere() { return draftPilotInventoryWhere(questionPracticePilotBatchIds()); }
export function isPracticePilotQuestion(row: InventoryRow) { return isDraftPilotQuestion(row, questionPracticePilotBatchIds()); }
export function isPracticeSelectable(row: InventoryRow) { return questionPracticePilotBatchIds().length ? isPracticePilotQuestion(row) : Boolean(toEligibleCandidate(row)); }
