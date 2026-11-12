import { afterEach, expect, it, vi } from 'vitest';
import { isIndividualExamEnabled, isIndividualExamSchemaEnabled } from './individual-exam-feature';
afterEach(() => vi.unstubAllEnvs());
it.each([[false, false], [true, false], [false, true], [true, true]])('requires schema=%s and api=%s together', (schema, api) => {
  vi.stubEnv('INDIVIDUAL_EXAM_SCHEMA_ENABLED', String(schema)); vi.stubEnv('INDIVIDUAL_EXAM_API_ENABLED', String(api));
  expect(isIndividualExamEnabled()).toBe(schema && api);
  expect(isIndividualExamSchemaEnabled()).toBe(schema);
});
