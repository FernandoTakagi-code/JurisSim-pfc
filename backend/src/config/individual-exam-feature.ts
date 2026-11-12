export function isIndividualExamSchemaEnabled() { return process.env.INDIVIDUAL_EXAM_SCHEMA_ENABLED === 'true'; }
export function isIndividualExamEnabled() { return isIndividualExamSchemaEnabled() && process.env.INDIVIDUAL_EXAM_API_ENABLED === 'true'; }
