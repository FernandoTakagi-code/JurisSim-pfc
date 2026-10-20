const { spawnSync } = require('node:child_process');

const READ_ONLY_DIAGNOSTIC = [
  'BEGIN READ ONLY;',
  "SELECT json_build_object('versionNum',current_setting('server_version_num')::integer,'readOnly',current_setting('transaction_read_only')='on');",
  'ROLLBACK;',
  '\\conninfo',
].join('\n');

function connectionEnvironment(urlValue, mode, rootCertificate = 'system', parent = process.env) {
  if (!['require', 'verify-full'].includes(mode)) throw new Error('TLS mode not permitted.');
  let url;
  try { url = new URL(urlValue); } catch { throw new Error('Invalid connection configuration.'); }
  const direct = /^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname);
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pooler) || !['', '5432'].includes(url.port)) {
    throw new Error('Expected direct or session-pooler connection.');
  }
  if (['host', 'hostaddr', 'options', 'dbname', 'sslmode', 'sslrootcert'].some(key => url.searchParams.has(key))) {
    throw new Error('Ambiguous connection overrides require review.');
  }
  const env = {};
  for (const [key, value] of Object.entries(parent)) {
    if (['path', 'systemroot', 'windir', 'comspec', 'temp', 'tmp', 'appdata', 'localappdata'].includes(key.toLowerCase())) env[key] = value;
  }
  Object.assign(env, {
    PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: mode, PGSSLMINPROTOCOLVERSION: 'TLSv1.2', PGCONNECT_TIMEOUT: '8',
    PGAPPNAME: 'jurissim_backup_preflight_only',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=10000',
  });
  if (mode === 'verify-full') env.PGSSLROOTCERT = rootCertificate;
  return { env, kind: pooler ? 'session_pooler' : 'direct' };
}

function failureCategory(stderr) {
  const value = String(stderr || '');
  if (/does not match host name|hostname mismatch/i.test(value)) return 'certificate_hostname_mismatch';
  if (/certificate verify failed|unable to get local issuer|certificate validation/i.test(value)) return 'certificate_trust_validation_failed';
  if (/root certificate|sslrootcert|certificate.*file/i.test(value)) return 'root_certificate_unavailable';
  if (/timeout|timed out/i.test(value)) return 'connection_timeout';
  return 'connection_or_diagnostic_failed';
}

function assess(output, mode) {
  if (!['require', 'verify-full'].includes(mode)) throw new Error('TLS mode not permitted.');
  const metadataLine = String(output).split(/\r?\n/).find(line => line.startsWith('{"versionNum"'));
  let metadata;
  try { metadata = JSON.parse(metadataLine); } catch { return { status: 'failed', category: 'unexpected_diagnostic_response' }; }
  const versionCompatible = Number.isInteger(metadata.versionNum) && Math.floor(metadata.versionNum / 10000) === 17;
  // Client-side libpq reports the encrypted leg, including through a pooler.
  // PostgreSQL pg_stat_ssl is deliberately not used as an external TLS gate.
  const protocol = String(output).match(/\bTLSv1\.[23]\b/)?.[0];
  const tlsConfirmed = Boolean(protocol);
  return {
    status: versionCompatible && tlsConfirmed && metadata.readOnly === true ? 'passed' : 'failed',
    serverVersionNum: metadata.versionNum, versionCompatible, readOnly: metadata.readOnly === true,
    tlsConfirmed, protocol: protocol || null,
    certificateAndHostnameVerified: tlsConfirmed && mode === 'verify-full',
  };
}

function diagnose({ url, mode, caPath = 'system', psqlPath, run = spawnSync }) {
  const { env, kind } = connectionEnvironment(url, mode, caPath);
  const result = run(psqlPath, ['-X', '-w', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    env, input: READ_ONLY_DIAGNOSTIC, encoding: 'utf8', windowsHide: true, timeout: 20000,
  });
  if (result.error || result.status !== 0) return { kind, mode, status: 'failed', category: failureCategory(result.stderr) };
  return { kind, mode, ...assess(result.stdout, mode) };
}

module.exports = { connectionEnvironment, failureCategory, assess, diagnose, READ_ONLY_DIAGNOSTIC };
