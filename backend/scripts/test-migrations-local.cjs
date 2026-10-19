// Creates its own disposable PostgreSQL cluster. Never accepts a database URL,
// loads connection settings from .env, connects to an existing server, or deletes
// databases/data files. Prisma receives explicit disposable connection settings.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const backend = path.resolve(__dirname, '..');
const migrations = path.join(backend, 'prisma', 'migrations');
const reconciliation = '20261015120000_reconcile_auth_schema';
const sessionVersionMigration = '20261015140000_session_version';
const historyIndexesMigration = '20261017120000_student_history_indexes';
const classExamsMigration = '20261017150000_classes_teacher_exams';
const goalsReportsMigration = '20261017180000_goals_reports_indexes';
const profilePhotosMigration = '20261018120000_profile_photos';
const pgBin = process.argv[2];
if (!pgBin || process.argv.length !== 3) {
  console.error('Usage: node scripts/test-migrations-local.cjs <PostgreSQL-bin-directory>');
  process.exit(1);
}
const executable = name => path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
for (const name of ['initdb', 'pg_ctl', 'psql']) assert.ok(fs.existsSync(executable(name)), `${name} missing`);
const folders = fs.readdirSync(migrations).filter(name => fs.existsSync(path.join(migrations, name, 'migration.sql'))).sort();
assert.equal(folders.at(-1), profilePhotosMigration, 'Review this harness before adding later migrations');
const historical = folders.filter(name => name < reconciliation);
const previousMigrations = folders.filter(name => name < profilePhotosMigration);
const digest = name => createHash('sha256').update(fs.readFileSync(path.join(migrations, name, 'migration.sql'))).digest('hex');
const checksums = previousMigrations.map(digest);
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-migrations-'));
const data = path.join(artifacts, 'data');
const log = path.join(artifacts, 'postgres.log');
const user = 'jurissim_migration_test';
let started = false;

// These values replace inherited connection settings even if the calling shell
// has production credentials. Every database command gets explicit local flags.
const env = {
  ...process.env, PGHOST: '127.0.0.1', PGUSER: user, PGPASSWORD: '',
  PGOPTIONS: '', PGSSLMODE: 'disable',
  PGCONNECT_TIMEOUT: '5', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: 'true',
};
delete env.PGSERVICE;
delete env.PGSERVICEFILE;
function run(command, args, input) {
  // On Windows, postgres can inherit pg_ctl's pipe handles and keep spawnSync
  // waiting after pg_ctl has exited. The server already writes to postgres.log.
  const controller = path.basename(command).startsWith('pg_ctl');
  const result = spawnSync(command, args, { cwd: backend, env, input,
    stdio: controller ? 'ignore' : 'pipe', encoding: 'utf8', windowsHide: true, timeout: 120_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${path.basename(command)} failed:\n${result.stdout}\n${result.stderr}`);
  return (result.stdout || '').trim();
}
function sql(database, input) {
  return run(executable('psql'), ['-X', '-w', '-h', '127.0.0.1', '-p', env.PGPORT,
    '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q', '-f', '-'], input);
}
function prisma(database, args) {
  const url = `postgresql://${user}@127.0.0.1:${env.PGPORT}/${database}?schema=public`;
  Object.assign(env, { DATABASE_URL: url, DIRECT_URL: url, SHADOW_DATABASE_URL: url });
  return run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), ...args]);
}
const quote = value => '"' + value.replaceAll('"', '""') + '"';
function snapshot(database, tables) {
  return Object.fromEntries(tables.map(({ name, columns }) => [name, sql(database,
    `SELECT count(*)::text || ':' || md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY to_jsonb(s)::text)::text, '[]'))
     FROM (SELECT ${columns.map(quote).join(', ')} FROM public.${quote(name)}) s;`)]));
}
const fixture = `
INSERT INTO "User" (id, nome, email, "senhaHash", role) VALUES ('fixture-user', 'Migration fixture', 'migration@example.invalid', 'fixture-not-a-real-password-hash', 'ALUNO');
INSERT INTO "Turma" (id, nome, "codigoConvite") VALUES ('fixture-class', 'Fixture', 'fixture-invite');
INSERT INTO "_AlunoTurmas" ("A", "B") VALUES ('fixture-class', 'fixture-user');
INSERT INTO "_ProfessorTurmas" ("A", "B") VALUES ('fixture-class', 'fixture-user');
INSERT INTO "Questao" (id, enunciado, disciplina, assunto, nivel, "fundamentacaoJuridica", "autorId", "turmaId") VALUES ('fixture-question', 'Fixture', 'Civil', 'Fixture', 'BASICO', 'Fixture', 'fixture-user', 'fixture-class');
INSERT INTO "Alternativa" (id, texto, correta, "questaoId") VALUES ('fixture-option', 'Fixture', true, 'fixture-question');
INSERT INTO "Simulado" (id, tipo, "alunoId") VALUES ('fixture-exam', 'DIAGNOSTICO', 'fixture-user');
INSERT INTO "QuestaoSimulado" (id, posicao, "simuladoId", "questaoId") VALUES ('fixture-exam-question', 1, 'fixture-exam', 'fixture-question');
INSERT INTO "Resposta" (id, correta, "simuladoId", "questaoId", "questaoSimuladoId", "alternativaEscolhidaId") VALUES ('fixture-answer', true, 'fixture-exam', 'fixture-question', 'fixture-exam-question', 'fixture-option');
INSERT INTO "DesempenhoDiagnostico" (id, "simuladoId", tipo, disciplina, acertos, "totalQuestoes", percentual) VALUES ('fixture-performance', 'fixture-exam', 'DISCIPLINA', 'Civil', 1, 1, 100);
INSERT INTO "TrilhaAdaptativa" (id, "simuladoId", "disciplinaPrioritaria", "nivelRecomendado", "quantidadeRecomendada", justificativa) VALUES ('fixture-trail', 'fixture-exam', 'Civil', 'BASICO', 1, 'Fixture');
INSERT INTO "MetaDiaria" (id, data, "metaQuestoes", "alunoId") VALUES ('fixture-goal', CURRENT_TIMESTAMP, 1, 'fixture-user');
INSERT INTO "AuditLog" (id, "userId", action) VALUES
  ('fixture-audit-request', 'fixture-user', 'PASSWORD_RECOVERY_REQUESTED'),
  ('fixture-audit-complete', 'fixture-user', 'PASSWORD_RECOVERY_COMPLETED');
INSERT INTO "PasswordRecoveryToken" (id, "userId", "tokenHash", "expiresAt") VALUES ('fixture-recovery', 'fixture-user', 'fixture-not-a-real-token-hash', CURRENT_TIMESTAMP + INTERVAL '1 hour');
`;
async function main() {
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const selected = server.address().port;
      server.close(error => error ? reject(error) : resolve(selected));
    });
  });
  env.PGPORT = String(port);
  console.log(`Artifacts (retained; no automatic deletion): ${artifacts}`);
  console.log(run(executable('initdb'), ['--version']));
  run(executable('initdb'), ['-D', data, '-U', user, '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale']);
  run(executable('pg_ctl'), ['-D', data, '-l', log, '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '30', 'start']);
  started = true;
  assert.equal(sql('postgres', 'SHOW data_directory;').replaceAll('\\', '/'), data.replaceAll('\\', '/'), 'Unexpected PostgreSQL cluster');
  sql('postgres', 'CREATE DATABASE jurissim_history; CREATE DATABASE jurissim_fresh;');

  // Upgrade path: replay the untouched history and preserve rows in every table.
  for (const name of historical) sql('jurissim_history', fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8'));
  console.log(`PASS: ${historical.length} historical migrations replayed`);
  const beforeDiff = prisma('jurissim_history', ['migrate', 'diff', '--from-url', `postgresql://${user}@127.0.0.1:${port}/jurissim_history?schema=public`, '--to-schema-datamodel', 'prisma/schema.prisma']);
  fs.writeFileSync(path.join(artifacts, 'before-diff.txt'), beforeDiff);
  sql('jurissim_history', fixture);
  const tables = JSON.parse(sql('jurissim_history', `SELECT json_agg(t ORDER BY name) FROM (
    SELECT table_name AS name, array_agg(column_name ORDER BY ordinal_position) AS columns
    FROM information_schema.columns WHERE table_schema = 'public' GROUP BY table_name
  ) t;`));
  const before = snapshot('jurissim_history', tables);
  assert.ok(Object.values(before).every(value => !value.startsWith('0:')), 'Every historical table must contain fixture rows');
  sql('jurissim_history', fs.readFileSync(path.join(migrations, reconciliation, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot('jurissim_history', tables), before, 'Existing data changed');
  assert.equal(sql('jurissim_history', 'SELECT count(*) FROM "User" WHERE "emailVerifiedAt" IS NULL AND "deletedAt" IS NULL;'), '1');
  console.log(`PASS: upgrade preserved rows/values in all ${tables.length} historical tables; new timestamps remain NULL`);
  const assertNoDrift = database => {
    const url = `postgresql://${user}@127.0.0.1:${port}/${database}?schema=public`;
    const output = prisma(database, ['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code']);
    console.log(`PASS: ${database} has no schema drift (${output.split('\n').at(-1)})`);
  };
  sql('jurissim_history', `
    INSERT INTO "User" (id, nome, email, "senhaHash", role) VALUES ('fixture-null-password', 'Fixture', 'null@example.invalid', NULL, 'ALUNO');
    INSERT INTO "AuthToken" (id, "userId", "tokenHash", type, "expiresAt") VALUES
      ('fixture-confirm', 'fixture-user', 'fixture-confirm-hash', 'EMAIL_VERIFICATION', CURRENT_TIMESTAMP + INTERVAL '1 hour'),
      ('fixture-reset', 'fixture-user', 'fixture-reset-hash', 'PASSWORD_RESET', CURRENT_TIMESTAMP + INTERVAL '1 hour');
    INSERT INTO "AuditLog" (id, "userId", action) VALUES
      ('fixture-email', 'fixture-user', 'EMAIL_CONFIRMADO'),
      ('fixture-password', 'fixture-user', 'SENHA_REDEFINIDA'),
      ('fixture-deleted', 'fixture-user', 'CONTA_EXCLUIDA'),
      ('fixture-request', 'fixture-user', 'RECUPERACAO_SENHA_SOLICITADA');
  `);
  console.log('PASS: nullable password, both auth token types and all four new audit labels accept fixture inserts');

  // Stage 3: preserve every stage-1 column and fixture row while adding versioning.
  const stage1Tables = JSON.parse(sql('jurissim_history', `SELECT json_agg(t ORDER BY name) FROM (
    SELECT table_name AS name, array_agg(column_name ORDER BY ordinal_position) AS columns
    FROM information_schema.columns WHERE table_schema = 'public' GROUP BY table_name
  ) t;`));
  const stage1Snapshot = snapshot('jurissim_history', stage1Tables);
  sql('jurissim_history', fs.readFileSync(path.join(migrations, sessionVersionMigration, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot('jurissim_history', stage1Tables), stage1Snapshot, 'Stage-1 data changed');
  assert.equal(sql('jurissim_history', 'SELECT count(*) FROM "User" WHERE "sessionVersion" IS NULL OR "sessionVersion" <> 0;'), '0');
  console.log(`PASS: session-version migration preserved all ${stage1Tables.length} tables and initialized existing users at zero`);
  const beforeIndexes = snapshot('jurissim_history', stage1Tables);
  sql('jurissim_history', fs.readFileSync(path.join(migrations, historyIndexesMigration, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot('jurissim_history', stage1Tables), beforeIndexes, 'History indexes changed existing data');
  console.log('PASS: history indexes preserved all existing rows/columns');
  const beforeClasses = snapshot('jurissim_history', stage1Tables);
  sql('jurissim_history', fs.readFileSync(path.join(migrations, classExamsMigration, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot('jurissim_history', stage1Tables), beforeClasses, 'Class/exam migration changed historical data');
  assert.equal(sql('jurissim_history', 'SELECT count(*) FROM "Simulado" WHERE "avaliacaoId" IS NOT NULL;'), '0');
  console.log('PASS: class/exam migration preserved historical data and nullable attempt links');
  const beforeGoalsIndexes = snapshot('jurissim_history', stage1Tables);
  sql('jurissim_history', fs.readFileSync(path.join(migrations, goalsReportsMigration, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot('jurissim_history', stage1Tables), beforeGoalsIndexes, 'Goal/report indexes changed historical data');
  console.log('PASS: goals/report indexes preserved historical goal and response data');
  const beforePhotos = snapshot('jurissim_history', stage1Tables);
  sql('jurissim_history', fs.readFileSync(path.join(migrations, profilePhotosMigration, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot('jurissim_history', stage1Tables), beforePhotos, 'Profile-photo migration changed historical data');
  assert.equal(sql('jurissim_history', 'SELECT count(*) FROM "ProfilePhoto";'), '0');
  console.log('PASS: private profile-photo table starts empty and preserves all existing rows/columns');
  assertNoDrift('jurissim_history');

  // Fresh installation: exercise Prisma's real migration runner and ledger.
  prisma('jurissim_fresh', ['validate', '--schema', 'prisma/schema.prisma']);
  prisma('jurissim_fresh', ['migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
  assertNoDrift('jurissim_fresh');
  const secondDeploy = prisma('jurissim_fresh', ['migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
  assert.match(secondDeploy, /No pending migrations/);
  assert.equal(sql('jurissim_fresh', 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'), String(folders.length));
  console.log(`PASS: fresh deploy applied ${folders.length} migrations; second deploy has no pending migrations`);
  assert.deepEqual(previousMigrations.map(digest), checksums, 'Historical migration files changed');
  console.log('PASS: historical migration checksums unchanged');

  // Run the actual repositories and HTTP authentication against only this cluster.
  prisma('jurissim_fresh', ['generate', '--schema', 'prisma/schema.prisma']);
  const runtimeUrl = `postgresql://${user}@127.0.0.1:${port}/jurissim_fresh?schema=public`;
  Object.assign(env, { DATABASE_URL: runtimeUrl, DIRECT_URL: runtimeUrl, SHADOW_DATABASE_URL: runtimeUrl,
    NODE_ENV: 'test', JWT_SECRET: 'local-postgres-stage3-test-key-over-32-characters',
    GMAIL_USER: '', GMAIL_APP_PASSWORD: '', GOOGLE_CLIENT_ID: '', GROQ_API_KEY: '' });
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-session-revocation-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-student-history-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-class-exams-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-goals-reports-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-profile-photo-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-auth-stage7-db.ts', data]));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => {
  if (started) {
    try {
      run(executable('pg_ctl'), ['-D', data, '-w', '-t', '30', '-m', 'fast', 'stop']);
      console.log('Disposable cluster stopped. Artifacts retained.');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
});
