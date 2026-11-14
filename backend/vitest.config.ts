import { defineConfig } from 'vitest/config';

// Testes unitários e de rota com dependências mockadas (não acessam banco).
export default defineConfig({
  test: {
    // Prevent dotenv or an inherited shell from enabling real provider calls.
    // Delivery suites explicitly supply fixtures and mock network clients.
    env: { BREVO_EMAIL_TRANSPORT: 'api', BREVO_API_KEY: '', BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '',
      // Same defaults as a clean CI runner: a developer's local .env must not change unit results.
      INSTITUTIONS_ENABLED: 'false', ADMINISTRATION_ENABLED: 'false', INSTITUTION_REGISTRATION_ENABLED: 'false' },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/**/*.integration.test.ts'],
  },
});
