import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/**/*.integration.test.ts'],
    setupFiles: ['./src/__tests__/no-database.ts'],
    env: { NODE_ENV: 'test', DATABASE_URL: 'postgresql://disabled:disabled@127.0.0.1:1/jurissim_h424_test', DIRECT_URL: 'postgresql://disabled:disabled@127.0.0.1:1/jurissim_h424_test',
      EMAIL_REUSE_BLOCKS_ENABLED: 'false', ADMINISTRATION_ENABLED: 'false', INSTITUTIONS_ENABLED: 'false', INSTITUTION_REGISTRATION_ENABLED: 'false', INSTITUTION_HOMOLOGATION_ENABLED: 'false',
      JWT_SECRET: 'no-database-test-secret-at-least-32-characters', BREVO_API_KEY: '', BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '', GMAIL_USER: '', GMAIL_APP_PASSWORD: '' },
  },
});
