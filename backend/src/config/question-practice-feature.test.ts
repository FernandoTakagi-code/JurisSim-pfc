import { afterEach, describe, expect, it } from 'vitest';
import { isQuestionPracticeApiEnabled, isQuestionPracticeSchemaEnabled } from './question-practice-feature';

afterEach(() => { delete process.env.QUESTION_PRACTICE_SCHEMA_ENABLED; delete process.env.QUESTION_PRACTICE_API_ENABLED; });

describe('question practice feature gates', () => {
  it('keeps schema-dependent history recognition and API disabled by default', () => {
    expect(isQuestionPracticeSchemaEnabled()).toBe(false);
    expect(isQuestionPracticeApiEnabled()).toBe(false);
  });
  it('requires both an applied-schema declaration and explicit API opt-in', () => {
    process.env.QUESTION_PRACTICE_API_ENABLED = 'true';
    expect(isQuestionPracticeApiEnabled()).toBe(false);
    process.env.QUESTION_PRACTICE_SCHEMA_ENABLED = 'true';
    expect(isQuestionPracticeApiEnabled()).toBe(true);
    process.env.QUESTION_PRACTICE_API_ENABLED = '1';
    expect(isQuestionPracticeApiEnabled()).toBe(false);
  });
});
