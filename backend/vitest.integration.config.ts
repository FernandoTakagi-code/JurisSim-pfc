import { defineConfig } from 'vitest/config';
import { disposableDatabaseConfig } from './src/__tests__/integration/disposable-database';

// Reject unowned/mismatched targets before test modules or clients are loaded.
// Never load .env or silently replace DATABASE_URL with a less-validated URL.
const { url } = disposableDatabaseConfig();

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./src/__tests__/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test', DATABASE_URL: url, DIRECT_URL: url,
      TEST_DATABASE_URL: url, TEST_DIRECT_URL: url,
      JWT_SECRET: 'segredo-exclusivo-dos-testes-de-integracao-jurissim',
      GMAIL_USER: '', GMAIL_APP_PASSWORD: '', GOOGLE_CLIENT_ID: '', GROQ_API_KEY: '',
    },
  },
});
