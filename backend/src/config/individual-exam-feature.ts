export function isIndividualExamSchemaEnabled() { return process.env.INDIVIDUAL_EXAM_SCHEMA_ENABLED === 'true'; }
export function isIndividualExamEnabled() { return isIndividualExamSchemaEnabled() && process.env.INDIVIDUAL_EXAM_API_ENABLED === 'true'; }
export function individualExamPilotBatchId(): string | null {
  const id = process.env.INDIVIDUAL_EXAM_PILOT_BATCH_ID?.trim();
  return process.env.INDIVIDUAL_EXAM_PILOT_ENABLED === 'true' && id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
