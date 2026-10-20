const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connectionEnvironment, assess, diagnose, READ_ONLY_DIAGNOSTIC } = require('./lib/backup-preflight.cjs');
const fixture = 'postgresql://fixture:synthetic-only@aws-0-fixture.pooler.supabase.com:5432/postgres?schema=public';
const response = version => JSON.stringify({ versionNum: version, readOnly: true, postgresBackendReportsTls: false }) + '\nSSL connection (protocol: TLSv1.3, cipher: fixture)';

test('pooler backend TLS false does not negate the libpq external TLS report', () => {
  const result = assess(response(170006), 'require');
  assert.equal(result.status, 'passed'); assert.equal(result.versionCompatible, true);
  assert.equal(result.tlsConfirmed, true); assert.equal(result.certificateAndHostnameVerified, false);
});
test('version and TLS are independent gates', () => {
  assert.equal(assess(response(160006), 'require').versionCompatible, false);
  const noTls = assess('{"versionNum":170006,"readOnly":true}', 'require');
  assert.equal(noTls.versionCompatible, true); assert.equal(noTls.status, 'failed');
  assert.equal(noTls.tlsConfirmed, false);
});
test('only TLS 1.2 and 1.3 are accepted and unexpected responses fail closed', () => {
  assert.equal(assess(response(170006).replace('TLSv1.3', 'TLSv1.2'), 'require').status, 'passed');
  assert.equal(assess(response(170006).replace('TLSv1.3', 'TLSv1.1'), 'require').status, 'failed');
  assert.equal(assess('synthetic private content', 'require').status, 'failed');
});
test('the same protected subprocess environment can be reused by the future dump', () => {
  const { env } = connectionEnvironment(fixture, 'require', 'system', { PGSSLMODE: 'disable', PGSERVICE: 'unsafe', DATABASE_URL: 'private' });
  assert.equal(env.PGSSLMODE, 'require'); assert.equal(env.PGSSLMINPROTOCOLVERSION, 'TLSv1.2');
  assert.equal(env.PGSERVICE, undefined); assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.PGHOST, new URL(fixture).hostname);
});
test('verify-full keeps the actual pooler hostname and explicit trust source', () => {
  const { env } = connectionEnvironment(fixture, 'verify-full', 'fixture-ca.pem', {});
  assert.equal(env.PGSSLMODE, 'verify-full'); assert.equal(env.PGSSLROOTCERT, 'fixture-ca.pem');
  assert.equal(env.PGHOST, new URL(fixture).hostname); assert.equal(env.PGHOSTADDR, undefined);
});
test('weaker modes, transaction poolers and ambiguous overrides are rejected', () => {
  for (const mode of ['disable', 'allow', 'prefer', 'verify-ca']) assert.throws(() => connectionEnvironment(fixture, mode));
  assert.throws(() => connectionEnvironment(fixture.replace('5432', '6543'), 'require'));
  assert.throws(() => connectionEnvironment(fixture + '&sslmode=disable', 'require'));
});
test('diagnostic subprocess receives no credentials in arguments and no data queries', () => {
  const result = diagnose({ url: fixture, mode: 'require', psqlPath: 'fixture-psql', run: (command, args, options) => {
    assert.equal(command, 'fixture-psql'); assert.equal(args.includes('synthetic-only'), false);
    assert.equal(options.input, READ_ONLY_DIAGNOSTIC);
    assert.equal(options.input.includes('pg_stat_ssl'), false);
    assert.match(options.input, /BEGIN READ ONLY/);
    return { status: 0, stdout: response(170006) };
  } });
  assert.equal(result.status, 'passed');
});
test('verify-full errors remain sanitized and never execute a fallback', () => {
  for (const [error, category] of [
    ['certificate verify failed: synthetic private detail', 'certificate_trust_validation_failed'],
    ['server certificate does not match host name: synthetic private detail', 'certificate_hostname_mismatch'],
  ]) {
    let calls = 0;
    const result = diagnose({ url: fixture, mode: 'verify-full', psqlPath: 'fixture-psql', run: () => {
      calls++; return { status: 2, stderr: error };
    } });
    assert.equal(calls, 1); assert.equal(result.category, category);
    assert.equal(JSON.stringify(result).includes('synthetic private detail'), false);
    assert.equal(result.status, 'failed');
  }
});
