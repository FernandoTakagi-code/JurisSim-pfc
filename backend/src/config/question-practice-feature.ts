export function isQuestionPracticeSchemaEnabled(): boolean {
  return process.env.QUESTION_PRACTICE_SCHEMA_ENABLED?.trim().toLowerCase() === 'true';
}

export function isQuestionPracticeApiEnabled(): boolean {
  return isQuestionPracticeSchemaEnabled()
    && process.env.QUESTION_PRACTICE_API_ENABLED?.trim().toLowerCase() === 'true';
}
