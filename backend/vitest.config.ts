import { defineConfig } from 'vitest/config';

// Testes unitários e de rota com dependências mockadas (não acessam banco).
export default defineConfig({
  test: {
    // Prevent dotenv or an inherited shell from enabling real SMTP in tests.
    // Delivery suites explicitly supply fixtures and mock Nodemailer.
    env: { BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '' },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/**/*.integration.test.ts'],
  },
});
