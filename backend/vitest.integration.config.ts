import { defineConfig } from 'vitest/config';
import { disposableDatabaseConfig } from './src/__tests__/integration/disposable-database';

// Reject unowned/mismatched targets before test modules or clients are loaded.
// Never load .env or silently replace DATABASE_URL with a less-validated URL.
const { url, port } = disposableDatabaseConfig();
const database = process.env.JURISSIM_TEST_INTEGRATION_DATABASE!;

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./src/__tests__/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test', DATABASE_URL: url, DIRECT_URL: url, SHADOW_DATABASE_URL: url,
      TEST_DATABASE_URL: url, TEST_DIRECT_URL: url,
      PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: String(port),
      PGDATABASE: database, PGUSER: 'jurissim_migration_test',
      PGOPTIONS: '', PGSERVICE: '', PGSERVICEFILE: '', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5', CHECKPOINT_DISABLE: '1',
      PGPASSWORD: process.env.JURISSIM_TEST_DB_PASSWORD!,
      PGPASSFILE: process.env.JURISSIM_TEST_PGPASSFILE!,
      JURISSIM_TEST_DB_PASSWORD: process.env.JURISSIM_TEST_DB_PASSWORD!,
      JURISSIM_TEST_PGPASSFILE: process.env.JURISSIM_TEST_PGPASSFILE!,
      JURISSIM_TEST_DATA_DIR: process.env.JURISSIM_TEST_DATA_DIR!,
      JURISSIM_TEST_INTEGRATION_DATABASE: database,
      JURISSIM_TEST_CAPABILITY: process.env.JURISSIM_TEST_CAPABILITY!,
      ...(process.env.JURISSIM_TEST_TARGET === 'WSL_LOCAL' ? {
        JURISSIM_TEST_TARGET: 'WSL_LOCAL',
        JURISSIM_TEST_WSL_MANIFEST: process.env.JURISSIM_TEST_WSL_MANIFEST!,
        JURISSIM_TEST_WSL_SYSTEM_IDENTIFIER: process.env.JURISSIM_TEST_WSL_SYSTEM_IDENTIFIER!,
      } : {}),
      JWT_SECRET: 'segredo-exclusivo-dos-testes-de-integracao-jurissim',
      PRISMA_HIDE_UPDATE_MESSAGE: 'true',
      GMAIL_USER: '', GMAIL_APP_PASSWORD: '', GOOGLE_CLIENT_ID: '', GROQ_API_KEY: '',
      BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '',
    },
  },
});
