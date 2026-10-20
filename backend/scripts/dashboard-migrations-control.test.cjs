const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { names, identity, resolveBackupPath, planPath, privateConfigPath, scripts, metadataSql, buildApplySql, validateMetadata } = require('./dashboard-migrations-control.cjs');
const items = scripts();
const verification = fs.readFileSync(path.join(__dirname, 'verify-evaluations-photos-security.sql'), 'utf8');
test('the batch has one outer transaction and security verification precedes its commit', () => {
  const sql = buildApplySql(items, verification);
  assert.equal((sql.match(/^COMMIT;/gm) || []).length, 1);
  assert.match(sql, /^BEGIN;/); assert.ok(sql.endsWith('COMMIT;'));
  assert.ok(sql.indexOf('FROM PUBLIC, anon, authenticated') < sql.indexOf('DO $verify$'));
  assert.ok(sql.indexOf('DO $verify$') < sql.lastIndexOf('COMMIT;'));
  assert.match(sql, /pg_try_advisory_xact_lock/); assert.match(sql, /lock_timeout='5s'/);
  assert.match(sql, /statement_timeout='60s'/); assert.match(sql, /Column verification failed/);
});
test('unexpected migrations or internal transaction boundaries cannot be executed', () => {
  assert.throws(() => buildApplySql(items.slice(1), verification));
  assert.throws(() => buildApplySql(items.map((i, n) => n ? i : { ...i, sql: i.sql + '\nCOMMIT;' }), verification));
});
test('metadata mode starts read-only and reads no application rows', () => {
  const sql = metadataSql(items);
  assert.match(sql, /^BEGIN READ ONLY;/); assert.ok(sql.endsWith('ROLLBACK;'));
  assert.equal(/ALTER TABLE|CREATE TABLE|CREATE INDEX|migrate resolve/.test(sql), false);
  assert.equal(sql.includes('FROM public."User"'), false);
});
test('direct and pooler project identities match without storing connection strings', () => {
  const direct = 'postgresql://postgres:synthetic@db.fixture.supabase.co:5432/postgres?schema=public';
  const pool = 'postgresql://postgres.fixture:synthetic@aws-0-fixture.pooler.supabase.com:5432/postgres?schema=public';
  assert.equal(identity(direct), identity(pool));
  assert.equal(identity(pool), identity(pool.replace(':synthetic@', ':different-synthetic@')));
  assert.throws(() => identity(pool.replace('schema=public', 'schema=other')));
});
test('backup path comes from explicit environment or private local config', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-private-config-'));
  const config = path.join(dir, 'private.json');
  try {
    fs.writeFileSync(config, JSON.stringify({ backupPath: path.resolve('fixture-backup.dump') }));
    assert.equal(resolveBackupPath({ JURISSIM_BACKUP_PATH: path.resolve('env-backup.dump') }, config), path.resolve('env-backup.dump'));
    assert.equal(resolveBackupPath({}, config), path.resolve('fixture-backup.dump'));
    assert.throws(() => resolveBackupPath({}, path.join(dir, 'missing.json')), e => e.category === 'backup_path_not_configured_or_not_absolute');
    assert.throws(() => resolveBackupPath({ JURISSIM_BACKUP_PATH: 'relative.dump' }, config), e => e.category === 'backup_path_not_configured_or_not_absolute');
    fs.writeFileSync(config, '{invalid');
    assert.throws(() => resolveBackupPath({}, config), e => e.category === 'private_backup_config_invalid');
    assert.ok(planPath.includes(path.join('backend', '.local')));
    assert.ok(privateConfigPath.includes(path.join('backend', '.local')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('concurrent activity, unfinished history and object conflicts stop the preflight', () => {
  const base = { readOnly: true, version: 170006, permissions: { create: true },
    browserRoles: [{ bypassRls: false }, { bypassRls: false }], enum: { owner: true, values: [] },
    history: [], relationConflicts: [], constraintConflicts: [], typeConflicts: [],
    unfinishedHistory: 0, activeDdlSessions: 0, advisoryLocks: 0 };
  for (const key of ['unfinishedHistory', 'activeDdlSessions', 'advisoryLocks']) assert.throws(() => validateMetadata({ ...base, [key]: 1 }), e => e.category === 'unfinished_or_concurrent_activity');
  for (const key of ['history', 'relationConflicts', 'constraintConflicts', 'typeConflicts']) assert.throws(() => validateMetadata({ ...base, [key]: ['fixture'] }), e => e.category === 'unexpected_existing_objects_or_history');
  assert.equal(names.length, 5);
});
