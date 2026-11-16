import { defineConfig } from 'vitest/config';

// Testes unitários e de rota com dependências mockadas (não acessam banco).
export default defineConfig({
  test: {
    // Prevent dotenv or an inherited shell from enabling real provider calls.
    // Delivery suites explicitly supply fixtures and mock network clients.
    setupFiles: ['./tests/setup/no-database.ts'],
    env: { NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://disabled:disabled@127.0.0.1:1/jurissim_unit_test',
      DIRECT_URL: 'postgresql://disabled:disabled@127.0.0.1:1/jurissim_unit_test',
      JWT_SECRET: 'isolated-unit-test-secret-at-least-32-characters',
      APP_PUBLIC_URL: 'http://localhost:5173', CORS_ORIGINS: 'http://localhost:5173',
      EMAIL_REUSE_BLOCKS_ENABLED: 'false',
      BREVO_EMAIL_TRANSPORT: 'api', BREVO_API_KEY: '', BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '',
      GMAIL_USER: '', GMAIL_APP_PASSWORD: '', GOOGLE_CLIENT_ID: '', GROQ_API_KEY: '',
      TEACHER_INVITATIONS_MODE: '', INSTITUTION_HOMOLOGATION_ENABLED: 'false',
      INSTITUTION_TEACHER_MANAGEMENT_ENABLED: 'false', INSTITUTION_EXAM_MANAGEMENT_ENABLED: 'false',
      CLASS_ACTIVITY_PILOT_ENABLED: 'false', CLASS_ACTIVITY_PILOT_BATCH_ID: '', CLASS_ACTIVITY_PILOT_BATCH_IDS: '',
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
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});
