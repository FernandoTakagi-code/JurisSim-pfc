// Run existing integration tests against a NEW loopback cluster restored from a
// custom-format backup. No .env, remote URLs, migrations or existing DB accepted.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const [binArg, archiveArg, expectedSha] = process.argv.slice(2);
assert(binArg && archiveArg && /^[a-f0-9]{64}$/.test(expectedSha || ''), 'Usage: node scripts/test-restored-backup-local.cjs <PG-bin> <dump> <sha256>');
const bin = fs.realpathSync(binArg), archive = fs.realpathSync(archiveArg);
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), expectedSha, 'Backup checksum mismatch');
const backend = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-migrations-'));
const data = path.join(directory, 'data');
assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
const user = 'jurissim_migration_test', password = crypto.randomBytes(32).toString('hex');
const database = 'js_int_' + crypto.randomBytes(16).toString('hex');
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => ['PATH','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','APPDATA','LOCALAPPDATA','PROGRAMFILES'].includes(k.toUpperCase())));
let started = false;
function run(name, args, input) {
  const pg = name !== 'node';
  const commandEnv = { ...env };
  if (pg) for (const key of ['PGSERVICE','PGSERVICEFILE']) if (!commandEnv[key]) delete commandEnv[key];
  const r = spawnSync(pg ? path.join(bin, name + '.exe') : process.execPath, args, { cwd: backend, env: commandEnv, input, encoding: 'utf8', windowsHide: true, timeout: 360000, maxBuffer: 16 * 1024 * 1024, stdio: name === 'pg_ctl' ? 'ignore' : ['pipe','pipe','pipe'] });
  if (r.status !== 0) { fs.writeFileSync(path.join(directory, 'failure.private.log'), (r.stdout || '') + '\n' + (r.stderr || '') + '\n' + String(r.error || '')); throw Error('Disposable step failed: ' + name + '; private log: ' + directory); }
  return r.stdout || '';
}
function sql(statement) { return run('psql', ['-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-d',database,'-f','-'], statement).trim(); }
(async () => {
  const pass = path.join(directory, 'init-password.tmp'); fs.writeFileSync(pass, password);
  try { run('initdb', ['-D',data,'-U',user,'--pwfile='+pass,'--auth=scram-sha-256','--encoding=UTF8','--no-locale']); } finally { fs.unlinkSync(pass); }
  const port = await new Promise((resolve,reject) => { const s = net.createServer(); s.once('error',reject); s.listen(0,'127.0.0.1',() => { const p=s.address().port; s.close(() => resolve(p)); }); });
  const passFile = path.join(directory, 'empty-pgpass'); fs.writeFileSync(passFile, '');
  const url = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public`;
  Object.assign(env, { NODE_ENV:'test', DATABASE_URL:url, DIRECT_URL:url, SHADOW_DATABASE_URL:url, TEST_DATABASE_URL:url, TEST_DIRECT_URL:url,
    PGHOST:'127.0.0.1', PGHOSTADDR:'127.0.0.1', PGPORT:String(port), PGDATABASE:database, PGUSER:user, PGPASSWORD:password, PGSSLMODE:'disable', PGCONNECT_TIMEOUT:'5', PGOPTIONS:'', PGSERVICE:'', PGSERVICEFILE:'', PGPASSFILE:passFile,
    JURISSIM_TEST_DATA_DIR:data, JURISSIM_TEST_INTEGRATION_DATABASE:database, JURISSIM_TEST_DB_PASSWORD:password, JURISSIM_TEST_PGPASSFILE:passFile, JURISSIM_TEST_CAPABILITY:crypto.randomBytes(32).toString('hex'),
    JWT_SECRET:crypto.randomBytes(48).toString('hex'), GOOGLE_CLIENT_ID:'', GROQ_API_KEY:'', BREVO_SMTP_USER:'', BREVO_SMTP_KEY:'', BREVO_API_KEY:'', BREVO_EMAIL_TRANSPORT:'api', GMAIL_USER:'', GMAIL_APP_PASSWORD:'', LOCAL_EMAIL_CAPTURE_ENABLED:'false', LOCAL_DIAGNOSTIC_DEMO_MODE:'false', INITIAL_DIAGNOSTIC_REQUIRED:'false', INITIAL_DIAGNOSTIC_API_ENABLED:'false', QUESTION_PRACTICE_API_ENABLED:'false', QUESTION_PRACTICE_SCHEMA_ENABLED:'false', INSTITUTIONS_ENABLED:'false', ADMINISTRATION_ENABLED:'false', INSTITUTION_REGISTRATION_ENABLED:'false', PRISMA_HIDE_UPDATE_MESSAGE:'true' });
  fs.writeFileSync(path.join(directory,'integration-test-owner.json'), JSON.stringify({capability:env.JURISSIM_TEST_CAPABILITY,host:'127.0.0.1',port,database,username:user,dataDirectory:data,emptyPasswordFile:passFile}));
  run('pg_ctl', ['-D',data,'-l',path.join(directory,'postgres.private.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']); started=true;
  run('createdb', ['--maintenance-db=postgres',database]);
  const identity=JSON.parse(sql("SELECT json_build_object('directory',current_setting('data_directory'),'address',host(inet_server_addr()),'database',current_database(),'owner',current_user)"));
  assert.equal(fs.realpathSync(identity.directory), fs.realpathSync(data)); assert.equal(identity.address,'127.0.0.1'); assert.equal(identity.database,database); assert.equal(identity.owner,user);
  sql('CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;');
  run('pg_restore', ['--schema=public','--no-owner','--no-privileges','--single-transaction','--exit-on-error','--dbname='+database,archive]);
  console.log('Public-schema backup restored to owned disposable cluster; no migrations or remote database access.');
  const output=run('node', ['node_modules/vitest/vitest.mjs','run','--config','vitest.integration.config.ts']);
  fs.writeFileSync(path.join(directory,'integration-result.private.log'),output);console.log(output);
})().catch(e => { console.error(e.message); process.exitCode=1; }).finally(() => { if(started) { try { run('pg_ctl',['-D',data,'-m','fast','-w','stop']); console.log('Disposable cluster stopped.'); } catch(e) { console.error(e.message); process.exitCode=1; } } });
