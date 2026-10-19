import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { assertDisposableDatabase, disposableDatabaseConfig } from '../integration/disposable-database';

// Filesystem fixture only: no PostgreSQL process, network or connection.
const cluster = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-migrations-'));
const data = path.join(cluster, 'data'); fs.mkdirSync(data);
const url = 'postgresql://jurissim_migration_test@127.0.0.1:55481/jurissim_integration?schema=public';
const capability = 'a'.repeat(64); // Fixture, never a production secret.
fs.writeFileSync(path.join(cluster, 'integration-test-owner.json'), JSON.stringify({ capability, url, dataDirectory: data }));
const environment = (): NodeJS.ProcessEnv => ({ NODE_ENV: 'test', DATABASE_URL: url, DIRECT_URL: url,
  TEST_DATABASE_URL: url, TEST_DIRECT_URL: url, JURISSIM_TEST_DATA_DIR: data, JURISSIM_TEST_CAPABILITY: capability });

describe('Guarda dos testes de banco descartável', () => {
  it('aceita somente alvo coerente com a prova local do harness', () => {
    expect(disposableDatabaseConfig(environment())).toEqual({ url, port: 55481, dataDirectory: fs.realpathSync(data) });
  });
  it.each(['DATABASE_URL', 'DIRECT_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL'])('rejeita %s externa antes de consultar o banco', async key => {
    const env = { ...environment(), [key]: 'postgresql://fixture@external.invalid:55481/jurissim_test?schema=public' };
    const query = vi.fn();
    await expect(assertDisposableDatabase({ $queryRaw: query }, env)).rejects.toThrow('cluster descartável');
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    ['NODE_ENV', 'production'], ['DATABASE_URL', ''], ['TEST_DIRECT_URL', ''],
    ['DATABASE_URL', url.replace(':55481', ':5432')],
    ['DATABASE_URL', url.replace('/jurissim_integration', '/existing_test')],
    ['DATABASE_URL', url.replace('schema=public', 'schema=test')],
    ['DIRECT_URL', url.replace(':55481', ':55482')],
    ['JURISSIM_TEST_DATA_DIR', os.tmpdir()], ['JURISSIM_TEST_CAPABILITY', 'b'.repeat(64)],
  ])('rejeita configuração insegura ou incoerente em %s', (key, value) => {
    expect(() => disposableDatabaseConfig({ ...environment(), [key]: value })).toThrow('cluster descartável');
  });
  it.each([
    { database: 'other_test' }, { port: 55482 }, { owner: 'other' }, { directory: os.tmpdir() },
  ])('recusa conexão efetiva diferente do alvo comprovado: %j', async mismatch => {
    const query = vi.fn().mockResolvedValue([{ directory: data, database: 'jurissim_integration', owner: 'jurissim_migration_test', port: 55481, ...mismatch }]);
    await expect(assertDisposableDatabase({ $queryRaw: query }, environment())).rejects.toThrow('cluster descartável');
    expect(query).toHaveBeenCalledOnce(); // Only the read-only identity query.
  });
  it('valida a identidade da conexão antes de liberar limpeza de fixtures', async () => {
    const query = vi.fn().mockResolvedValue([{ directory: data, database: 'jurissim_integration', owner: 'jurissim_migration_test', port: 55481 }]);
    await expect(assertDisposableDatabase({ $queryRaw: query }, environment())).resolves.toMatchObject({ url });
  });
});
