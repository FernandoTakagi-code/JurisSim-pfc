// Standalone disposable PostgreSQL 17 rehearsal. No dotenv, remote URLs or SMTP.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const backend = path.resolve(__dirname, '..');
const bin = 'C:/Program Files/PostgreSQL/17/bin';
const pg = name => path.join(bin, name + '.exe');
const admin = 'rehearsal_admin', actor = 'rehearsal_backend', database = 'dashboard_rehearsal';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-dashboard-rehearsal-'));
const data = path.join(directory, 'data');
const migrations = path.join(backend, 'prisma/migrations');
const targets = ['20261017120000_student_history_indexes', '20261017150000_classes_teacher_exams',
  '20261017180000_goals_reports_indexes', '20261018120000_profile_photos',
  '20261020120000_backend_only_evaluations_photos'];
const names = fs.readdirSync(migrations).filter(n => fs.existsSync(path.join(migrations, n, 'migration.sql'))).sort();
assert.equal(names.at(-1), targets.at(-1), 'Review new migrations before rehearsal.');
const earlier = names.filter(n => n < targets[0]);
const read = name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8');
const digest = name => createHash('sha256').update(fs.readFileSync(path.join(migrations, name, 'migration.sql'))).digest('hex');
const originalHashes = names.map(digest);
// Prisma runs from the temporary workspace, with a copied schema/history, so its
// automatic .env discovery cannot load the project's private environment files.
const localPrisma = path.join(directory, 'prisma');
fs.mkdirSync(path.join(localPrisma, 'migrations'), { recursive: true });
fs.copyFileSync(path.join(backend, 'prisma/schema.prisma'), path.join(localPrisma, 'schema.prisma'));
fs.copyFileSync(path.join(migrations, 'migration_lock.toml'), path.join(localPrisma, 'migrations/migration_lock.toml'));
for (const name of names) {
  fs.mkdirSync(path.join(localPrisma, 'migrations', name));
  fs.copyFileSync(path.join(migrations, name, 'migration.sql'), path.join(localPrisma, 'migrations', name, 'migration.sql'));
}
const verify = fs.readFileSync(path.join(__dirname, 'verify-evaluations-photos-security.sql'), 'utf8');
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'appdata', 'localappdata', 'userprofile'].includes(key.toLowerCase())) env[key] = value;
}
Object.assign(env, { PGHOST: '127.0.0.1', PGUSER: actor, PGPASSWORD: '', PGSSLMODE: 'disable',
  PGCONNECT_TIMEOUT: '5', PRISMA_HIDE_UPDATE_MESSAGE: 'true', CHECKPOINT_DISABLE: '1',
  BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '', GMAIL_USER: '', GMAIL_APP_PASSWORD: '' });
let started = false, step = 'initialization', checks = [];
function pass(message) { checks.push(message); console.log('PASS: ' + message); }
function execute(command, args, input, extra = {}, allowed = [0]) {
  const controller = command === pg('pg_ctl');
  const result = spawnSync(command, args, { cwd: directory, env: { ...env, ...extra }, input,
    stdio: controller ? 'ignore' : 'pipe', encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (result.error || !allowed.includes(result.status)) throw new Error('Local subprocess failed at ' + step + '; details suppressed.');
  return { output: (result.stdout || '').trim(), error: result.stderr || '', status: result.status };
}
function sql(input, user = actor, db = database, expectedFailure) {
  const result = execute(pg('psql'), ['-X', '-w', '-h', '127.0.0.1', '-p', env.PGPORT,
    '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-A', '-t', '-q', '-f', '-'], input, {}, expectedFailure ? [3] : [0]);
  if (expectedFailure) assert.ok(result.error.includes(expectedFailure), 'Unexpected SQL failure category.');
  return result.output;
}
function prisma(args) {
  return execute(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), ...args,
    '--schema', path.join(localPrisma, 'schema.prisma')]).output;
}
function snapshot() {
  const catalog = sql(`SELECT md5(coalesce(jsonb_agg(s ORDER BY s::text)::text,'[]')) FROM (
    SELECT c.relname, c.relkind, c.relrowsecurity, a.attname, a.atttypid, a.atttypmod,
      a.attnotnull, c.relacl::text, pg_get_expr(d.adbin,d.adrelid) AS default_value
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public'
  ) s;`);
  const enums = sql(`SELECT md5(jsonb_agg(s ORDER BY s::text)::text) FROM (
    SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public') s;`);
  const rows = sql(`SELECT md5(jsonb_agg(s ORDER BY s::text)::text) FROM (
    SELECT 'User' AS source,to_jsonb(u) AS value FROM "User" u
    UNION ALL SELECT 'Simulado',to_jsonb(s)-'avaliacaoId' FROM "Simulado" s
    UNION ALL SELECT 'Resposta',to_jsonb(r) FROM "Resposta" r
    UNION ALL SELECT 'Turma',to_jsonb(t)-'archivedAt'-'conviteExpiraEm' FROM "Turma" t) s;`);
  return { catalog, enums, rows };
}
const begin = "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; SET LOCAL search_path=public,pg_catalog;\n";
const creation = targets.slice(0, 4).map(read).join('\n');
const security = read(targets[4]);
const fixture = `
INSERT INTO "User" (id,nome,email,"senhaHash",role) VALUES ('fixture-user','Fixture','fixture@example.invalid','not-a-password','ALUNO');
INSERT INTO "Turma" (id,nome,"codigoConvite") VALUES ('fixture-class','Fixture','fixture-code');
INSERT INTO "Questao" (id,enunciado,disciplina,assunto,nivel,"fundamentacaoJuridica","autorId") VALUES ('fixture-question','Fixture','Civil','Fixture','BASICO','Fixture','fixture-user');
INSERT INTO "Simulado" (id,tipo,"alunoId") VALUES ('fixture-attempt','DIAGNOSTICO','fixture-user');
INSERT INTO "QuestaoSimulado" (id,posicao,"simuladoId","questaoId") VALUES ('fixture-assigned',1,'fixture-attempt','fixture-question');
INSERT INTO "Resposta" (id,correta,"simuladoId","questaoId","questaoSimuladoId") VALUES ('fixture-answer',true,'fixture-attempt','fixture-question','fixture-assigned');
INSERT INTO "MetaDiaria" (id,data,"metaQuestoes","alunoId") VALUES ('fixture-goal',CURRENT_TIMESTAMP,1,'fixture-user');
`;
async function main() {
  assert.match(execute(pg('postgres'), ['--version']).output, /PostgreSQL\) 17\./);
  env.PGPORT = String(await new Promise((resolve, reject) => {
    const server = net.createServer(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(e => e ? reject(e) : resolve(port)); });
  }));
  execute(pg('initdb'), ['-D', data, '-U', admin, '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale']);
  execute(pg('pg_ctl'), ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o',
    `-h 127.0.0.1 -p ${env.PGPORT} -c log_statement=none -c log_min_error_statement=panic -c log_parameter_max_length_on_error=0`, '-w', '-t', '30', 'start']);
  started = true;
  step = 'identity';
  assert.equal(fs.realpathSync(sql('SHOW data_directory;', admin, 'postgres')), fs.realpathSync(data));
  assert.equal(sql("SELECT current_setting('server_version_num')::int / 10000;", admin, 'postgres'), '17');
  sql(`CREATE ROLE ${actor} LOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE anon LOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE authenticated LOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE fixture_leak NOLOGIN;
    GRANT fixture_leak TO anon; CREATE DATABASE ${database} OWNER ${actor};`, admin, 'postgres');
  const url = `postgresql://${actor}@127.0.0.1:${env.PGPORT}/${database}?schema=public`;
  Object.assign(env, { DATABASE_URL: url, DIRECT_URL: url, SHADOW_DATABASE_URL: url });
  assert.equal(new URL(env.DATABASE_URL).hostname, '127.0.0.1');
  assert.equal(sql('SELECT rolsuper FROM pg_roles WHERE rolname=current_user;'), 'f');
  pass('PostgreSQL 17 isolated cluster; backend role is not superuser');
  step = 'baseline';
  for (const name of earlier) sql(read(name));
  sql(fixture);
  sql('GRANT USAGE ON SCHEMA public TO anon,authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC,anon,authenticated;');
  const before = snapshot();
  pass('baseline from historical SQL and synthetic rows only; broad default grants reproduced');
  step = 'rollback';
  const failures = [
    ['injected failure', creation + '\n' + security + '\n' + verify + '\nSELECT 1/0;', '22012'],
    ['inherited grant', creation + '\n' + security + '\nGRANT SELECT ON "Avaliacao" TO fixture_leak;\n' + verify, 'P0001'],
    ['column grant', creation + '\n' + security + '\nGRANT SELECT ("userId") ON "ProfilePhoto" TO authenticated;\n' + verify, 'P0001'],
    ['unexpected policy', creation + '\nCREATE POLICY fixture_policy ON "ProfilePhoto" USING (true);\n' + security, 'P0001'],
  ];
  for (const [label, statements, code] of failures) {
    sql(begin + statements + '\nCOMMIT;', actor, database, code);
    assert.deepEqual(snapshot(), before, 'Incomplete rollback for ' + label);
    assert.equal(sql(`SELECT count(*) FROM pg_constraint WHERE conname IN ('Simulado_avaliacaoId_fkey','ProfilePhoto_content_check');`), '0');
    pass(label + ': transaction rejected; schema, enum, grants and fixture rows rolled back');
  }
  step = 'atomic creation';
  sql(begin + creation + '\n' + security + '\n' + verify + '\nCOMMIT;');
  sql('BEGIN READ ONLY;\n' + verify + '\nROLLBACK;');
  assert.equal(snapshot().rows, before.rows, 'Successful upgrade changed existing fixture values.');
  pass('all four migrations plus security committed atomically; metadata permission checks passed');
  step = 'schema validation';
  const diff = execute(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'diff',
    '--from-url', url, '--to-schema-datamodel', path.join(localPrisma, 'schema.prisma'), '--exit-code']);
  assert.equal(diff.status, 0);
  assert.equal(sql(`SELECT count(*) FROM pg_constraint WHERE conname IN ('Avaliacao_autorId_fkey','AvaliacaoQuestao_avaliacaoId_fkey','AvaliacaoQuestao_questaoId_fkey','_AvaliacaoToTurma_A_fkey','_AvaliacaoToTurma_B_fkey','Simulado_avaliacaoId_fkey','ProfilePhoto_userId_fkey') AND convalidated;`), '7');
  pass('Prisma schema diff empty; tables, columns, enum, keys and indexes match; seven new foreign keys valid');
  step = 'Prisma dashboard queries';
  const queryCheck = `
    const assert=require('node:assert/strict');
    const {createRequire}=require('node:module');
    const load=createRequire(${JSON.stringify(path.join(backend, 'package.json'))});
    load('tsx/cjs');
    const {prisma}=load('./src/lib/prisma.ts');
    const {StudentHistoryRepository}=load('./src/repositories/student-history-repository.ts');
    const {ProfilePhotoService}=load('./src/services/profile-photo-service.ts');
    (async()=>{try{
      const repo=new StudentHistoryRepository();
      const blank=await repo.overview('synthetic-empty-account');
      assert.equal(blank.totals.completedActivities,0);
      assert.equal(blank.latestDiagnosticId,null);
      assert.deepEqual(blank.evolution,[]);assert.deepEqual(blank.recentActivities,[]);
      const existing=await repo.overview('fixture-user');
      assert.equal(existing.recentActivities.length,1);
      assert.equal(existing.totals.completedActivities,0);
      assert.deepEqual(await new ProfilePhotoService().get('fixture-user'),{kind:'default'});
    }finally{await prisma.$disconnect();}})().catch(()=>{process.exitCode=1;});
  `;
  execute(process.execPath, ['-e', queryCheck], undefined, { NODE_ENV: 'test' });
  pass('actual Prisma overview works without completed activities; photo service returns default without a photo');
  step = 'access and constraints';
  for (const role of ['anon', 'authenticated']) for (const table of ['Avaliacao', 'AvaliacaoQuestao', '_AvaliacaoToTurma', 'ProfilePhoto']) {
    sql(`SELECT * FROM public."${table}" LIMIT 0;`, role, database, '42501');
  }
  sql(`INSERT INTO "Avaliacao" (id,titulo,"autorId") VALUES ('fixture-evaluation','Fixture','fixture-user');
    INSERT INTO "AvaliacaoQuestao" (id,"avaliacaoId","questaoId",posicao) VALUES ('fixture-evaluation-question','fixture-evaluation','fixture-question',1);
    INSERT INTO "_AvaliacaoToTurma" ("A","B") VALUES ('fixture-evaluation','fixture-class');
    INSERT INTO "ProfilePhoto" ("userId","avatarId",version,"updatedAt") VALUES ('fixture-user','books','fixture-version',CURRENT_TIMESTAMP);`);
  sql(`INSERT INTO "ProfilePhoto" ("userId","avatarId",version,"updatedAt") VALUES ('missing-user','not-an-avatar','fixture',CURRENT_TIMESTAMP);`, actor, database, '23514');
  sql(`INSERT INTO "Avaliacao" (id,titulo,"autorId") VALUES ('fixture-invalid','Fixture','missing-user');`, actor, database, '23503');
  assert.equal(sql(`SELECT count(*) FROM "ProfilePhoto";`), '1');
  assert.equal(sql('SELECT count(*) FROM "Resposta";'), '1');
  pass('eight direct browser-role reads denied; backend can insert/read; invalid content and foreign key rejected');
  step = 'local Prisma history';
  for (const name of names) prisma(['migrate', 'resolve', '--applied', name]);
  const history = JSON.parse(sql(`SELECT json_agg(json_build_object('name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL)) FROM "_prisma_migrations";`));
  assert.equal(history.length, names.length);
  for (const name of names) {
    const records = history.filter(r => r.name === name);
    assert.equal(records.length, 1); assert.equal(records[0].checksum, digest(name));
    assert.equal(records[0].finished, true); assert.equal(records[0].rolledBack, false);
  }
  assert.deepEqual(names.map(digest), originalHashes);
  pass('local migrate resolve succeeded; every history record and checksum verified; historical SQL unchanged');
}
main().catch(() => { console.error('FAIL: ' + step + '; details suppressed.'); process.exitCode = 1; }).finally(() => {
  if (started) {
    try { execute(pg('pg_ctl'), ['-D', data, '-w', '-t', '30', '-m', 'fast', 'stop']); console.log('Disposable PostgreSQL stopped.'); }
    catch { console.error('Disposable PostgreSQL stop failed.'); process.exitCode = 1; }
  }
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ success: !process.exitCode, step, checks }, null, 2));
  console.log('Local rehearsal artifacts: ' + directory);
});
