// Cria um backup restrito e recuperável do schema public a partir da URL direta do
// PostgreSQL configurada e comprova que ele pode ser restaurado em um PG17 local novo.
// Nunca imprime nem coloca credenciais do banco na linha de comando do processo.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { parse } = require('dotenv');

const backend = path.resolve(__dirname, '..');
const env = parse(fs.readFileSync(path.join(backend, '.env')));
const direct = new URL(env.DIRECT_URL || '');
const dbUrl = new URL(env.DATABASE_URL || '');
const directProject = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(direct.hostname)?.[1]
  ?? (/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(direct.hostname) ? /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(direct.username))?.[1] : undefined);
const pooledProject = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(dbUrl.hostname)?.[1]
  ?? (/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(dbUrl.hostname) ? /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(dbUrl.username))?.[1] : undefined);
assert(directProject && (directProject === pooledProject || direct.hostname === dbUrl.hostname), 'Configured URLs do not identify the same Supabase project.');
assert(direct.port === '5432' && direct.pathname === '/postgres' && direct.password, 'DIRECT_URL is not a direct PostgreSQL target.');
assert(/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(direct.hostname) || direct.searchParams.get('sslmode') === 'require', 'DIRECT_URL must be a Supabase host with TLS explicitly enabled.');

const pgBin = 'C:/Program Files/PostgreSQL/17/bin';
const exe = name => path.join(pgBin, name + '.exe');
for (const name of ['pg_dump', 'pg_restore', 'initdb', 'pg_ctl', 'createdb', 'psql']) assert(fs.existsSync(exe(name)), `${name}.exe missing`);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-public-backup-'));
const backup = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, `jurissim-public-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
const passfile = path.join(root, 'pgpass.conf');
const data = path.join(root, 'recovery-data');
const log = path.join(root, 'recovery-postgres.log');
const pgEscape = value => String(value).replaceAll('\\', '\\\\').replaceAll(':', '\\:');
fs.writeFileSync(passfile, `${pgEscape(direct.hostname)}:${direct.port}:${pgEscape(direct.pathname.slice(1))}:${pgEscape(decodeURIComponent(direct.username))}:${pgEscape(decodeURIComponent(direct.password))}\n`);
fs.chmodSync(passfile, 0o600);
const pgEnv = { ...process.env, PGPASSFILE: passfile, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '8' };
function run(name, args, environment = pgEnv) {
  const localRestore = ['pg_restore', 'psql'].includes(name) && environment.PGHOST === '127.0.0.1';
  const result = spawnSync(exe(name), args, { cwd: root, env: environment, stdio: localRestore ? ['ignore', 'ignore', 'pipe'] : 'ignore', encoding: localRestore ? 'utf8' : undefined, windowsHide: true, timeout: 600_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${name} failed with exit ${result.status}; ${localRestore ? result.stderr : 'remote diagnostic details suppressed.'}`);
}

async function main() {
try {
  if (!process.argv[2]) run('pg_dump', ['--host', direct.hostname, '--port', direct.port, '--username', decodeURIComponent(direct.username), '--dbname', direct.pathname.slice(1), '--format=custom', '--no-owner', '--no-acl', '--schema=public', '--no-password', '--file', backup]);
  assert(fs.statSync(backup).size > 1024, 'Backup archive is unexpectedly small.');
  run('pg_restore', ['--list', backup], { ...process.env });
  const portServer = require('node:net').createServer();
  const port = await new Promise((resolve, reject) => portServer.listen(0, '127.0.0.1', () => { const value = portServer.address().port; portServer.close(error => error ? reject(error) : resolve(value)); }));
  run('initdb', ['--pgdata', data, '--username', 'jurissim_recovery', '--encoding=UTF8', '--locale=C', '--auth-local=trust', '--auth-host=trust', '--no-instructions'], { ...process.env });
  run('pg_ctl', ['--pgdata', data, '--log', log, '--options', `-h 127.0.0.1 -p ${port}`, '--wait', 'start'], { ...process.env });
  try {
    const local = { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'jurissim_recovery', PGDATABASE: 'postgres', PGSSLMODE: 'disable', PGCLIENTENCODING: 'UTF8' };
    run('createdb', ['jurissim_recovery_check'], local);
    run('psql', ['--host', '127.0.0.1', '--port', String(port), '--username', 'jurissim_recovery', '--dbname', 'jurissim_recovery_check', '--no-psqlrc', '--command', 'DROP SCHEMA public'], local);
    run('pg_restore', ['--host', '127.0.0.1', '--port', String(port), '--username', 'jurissim_recovery', '--dbname', 'jurissim_recovery_check', '--no-owner', '--no-acl', '--exit-on-error', backup], local);
    const protectedCounts = 'SELECT (SELECT count(*) FROM public."Turma") || ' + "':'" + ' || (SELECT count(*) FROM public."User") || ' + "':'" + ' || (SELECT count(*) FROM public."Simulado") || ' + "':'" + ' || (SELECT count(*) FROM public."Resposta") || ' + "':'" + ' || (SELECT count(*) FROM public."Questao")';
    const countArgs = ['--host', '127.0.0.1', '--port', String(port), '--username', 'jurissim_recovery', '--dbname', 'jurissim_recovery_check', '--no-psqlrc', '--tuples-only', '--no-align', '--command'];
    const before = spawnSync(exe('psql'), [...countArgs, protectedCounts], { cwd: root, env: local, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    assert.equal(before.status, 0, 'Could not count protected records in restored database.');
    for (const migration of ['20261115193000_class_lifecycle', '20261115203000_class_activities']) {
      run('psql', [...countArgs.slice(0, -1), '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--file', path.join(backend, 'prisma', 'migrations', migration, 'migration.sql')], local);
    }
    const after = spawnSync(exe('psql'), [...countArgs, protectedCounts], { cwd: root, env: local, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    assert.equal(after.status, 0, 'Could not recount protected records after disposable migrations.');
    assert.equal(after.stdout.trim(), before.stdout.trim(), 'A tested migration changed existing student/class/history rows.');
    const schemaCheck = spawnSync(exe('psql'), [...countArgs, `SELECT count(*) FROM pg_class WHERE relname IN ('ClassLifecycle','ClassActivity','ClassExamSettings') AND relrowsecurity`], { cwd: root, env: local, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    assert.equal(schemaCheck.status, 0, 'Could not verify migration security settings.');
    assert.equal(Number(schemaCheck.stdout.trim()), 3, 'Expected all three new RLS-enabled tables after migrations.');
    const check = spawnSync(exe('psql'), ['--host', '127.0.0.1', '--port', String(port), '--username', 'jurissim_recovery', '--dbname', 'jurissim_recovery_check', '--no-psqlrc', '--tuples-only', '--no-align', '--command', `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`], { cwd: root, env: local, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    assert.equal(check.status, 0, 'Restored-database verification query failed.');
    const tableCount = Number(check.stdout.trim());
    assert(tableCount >= 10, `Restored only ${tableCount} public tables.`);
    console.log(JSON.stringify({ backup, bytes: fs.statSync(backup).size, restoredPublicTables: tableCount, projectRef: directProject, databaseAltered: false }));
  } finally {
    run('pg_ctl', ['--pgdata', data, '--wait', '--mode', 'fast', 'stop'], { ...process.env });
  }
} catch (error) {
  console.error(String(error.message || error));
  process.exitCode = 1;
} finally {
  try { fs.unlinkSync(passfile); } catch {}
}
}
void main();
