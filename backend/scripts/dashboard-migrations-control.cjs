// --prepare is local only; --check reads metadata only. --apply requires a
// separate explicit authorization and the exact reviewed local plan.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { connectionEnvironment, diagnose } = require('./lib/backup-preflight.cjs');
const backend = path.resolve(__dirname, '..');
const dir = path.join(backend, 'prisma/migrations');
const localDir = path.join(backend, '.local');
const planPath = path.join(localDir, 'dashboard-migrations-plan.json');
const privateConfigPath = path.join(localDir, 'dashboard-migrations.private.json');
const legacyPlanPath = path.join(__dirname, 'dashboard-migrations-plan.json');
const names = ['20261017120000_student_history_indexes', '20261017150000_classes_teacher_exams',
  '20261017180000_goals_reports_indexes', '20261018120000_profile_photos', '20261020120000_backend_only_evaluations_photos'];
const psql = 'C:/Program Files/PostgreSQL/17/bin/psql.exe';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const read = name => fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
const list = values => values.map(v => "'" + v.replaceAll("'", "''") + "'").join(',');
function fail(category) { throw Object.assign(new Error('Operation stopped.'), { category }); }
function resolveBackupPath(env = process.env, configPath = privateConfigPath) {
  let configured = typeof env.JURISSIM_BACKUP_PATH === 'string' ? env.JURISSIM_BACKUP_PATH.trim() : '';
  if (!configured && fs.existsSync(configPath)) {
    try { configured = JSON.parse(fs.readFileSync(configPath, 'utf8')).backupPath; }
    catch { fail('private_backup_config_invalid'); }
  }
  if (typeof configured !== 'string' || !configured.trim() || !path.isAbsolute(configured.trim())) {
    fail('backup_path_not_configured_or_not_absolute');
  }
  return path.normalize(configured.trim());
}
function identity(value) {
  const u = new URL(value), direct = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  const pool = /\.pooler\.supabase\.com$/.test(u.hostname) ? decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]+)$/) : null;
  const project = direct?.[1] || pool?.[1];
  if (!project || (u.searchParams.get('schema') || 'public') !== 'public') fail('destination_configuration');
  return hash(JSON.stringify([project, decodeURIComponent(u.pathname.slice(1)), 'public']));
}
function settings() {
  const config = require('dotenv').parse(fs.readFileSync(path.join(backend, '.env')));
  if (identity(config.DATABASE_URL) !== identity(config.DIRECT_URL)) fail('different_configured_destinations');
  return config;
}
function scripts() { return names.map(name => ({ name, sql: read(name), checksum: hash(fs.readFileSync(path.join(dir, name, 'migration.sql'))) })); }
function objectNames(items) {
  const source = items.map(i => i.sql).join('\n');
  return {
    relations: [...source.matchAll(/CREATE (?:UNIQUE )?(?:TABLE|INDEX) "([^"]+)"/g)].map(m => m[1]),
    constraints: [...source.matchAll(/CONSTRAINT "([^"]+)"/g)].map(m => m[1]),
  };
}
function metadataSql(items) {
  const objects = objectNames(items);
  return [
    'BEGIN READ ONLY;',
    "SELECT json_build_object('version',current_setting('server_version_num')::integer,'readOnly',current_setting('transaction_read_only')='on',",
    "'history',(SELECT coalesce(json_agg(json_build_object('name',migration_name,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL,'checksum',checksum)),'[]'::json) FROM public.\"_prisma_migrations\" WHERE migration_name IN (" + list(names) + ')),',
    "'unfinishedHistory',(SELECT count(*) FROM public.\"_prisma_migrations\" WHERE finished_at IS NULL AND rolled_back_at IS NULL),",
    "'relationConflicts',(SELECT coalesce(json_agg(c.relname),'[]'::json) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (" + list(objects.relations) + ')),',
    "'constraintConflicts',(SELECT coalesce(json_agg(k.conname),'[]'::json) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public' AND k.conname IN (" + list(objects.constraints) + ')),',
    "'typeConflicts',(SELECT coalesce(json_agg(t.typname),'[]'::json) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname IN ('Avaliacao','AvaliacaoQuestao','_AvaliacaoToTurma','ProfilePhoto')),",
    "'enum',(SELECT json_build_object('owner',pg_has_role(current_user,t.typowner,'USAGE'),'values',(SELECT json_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid=t.oid)) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='TipoSimulado'),",
    "'dependencies',(SELECT json_agg(json_build_object('table',c.relname,'owner',pg_has_role(current_user,c.relowner,'USAGE'),'references',has_table_privilege(current_user,c.oid,'REFERENCES'),'primaryKeyId',EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='id' WHERE k.conrelid=c.oid AND k.contype='p' AND k.convalidated AND k.conkey=ARRAY[a.attnum]),'columns',(SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull)) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('User','Questao','Turma','Simulado','Resposta','MetaDiaria') AND c.relkind='r'),",
    "'permissions',json_build_object('create',has_schema_privilege(current_user,'public','CREATE'),'usage',has_schema_privilege(current_user,'public','USAGE'),'bypassRls',(SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname=current_user),'historyInsert',has_table_privilege(current_user,'public.\"_prisma_migrations\"','INSERT'),'historyUpdate',has_table_privilege(current_user,'public.\"_prisma_migrations\"','UPDATE')),",
    "'browserRoles',(SELECT json_agg(json_build_object('role',rolname,'bypassRls',rolbypassrls OR rolsuper)) FROM pg_roles WHERE rolname IN ('anon','authenticated')),",
    "'activeDdlSessions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state='active' AND query ~* '(ALTER[[:space:]]|CREATE[[:space:]]|DROP[[:space:]]|_prisma_migrations)'),",
    "'advisoryLocks',(SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())));",
    'ROLLBACK;',
  ].join('\n');
}
function validateMetadata(m, pending = true) {
  if (!m.readOnly || Math.floor(m.version / 10000) !== 17) fail('server_or_readonly');
  if (m.unfinishedHistory || m.activeDdlSessions || m.advisoryLocks) fail('unfinished_or_concurrent_activity');
  if (!Object.values(m.permissions).every(v => v === true)) fail('required_permissions');
  if (m.browserRoles?.length !== 2 || m.browserRoles.some(r => r.bypassRls)) fail('unexpected_browser_roles');
  if (!m.enum?.owner) fail('enum_ownership');
  if (pending && (m.history.length || m.relationConflicts.length || m.constraintConflicts.length || m.typeConflicts.length || m.enum.values.includes('AVALIACAO'))) fail('unexpected_existing_objects_or_history');
  const required = { User: ['id'], Questao: ['id'], Turma: ['id'], Simulado: ['id', 'alunoId', 'iniciadoEm', 'finalizadoEm', 'tipo'], Resposta: ['simuladoId', 'respondidoEm'], MetaDiaria: ['id', 'alunoId', 'data'] };
  const schemaSource = fs.readFileSync(path.join(backend, 'prisma/schema.prisma'), 'utf8');
  const types = { String: 'text', Int: 'integer', DateTime: 'timestamp(3) without time zone', TipoSimulado: '"TipoSimulado"' };
  for (const [name, columns] of Object.entries(required)) {
    const t = m.dependencies?.find(t => t.table === name);
    if (!t || !t.owner || !t.references || !t.primaryKeyId || columns.some(c => !t.columns.some(a => a.name === c))) fail('missing_dependency');
    const body = schemaSource.match(new RegExp('model ' + name + ' \\{([\\s\\S]*?)\\n\\}'))[1];
    for (const column of columns) {
      const field = body.match(new RegExp('(?:^|\\n)\\s*' + column + '\\s+(\\w+)(\\?)?'));
      const actual = t.columns.find(c => c.name === column);
      if (actual.type !== types[field[1]] || actual.required !== !field[2]) fail('dependency_type_or_nullability');
    }
  }
  for (const [table, column] of [['Turma', 'archivedAt'], ['Turma', 'conviteExpiraEm'], ['Simulado', 'avaliacaoId']]) {
    if (pending && m.dependencies.find(t => t.table === table).columns.some(c => c.name === column)) fail('column_conflict');
  }
}
function structureVerification(items) {
  const objects = objectNames(items);
  const source = fs.readFileSync(path.join(backend, 'prisma/schema.prisma'), 'utf8');
  const types = { String: 'text', Int: 'integer', DateTime: 'timestamp(3) without time zone', Bytes: 'bytea' };
  const expected = [];
  for (const table of ['Avaliacao', 'AvaliacaoQuestao', '_AvaliacaoToTurma', 'ProfilePhoto']) {
    if (table === '_AvaliacaoToTurma') { for (const col of ['A', 'B']) expected.push([table, col, 'text', true]); continue; }
    const body = source.match(new RegExp('model ' + table + ' \\{([\\s\\S]*?)\\n\\}'))[1];
    for (const line of body.split('\n')) {
      const m = line.trim().match(/^(\w+)\s+(\w+)(\?)?(?:\s|$)/);
      if (m && types[m[2]]) expected.push([table, m[1], types[m[2]], !m[3]]);
    }
  }
  expected.push(['Turma', 'archivedAt', types.DateTime, false], ['Turma', 'conviteExpiraEm', types.DateTime, false], ['Simulado', 'avaliacaoId', 'text', false]);
  const columns = expected.map(([table, col, type, required]) => '(' + list([table, col, type]) + ',' + required + ')').join(',');
  return `DO $structure$ BEGIN
    IF EXISTS (SELECT 1 FROM (VALUES ${columns}) v(tbl,col,typ,required) LEFT JOIN pg_namespace n ON n.nspname='public' LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=v.tbl LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=v.col AND a.attnum>0 AND NOT a.attisdropped WHERE a.attnum IS NULL OR format_type(a.atttypid,a.atttypmod)<>v.typ OR a.attnotnull<>v.required) THEN RAISE EXCEPTION 'Column verification failed.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' AND t.typname='TipoSimulado' AND e.enumlabel='AVALIACAO') THEN RAISE EXCEPTION 'Enum verification failed.'; END IF;
    IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (${list(objects.relations)})) <> ${objects.relations.length} THEN RAISE EXCEPTION 'Created object verification failed.'; END IF;
    IF (SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public' AND k.conname IN (${list(objects.constraints)}) AND k.convalidated) <> ${objects.constraints.length} THEN RAISE EXCEPTION 'Constraint verification failed.'; END IF;
    IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (${list(objects.relations)}) AND NOT i.indisvalid) THEN RAISE EXCEPTION 'Invalid index.'; END IF;
  END; $structure$;`;
}
function buildApplySql(items, securityCheck) {
  if (items.map(i => i.name).join() !== names.join()) fail('unexpected_migration_set');
  if (items.some(i => /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(i.sql))) fail('unexpected_internal_transaction');
  return ["BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; SET LOCAL search_path=public,pg_catalog;",
    "DO $lock$ BEGIN IF NOT pg_try_advisory_xact_lock(72707369::bigint) THEN RAISE EXCEPTION 'Migration lock unavailable.'; END IF; IF EXISTS(SELECT 1 FROM public.\"_prisma_migrations\" WHERE migration_name IN (" + list(names) + ")) THEN RAISE EXCEPTION 'Migration history changed.'; END IF; END; $lock$;",
    ...items.map(i => i.sql), structureVerification(items), securityCheck, 'COMMIT;'].join('\n');
}
function runSql(env, sql) {
  const r = spawnSync(psql, ['-X', '-w', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    env, input: sql, encoding: 'utf8', windowsHide: true, timeout: 360000, maxBuffer: 4 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) fail('sql_failed_no_retry');
  return r.stdout.trim();
}
async function fileHash(file) { const h = crypto.createHash('sha256'); for await (const b of fs.createReadStream(file)) h.update(b); return h.digest('hex'); }
async function main() {
  const mode = process.argv[2] || '--check';
  if (!['--prepare', '--check', '--apply'].includes(mode)) fail('invalid_mode');
  if (mode === '--apply' && process.argv[3] !== '--confirm-five-approved') fail('explicit_confirmation_required');
  const config = settings(), items = scripts(), securityCheck = fs.readFileSync(path.join(__dirname, 'verify-evaluations-photos-security.sql'), 'utf8');
  const backupHash = await fileHash(resolveBackupPath());
  const sql = buildApplySql(items, securityCheck);
  const current = { destinationFingerprint: identity(config.DIRECT_URL), migrations: items.map(({ name, checksum }) => ({ name, checksum })), backupHash, sqlChecksum: hash(sql) };
  if (mode === '--prepare') {
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify(current, null, 2));
    console.log(JSON.stringify({ status: 'local_plan_prepared', migrations: names.length, backupHashMatches: true })); return;
  }
  if (fs.existsSync(legacyPlanPath)) fail('legacy_plan_must_be_moved_to_ignored_local_storage');
  if (JSON.stringify(JSON.parse(fs.readFileSync(planPath))) !== JSON.stringify(current)) fail('reviewed_plan_changed');
  const tls = diagnose({ url: config.DIRECT_URL, mode: 'require', psqlPath: psql });
  if (tls.status !== 'passed' || tls.protocol !== 'TLSv1.3') fail('external_tls13_not_confirmed');
  const env = connectionEnvironment(config.DIRECT_URL, 'require').env;
  env.PGSSLMINPROTOCOLVERSION = 'TLSv1.3'; env.PGAPPNAME = 'jurissim_dashboard_migrations_control';
  const m = JSON.parse(runSql(env, metadataSql(items))); validateMetadata(m);
  console.log(JSON.stringify({ status: 'metadata_preflight_passed', projectAndSchemaPinned: true, backupHashMatches: true,
    migrations: names.map(name => ({ name, status: 'pending' })), unfinishedHistory: m.unfinishedHistory,
    activeDdlSessions: m.activeDdlSessions, advisoryLocks: m.advisoryLocks, dependencyTables: m.dependencies.length,
    permissionsVerified: true, browserRolesUnprivileged: true, conflicts: false, tls: tls.protocol }));
  if (mode !== '--apply') return;
  // This branch must never be invoked without the user's separate execution approval.
  const writable = { ...env, PGOPTIONS: '-c default_transaction_read_only=off -c lock_timeout=5000 -c statement_timeout=60000' };
  runSql(writable, sql);
  console.log(JSON.stringify({ status: 'sql_committed' }));
  runSql(env, 'BEGIN READ ONLY;\n' + structureVerification(items) + '\n' + securityCheck + '\nROLLBACK;');
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-dashboard-resolve-'));
  const schema = path.join(workspace, 'prisma/schema.prisma');
  fs.mkdirSync(path.dirname(schema), { recursive: true }); fs.copyFileSync(path.join(backend, 'prisma/schema.prisma'), schema);
  fs.cpSync(dir, path.join(workspace, 'prisma/migrations'), { recursive: true });
  const url = new URL(config.DIRECT_URL); url.searchParams.set('sslmode', 'require');
  const prismaEnv = { ...writable, DATABASE_URL: url.toString(), DIRECT_URL: url.toString(), PRISMA_HIDE_UPDATE_MESSAGE: 'true', CHECKPOINT_DISABLE: '1' };
  for (const name of names) {
    const result = spawnSync(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'resolve', '--applied', name, '--schema', schema], {
      cwd: workspace, env: prismaEnv, encoding: 'utf8', windowsHide: true, timeout: 90000,
    });
    if (result.error || result.status !== 0) fail('history_registration_failed_after_commit_no_sql_retry');
    const state = JSON.parse(runSql(env, metadataSql(items)));
    const row = state.history.filter(r => r.name === name);
    if (row.length !== 1 || !row[0].finished || row[0].rolledBack || row[0].checksum !== items.find(i => i.name === name).checksum) fail('history_verification_failed_after_commit');
    console.log(JSON.stringify({ status: 'migration_history_verified', migration: name }));
  }
  console.log(JSON.stringify({ status: 'five_migrations_applied_and_registered', endpointTests: 'not_executed' }));
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ status: 'stopped', category: error.category || 'unexpected_failure_private_details_suppressed' })); process.exitCode = 1; });
module.exports = { names, identity, resolveBackupPath, planPath, privateConfigPath, metadataSql, scripts, validateMetadata, structureVerification, buildApplySql };
