// Windows-to-WSL PostgreSQL integration runner. It never starts WSL, reads .env,
// accepts arbitrary targets, deletes data, or logs a password/connection URL.
// --check performs identity and empty-schema reads only. --apply is for a fresh
// database. --inspect-recovery reads a narrowly validated P3018 state, while
// --recover is the separately gated local recovery path.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const readline = require('node:readline');
const { PrismaClient } = require('@prisma/client');
const { parsePsqlIdentityOutput, parsePrismaIdentityRows } = require('./wsl-postgres-address.cjs');

const DISTRO = 'Ubuntu';
const HOST = '127.0.0.1';
const PORT = 5433;
const DATABASE = 'jurissim_teste_local';
const USERNAME = 'jurissim_tester';
const SYSTEM_IDENTIFIER = '7700224927711935537';
const LOCAL_APP_PORT = 3334;
const FAILED_MIGRATION = '20261020120000_backend_only_evaluations_photos';
const RLS_TABLES = ['Avaliacao', 'AvaliacaoQuestao', '_AvaliacaoToTurma', 'ProfilePhoto'];
const LOCAL_ROLES = ['anon', 'authenticated'];
const backend = path.resolve(__dirname, '..');

const allowedEnvironment = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
]);
const cleanEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => allowedEnvironment.has(key.toUpperCase())));
Object.assign(cleanEnv, {
  NODE_ENV: 'test', NODE_OPTIONS: '',
  JWT_SECRET: 'jurissim-wsl-integration-test-secret-only',
  GMAIL_USER: '', GMAIL_APP_PASSWORD: '', BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '',
  GOOGLE_CLIENT_ID: '', GROQ_API_KEY: '', APP_PUBLIC_URL: 'http://127.0.0.1:5173',
  PRISMA_HIDE_UPDATE_MESSAGE: 'true',
});

function decodeNative(buffer) {
  if (!buffer) return '';
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return (bytes.includes(0) ? new TextDecoder('utf-16le').decode(bytes) : bytes.toString('utf8')).replaceAll('\0', '');
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: backend, env: cleanEnv, encoding: null, windowsHide: true, timeout: 120_000,
    ...options,
  });
  const stdout = decodeNative(result.stdout);
  const stderr = decodeNative(result.stderr);
  if (result.error) throw new Error(`${path.basename(command)} could not run: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (exit ${result.status}): ${stderr.trim() || stdout.trim() || 'no diagnostic output'}`);
  return stdout.trim();
}
function readSecret() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal to enter the database password without echo.');
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdout.write('Senha do PostgreSQL (entrada oculta): ');
    const finish = error => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error); else resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const onData = chunk => {
      for (const byte of chunk) {
        if (byte === 3) return finish(new Error('Interrupted.'));
        if (byte === 13 || byte === 10) return finish();
        if (byte === 8 || byte === 127) { chunks.pop(); continue; }
        chunks.push(Buffer.from([byte]));
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}
function requireRunningUbuntu() {
  const output = run('wsl.exe', ['--list', '--verbose']);
  const found = output.split(/\r?\n/).some(line =>
    new RegExp(`\\b${DISTRO}\\b`, 'i').test(line) && /\bRunning\b/i.test(line));
  assert.ok(found, 'Ubuntu must already be running. This script will not start WSL or its PostgreSQL service.');
}
function requireWslLoopbackForwarder() {
  const command = "$names = @(Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue | ForEach-Object { try { (Get-Process -Id $_.OwningProcess -ErrorAction Stop).ProcessName } catch { 'unknown' } } | Sort-Object -Unique); ConvertTo-Json -InputObject $names -Compress";
  const output = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]);
  const parsed = JSON.parse(output || '[]');
  const owners = Array.isArray(parsed) ? parsed : [parsed];
  assert.ok(Array.isArray(owners) && owners.length > 0, 'No Windows localhost forwarder is listening on TCP 5433.');
  assert.ok(owners.every(owner => ['wslhost', 'wslrelay'].includes(String(owner).toLowerCase())),
    'TCP 5433 is owned by a process other than the WSL localhost forwarder; refusing any database connection.');
}

const identitySql = `SELECT json_build_object(
  'database', current_database(), 'username', current_user,
  'address', inet_server_addr()::text, 'port', inet_server_port(),
  'systemIdentifier', (pg_control_system()).system_identifier::text,
  'versionMajor', split_part(current_setting('server_version'), '.', 1)::int
)::text AS identity;`;
function queryIdentityInsideWsl(password) {
  const shell = 'IFS= read -r PGPASSWORD || exit 2; export PGPASSWORD; exec env -i PGPASSWORD="$PGPASSWORD" PATH="$PATH" PGCONNECT_TIMEOUT=3 psql -X -qAt -w -h 127.0.0.1 -p 5433 -U jurissim_tester -d jurissim_teste_local -v ON_ERROR_STOP=1 -f -';
  const result = spawnSync('wsl.exe', ['--distribution', DISTRO, '--exec', 'sh', '-c', shell], {
    cwd: backend, env: cleanEnv, input: `${password}\n${identitySql}\n`, encoding: null, windowsHide: true, timeout: 15_000,
  });
  if (result.error || result.status !== 0) {
    const detail = decodeNative(result.stderr).trim();
    throw new Error(`Read-only WSL identity query failed${detail ? `: ${detail}` : '.'}`);
  }
  const identity = parsePsqlIdentityOutput(decodeNative(result.stdout));
  assert.deepEqual(identity, {
    database: DATABASE, username: USERNAME, address: HOST, port: PORT,
    systemIdentifier: SYSTEM_IDENTIFIER,
    versionMajor: 18,
  });
  assert.match(identity.systemIdentifier, /^[0-9]{10,30}$/);
  return identity;
}

function safeUrl(password) {
  const url = new URL(`postgresql://${USERNAME}@${HOST}:${PORT}/${DATABASE}`);
  url.password = password;
  url.search = '?schema=public';
  return url.href;
}
async function queryIdentityFromWindows(password) {
  const url = safeUrl(password);
  const client = new PrismaClient({ datasourceUrl: url, log: [] });
  try {
    const rows = await client.$queryRawUnsafe(identitySql);
    return parsePrismaIdentityRows(rows);
  } finally { await client.$disconnect(); }
}

async function checkEmptySchema(password) {
  const client = new PrismaClient({ datasourceUrl: safeUrl(password), log: [] });
  try {
    const rows = await client.$queryRawUnsafe(`SELECT count(*)::int AS relation_count
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f')`);
    assert.equal(Number(rows[0]?.relation_count), 0,
      'Target database is not empty; migrations and integration tests are refused to preserve existing data.');
  } finally { await client.$disconnect(); }
}

function migrationChecksum(migrationRoot, name) {
  return createHash('sha256').update(fs.readFileSync(path.join(migrationRoot, name, 'migration.sql'))).digest('hex');
}

// Pure validation for mocked unit tests. This deliberately accepts RLS enabled
// on any/all target tables: those ALTER TABLE statements can persist before the
// failed REVOKE, and rerunning ENABLE ROW LEVEL SECURITY is idempotent. Policies
// and FORCE RLS are not accepted because they are not part of this migration.
function assertRecoveryState({ migrationNames, migrationRows, roleRows, rlsRows, migrationRoot = path.join(backend, 'prisma', 'migrations') }) {
  const failedIndex = migrationNames.indexOf(FAILED_MIGRATION);
  assert.ok(failedIndex > 0, `Expected migration ${FAILED_MIGRATION} in the local history.`);
  assert.equal(migrationRows.length, failedIndex + 1,
    'Migration history must contain every prior local migration and only the failed target; manual review required.');

  const byName = new Map();
  for (const row of migrationRows) {
    const entries = byName.get(row.migration_name) ?? [];
    entries.push(row);
    byName.set(row.migration_name, entries);
  }
  for (const name of migrationNames.slice(0, failedIndex)) {
    const rows = byName.get(name) ?? [];
    assert.equal(rows.length, 1, `Expected exactly one migration record for ${name}.`);
    assert.ok(rows[0].finished_at && !rows[0].rolled_back_at,
      `Prior migration ${name} is not recorded as successfully applied.`);
    assert.equal(rows[0].checksum, migrationChecksum(migrationRoot, name),
      `Local SQL checksum differs from the applied migration ${name}; manual review required.`);
  }

  const failedRows = byName.get(FAILED_MIGRATION) ?? [];
  assert.equal(failedRows.length, 1, `Expected exactly one P3018 record for ${FAILED_MIGRATION}.`);
  const failed = failedRows[0];
  assert.ok(failed.started_at && !failed.finished_at && !failed.rolled_back_at,
    'The target migration is not in the expected failed/unresolved state.');
  assert.equal(failed.checksum, migrationChecksum(migrationRoot, FAILED_MIGRATION),
    'The failed migration checksum differs from the local SQL; refusing recovery.');
  assert.match(String(failed.logs ?? ''), /role\s+["']?anon["']?\s+does not exist/i,
    'The recorded migration failure is not the reviewed missing anon role error.');
  const appliedSteps = Number(failed.applied_steps_count);
  assert.ok(Number.isInteger(appliedSteps) && appliedSteps >= 0,
    'The failed migration applied_steps_count is invalid; manual review required.');
  assert.ok(!migrationRows.some(row => row.migration_name > FAILED_MIGRATION),
    'A later migration is already recorded; manual review required.');

  assert.equal(rlsRows.length, RLS_TABLES.length, 'Could not inspect every expected RLS table.');
  for (const table of RLS_TABLES) {
    const rows = rlsRows.filter(row => row.table_name === table);
    assert.equal(rows.length, 1, `Expected one public.${table} relation.`);
    assert.equal(rows[0].force_rls, false, `public.${table} unexpectedly has FORCE ROW LEVEL SECURITY.`);
    assert.equal(Number(rows[0].policy_count), 0, `public.${table} has policies requiring manual review.`);
  }

  const rolesToCreate = [];
  for (const name of LOCAL_ROLES) {
    const role = roleRows.find(row => row.rolname === name);
    if (!role) { rolesToCreate.push(name); continue; }
    for (const attribute of ['rolcanlogin', 'rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls']) {
      assert.equal(role[attribute], false, `Existing role ${name} has unsafe attribute ${attribute}.`);
    }
    assert.equal(Number(role.membership_count), 0, `Existing role ${name} has role memberships; manual review required.`);
  }
  return {
    rolesToCreate,
    appliedSteps,
    rlsAlreadyEnabled: rlsRows.filter(row => row.rls_enabled).map(row => row.table_name),
  };
}

async function inspectRecoveryState(password, migrationNames) {
  const migrationRoot = path.join(backend, 'prisma', 'migrations');
  const client = new PrismaClient({ datasourceUrl: safeUrl(password), log: [] });
  try {
    const [migrationRows, roleRows, rlsRows, capabilityRows] = await Promise.all([
      client.$queryRawUnsafe(`SELECT migration_name, checksum, started_at, finished_at, rolled_back_at,
          applied_steps_count, logs
        FROM public."_prisma_migrations" ORDER BY migration_name`),
      client.$queryRawUnsafe(`SELECT r.rolname, r.rolcanlogin, r.rolsuper, r.rolcreatedb,
          r.rolcreaterole, r.rolreplication, r.rolbypassrls,
          (SELECT count(*)::int FROM pg_catalog.pg_auth_members m
            WHERE m.roleid = r.oid OR m.member = r.oid) AS membership_count
        FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon', 'authenticated')`),
      client.$queryRawUnsafe(`SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS force_rls,
          (SELECT count(*)::int FROM pg_catalog.pg_policy p WHERE p.polrelid = c.oid) AS policy_count
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname IN ('Avaliacao', 'AvaliacaoQuestao', '_AvaliacaoToTurma', 'ProfilePhoto')
          AND c.relkind IN ('r', 'p')`),
      client.$queryRawUnsafe(`SELECT r.rolcreaterole AS can_create_roles FROM pg_catalog.pg_roles r WHERE r.rolname = current_user`),
    ]);
    const state = assertRecoveryState({ migrationNames, migrationRows, roleRows, rlsRows, migrationRoot });
    return { ...state, canCreateRoles: capabilityRows[0]?.can_create_roles === true, appliedBeforeFailure: migrationNames.indexOf(FAILED_MIGRATION) };
  } finally { await client.$disconnect(); }
}

async function createMissingLocalRoles(password, roleNames) {
  const missing = [...new Set(roleNames)];
  assert.ok(missing.every(name => LOCAL_ROLES.includes(name)), 'Refusing an unapproved role name.');
  if (missing.length === 0) return;
  const client = new PrismaClient({ datasourceUrl: safeUrl(password), log: [] });
  try {
    for (const name of missing) {
      await client.$executeRawUnsafe(buildLocalRoleCreationSql(name));
    }
  }
  finally { await client.$disconnect(); }
}

function buildLocalRoleCreationSql(name) {
  assert.ok(LOCAL_ROLES.includes(name), 'Refusing an unapproved local role name.');
  return `CREATE ROLE "${name}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`;
}

async function verifyFailedMigrationRolledBack(password) {
  const client = new PrismaClient({ datasourceUrl: safeUrl(password), log: [] });
  try {
    const rows = await client.$queryRawUnsafe(`SELECT started_at, finished_at, rolled_back_at
      FROM public."_prisma_migrations" WHERE migration_name = '${FAILED_MIGRATION}'`);
    assert.equal(rows.length, 1, 'Prisma migration state is ambiguous after migrate resolve.');
    assert.ok(rows[0].rolled_back_at && rows[0].started_at && !rows[0].finished_at,
      'Prisma did not record the failed migration as rolled back; refusing migrate deploy.');
  } finally { await client.$disconnect(); }
}

function loadMigrationNames() {
  const root = path.join(backend, 'prisma', 'migrations');
  return fs.readdirSync(root).filter(name => fs.existsSync(path.join(root, name, 'migration.sql'))).sort();
}

function assertReviewedMigrationTail(migrations) {
  const requiredTail = [
    '20261021100000_question_import_provenance',
    '20261021110000_initial_diagnostic_identity',
    '20261021120000_question_eligibility_metadata',
    '20261021130000_question_practice_sessions',
  ];
  assert.deepEqual(migrations.slice(-requiredTail.length), requiredTail, 'Local migration order differs from the reviewed sequence.');
}

async function assertLocalPortAvailable(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error(`Local port ${port} is unavailable; refusing to start a second backend.`)));
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function buildLocalBackendEnvironment(password) {
  const url = safeUrl(password);
  return {
    ...cleanEnv,
    NODE_ENV: 'development', NODE_OPTIONS: '',
    PORT: String(LOCAL_APP_PORT), HOST: '127.0.0.1',
    DATABASE_URL: url, DIRECT_URL: url, SHADOW_DATABASE_URL: url,
    TEST_DATABASE_URL: url, TEST_DIRECT_URL: url,
    PGHOST: HOST, PGHOSTADDR: HOST, PGPORT: String(PORT), PGDATABASE: DATABASE,
    PGUSER: USERNAME, PGPASSWORD: password, PGPASSFILE: '', PGSERVICE: '', PGSERVICEFILE: '',
    PGOPTIONS: '', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5',
    JWT_SECRET: randomBytes(48).toString('base64url'),
    CORS_ORIGINS: 'http://127.0.0.1:5174,http://localhost:5174',
    APP_PUBLIC_URL: 'http://127.0.0.1:5174',
    LOCAL_EMAIL_CAPTURE_ENABLED: 'true',
    JURISSIM_LOCAL_DB_SYSTEM_IDENTIFIER: SYSTEM_IDENTIFIER,
    GOOGLE_CLIENT_ID: '', GROQ_API_KEY: '',
    BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '', GMAIL_USER: '', GMAIL_APP_PASSWORD: '',
    INITIAL_DIAGNOSTIC_REQUIRED: 'false', INITIAL_DIAGNOSTIC_API_ENABLED: 'false',
    QUESTION_PRACTICE_SCHEMA_ENABLED: 'false', QUESTION_PRACTICE_API_ENABLED: 'false',
  };
}

function buildLocalBackendServeEnvironment(password) {
  const runtimeEnv = buildLocalBackendEnvironment(password);
  runtimeEnv.INITIAL_DIAGNOSTIC_REQUIRED = 'true';
  runtimeEnv.INITIAL_DIAGNOSTIC_API_ENABLED = 'false';
  return runtimeEnv;
}

function buildLocalBackendDemoEnvironment(password) {
  const runtimeEnv = buildLocalBackendServeEnvironment(password);
  runtimeEnv.JURISSIM_TEST_TARGET = 'WSL_LOCAL';
  runtimeEnv.LOCAL_DIAGNOSTIC_DEMO_MODE = 'true';
  runtimeEnv.QUESTION_PRACTICE_SCHEMA_ENABLED = 'false';
  runtimeEnv.QUESTION_PRACTICE_API_ENABLED = 'false';
  return runtimeEnv;
}

async function runLocalBackend(password, demoMode = false) {
  await assertLocalPortAvailable(LOCAL_APP_PORT);
  const runtimeEnv = demoMode ? buildLocalBackendDemoEnvironment(password) : buildLocalBackendServeEnvironment(password);
  const tsxCli = path.join(backend, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  assert.ok(fs.existsSync(tsxCli), 'Local tsx executable is missing; install dependencies before starting the backend.');
  console.log(`Starting local backend on http://127.0.0.1:${LOCAL_APP_PORT} (database identity verified; ${demoMode ? 'local demo explicitly enabled, diagnostic remains pending' : 'mandatory diagnostic enforced'}; external email, Google OAuth, and AI credentials disabled).`);
  const child = spawn(process.execPath, [tsxCli, 'watch', 'src/server.ts'], {
    cwd: backend, env: runtimeEnv, stdio: 'inherit', windowsHide: true,
  });
  const stopChild = signal => { if (!child.killed) child.kill(signal); };
  const onInterrupt = () => stopChild('SIGINT');
  const onTerminate = () => stopChild('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    if (result.code !== 0 && result.code !== null) process.exitCode = result.code;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    for (const key of ['DATABASE_URL', 'DIRECT_URL', 'SHADOW_DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL', 'PGPASSWORD', 'JWT_SECRET']) delete runtimeEnv[key];
  }
}

function buildTestEnvironment(password, identity, manifestPath, passFile, capability) {
  const url = safeUrl(password);
  Object.assign(cleanEnv, {
    JURISSIM_TEST_TARGET: 'WSL_LOCAL',
    DATABASE_URL: url, DIRECT_URL: url, SHADOW_DATABASE_URL: url,
    TEST_DATABASE_URL: url, TEST_DIRECT_URL: url,
    PGHOST: HOST, PGHOSTADDR: HOST, PGPORT: String(PORT), PGDATABASE: DATABASE,
    PGUSER: USERNAME, PGPASSWORD: password, PGPASSFILE: passFile,
    PGSERVICE: '', PGSERVICEFILE: '', PGOPTIONS: '', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5',
    JURISSIM_TEST_DB_PASSWORD: password, JURISSIM_TEST_PGPASSFILE: passFile,
    JURISSIM_TEST_INTEGRATION_DATABASE: DATABASE,
    JURISSIM_TEST_CAPABILITY: capability,
    JURISSIM_TEST_WSL_MANIFEST: manifestPath,
    JURISSIM_TEST_WSL_SYSTEM_IDENTIFIER: identity.systemIdentifier,
  });
}

async function main() {
  const mode = process.argv[2];
  const validModes = ['--check', '--apply', '--inspect-recovery', '--recover', '--serve-backend', '--serve-backend-demo'];
  if (process.argv.length !== 3 || !validModes.includes(mode)) {
    throw new Error(`Usage: node scripts/test-wsl-postgres.cjs ${validModes.join('|')}`);
  }
  requireRunningUbuntu();
  requireWslLoopbackForwarder();
  const password = await readSecret();
  assert.ok(password.length > 0, 'An empty password is refused.');
  let secret = password;
  try {
    const wslIdentity = queryIdentityInsideWsl(secret);
    const windowsIdentity = await queryIdentityFromWindows(secret);
    assert.deepEqual(windowsIdentity, wslIdentity,
      'Windows localhost did not reach the same PostgreSQL 18 cluster identified inside Ubuntu.');
    console.log('PASS: Windows Prisma and Ubuntu psql report the same PostgreSQL 18 cluster and exact local database/user.');
    if (mode === '--check') {
      await checkEmptySchema(secret);
      console.log('PASS: target database has no public tables; current data is not eligible for destructive integration fixtures.');
      console.log('Read-only preflight complete. No migration or fixture was run.');
      return;
    }

    if (mode === '--serve-backend' || mode === '--serve-backend-demo') {
      await runLocalBackend(secret, mode === '--serve-backend-demo');
      return;
    }

    const migrations = loadMigrationNames();
    assertReviewedMigrationTail(migrations);

    if (mode === '--inspect-recovery' || mode === '--recover') {
      const recovery = await inspectRecoveryState(secret, migrations);
      console.log(`PASS: ${recovery.appliedBeforeFailure} earlier local migrations are successful; only the reviewed P3018 migration is unresolved.`);
      const enabledTables = recovery.rlsAlreadyEnabled.length ? recovery.rlsAlreadyEnabled.join(', ') : 'none';
      console.log(`PASS: target SQL checksum and recorded missing-role error match (Prisma applied_steps_count=${recovery.appliedSteps}); RLS enabled on ${recovery.rlsAlreadyEnabled.length}/${RLS_TABLES.length} tables [${enabledTables}], without FORCE RLS or policies.`);
      console.log(`Local roles to create: ${recovery.rolesToCreate.length ? recovery.rolesToCreate.join(', ') : 'none'}.`);
      if (mode === '--inspect-recovery') {
        console.log(`Read-only recovery inspection complete. Role creation capability: ${recovery.canCreateRoles ? 'available' : 'not available to this user'}. No changes were made.`);
        return;
      }
      if (recovery.rolesToCreate.length && !recovery.canCreateRoles) {
        throw new Error('Recovery is safe to inspect, but jurissim_tester cannot create the missing local roles. Have a local PostgreSQL administrator create only the two restricted roles, then rerun --inspect-recovery.');
      }
      if (recovery.rolesToCreate.length) {
        const [wslBeforeRoles, windowsBeforeRoles] = await Promise.all([
          Promise.resolve(queryIdentityInsideWsl(secret)), queryIdentityFromWindows(secret),
        ]);
        assert.deepEqual(windowsBeforeRoles, wslBeforeRoles, 'Cluster identity changed before local role creation; aborting.');
        await createMissingLocalRoles(secret, recovery.rolesToCreate);
      }
      const [wslAgain, windowsAgain] = await Promise.all([
        Promise.resolve(queryIdentityInsideWsl(secret)), queryIdentityFromWindows(secret),
      ]);
      assert.deepEqual(windowsAgain, wslAgain, 'Cluster identity changed before recovery; aborting.');
      const verified = await inspectRecoveryState(secret, migrations);
      assert.equal(verified.rolesToCreate.length, 0, 'Local role creation did not produce the expected roles.');
      const artifactDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-wsl-postgres-recovery-'));
      const manifestPath = path.join(artifactDirectory, 'identity.json');
      const passFile = path.join(artifactDirectory, 'empty-pgpass');
      const capability = randomBytes(32).toString('hex');
      fs.writeFileSync(passFile, '', { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(manifestPath, JSON.stringify({ capability, host: HOST, port: PORT, database: DATABASE, username: USERNAME, systemIdentifier: wslAgain.systemIdentifier }), { flag: 'wx', mode: 0o600 });
      buildTestEnvironment(secret, wslAgain, manifestPath, passFile, capability);
      const prismaCli = path.join(backend, 'node_modules', 'prisma', 'build', 'index.js');
      const resolve = run(process.execPath, [prismaCli, 'migrate', 'resolve', '--rolled-back', FAILED_MIGRATION, '--schema', 'prisma/schema.prisma']);
      console.log(resolve.replaceAll(secret, '[REDACTED]').replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[REDACTED]@'));
      await verifyFailedMigrationRolledBack(secret);
      const [wslBeforeDeploy, windowsBeforeDeploy] = await Promise.all([
        Promise.resolve(queryIdentityInsideWsl(secret)), queryIdentityFromWindows(secret),
      ]);
      assert.deepEqual(windowsBeforeDeploy, wslBeforeDeploy, 'Cluster identity changed before migrate deploy; aborting.');
      const deploy = run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
      console.log(deploy.replaceAll(secret, '[REDACTED]').replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[REDACTED]@'));
      console.log(`Recovery completed using only the verified WSL cluster. Artifacts retained: ${artifactDirectory}`);
      return;
    }

    await checkEmptySchema(secret);
    console.log('PASS: target database has no public tables; current data is not eligible for destructive integration fixtures.');

    const artifactDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-wsl-postgres-'));
    const manifestPath = path.join(artifactDirectory, 'identity.json');
    const passFile = path.join(artifactDirectory, 'empty-pgpass');
    const capability = randomBytes(32).toString('hex');
    fs.writeFileSync(passFile, '', { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(manifestPath, JSON.stringify({
      capability, host: HOST, port: PORT, database: DATABASE, username: USERNAME,
      systemIdentifier: wslIdentity.systemIdentifier,
    }), { flag: 'wx', mode: 0o600 });
    buildTestEnvironment(secret, wslIdentity, manifestPath, passFile, capability);

    const prismaCli = path.join(backend, 'node_modules', 'prisma', 'build', 'index.js');
    const deploy = run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
    console.log(deploy.replaceAll(secret, '[REDACTED]').replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[REDACTED]@'));
    console.log(`Applied local migration set (${migrations.length} migration directories); no automatic retry or database cleanup is performed.`);
    const vitest = path.join(backend, 'node_modules', 'vitest', 'vitest.mjs');
    const tests = run(process.execPath, [vitest, 'run', '--config', 'vitest.integration.config.ts']);
    console.log(tests.replaceAll(secret, '[REDACTED]').replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[REDACTED]@'));
    console.log(`Artifacts retained for review: ${artifactDirectory}`);
  } finally {
    secret = '';
    for (const key of ['DATABASE_URL', 'DIRECT_URL', 'SHADOW_DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL', 'PGPASSWORD', 'JURISSIM_TEST_DB_PASSWORD']) delete cleanEnv[key];
  }
}

if (require.main === module) main().catch(error => {
  const message = String(error?.message ?? 'Unknown error')
    .replaceAll(process.env.JURISSIM_TEST_DB_PASSWORD ?? '\0', '[REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[REDACTED]@');
  console.error(message);
  process.exitCode = 1;
});

module.exports = {
  FAILED_MIGRATION, RLS_TABLES, LOCAL_ROLES, assertRecoveryState,
  assertReviewedMigrationTail, loadMigrationNames, migrationChecksum, buildLocalRoleCreationSql,
  assertLocalPortAvailable, buildLocalBackendEnvironment, buildLocalBackendServeEnvironment, buildLocalBackendDemoEnvironment, LOCAL_APP_PORT,
};
