import { pilotBatchIds } from './pilot-batches';
export function isIndividualExamSchemaEnabled() { return process.env.INDIVIDUAL_EXAM_SCHEMA_ENABLED === 'true'; }
export function isIndividualExamEnabled() { return isIndividualExamSchemaEnabled() && process.env.INDIVIDUAL_EXAM_API_ENABLED === 'true'; }
export function individualExamPilotBatchId(): string | null {
  return individualExamPilotBatchIds()[0] ?? null;
}
export function individualExamPilotBatchIds() { return pilotBatchIds('INDIVIDUAL_EXAM'); }
