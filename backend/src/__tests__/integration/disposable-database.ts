import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

const refusal = 'Testes de banco exigem o cluster descartável do harness local. Execute node scripts/test-migrations-local.cjs <PostgreSQL-bin>. Nenhuma URL externa ou de banco existente é aceita.';
const fail = () => { throw new Error(refusal); };

// Validate before creating clients or executing SQL. Never load .env or accept
// a URL merely because its database/schema contains "test".
export function disposableDatabaseConfig(environment: NodeJS.ProcessEnv = process.env) {
  try {
    assert.equal(environment.NODE_ENV, 'test');
    const keys = ['DATABASE_URL', 'DIRECT_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL'] as const;
    const urls = keys.map(key => new URL(environment[key] ?? ''));
    for (const url of urls) {
      assert.equal(url.protocol, 'postgresql:');
      assert.equal(url.hostname, '127.0.0.1');
      assert.equal(url.username, 'jurissim_migration_test');
      assert.equal(url.password, '');
      assert.equal(url.pathname, '/jurissim_integration');
      assert.equal(url.hash, '');
      assert.ok(/^\d+$/.test(url.port) && Number(url.port) >= 1024 && Number(url.port) <= 65535 && url.port !== '5432');
      assert.equal(url.search, '?schema=public');
      assert.equal(url.href, urls[0].href);
    }
    const dataDirectory = fs.realpathSync(environment.JURISSIM_TEST_DATA_DIR ?? '');
    const clusterDirectory = path.dirname(dataDirectory);
    assert.equal(path.dirname(clusterDirectory), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(clusterDirectory), /^jurissim-migrations-[A-Za-z0-9_-]+$/);
    assert.equal(path.basename(dataDirectory), 'data');
    const capability = environment.JURISSIM_TEST_CAPABILITY;
    assert.match(capability ?? '', /^[a-f0-9]{64}$/);
    const owner = JSON.parse(fs.readFileSync(path.join(clusterDirectory, 'integration-test-owner.json'), 'utf8'));
    assert.equal(owner.capability, capability);
    assert.equal(owner.url, urls[0].href);
    assert.equal(fs.realpathSync(owner.dataDirectory), dataDirectory);
    return { url: urls[0].href, port: Number(urls[0].port), dataDirectory };
  } catch { return fail(); }
}

// Recheck the actual client connection before every TRUNCATE. This identity
// query is read-only; no data can be modified before cluster ownership matches.
export async function assertDisposableDatabase(client: Pick<PrismaClient, '$queryRaw'>, environment: NodeJS.ProcessEnv = process.env) {
  const config = disposableDatabaseConfig(environment);
  const rows = await client.$queryRaw<{ directory: string; database: string; owner: string; port: number }[]>`
    SELECT current_setting('data_directory') AS directory, current_database() AS database,
      current_user AS owner, inet_server_port() AS port`;
  const row = rows[0];
  if (!row || row.database !== 'jurissim_integration' || row.owner !== 'jurissim_migration_test' || row.port !== config.port) return fail();
  try { assert.equal(fs.realpathSync(row.directory), config.dataDirectory); } catch { return fail(); }
  return config;
}
