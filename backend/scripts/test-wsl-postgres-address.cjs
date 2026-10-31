const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  normalizeLoopbackAddress, parsePsqlIdentityOutput, parsePrismaIdentityRows,
} = require('./wsl-postgres-address.cjs');
const {
  FAILED_MIGRATION, RLS_TABLES, assertRecoveryState, loadMigrationNames, migrationChecksum,
  buildLocalRoleCreationSql, buildLocalBackendEnvironment, buildLocalBackendServeEnvironment, buildLocalBackendDemoEnvironment, assertLocalPortAvailable,
} = require('./test-wsl-postgres.cjs');

const expectedIdentity = {
  database: 'jurissim_teste_local',
  username: 'jurissim_tester',
  address: '127.0.0.1',
  port: 5433,
  systemIdentifier: '7700224927711935537',
  versionMajor: 18,
};

test('canonicalizes the WSL loopback IPv4 address with its /32 prefix', () => {
  assert.equal(normalizeLoopbackAddress('127.0.0.1/32'), '127.0.0.1');
  assert.equal(normalizeLoopbackAddress('127.0.0.1'), '127.0.0.1');
});

test('does not normalize other hosts, prefixes, or address families to loopback', () => {
  for (const address of ['127.0.0.1/24', '127.0.0.2/32', '::1', '::1/128', null, undefined]) {
    assert.equal(normalizeLoopbackAddress(address), address);
  }
});

test('parses the one-column JSON row emitted by psql -A -t and normalizes loopback /32', () => {
  const psqlRow = JSON.stringify({ ...expectedIdentity, address: '127.0.0.1/32' });
  assert.deepEqual(parsePsqlIdentityOutput(`${psqlRow}\n`), expectedIdentity);
});

test('parses the aliased JSON text column returned by Prisma raw query', () => {
  assert.deepEqual(parsePrismaIdentityRows([{ identity: JSON.stringify(expectedIdentity) }]), expectedIdentity);
});

test('rejects empty, malformed, multirow, or wrongly shaped identity responses', () => {
  assert.throws(() => parsePsqlIdentityOutput(''), /returned no PostgreSQL identity row/);
  assert.throws(() => parsePsqlIdentityOutput('not-json'), /invalid JSON/);
  assert.throws(() => parsePsqlIdentityOutput('{}\n{}'), /unexpected number/);
  assert.throws(() => parsePrismaIdentityRows([]), /no PostgreSQL identity row/);
  assert.throws(() => parsePrismaIdentityRows([{ json_build_object: JSON.stringify(expectedIdentity) }]), /expected `identity` column/);
  assert.throws(() => parsePrismaIdentityRows([{ identity: '' }]), /empty PostgreSQL identity response/);
});

function recoveryFixture() {
  const migrationRoot = require('node:path').join(__dirname, '..', 'prisma', 'migrations');
  const migrationNames = loadMigrationNames();
  const failedIndex = migrationNames.indexOf(FAILED_MIGRATION);
  const migrationRows = migrationNames.slice(0, failedIndex).map(name => ({
    migration_name: name,
    checksum: migrationChecksum(migrationRoot, name),
    started_at: new Date('2026-10-20T12:00:00Z'),
    finished_at: new Date('2026-10-20T12:01:00Z'),
    rolled_back_at: null,
    applied_steps_count: 1,
    logs: null,
  }));
  migrationRows.push({
    migration_name: FAILED_MIGRATION,
    checksum: migrationChecksum(migrationRoot, FAILED_MIGRATION),
    started_at: new Date('2026-10-20T12:02:00Z'),
    finished_at: null,
    rolled_back_at: null,
    applied_steps_count: 0,
    logs: 'ERROR: role "anon" does not exist (SQLSTATE 42704)',
  });
  return {
    migrationRoot,
    migrationNames,
    migrationRows,
    roleRows: [],
    rlsRows: RLS_TABLES.map((table_name, index) => ({
      table_name,
      rls_enabled: index < 2,
      force_rls: false,
      policy_count: 0,
    })),
  };
}

test('accepts the reviewed P3018 state with compatible partial RLS changes and missing local roles', () => {
  const result = assertRecoveryState(recoveryFixture());
  assert.deepEqual(result.rolesToCreate, ['anon', 'authenticated']);
  assert.deepEqual(result.rlsAlreadyEnabled, ['Avaliacao', 'AvaliacaoQuestao']);
});

test('role creation SQL is restricted to the two local NOLOGIN roles without grants', () => {
  for (const role of ['anon', 'authenticated']) {
    const sql = buildLocalRoleCreationSql(role);
    assert.match(sql, new RegExp(`^CREATE ROLE "${role}"`));
    for (const option of ['NOLOGIN', 'NOSUPERUSER', 'NOCREATEDB', 'NOCREATEROLE', 'NOREPLICATION', 'NOBYPASSRLS']) {
      assert.ok(sql.includes(option), `missing role restriction ${option}`);
    }
    assert.doesNotMatch(sql, /\bGRANT\b|\bIN ROLE\b|\bROLE\s+.*\s+MEMBER\b/i);
  }
  assert.throws(() => buildLocalRoleCreationSql('service_role'), /unapproved local role/);
});

test('local backend environment pins all database URLs and disables external integrations and unvalidated flags', () => {
  const environment = buildLocalBackendEnvironment('local-only-test-password');
  for (const key of ['DATABASE_URL', 'DIRECT_URL', 'SHADOW_DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL']) {
    const url = new URL(environment[key]);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, '5433');
    assert.equal(url.pathname, '/jurissim_teste_local');
    assert.equal(decodeURIComponent(url.username), 'jurissim_tester');
    assert.equal(decodeURIComponent(url.password), 'local-only-test-password');
  }
  assert.equal(environment.HOST, '127.0.0.1');
  assert.equal(environment.PORT, '3334');
  assert.equal(environment.CORS_ORIGINS, 'http://127.0.0.1:5174,http://localhost:5174');
  assert.equal(environment.LOCAL_EMAIL_CAPTURE_ENABLED, 'true');
  assert.equal(environment.JURISSIM_LOCAL_DB_SYSTEM_IDENTIFIER, '7700224927711935537');
  assert.equal(environment.BREVO_SMTP_KEY, '');
  assert.equal(environment.GOOGLE_CLIENT_ID, '');
  assert.equal(environment.INITIAL_DIAGNOSTIC_REQUIRED, 'false');
  assert.equal(environment.INITIAL_DIAGNOSTIC_API_ENABLED, 'false');
  assert.equal(environment.QUESTION_PRACTICE_API_ENABLED, 'false');
});

test('--serve-backend enables only the mandatory gate in its child process', () => {
  const environment = buildLocalBackendServeEnvironment('local-only-test-password');
  assert.equal(environment.INITIAL_DIAGNOSTIC_REQUIRED, 'true');
  assert.equal(environment.INITIAL_DIAGNOSTIC_API_ENABLED, 'false');
  assert.equal(environment.VITE_INITIAL_DIAGNOSTIC_UI_ENABLED, undefined);
  assert.equal(environment.QUESTION_PRACTICE_API_ENABLED, 'false');
  assert.equal(environment.DATABASE_URL, environment.DIRECT_URL);
  assert.equal(new URL(environment.DATABASE_URL).hostname, '127.0.0.1');
  assert.equal(new URL(environment.DATABASE_URL).port, '5433');
  assert.equal(new URL(environment.DATABASE_URL).pathname, '/jurissim_teste_local');
});

test('--serve-backend-demo is explicit, local-only, keeps diagnosis required, and leaves APIs disabled', () => {
  const environment = buildLocalBackendDemoEnvironment('local-only-test-password');
  assert.equal(environment.LOCAL_DIAGNOSTIC_DEMO_MODE, 'true');
  assert.equal(environment.JURISSIM_TEST_TARGET, 'WSL_LOCAL');
  assert.equal(environment.HOST, '127.0.0.1');
  assert.equal(environment.INITIAL_DIAGNOSTIC_REQUIRED, 'true');
  assert.equal(environment.INITIAL_DIAGNOSTIC_API_ENABLED, 'false');
  assert.equal(environment.QUESTION_PRACTICE_SCHEMA_ENABLED, 'false');
  assert.equal(environment.QUESTION_PRACTICE_API_ENABLED, 'false');
  assert.equal(environment.DATABASE_URL, environment.DIRECT_URL);
  assert.equal(new URL(environment.DATABASE_URL).hostname, '127.0.0.1');
  assert.equal(new URL(environment.DATABASE_URL).port, '5433');
  assert.equal(new URL(environment.DATABASE_URL).pathname, '/jurissim_teste_local');
});

test('local port guard accepts a free loopback port and rejects an occupied one', async () => {
  await assertLocalPortAvailable(0);
  const net = require('node:net');
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const occupiedPort = server.address().port;
  try { await assert.rejects(assertLocalPortAvailable(occupiedPort), /Local port .* unavailable/); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('rejects a failed migration with a different cause or a completed/rolled-back status', () => {
  const wrongCause = recoveryFixture();
  wrongCause.migrationRows.at(-1).logs = 'ERROR: permission denied';
  assert.throws(() => assertRecoveryState(wrongCause), /reviewed missing anon role error/);

  const completed = recoveryFixture();
  completed.migrationRows.at(-1).finished_at = new Date();
  assert.throws(() => assertRecoveryState(completed), /expected failed\/unresolved state/);
});

test('rejects migration checksum drift, unexplained policies, FORCE RLS, and unsafe role memberships', () => {
  const checksumDrift = recoveryFixture();
  checksumDrift.migrationRows[0].checksum = '0'.repeat(64);
  assert.throws(() => assertRecoveryState(checksumDrift), /checksum differs/);

  const policyState = recoveryFixture();
  policyState.rlsRows[0].policy_count = 1;
  assert.throws(() => assertRecoveryState(policyState), /policies requiring manual review/);

  const forceRls = recoveryFixture();
  forceRls.rlsRows[0].force_rls = true;
  assert.throws(() => assertRecoveryState(forceRls), /FORCE ROW LEVEL SECURITY/);

  const membership = recoveryFixture();
  membership.roleRows = [{
    rolname: 'anon', rolcanlogin: false, rolsuper: false, rolcreatedb: false,
    rolcreaterole: false, rolreplication: false, rolbypassrls: false, membership_count: 1,
  }];
  assert.throws(() => assertRecoveryState(membership), /role anon has role memberships/);

  const loginRole = recoveryFixture();
  loginRole.roleRows = [{
    rolname: 'authenticated', rolcanlogin: true, rolsuper: false, rolcreatedb: false,
    rolcreaterole: false, rolreplication: false, rolbypassrls: false, membership_count: 0,
  }];
  assert.throws(() => assertRecoveryState(loginRole), /unsafe attribute rolcanlogin/);
});
