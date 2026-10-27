// Creates its own disposable PostgreSQL cluster. Never accepts a database URL,
// loads connection settings from .env, connects to an existing server, or deletes
// databases/data files. Prisma receives explicit disposable connection settings.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { Prisma: installedPrisma } = require('@prisma/client');

const backend = path.resolve(__dirname, '..');
const migrations = path.join(backend, 'prisma', 'migrations');
const reconciliation = '20261015120000_reconcile_auth_schema';
const sessionVersionMigration = '20261015140000_session_version';
const historyIndexesMigration = '20261017120000_student_history_indexes';
const classExamsMigration = '20261017150000_classes_teacher_exams';
const goalsReportsMigration = '20261017180000_goals_reports_indexes';
const profilePhotosMigration = '20261018120000_profile_photos';
const backendOnlyMigration = '20261020120000_backend_only_evaluations_photos';
const questionImportMigration = '20261021100000_question_import_provenance';
const initialDiagnosticMigration = '20261021110000_initial_diagnostic_identity';
const questionEligibilityMigration = '20261021120000_question_eligibility_metadata';
const questionPracticeMigration = '20261021130000_question_practice_sessions';
const requiredQuestionMigrations = [questionImportMigration, initialDiagnosticMigration, questionEligibilityMigration, questionPracticeMigration];
const pgBin = process.argv[2];
const preflightOnly = process.argv[3] === '--preflight-only';
const startupDiagnosticOnly = process.argv[3] === '--startup-diagnostic-only';
if (!pgBin || (process.argv.length !== 3
  && !(process.argv.length === 4 && (preflightOnly || startupDiagnosticOnly)))) {
  console.error('Usage: node scripts/test-migrations-local.cjs <PostgreSQL-bin-directory> [--preflight-only|--startup-diagnostic-only]');
  process.exit(1);
}
const resolvedPgBin = path.resolve(pgBin);
const executable = name => path.join(resolvedPgBin, name + (process.platform === 'win32' ? '.exe' : ''));
for (const name of ['initdb', 'pg_ctl', 'postgres', 'psql']) assert.ok(fs.existsSync(executable(name)), `${name} missing`);
const folders = fs.readdirSync(migrations).filter(name => fs.existsSync(path.join(migrations, name, 'migration.sql'))).sort();
assert.deepEqual(folders.slice(-requiredQuestionMigrations.length), requiredQuestionMigrations,
  'Review this harness when the required question/diagnostic migration sequence changes');
for (const name of requiredQuestionMigrations) assert.ok(folders.includes(name), `Required migration missing: ${name}`);
function prismaModelSignature(dmmf) {
  return JSON.stringify({
    models: dmmf.datamodel.models.map(model => [model.name,
      model.fields.map(field => [field.name, field.type, field.isList, field.isRequired, field.isId, field.isUnique])]
    ).sort((left, right) => left[0].localeCompare(right[0])),
    enums: dmmf.datamodel.enums.map(item => [item.name, item.values.map(value => value.name)])
      .sort((left, right) => left[0].localeCompare(right[0])),
  });
}
const installedModels = new Map(installedPrisma.dmmf.datamodel.models.map(model => [model.name, new Set(model.fields.map(field => field.name))]));
for (const [modelName, requiredFields] of Object.entries({
  DiagnosticoInicial: ['alunoId', 'simuladoId'],
  SessaoPratica: ['simuladoId', 'alunoId', 'disciplina'],
  Questao: ['origem', 'revisaoJuridicaEm', 'revisaoPedagogicaEm', 'liberadaAcervoEm', 'situacaoDireitos', 'oabNumeroQuestao'],
  Alternativa: ['letra'],
})) {
  const fields = installedModels.get(modelName);
  assert.ok(fields && requiredFields.every(field => fields.has(field)),
    `Installed Prisma Client is stale or incompatible: ${modelName} is missing required fields.`);
}
const historical = folders.filter(name => name < reconciliation);
const previousMigrations = folders.filter(name => name < questionImportMigration);
const digest = name => createHash('sha256').update(fs.readFileSync(path.join(migrations, name, 'migration.sql'))).digest('hex');
const checksums = previousMigrations.map(digest);
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-migrations-'));
const data = path.join(artifacts, 'data');
const log = path.join(artifacts, 'postgres.log');
const passwordFile = path.join(artifacts, 'postgres-password.txt');
const emptyPasswordFile = path.join(artifacts, 'empty-pgpass');
const user = 'jurissim_migration_test';
const testPassword = randomBytes(32).toString('hex');
// Unpredictable database names make a port takeover fail closed even if a
// different local PostgreSQL instance uses trust authentication.
const runId = randomBytes(16).toString('hex');
const historyDatabase = `js_hist_${runId}`;
const freshDatabase = `js_fresh_${runId}`;
const integrationDatabase = `js_int_${runId}`;
const isolatedSchemaDirectory = path.join(backend, 'node_modules', `.jurissim-prisma-schema-${runId}`);
const isolatedSchemaPath = path.join(isolatedSchemaDirectory, 'schema.prisma');
const isolatedPrismaOutput = path.join(artifacts, 'isolated-prisma-client');
let isolatedSchemaDirectoryCreated = false;
const allowedEnvironment = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
]);
const env = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => allowedEnvironment.has(key.toUpperCase())));
Object.assign(env, {
  NODE_ENV: 'test', NODE_OPTIONS: '',
  JWT_SECRET: 'local-postgres-stage4-test-key-over-32-characters',
  GMAIL_USER: '', GMAIL_APP_PASSWORD: '', BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '',
  GOOGLE_CLIENT_ID: '', GROQ_API_KEY: '', APP_PUBLIC_URL: 'http://127.0.0.1:5173',
  PRISMA_HIDE_UPDATE_MESSAGE: 'true',
});
let port;
let startAttempted = false;
let stopRequested = false;

function redact(value) {
  return String(value ?? '').replaceAll(testPassword, '[REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[REDACTED]@');
}

function run(command, args, input, allowAfterStop = false, environment = env) {
  if (stopRequested && !allowAfterStop) throw new Error('Harness interrupted; refusing further database commands.');
  // On Windows, postgres can inherit pg_ctl's pipe handles and keep spawnSync
  // waiting after pg_ctl has exited. The server already writes to postgres.log.
  const controller = path.basename(command).startsWith('pg_ctl') && ['start', 'stop'].includes(args.at(-1));
  const result = spawnSync(command, args, { cwd: backend, env: environment, input,
    stdio: controller ? 'ignore' : 'pipe', encoding: 'utf8', windowsHide: true, timeout: 120_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${path.basename(command)} failed:\n${redact(result.stdout)}\n${redact(result.stderr)}`);
  return redact(result.stdout || '').trim();
}

function runCaptured(command, args, stdoutPath, stderrPath, environment = env) {
  const stdoutFd = fs.openSync(stdoutPath, 'wx');
  const stderrFd = fs.openSync(stderrPath, 'wx');
  let result;
  try {
    result = spawnSync(command, args, {
      cwd: backend, env: environment, stdio: ['ignore', stdoutFd, stderrFd],
      encoding: 'utf8', windowsHide: true, timeout: 120_000,
    });
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
  const windowsDecoder = process.platform === 'win32' ? new TextDecoder('windows-1252') : new TextDecoder();
  const stdout = windowsDecoder.decode(fs.readFileSync(stdoutPath));
  const stderr = windowsDecoder.decode(fs.readFileSync(stderrPath));
  return { status: result?.status ?? null, error: result?.error?.message ?? null, stdout, stderr };
}

function removeIsolatedSchemaCopy() {
  if (!isolatedSchemaDirectoryCreated) return;
  const nodeModules = fs.realpathSync(path.join(backend, 'node_modules'));
  const directory = path.resolve(isolatedSchemaDirectory);
  assert.equal(path.dirname(directory), nodeModules, 'Refusing to clean a schema-copy directory outside backend/node_modules.');
  const directoryStat = fs.lstatSync(directory);
  assert.ok(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), 'Refusing to clean a non-owned schema-copy path.');
  assert.equal(fs.realpathSync(directory), directory, 'Refusing to clean a redirected schema-copy directory.');
  const schemaStat = fs.lstatSync(isolatedSchemaPath);
  assert.ok(schemaStat.isFile() && !schemaStat.isSymbolicLink(), 'Refusing to clean anything except the schema copy.');
  fs.unlinkSync(isolatedSchemaPath);
  fs.rmdirSync(directory);
  isolatedSchemaDirectoryCreated = false;
}

function generatePrismaClientIsolated() {
  const nodeModules = fs.realpathSync(path.join(backend, 'node_modules'));
  assert.equal(path.dirname(path.resolve(isolatedSchemaDirectory)), nodeModules,
    'Isolated schema must be placed directly under backend/node_modules for package resolution.');
  fs.mkdirSync(isolatedSchemaDirectory);
  isolatedSchemaDirectoryCreated = true;
  const sourceSchema = fs.readFileSync(path.join(backend, 'prisma', 'schema.prisma'), 'utf8');
  const generator = sourceSchema.match(/generator\s+client\s*\{[\s\S]*?\}/);
  assert.ok(generator && /provider\s*=\s*"prisma-client-js"/.test(generator[0]),
    'Could not identify the Prisma Client generator block safely.');
  assert.ok(!/\boutput\s*=/.test(generator[0]), 'Source Prisma schema already sets a generator output; refusing to rewrite it.');
  const output = path.resolve(isolatedPrismaOutput).replaceAll('\\', '/');
  const isolatedGenerator = generator[0].replace(/(provider\s*=\s*"prisma-client-js"\s*)/,
    `$1  output = "${output}"\n`);
  fs.writeFileSync(isolatedSchemaPath, sourceSchema.replace(generator[0], isolatedGenerator), { flag: 'wx' });

  const dummyUrl = 'postgresql://isolated:isolated@127.0.0.1:1/unused?schema=public';
  const generationEnvironment = {
    ...env,
    DATABASE_URL: dummyUrl,
    DIRECT_URL: dummyUrl,
    SHADOW_DATABASE_URL: dummyUrl,
    PGHOST: '127.0.0.1',
    PGHOSTADDR: '127.0.0.1',
    PGPORT: '1',
    PGDATABASE: 'unused',
    PGUSER: 'isolated',
    PGPASSWORD: 'isolated',
  };

  try {
    const outputLog = run(process.execPath,
      [path.join(backend, 'node_modules/prisma/build/index.js'), 'generate', '--schema', isolatedSchemaPath],
      undefined, false, generationEnvironment);
    const isolatedPrisma = require(isolatedPrismaOutput).Prisma;
    assert.equal(prismaModelSignature(isolatedPrisma.dmmf), prismaModelSignature(installedPrisma.dmmf),
      'Installed runtime Prisma Client does not match the isolated client generated from the current schema.');
    console.log(outputLog);
    console.log('PASS: Prisma Client generated in isolated TEMP output; installed runtime Client schema matches it');
  } finally {
    removeIsolatedSchemaCopy();
  }
}

function targetEnvironment(database) {
  Object.assign(env, {
    PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: String(port),
    PGDATABASE: database, PGUSER: user, PGPASSWORD: testPassword,
    PGPASSFILE: emptyPasswordFile, PGOPTIONS: '', PGSSLMODE: 'disable',
    PGCONNECT_TIMEOUT: '5', CHECKPOINT_DISABLE: '1',
  });
}

const sqlLiteral = value => `'${String(value).replaceAll("'", "''")}'`;
function identityGuard(database) {
  const expectedDirectory = path.resolve(data).replaceAll('\\', '/');
  return `DO $harness_identity$ BEGIN
    IF replace(current_setting('data_directory'), chr(92), '/') <> ${sqlLiteral(expectedDirectory)}
      OR current_database() <> ${sqlLiteral(database)}
      OR current_user <> ${sqlLiteral(user)}
      OR inet_server_addr()::text <> '127.0.0.1'
      OR inet_server_port() <> ${Number(port)} THEN
      RAISE EXCEPTION 'Refusing database command: PostgreSQL cluster identity mismatch.';
    END IF;
  END $harness_identity$;`;
}

function sql(database, input) {
  targetEnvironment(database);
  return run(executable('psql'), ['-X', '-w', '-h', '127.0.0.1', '-p', env.PGPORT,
    '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q', '-f', '-'], `${identityGuard(database)}\n${input}`);
}
function prisma(database, args) {
  targetEnvironment(database);
  // A psql assertion precedes every Prisma CLI call that could reach a database.
  sql(database, 'SELECT 1;');
  const url = `postgresql://${user}:${testPassword}@127.0.0.1:${env.PGPORT}/${database}?schema=public`;
  Object.assign(env, { DATABASE_URL: url, DIRECT_URL: url, SHADOW_DATABASE_URL: url });
  return run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), ...args]);
}
const quote = value => '"' + value.replaceAll('"', '""') + '"';
function snapshot(database, tables) {
  return Object.fromEntries(tables.map(({ name, columns }) => [name, sql(database,
    `SELECT count(*)::text || ':' || md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY to_jsonb(s)::text)::text, '[]'))
     FROM (SELECT ${columns.map(quote).join(', ')} FROM public.${quote(name)}) s;`)]));
}
function removeOwnedFile(file) {
  const root = fs.realpathSync(artifacts);
  const target = path.resolve(file);
  const relative = path.relative(root, target);
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    'Refusing to remove a path outside the harness artifact directory.');
  assert.equal(fs.realpathSync(path.dirname(target)), root, 'Refusing to remove a file outside the harness root.');
  const stat = fs.lstatSync(target);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Refusing to remove anything except a regular harness file.');
  fs.unlinkSync(target);
}

async function chooseAvailableLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not reserve a loopback port.')));
        return;
      }
      const selected = address.port;
      server.close(error => error ? reject(error) : resolve(selected));
    });
  });
}

const fixture = `
INSERT INTO "User" (id, nome, email, "senhaHash", role) VALUES ('fixture-user', 'Migration fixture', 'migration@example.invalid', 'fixture-not-a-real-password-hash', 'ALUNO');
INSERT INTO "Turma" (id, nome, "codigoConvite") VALUES ('fixture-class', 'Fixture', 'fixture-invite');
INSERT INTO "_AlunoTurmas" ("A", "B") VALUES ('fixture-class', 'fixture-user');
INSERT INTO "_ProfessorTurmas" ("A", "B") VALUES ('fixture-class', 'fixture-user');
INSERT INTO "Questao" (id, enunciado, disciplina, assunto, nivel, "fundamentacaoJuridica", "autorId", "turmaId") VALUES ('fixture-question', 'Fixture', 'Civil', 'Fixture', 'BASICO', 'Fixture', 'fixture-user', 'fixture-class');
INSERT INTO "Questao" (id, enunciado, disciplina, assunto, nivel, "fundamentacaoJuridica", "autorId", "turmaId") VALUES ('fixture-question-duplicate', 'Fixture', 'Civil', 'Fixture', 'BASICO', 'Fixture', 'fixture-user', 'fixture-class');
INSERT INTO "Alternativa" (id, texto, correta, "questaoId") VALUES ('fixture-option', 'Fixture', true, 'fixture-question');
INSERT INTO "Alternativa" (id, texto, correta, "questaoId") VALUES ('fixture-option-duplicate', 'Fixture', true, 'fixture-question-duplicate');
INSERT INTO "Simulado" (id, tipo, "alunoId", "finalizadoEm") VALUES ('fixture-exam', 'DIAGNOSTICO', 'fixture-user', CURRENT_TIMESTAMP);
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
  console.log(`Artifacts (retained; no automatic deletion): ${artifacts}`);
  // Prove isolated generation and current runtime-client compatibility before
  // initializing or starting PostgreSQL.
  generatePrismaClientIsolated();
  if (preflightOnly) {
    console.log('Preflight passed. PostgreSQL was not initialized or started.');
    return;
  }
  const binaryVersions = Object.fromEntries(['initdb', 'pg_ctl', 'postgres'].map(name => [
    name, run(executable(name), ['--version']),
  ]));
  const majorVersions = Object.entries(binaryVersions).map(([name, version]) => {
    const binaryPath = fs.realpathSync(executable(name));
    assert.equal(path.dirname(binaryPath), fs.realpathSync(resolvedPgBin), `${name} is not from the selected PostgreSQL bin directory`);
    const match = version.match(/PostgreSQL\)\s+(\d+)/);
    assert.ok(match, `Could not read PostgreSQL major version from ${name}: ${version}`);
    return match[1];
  });
  assert.ok(majorVersions.every(version => version === majorVersions[0]),
    `PostgreSQL executable version mismatch: ${JSON.stringify(binaryVersions)}`);
  assert.equal(majorVersions[0], '17', `Expected PostgreSQL 17 binaries: ${JSON.stringify(binaryVersions)}`);
  console.log(`PostgreSQL binaries verified: ${JSON.stringify(binaryVersions)}`);
  fs.accessSync(artifacts, fs.constants.R_OK | fs.constants.W_OK);
  const logFd = fs.openSync(log, 'wx');
  fs.closeSync(logFd);
  console.log(`Writable private artifact directory verified: ${artifacts}`);
  fs.writeFileSync(emptyPasswordFile, '', { flag: 'wx', mode: 0o600 });
  try {
    fs.writeFileSync(passwordFile, `${testPassword}\n`, { flag: 'wx', mode: 0o600 });
    run(executable('initdb'), ['-D', data, '-U', user, `--pwfile=${passwordFile}`,
      '--auth-local=scram-sha-256', '--auth-host=scram-sha-256', '--encoding=UTF8', '--no-locale']);
  } finally {
    if (fs.existsSync(passwordFile)) removeOwnedFile(passwordFile);
  }
  // Choose the port immediately before bind. If another process wins the small
  // close-to-bind race, pg_ctl fails and no client is allowed to probe that port.
  port = await chooseAvailableLoopbackPort();
  console.log(`Selected loopback port: ${port}`);
  targetEnvironment('postgres');
  startAttempted = true;
  const pgCtlStdout = path.join(artifacts, 'pg_ctl-start.stdout.log');
  const pgCtlStderr = path.join(artifacts, 'pg_ctl-start.stderr.log');
  const startArgs = ['-D', data, '-l', log, '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '30', 'start'];
  const startResult = runCaptured(executable('pg_ctl'), startArgs, pgCtlStdout, pgCtlStderr, env);
  fs.writeFileSync(path.join(artifacts, 'pg_ctl-start-diagnostic.json'), JSON.stringify({
    executable: executable('pg_ctl'), args: startArgs, dataDirectory: data, logFile: log,
    bindAddress: '127.0.0.1', port, binaryVersions,
    exitCode: startResult.status, error: startResult.error,
    stdout: startResult.stdout, stderr: startResult.stderr,
  }, null, 2));
  if (startResult.error || startResult.status !== 0) {
    throw new Error(`pg_ctl start failed (exit=${startResult.status}; error=${startResult.error ?? 'none'}). stdout: ${startResult.stdout.trim() || '[empty]'}; stderr: ${startResult.stderr.trim() || '[empty]'}; PostgreSQL log: ${log}`);
  }
  assert.equal(sql('postgres', 'SHOW data_directory;').replaceAll('\\', '/'), data.replaceAll('\\', '/'), 'Unexpected PostgreSQL cluster');
  console.log(`PASS: temporary cluster identity verified in ${data}`);
  if (startupDiagnosticOnly) {
    console.log('Startup diagnostic complete. No databases beyond the initdb default were created; no migrations or integration tests ran.');
    return;
  }
  sql('postgres', 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;');
  sql('postgres', `CREATE DATABASE ${quote(historyDatabase)}; CREATE DATABASE ${quote(freshDatabase)};`);

  // Upgrade path: replay the untouched history and preserve rows in every table.
  for (const name of historical) sql(historyDatabase, fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8'));
  console.log(`PASS: ${historical.length} historical migrations replayed`);
  const beforeDiff = prisma(historyDatabase, ['migrate', 'diff', '--from-url', `postgresql://${user}:${testPassword}@127.0.0.1:${port}/${historyDatabase}?schema=public`, '--to-schema-datamodel', 'prisma/schema.prisma']);
  fs.writeFileSync(path.join(artifacts, 'before-diff.txt'), beforeDiff);
  sql(historyDatabase, fixture);
  const tables = JSON.parse(sql(historyDatabase, `SELECT json_agg(t ORDER BY name) FROM (
    SELECT table_name AS name, array_agg(column_name ORDER BY ordinal_position) AS columns
    FROM information_schema.columns WHERE table_schema = 'public' GROUP BY table_name
  ) t;`));
  const before = snapshot(historyDatabase, tables);
  assert.ok(Object.values(before).every(value => !value.startsWith('0:')), 'Every historical table must contain fixture rows');
  sql(historyDatabase, fs.readFileSync(path.join(migrations, reconciliation, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot(historyDatabase, tables), before, 'Existing data changed');
  assert.equal(sql(historyDatabase, 'SELECT count(*) FROM "User" WHERE "emailVerifiedAt" IS NULL AND "deletedAt" IS NULL;'), '1');
  console.log(`PASS: upgrade preserved rows/values in all ${tables.length} historical tables; new timestamps remain NULL`);
  const assertNoDrift = database => {
    const url = `postgresql://${user}:${testPassword}@127.0.0.1:${port}/${database}?schema=public`;
    const output = prisma(database, ['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code']);
    console.log(`PASS: ${database} has no schema drift (${output.split('\n').at(-1)})`);
  };
  sql(historyDatabase, `
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
  const stage1Tables = JSON.parse(sql(historyDatabase, `SELECT json_agg(t ORDER BY name) FROM (
    SELECT table_name AS name, array_agg(column_name ORDER BY ordinal_position) AS columns
    FROM information_schema.columns WHERE table_schema = 'public' GROUP BY table_name
  ) t;`));
  const stage1Snapshot = snapshot(historyDatabase, stage1Tables);
  sql(historyDatabase, fs.readFileSync(path.join(migrations, sessionVersionMigration, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot(historyDatabase, stage1Tables), stage1Snapshot, 'Stage-1 data changed');
  assert.equal(sql(historyDatabase, 'SELECT count(*) FROM "User" WHERE "sessionVersion" IS NULL OR "sessionVersion" <> 0;'), '0');
  console.log(`PASS: session-version migration preserved all ${stage1Tables.length} tables and initialized existing users at zero`);
  const beforeIndexes = snapshot(historyDatabase, stage1Tables);
  sql(historyDatabase, fs.readFileSync(path.join(migrations, historyIndexesMigration, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot(historyDatabase, stage1Tables), beforeIndexes, 'History indexes changed existing data');
  console.log('PASS: history indexes preserved all existing rows/columns');
  const beforeClasses = snapshot(historyDatabase, stage1Tables);
  sql(historyDatabase, fs.readFileSync(path.join(migrations, classExamsMigration, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot(historyDatabase, stage1Tables), beforeClasses, 'Class/exam migration changed historical data');
  assert.equal(sql(historyDatabase, 'SELECT count(*) FROM "Simulado" WHERE "avaliacaoId" IS NOT NULL;'), '0');
  console.log('PASS: class/exam migration preserved historical data and nullable attempt links');
  const beforeGoalsIndexes = snapshot(historyDatabase, stage1Tables);
  sql(historyDatabase, fs.readFileSync(path.join(migrations, goalsReportsMigration, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot(historyDatabase, stage1Tables), beforeGoalsIndexes, 'Goal/report indexes changed historical data');
  console.log('PASS: goals/report indexes preserved historical goal and response data');
  const beforePhotos = snapshot(historyDatabase, stage1Tables);
  sql(historyDatabase, fs.readFileSync(path.join(migrations, profilePhotosMigration, 'migration.sql'), 'utf8'));
  assert.deepEqual(snapshot(historyDatabase, stage1Tables), beforePhotos, 'Profile-photo migration changed historical data');
  assert.equal(sql(historyDatabase, 'SELECT count(*) FROM "ProfilePhoto";'), '0');
  console.log('PASS: private profile-photo table starts empty and preserves all existing rows/columns');
  for (const migration of [backendOnlyMigration, ...requiredQuestionMigrations]) {
    const beforeMigration = snapshot(historyDatabase, stage1Tables);
    sql(historyDatabase, fs.readFileSync(path.join(migrations, migration, 'migration.sql'), 'utf8'));
    assert.deepEqual(snapshot(historyDatabase, stage1Tables), beforeMigration, `${migration} changed existing rows`);
  }
  assert.equal(sql(historyDatabase, 'SELECT count(*) FROM "LoteImportacao";'), '0');
  assert.equal(sql(historyDatabase, 'SELECT count(*) FROM "Questao" WHERE "fingerprint" IS NOT NULL OR "fonteNome" IS NOT NULL OR "loteImportacaoId" IS NOT NULL;'), '0');
  assert.equal(sql(historyDatabase, `SELECT count(*) FROM "Questao" WHERE enunciado = 'Fixture' AND fingerprint IS NULL;`), '2');
  assert.equal(sql(historyDatabase, `SELECT count(*) FROM "DiagnosticoInicial" WHERE "alunoId" = 'fixture-user' AND "simuladoId" = 'fixture-exam';`), '1');
  assert.equal(sql(historyDatabase, `SELECT count(*) FROM "DiagnosticoInicial" d JOIN "Simulado" s ON s.id = d."simuladoId" WHERE d."alunoId" <> s."alunoId";`), '0');
  assert.equal(sql(historyDatabase, `SELECT count(*) FROM pg_constraint WHERE conname IN ('DiagnosticoInicial_alunoId_key', 'DiagnosticoInicial_simuladoId_key', 'DiagnosticoInicial_simuladoId_alunoId_fkey');`), '3');
  assert.equal(sql(historyDatabase, `SELECT count(*) FROM "Questao" WHERE "origem" IS NOT NULL OR "revisaoJuridicaEm" IS NOT NULL OR "revisorJuridicoId" IS NOT NULL OR "revisaoPedagogicaEm" IS NOT NULL OR "revisorPedagogicoId" IS NOT NULL OR "liberadaAcervoEm" IS NOT NULL OR "liberadaAcervoPorId" IS NOT NULL OR "situacaoDireitos" IS NOT NULL OR "direitosVerificadosEm" IS NOT NULL OR "direitosVerificadosPorId" IS NOT NULL OR "oabExame" IS NOT NULL OR "oabEdicao" IS NOT NULL OR "oabTipoProva" IS NOT NULL OR "oabNumeroQuestao" IS NOT NULL OR "fonteOficialUrl" IS NOT NULL OR "situacaoQuestaoOficial" IS NOT NULL;`), '0');
  assert.equal(sql(historyDatabase, `SELECT count(*) FROM "Alternativa" WHERE "letra" IS NOT NULL;`), '0');
  assert.equal(sql(historyDatabase, `SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = 'public."LetraAlternativa"'::regtype;`), 'A,B,C,D');
  sql(historyDatabase, `INSERT INTO "Alternativa" (id, texto, correta, "questaoId", letra) VALUES
    ('fixture-letter-a', 'A', true, 'fixture-question', 'A'),
    ('fixture-letter-b', 'B', false, 'fixture-question', 'B'),
    ('fixture-letter-c', 'C', false, 'fixture-question', 'C'),
    ('fixture-letter-d', 'D', false, 'fixture-question', 'D');`);
  assert.throws(() => sql(historyDatabase, `INSERT INTO "Alternativa" (id, texto, correta, "questaoId", letra) VALUES ('fixture-letter-a-duplicate', 'A duplicate', false, 'fixture-question', 'A');`), /failed/i);
  console.log('PASS: initial-diagnostic identity/FK, nullable eligibility metadata, legacy rows and unique A-D letters');
  assert.equal(sql(historyDatabase, `SELECT (relrowsecurity AND NOT relforcerowsecurity)::text FROM pg_class WHERE oid = 'public."LoteImportacao"'::regclass;`), 'true');
  assert.equal(sql(historyDatabase, `SELECT count(*) FROM pg_constraint WHERE conname IN ('Questao_loteImportacaoId_fkey', 'LoteImportacao_administradorId_fkey');`), '2');
  assert.equal(sql(historyDatabase, `SELECT (i.indisunique)::text FROM pg_index i WHERE i.indexrelid = 'public."Questao_fingerprint_key"'::regclass;`), 'true');
  for (const role of ['anon', 'authenticated']) {
    assert.equal(sql(historyDatabase, `SELECT has_table_privilege('${role}', 'public."LoteImportacao"', 'SELECT')::text;`), 'false');
    assert.equal(sql(historyDatabase, `SELECT has_table_privilege('${role}', 'public."LoteImportacao"', 'INSERT')::text;`), 'false');
  }
  sql(historyDatabase, `
    INSERT INTO "Questao" (id, enunciado, disciplina, assunto, nivel, "fundamentacaoJuridica", "autorId")
      VALUES ('fixture-null-fp-1', 'Question null fingerprint one', 'Civil', 'Fixture', 'BASICO', 'Fixture', 'fixture-user'),
             ('fixture-null-fp-2', 'Question null fingerprint two', 'Civil', 'Fixture', 'BASICO', 'Fixture', 'fixture-user');
    INSERT INTO "Questao" (id, enunciado, disciplina, assunto, nivel, "fundamentacaoJuridica", "autorId", fingerprint)
      VALUES ('fixture-fingerprint', 'Question fingerprint', 'Civil', 'Fixture', 'BASICO', 'Fixture', 'fixture-user', '${'f'.repeat(64)}');
  `);
  assert.throws(() => sql(historyDatabase, `INSERT INTO "Questao" (id, enunciado, disciplina, assunto, nivel, "fundamentacaoJuridica", "autorId", fingerprint)
    VALUES ('fixture-fingerprint-duplicate', 'Question duplicate fingerprint', 'Civil', 'Fixture', 'BASICO', 'Fixture', 'fixture-user', '${'f'.repeat(64)}');`), /failed/i);
  console.log('PASS: question-import migration preserves historical rows and enforces RLS/grants plus nullable/unique fingerprints');
  assertNoDrift(historyDatabase);

  // Fresh installation: exercise Prisma's real migration runner and ledger.
  prisma(freshDatabase, ['validate', '--schema', 'prisma/schema.prisma']);
  prisma(freshDatabase, ['migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
  assertNoDrift(freshDatabase);
  const secondDeploy = prisma(freshDatabase, ['migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
  assert.match(secondDeploy, /No pending migrations/);
  assert.equal(sql(freshDatabase, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'), String(folders.length));
  console.log(`PASS: fresh deploy applied ${folders.length} migrations; second deploy has no pending migrations`);
  assert.deepEqual(previousMigrations.map(digest), checksums, 'Historical migration files changed');
  console.log('PASS: historical migration checksums unchanged');

  // Run the actual repositories and HTTP authentication against only this cluster.
  const runtimeUrl = `postgresql://${user}:${testPassword}@127.0.0.1:${port}/${freshDatabase}?schema=public`;
  Object.assign(env, { DATABASE_URL: runtimeUrl, DIRECT_URL: runtimeUrl, SHADOW_DATABASE_URL: runtimeUrl,
    PGDATABASE: freshDatabase, JURISSIM_TEST_DB_PASSWORD: testPassword,
    JURISSIM_TEST_PGPASSFILE: emptyPasswordFile, JURISSIM_TEST_DATA_DIR: data,
    JURISSIM_TEST_FRESH_DATABASE: freshDatabase });
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-session-revocation-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-student-history-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-class-exams-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-goals-reports-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-profile-photo-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-auth-stage7-db.ts', data]));

  // Separate database for main's suite, within this same freshly created cluster.
  sql('postgres', `CREATE DATABASE ${quote(integrationDatabase)};`);
  prisma(integrationDatabase, ['migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
  const integrationUrl = `postgresql://${user}:${testPassword}@127.0.0.1:${port}/${integrationDatabase}?schema=public`;
  const capability = randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(artifacts, 'integration-test-owner.json'), JSON.stringify({
    capability, host: '127.0.0.1', port, database: integrationDatabase, username: user,
    dataDirectory: data, emptyPasswordFile,
  }));
  Object.assign(env, { TEST_DATABASE_URL: integrationUrl, TEST_DIRECT_URL: integrationUrl,
    DATABASE_URL: integrationUrl, DIRECT_URL: integrationUrl, SHADOW_DATABASE_URL: integrationUrl,
    PGDATABASE: integrationDatabase, JURISSIM_TEST_DATA_DIR: data,
    JURISSIM_TEST_DB_PASSWORD: testPassword, JURISSIM_TEST_PGPASSFILE: emptyPasswordFile,
    JURISSIM_TEST_CAPABILITY: capability, JURISSIM_TEST_INTEGRATION_DATABASE: integrationDatabase });
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-question-import-db.ts', data]));
  console.log(run(process.execPath, ['--import', 'tsx', 'scripts/test-initial-diagnostic-db.ts', data]));
  console.log(run(process.execPath, [path.join(backend, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.integration.config.ts']));
  assertNoDrift(integrationDatabase);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopRequested = true;
  process.exitCode = signal === 'SIGINT' ? 130 : 143;
});

function cleanup() {
  try { removeIsolatedSchemaCopy(); }
  catch (error) { console.error(`Could not safely remove the isolated schema copy. ${redact(error.message)}`); process.exitCode = 1; }
  if (fs.existsSync(passwordFile)) {
    try { removeOwnedFile(passwordFile); }
    catch (error) { console.error(`Could not remove the harness password file. ${redact(error.message)}`); process.exitCode = 1; }
  }
  if (!startAttempted) return;
  const status = spawnSync(executable('pg_ctl'), ['-D', data, 'status'], {
    cwd: backend, env: { ...env, PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: String(port),
      PGDATABASE: 'postgres', PGUSER: user, PGPASSWORD: testPassword, PGPASSFILE: emptyPasswordFile },
    stdio: 'ignore', windowsHide: true, timeout: 30_000,
  });
  if (status.error) {
    console.error(`Could not inspect the harness-owned PostgreSQL process. ${redact(status.error.message)}; inspect ${log}.`);
    process.exitCode = 1;
    return;
  }
  if (status.status !== 0) {
    console.log('No running postmaster was reported for this harness data directory; artifacts retained for inspection.');
    return;
  }
  try {
    run(executable('pg_ctl'), ['-D', data, '-w', '-t', '30', '-m', 'fast', 'stop'], undefined, true);
    console.log('Disposable cluster stopped. Artifacts retained.');
  } catch (error) {
    console.error(`Could not stop the harness-owned PostgreSQL cluster; inspect ${log}. ${redact(error.message)}`);
    process.exitCode = 1;
  }
}

main().catch(error => { console.error(redact(error.message)); process.exitCode ||= 1; })
  .finally(cleanup)
  .catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
