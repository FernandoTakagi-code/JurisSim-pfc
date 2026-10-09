import { defineConfig } from 'vitest/config';

// Testes unitários e de rota com dependências mockadas (não acessam banco).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/**/*.integration.test.ts'],
  },
});