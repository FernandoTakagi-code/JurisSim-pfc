import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

const refusal = 'Testes de banco exigem o cluster descartável do harness local. Execute node scripts/test-migrations-local.cjs <PostgreSQL-bin>. Nenhuma URL externa ou de banco existente é aceita.';
const fail = () => { throw new Error(refusal); };

// Validate before creating clients or executing SQL. Never load .env or accept
// a URL merely because its database/schema contains "test".
function wslDisposableDatabaseConfig(environment: NodeJS.ProcessEnv) {
  const failWsl = (): never => { throw new Error('WSL PostgreSQL integration target or identity proof is invalid.'); };
  try {
    assert.equal(environment.JURISSIM_TEST_TARGET, 'WSL_LOCAL');
    assert.equal(environment.NODE_ENV, 'test');
    const expectedDatabase = 'jurissim_teste_local';
    const expectedUsername = 'jurissim_tester';
    const expectedPassword = environment.JURISSIM_TEST_DB_PASSWORD;
    assert.ok(expectedPassword && !/[\r\n]/.test(expectedPassword));
    const keys = ['DATABASE_URL', 'DIRECT_URL', 'SHADOW_DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL'] as const;
    const urls = keys.map(key => new URL(environment[key] ?? ''));
    for (const url of urls) {
      assert.equal(url.protocol, 'postgresql:');
      assert.equal(url.hostname, '127.0.0.1');
      assert.equal(url.port, '5433');
      assert.equal(url.username, expectedUsername);
      assert.equal(url.password, expectedPassword);
      assert.equal(url.pathname, `/${expectedDatabase}`);
      assert.equal(url.search, '?schema=public');
      assert.equal(url.hash, '');
      assert.equal(url.href, urls[0].href);
    }
    assert.equal(environment.PGHOST, '127.0.0.1');
    assert.equal(environment.PGHOSTADDR, '127.0.0.1');
    assert.equal(environment.PGPORT, '5433');
    assert.equal(environment.PGDATABASE, expectedDatabase);
    assert.equal(environment.PGUSER, expectedUsername);
    assert.equal(environment.PGPASSWORD, expectedPassword);
    assert.equal(environment.PGSERVICE, '');
    assert.equal(environment.PGSERVICEFILE, '');
    assert.equal(environment.JURISSIM_TEST_INTEGRATION_DATABASE, expectedDatabase);
    assert.match(environment.JURISSIM_TEST_CAPABILITY ?? '', /^[a-f0-9]{64}$/);
    const expectedSystemIdentifier = environment.JURISSIM_TEST_WSL_SYSTEM_IDENTIFIER;
    assert.match(expectedSystemIdentifier ?? '', /^[0-9]{10,30}$/);
    const manifestPath = path.resolve(environment.JURISSIM_TEST_WSL_MANIFEST ?? '');
    const manifestDirectory = fs.realpathSync(path.dirname(manifestPath));
    assert.equal(path.dirname(manifestDirectory), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(manifestDirectory), /^jurissim-wsl-postgres-[A-Za-z0-9_-]+$/);
    assert.equal(path.basename(manifestPath), 'identity.json');
    const manifestStat = fs.lstatSync(manifestPath);
    assert.ok(manifestStat.isFile() && !manifestStat.isSymbolicLink());
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.deepEqual(manifest, {
      capability: environment.JURISSIM_TEST_CAPABILITY,
      host: '127.0.0.1', port: 5433, database: expectedDatabase, username: expectedUsername,
      systemIdentifier: expectedSystemIdentifier,
    });
    const passFile = fs.realpathSync(environment.JURISSIM_TEST_PGPASSFILE ?? '');
    assert.equal(path.dirname(passFile), manifestDirectory);
    assert.equal(path.basename(passFile), 'empty-pgpass');
    const passStat = fs.lstatSync(passFile);
    assert.ok(passStat.isFile() && !passStat.isSymbolicLink());
    assert.equal(fs.readFileSync(passFile, 'utf8'), '');
    return { url: urls[0].href, port: 5433, target: 'WSL_LOCAL' as const, systemIdentifier: expectedSystemIdentifier! };
  } catch { return failWsl(); }
}

export function disposableDatabaseConfig(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.JURISSIM_TEST_TARGET === 'WSL_LOCAL') return wslDisposableDatabaseConfig(environment);
  try {
    assert.equal(environment.NODE_ENV, 'test');
    const keys = ['DATABASE_URL', 'DIRECT_URL', 'SHADOW_DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL'] as const;
    const urls = keys.map(key => new URL(environment[key] ?? ''));
    const expectedDatabase = environment.JURISSIM_TEST_INTEGRATION_DATABASE;
    assert.match(expectedDatabase ?? '', /^js_int_[a-f0-9]{32}$/);
    const expectedPassword = environment.JURISSIM_TEST_DB_PASSWORD;
    assert.match(expectedPassword ?? '', /^[a-f0-9]{64}$/);
    for (const url of urls) {
      assert.equal(url.protocol, 'postgresql:');
      assert.equal(url.hostname, '127.0.0.1');
      assert.equal(url.username, 'jurissim_migration_test');
      assert.equal(url.password, expectedPassword);
      assert.equal(url.pathname, `/${expectedDatabase}`);
      assert.equal(url.hash, '');
      assert.ok(/^\d+$/.test(url.port) && Number(url.port) >= 1024 && Number(url.port) <= 65535 && url.port !== '5432');
      assert.equal(url.search, '?schema=public');
      assert.equal(url.href, urls[0].href);
    }
    assert.equal(environment.PGHOST, '127.0.0.1');
    assert.equal(environment.PGHOSTADDR, '127.0.0.1');
    assert.equal(environment.PGPORT, urls[0].port);
    assert.equal(environment.PGDATABASE, expectedDatabase);
    assert.equal(environment.PGUSER, 'jurissim_migration_test');
    assert.equal(environment.PGPASSWORD, expectedPassword);
    assert.equal(environment.PGPASSFILE, environment.JURISSIM_TEST_PGPASSFILE);
    const dataDirectory = fs.realpathSync(environment.JURISSIM_TEST_DATA_DIR ?? '');
    const clusterDirectory = path.dirname(dataDirectory);
    assert.equal(path.dirname(clusterDirectory), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(clusterDirectory), /^jurissim-migrations-[A-Za-z0-9_-]+$/);
    assert.equal(path.basename(dataDirectory), 'data');
    const capability = environment.JURISSIM_TEST_CAPABILITY;
    assert.match(capability ?? '', /^[a-f0-9]{64}$/);
    const owner = JSON.parse(fs.readFileSync(path.join(clusterDirectory, 'integration-test-owner.json'), 'utf8'));
    assert.equal(owner.capability, capability);
    assert.equal(owner.host, '127.0.0.1');
    assert.equal(owner.port, Number(urls[0].port));
    assert.equal(owner.database, expectedDatabase);
    assert.equal(owner.username, 'jurissim_migration_test');
    assert.equal(fs.realpathSync(owner.dataDirectory), dataDirectory);
    const passFile = fs.realpathSync(environment.JURISSIM_TEST_PGPASSFILE ?? '');
    assert.equal(passFile, fs.realpathSync(owner.emptyPasswordFile));
    assert.equal(path.dirname(passFile), fs.realpathSync(clusterDirectory));
    assert.equal(fs.lstatSync(passFile).isFile(), true);
    assert.equal(fs.readFileSync(passFile, 'utf8'), '');
    return { url: urls[0].href, port: Number(urls[0].port), dataDirectory };
  } catch { return fail(); }
}

// Recheck the actual client connection before every TRUNCATE. This identity
// query is read-only; no data can be modified before cluster ownership matches.
export async function assertDisposableDatabase(client: Pick<PrismaClient, '$queryRaw'>, environment: NodeJS.ProcessEnv = process.env) {
  const config = disposableDatabaseConfig(environment);
  const rows = await client.$queryRaw<{ directory: string; database: string; owner: string; port: number; address: string; systemIdentifier: string }[]>`
    SELECT current_setting('data_directory') AS directory, current_database() AS database,
      current_user AS owner, inet_server_port() AS port, host(inet_server_addr()) AS address,
      (pg_control_system()).system_identifier::text AS "systemIdentifier"`;
  const row = rows[0];
  const isWslTarget = 'target' in config && config.target === 'WSL_LOCAL';
  const expectedOwner = isWslTarget ? 'jurissim_tester' : 'jurissim_migration_test';
  if (!row || row.database !== environment.JURISSIM_TEST_INTEGRATION_DATABASE || row.owner !== expectedOwner
    || row.port !== config.port || row.address !== '127.0.0.1') return fail();
  if (isWslTarget) {
    if (row.systemIdentifier !== config.systemIdentifier) return fail();
    return config;
  }
  if (!('dataDirectory' in config)) return fail();
  try { assert.equal(fs.realpathSync(row.directory), config.dataDirectory); } catch { return fail(); }
  return config;
}
