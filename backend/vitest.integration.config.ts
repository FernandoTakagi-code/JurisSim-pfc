import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// Testes de integração: usam um PostgreSQL de TESTE (TEST_DATABASE_URL),
// nunca o banco de desenvolvimento.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./src/__tests__/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: testDatabaseUrl
      ? {
          DATABASE_URL: testDatabaseUrl,
          DIRECT_URL: process.env.TEST_DIRECT_URL ?? testDatabaseUrl,
          JWT_SECRET: 'segredo-exclusivo-dos-testes-de-integracao-jurissim',
        }
      : {},
  },
});