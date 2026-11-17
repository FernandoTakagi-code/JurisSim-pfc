import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { assertDisposableDatabase, disposableDatabaseConfig } from '../integration/disposable-database';

// Filesystem fixture only: no PostgreSQL process, network or connection.
const cluster = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-migrations-'));
const data = path.join(cluster, 'data'); fs.mkdirSync(data);
const emptyPasswordFile = path.join(cluster, 'empty-pgpass'); fs.writeFileSync(emptyPasswordFile, '');
const password = 'c'.repeat(64);
const database = `js_int_${'d'.repeat(32)}`;
const url = `postgresql://jurissim_migration_test:${password}@127.0.0.1:55481/${database}?schema=public`;
const capability = 'a'.repeat(64); // Fixture, never a production secret.
fs.writeFileSync(path.join(cluster, 'integration-test-owner.json'), JSON.stringify({
  capability, host: '127.0.0.1', port: 55481, database,
  username: 'jurissim_migration_test', dataDirectory: data, emptyPasswordFile,
}));
const environment = (): NodeJS.ProcessEnv => ({ NODE_ENV: 'test', DATABASE_URL: url, DIRECT_URL: url, SHADOW_DATABASE_URL: url,
  TEST_DATABASE_URL: url, TEST_DIRECT_URL: url, PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1',
  PGPORT: '55481', PGDATABASE: database, PGUSER: 'jurissim_migration_test',
  PGPASSWORD: password, PGPASSFILE: emptyPasswordFile, JURISSIM_TEST_DB_PASSWORD: password,
  JURISSIM_TEST_PGPASSFILE: emptyPasswordFile, JURISSIM_TEST_DATA_DIR: data,
  JURISSIM_TEST_CAPABILITY: capability, JURISSIM_TEST_INTEGRATION_DATABASE: database });

const wslDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-wsl-postgres-'));
const wslPassword = 'w'.repeat(48);
const wslCapability = 'e'.repeat(64);
const wslSystemIdentifier = '7483920112345678901';
const wslUrl = `postgresql://jurissim_tester:${wslPassword}@127.0.0.1:5433/jurissim_teste_local?schema=public`;
const wslPassFile = path.join(wslDirectory, 'empty-pgpass'); fs.writeFileSync(wslPassFile, '');
const wslManifestPath = path.join(wslDirectory, 'identity.json');
fs.writeFileSync(wslManifestPath, JSON.stringify({
  capability: wslCapability, host: '127.0.0.1', port: 5433,
  database: 'jurissim_teste_local', username: 'jurissim_tester', systemIdentifier: wslSystemIdentifier,
}));
const wslEnvironment = (): NodeJS.ProcessEnv => ({ NODE_ENV: 'test', JURISSIM_TEST_TARGET: 'WSL_LOCAL',
  DATABASE_URL: wslUrl, DIRECT_URL: wslUrl, SHADOW_DATABASE_URL: wslUrl, TEST_DATABASE_URL: wslUrl, TEST_DIRECT_URL: wslUrl,
  PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '5433', PGDATABASE: 'jurissim_teste_local',
  PGUSER: 'jurissim_tester', PGPASSWORD: wslPassword, PGPASSFILE: wslPassFile, PGSERVICE: '', PGSERVICEFILE: '',
  JURISSIM_TEST_DB_PASSWORD: wslPassword, JURISSIM_TEST_PGPASSFILE: wslPassFile,
  JURISSIM_TEST_INTEGRATION_DATABASE: 'jurissim_teste_local', JURISSIM_TEST_CAPABILITY: wslCapability,
  JURISSIM_TEST_WSL_MANIFEST: wslManifestPath, JURISSIM_TEST_WSL_SYSTEM_IDENTIFIER: wslSystemIdentifier });

describe('Guarda dos testes de banco descartável', () => {
  it('aceita somente alvo coerente com a prova local do harness', () => {
    expect(disposableDatabaseConfig(environment())).toEqual({ url, port: 55481, dataDirectory: fs.realpathSync(data) });
  });
  it.each(['DATABASE_URL', 'DIRECT_URL', 'SHADOW_DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL'])('rejeita %s externa antes de consultar o banco', async key => {
    const env = { ...environment(), [key]: 'postgresql://fixture@external.invalid:55481/jurissim_test?schema=public' };
    const query = vi.fn();
    await expect(assertDisposableDatabase({ $queryRaw: query }, env)).rejects.toThrow('cluster descartável');
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    ['NODE_ENV', 'production'], ['DATABASE_URL', ''], ['SHADOW_DATABASE_URL', ''], ['TEST_DIRECT_URL', ''],
    ['DATABASE_URL', url.replace(':55481', ':5432')],
    ['DATABASE_URL', url.replace(`/${database}`, '/existing_test')],
    ['DATABASE_URL', url.replace('schema=public', 'schema=test')],
    ['DIRECT_URL', url.replace(':55481', ':55482')],
    ['PGHOSTADDR', '192.0.2.44'], ['PGPASSWORD', 'wrong-secret'],
    ['PGPASSFILE', 'C:\\outside\\pgpass.conf'], ['PGDATABASE', 'other_test'],
    ['JURISSIM_TEST_DATA_DIR', os.tmpdir()], ['JURISSIM_TEST_CAPABILITY', 'b'.repeat(64)],
  ])('rejeita configuração insegura ou incoerente em %s', (key, value) => {
    expect(() => disposableDatabaseConfig({ ...environment(), [key]: value })).toThrow('cluster descartável');
  });
  it.each([
    { database: 'other_test' }, { port: 55482 }, { owner: 'other' }, { directory: os.tmpdir() }, { address: '192.0.2.5' },
  ])('recusa conexão efetiva diferente do alvo comprovado: %j', async mismatch => {
    const query = vi.fn().mockResolvedValue([{ directory: data, database, owner: 'jurissim_migration_test', port: 55481, address: '127.0.0.1', ...mismatch }]);
    await expect(assertDisposableDatabase({ $queryRaw: query }, environment())).rejects.toThrow('cluster descartável');
    expect(query).toHaveBeenCalledOnce(); // Only the read-only identity query.
  });
  it('valida a identidade da conexão antes de liberar limpeza de fixtures', async () => {
    const query = vi.fn().mockResolvedValue([{ directory: data, database, owner: 'jurissim_migration_test', port: 55481, address: '127.0.0.1' }]);
    await expect(assertDisposableDatabase({ $queryRaw: query }, environment())).resolves.toMatchObject({ url });
  });
});

describe('WSL isolated PostgreSQL guard', () => {
  it('accepts only the declared WSL database URLs and identity manifest', () => {
    expect(disposableDatabaseConfig(wslEnvironment())).toEqual({
      url: wslUrl, port: 5433, target: 'WSL_LOCAL', systemIdentifier: wslSystemIdentifier,
    });
  });
  it.each([
    ['DATABASE_URL', wslUrl.replace('127.0.0.1', 'db.example.invalid')],
    ['DIRECT_URL', wslUrl.replace(':5433', ':55432')],
    ['TEST_DATABASE_URL', wslUrl.replace('/jurissim_teste_local', '/postgres')],
    ['PGHOSTADDR', '192.0.2.10'], ['PGUSER', 'postgres'], ['PGDATABASE', 'postgres'],
    ['PGSERVICE', 'production'], ['PGSERVICEFILE', 'C:\\outside\\service.conf'],
    ['JURISSIM_TEST_WSL_SYSTEM_IDENTIFIER', 'different-cluster'], ['JURISSIM_TEST_TARGET', 'HARNESS'],
  ])('refuses a mismatched WSL target in %s before connecting', (key, value) => {
    expect(() => disposableDatabaseConfig({ ...wslEnvironment(), [key]: value })).toThrow();
  });
  it.each([
    ['jurissim_teste_local', 'jurissim_tester', 5433, '127.0.0.1', wslSystemIdentifier],
    ['another_database', 'jurissim_tester', 5433, '127.0.0.1', wslSystemIdentifier],
    ['jurissim_teste_local', 'jurissim_tester', 5433, '127.0.0.1', '9999999999999999999'],
  ])('checks the effective WSL identity before allowing fixtures', async (databaseResult, owner, port, address, systemIdentifier) => {
    const query = vi.fn().mockResolvedValue([{ directory: '/not-used-for-wsl', database: databaseResult, owner, port, address, systemIdentifier }]);
    const promise = assertDisposableDatabase({ $queryRaw: query }, wslEnvironment());
    if (databaseResult === 'jurissim_teste_local' && systemIdentifier === wslSystemIdentifier) {
      await expect(promise).resolves.toMatchObject({ target: 'WSL_LOCAL', systemIdentifier: wslSystemIdentifier });
    } else {
      await expect(promise).rejects.toThrow();
    }
    expect(query).toHaveBeenCalledOnce();
  });
});
