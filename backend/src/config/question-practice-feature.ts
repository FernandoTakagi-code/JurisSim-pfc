export function isQuestionPracticeSchemaEnabled(): boolean {
  return process.env.QUESTION_PRACTICE_SCHEMA_ENABLED?.trim().toLowerCase() === 'true';
}

export function isQuestionPracticeApiEnabled(): boolean {
  return isQuestionPracticeSchemaEnabled()
    && process.env.QUESTION_PRACTICE_API_ENABLED?.trim().toLowerCase() === 'true';
}
export function questionPracticePilotBatchId(): string | null {
  const id = process.env.QUESTION_PRACTICE_PILOT_BATCH_ID?.trim();
  return process.env.QUESTION_PRACTICE_PILOT_ENABLED === 'true' && id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
