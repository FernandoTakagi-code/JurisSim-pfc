import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import initialTerms from '../../../src/terms-of-use/initial-terms.json';

const folder = '20261121120000_terms_of_use_versions';
const file = path.resolve('prisma/migrations', folder, 'migration.sql');

describe('migração dos Termos de Uso', () => {
  it('existe e cria a tabela com versão única e FK restrita para User', () => {
    expect(existsSync(file)).toBe(true);
    const sql = readFileSync(file, 'utf8');
    expect(sql).toMatch(/CREATE TABLE "TermsOfUseVersion"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "TermsOfUseVersion_version_key" ON "TermsOfUseVersion"\("version"\)/);
    expect(sql).toMatch(/FOREIGN KEY \("publishedById"\) REFERENCES "User"\("id"\) ON DELETE RESTRICT/);
  });

  it('insere a versão inicial 2026-11-13.1 com o texto atual dos Termos', () => {
    const sql = readFileSync(file, 'utf8');
    const insert = sql.match(/INSERT INTO "TermsOfUseVersion"[\s\S]*?VALUES\s*\(([\s\S]*?)\);/);
    expect(insert).not.toBeNull();
    const values = insert![1];
    expect(values).toContain("'2026-11-13.1'");
    expect(values).toContain("'2026-11-13 03:00:00'");
    const json = values.match(/'(\[[\s\S]*\])'::jsonb/);
    expect(json).not.toBeNull();
    expect(JSON.parse(json![1].split("''").join("'"))).toEqual(initialTerms);
    expect(initialTerms).toHaveLength(11);
  });

  it('não altera nenhuma migração já existente', () => {
    const changed = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'prisma/migrations'], { encoding: 'utf8' })
      .split('\n').filter(Boolean);
    expect(changed).toEqual([]);
  });
});
