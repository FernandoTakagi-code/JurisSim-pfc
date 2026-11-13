import { defineConfig } from 'vitest/config';
import { accountDeletionEnabled } from './src/account-deletion-availability';

if (!accountDeletionEnabled()) throw new Error('H4.24: integração suspensa. Nenhuma conexão de banco será aberta.');

// Entrypoint: node scripts/h424-local.cjs. No dotenv or database fallback.
for (const [key, name] of [['DATABASE_URL', 'jurissim_h424_test'], ['SHADOW_DATABASE_URL', 'jurissim_h424_shadow']]) {
  const url = new URL(process.env[key]!);
  if (url.hostname !== '127.0.0.1' || url.port !== '5432' || url.pathname !== '/' + name || url.search || url.hash) throw new Error('H4.24: destino recusado.');
}
export default defineConfig({ test: { include: ['src/__tests__/integration/h424.integration.test.ts'], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000 } });
