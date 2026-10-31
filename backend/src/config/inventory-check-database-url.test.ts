import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveInventoryCheckDatabaseUrl } from './inventory-check-database-url';

const directories: string[] = [];
function envFile(contents: string) {
  const directory = mkdtempSync(join(tmpdir(), 'jurissim-inventory-config-'));
  directories.push(directory);
  const path = join(directory, '.env');
  writeFileSync(path, contents, 'utf8');
  return path;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('resolveInventoryCheckDatabaseUrl', () => {
  it('prefers the dedicated variable and does not need to read the env file', () => {
    expect(resolveInventoryCheckDatabaseUrl(' postgresql://dedicated ', join(tmpdir(), 'missing-inventory.env')))
      .toBe('postgresql://dedicated');
  });

  it('uses only DATABASE_URL from the env file and does not mutate process.env', () => {
    const path = envFile(' export OTHER_SECRET=must-not-load\n  DATABASE_URL = " postgresql://user:pass@localhost/db?schema=public  "\nINVENTORY_CHECK_UNRELATED_SECRET=do-not-load\nSMTP_KEY=do-not-load\n');
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalUnrelatedSecret = process.env.INVENTORY_CHECK_UNRELATED_SECRET;
    const resolved = resolveInventoryCheckDatabaseUrl(undefined, path);

    expect(resolved).toBe('postgresql://user:pass@localhost/db?schema=public');
    expect(process.env.DATABASE_URL).toBe(originalDatabaseUrl);
    expect(process.env.INVENTORY_CHECK_UNRELATED_SECRET).toBe(originalUnrelatedSecret);
    expect(readFileSync(path, 'utf8')).toContain('SMTP_KEY=do-not-load');
  });

  it('returns undefined when neither source defines a database URL', () => {
    expect(resolveInventoryCheckDatabaseUrl(undefined, envFile('JWT_SECRET=unrelated\n'))).toBeUndefined();
  });
});
