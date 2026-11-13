import { defineConfig } from 'vitest/config';

// Testes unitários e de rota com dependências mockadas (não acessam banco).
export default defineConfig({
  test: {
    // Prevent dotenv or an inherited shell from enabling real provider calls.
    // Delivery suites explicitly supply fixtures and mock network clients.
    env: { BREVO_EMAIL_TRANSPORT: 'api', BREVO_API_KEY: '', BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '',
      // Local pilot activation must not change unrelated route/auth fixtures.
      INITIAL_DIAGNOSTIC_REQUIRED: 'false', INITIAL_DIAGNOSTIC_API_ENABLED: 'false',
      INITIAL_DIAGNOSTIC_PILOT_ENABLED: 'false', INITIAL_DIAGNOSTIC_PILOT_BATCH_ID: '',
      INITIAL_DIAGNOSTIC_COMPOSITION_MODE: 'MISTA_15_15',
      INDIVIDUAL_EXAM_SCHEMA_ENABLED: 'false', INDIVIDUAL_EXAM_API_ENABLED: 'false',
      INDIVIDUAL_EXAM_PILOT_ENABLED: 'false', INDIVIDUAL_EXAM_PILOT_BATCH_ID: '',
      QUESTION_PRACTICE_PILOT_ENABLED: 'false', QUESTION_PRACTICE_PILOT_BATCH_ID: '',
      QUESTION_PRACTICE_PILOT_BATCH_IDS: '', INDIVIDUAL_EXAM_PILOT_BATCH_IDS: '',
      QUESTION_REVIEW_SCHEMA_ENABLED: 'false', QUESTION_REVIEW_API_ENABLED: 'false',
      INSTITUTIONS_ENABLED: 'false', ADMINISTRATION_ENABLED: 'false', INSTITUTION_REGISTRATION_ENABLED: 'false',
    },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/**/*.integration.test.ts'],
  },
});
