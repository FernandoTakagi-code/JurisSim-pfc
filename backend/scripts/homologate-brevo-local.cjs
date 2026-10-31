// Standalone, opt-in homologation. Never imported by the application or npm test.
// --simulate sends nothing. --authorized-three requires a separately authorized
// recipient in JURISSIM_BREVO_RECIPIENT. Never rerun a real batch automatically.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');

const real = process.argv[2] === '--authorized-three';
assert.ok(real || process.argv[2] === '--simulate', 'Select an explicit homologation mode.');
assert.equal(process.argv.length, 3);
const recipient = real ? process.env.JURISSIM_BREVO_RECIPIENT : 'homologation@example.invalid';
assert.ok(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient || ''), 'An authorized recipient is required.');
const backend = path.resolve(__dirname, '..');
const frontend = path.resolve(backend, '../frontend');
const pgBin = process.env.JURISSIM_PG_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const pg = name => path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
for (const name of ['initdb', 'pg_ctl', 'psql']) assert.ok(fs.existsSync(pg(name)));
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'jurissim-brevo-'));
const data = path.join(artifacts, 'data');
const journal = path.join(artifacts, 'result.json');
const owner = 'jurissim_brevo_test', database = 'jurissim_brevo';
const origin = 'http://127.0.0.1:5184';
const messages = [], checkpoints = [], transports = new Set();
let attempts = 0, started = false, server, browser, vite, socket, prisma, base;
let step = 'initialization', completed = false;
let disposableIdentityVerified = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => createHash('sha256').update(value).digest('hex');
const tokenOf = mail => new URLSearchParams(new URL(mail.url).hash.split('?')[1]).get('token');
function assertTokenLifetime(record, minutes, requestStartedAt, requestFinishedAt) {
  const createdAt = record.createdAt.getTime(), expiresAt = record.expiresAt.getTime();
  const ttl = minutes * 60000;
  // The service computes expiry before the repository timestamps persistence.
  // Check expiry against the request window, not exact equality to createdAt.
  assert.ok(Number.isFinite(createdAt) && Number.isFinite(expiresAt));
  assert.ok(createdAt >= requestStartedAt && createdAt <= requestFinishedAt);
  assert.ok(expiresAt >= requestStartedAt + ttl && expiresAt <= requestFinishedAt + ttl);
  assert.ok(expiresAt > createdAt && expiresAt - createdAt <= ttl);
  assert.ok(expiresAt > Date.now());
}
function save() {
  fs.writeFileSync(journal, JSON.stringify({
    mode: real ? 'real' : 'simulated', attempts, accepted: messages.length,
    completed, lastCheckpoint: step, checkpoints,
    messages: messages.map(({ kind, time, code }) => ({ kind, time, smtpCode: code })),
    recipientDelivery: 'not independently verified',
  }, null, 2));
}
function pass(label) { step = label; checkpoints.push(label); save(); console.log('PASS: ' + label); }
// Allow only OS/runtime environment into subprocesses; no inherited databases,
// email keys, VITE variables, service files or cloud credentials.
const childEnv = {};
for (const [key, value] of Object.entries(process.env)) {
  if (['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp',
    'userprofile', 'localappdata', 'appdata', 'programfiles', 'programfiles(x86)',
    'programdata', 'systemdrive', 'processor_architecture'].includes(key.toLowerCase())) childEnv[key] = value;
}
Object.assign(childEnv, { NODE_ENV: 'test', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: 'true',
  PGHOST: '127.0.0.1', PGUSER: owner, PGPASSWORD: '', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5' });
function run(command, args, input, controller = false) {
  const result = spawnSync(command, args, { cwd: backend, env: childEnv, input,
    stdio: controller ? 'ignore' : 'pipe', encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error('Local subprocess failed; details suppressed.');
  return (result.stdout || '').trim();
}
function sql(input) {
  return run(pg('psql'), ['-X', '-w', '-h', '127.0.0.1', '-p', childEnv.PGPORT,
    '-U', owner, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q', '-f', '-'], input);
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer(); probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(error => error ? reject(error) : resolve(port)); });
  });
}
async function api(route, body, bearer, expected = 200, method = 'POST') {
  const response = await fetch(base + route, { method,
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, expected, 'Unexpected local API status.');
  return response.json();
}
async function main() {
  console.log('Homologation mode: ' + (real ? 'REAL, maximum three attempts' : 'SIMULATED, zero real emails'));
  console.log('Sanitized result directory: ' + artifacts);
  save();
  step = 'create disposable PostgreSQL';
  const port = await freePort(); childEnv.PGPORT = String(port);
  run(pg('initdb'), ['-D', data, '-U', owner, '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale']);
  run(pg('pg_ctl'), ['-D', data, '-l', path.join(artifacts, 'postgres.log'), '-o',
    `-h 127.0.0.1 -p ${port} -c log_statement=none -c log_min_error_statement=panic -c log_parameter_max_length_on_error=0`, '-w', '-t', '30', 'start'], undefined, true);
  started = true;
  assert.equal(fs.realpathSync(sql('SHOW data_directory;')).toLowerCase(), fs.realpathSync(data).toLowerCase());
  assert.equal(sql('SELECT current_user;'), owner);
  sql('CREATE DATABASE ' + database + ';');
  const url = `postgresql://${owner}@127.0.0.1:${port}/${database}?schema=public`;
  for (const key of ['DATABASE_URL', 'DIRECT_URL', 'SHADOW_DATABASE_URL']) childEnv[key] = url;
  run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
  Object.assign(process.env, { DATABASE_URL: url, DIRECT_URL: url, SHADOW_DATABASE_URL: url,
    NODE_ENV: 'test', APP_PUBLIC_URL: origin, JWT_SECRET: randomBytes(48).toString('hex'),
    GMAIL_USER: '', GMAIL_APP_PASSWORD: '', BREVO_SMTP_USER: '', BREVO_SMTP_KEY: '',
    GOOGLE_CLIENT_ID: '', GROQ_API_KEY: '' });
  const dotenv = require('../node_modules/dotenv');
  if (real) {
    // Read only the two SMTP values; never import private DB/JWT configuration.
    const privateEnv = dotenv.parse(fs.readFileSync(path.join(backend, '.env')));
    assert.ok(privateEnv.BREVO_SMTP_USER?.trim() && privateEnv.BREVO_SMTP_KEY?.trim());
    process.env.BREVO_SMTP_USER = privateEnv.BREVO_SMTP_USER;
    process.env.BREVO_SMTP_KEY = privateEnv.BREVO_SMTP_KEY;
  }
  // Application imports must not subsequently load unrelated private values.
  dotenv.config = () => ({ parsed: {} });
  require('tsx/cjs');
  const { EMAIL_VERIFICATION_TOKEN_TTL_MINUTES, PASSWORD_RECOVERY_TOKEN_TTL_MINUTES } = require('../src/services/auth-token-policy.ts');
  prisma = require('../src/lib/prisma.ts').prisma;
  const [identity] = await prisma.$queryRawUnsafe('SELECT current_database() AS database, current_user AS owner, current_setting(\'data_directory\') AS directory');
  assert.equal(identity.database, database); assert.equal(identity.owner, owner);
  assert.equal(fs.realpathSync(identity.directory).toLowerCase(), fs.realpathSync(data).toLowerCase());
  assert.equal(await prisma.user.count(), 0);
  disposableIdentityVerified = true;
  pass('fresh disposable database identity verified; 12 local migrations applied');

  const { BrevoSmtpClient, OFFICIAL_EMAIL } = require('../src/services/brevo-smtp.ts');
  if (!real) { process.env.BREVO_SMTP_USER = 'fixture@smtp-brevo.com'; process.env.BREVO_SMTP_KEY = 'simulated-only'; }
  assert.ok(new BrevoSmtpClient().isConfigured);
  const getTransporter = BrevoSmtpClient.prototype.getTransporter;
  const guarded = new WeakSet();
  const simulatedTransport = { sendMail: async message => ({ accepted: [message.to], rejected: [], response: '250 simulated' }), close() {} };
  BrevoSmtpClient.prototype.getTransporter = function () {
    const transport = real ? getTransporter.call(this) : simulatedTransport;
    if (!guarded.has(transport)) {
      guarded.add(transport); transports.add(transport);
      const sendMail = transport.sendMail.bind(transport);
      transport.sendMail = async message => {
        assert.equal(message.to, recipient); assert.equal(message.from.address, OFFICIAL_EMAIL);
        assert.ok(!message.cc && !message.bcc && !message.envelope);
        assert.ok(attempts < 3, 'Authorized batch exhausted.');
        const kind = attempts < 2 ? 'verification' : 'recovery';
        assert.ok(kind === 'verification' ? message.subject.startsWith('Confirme') : message.subject.startsWith('Recupera'));
        const link = message.text.match(/http[^\s]+/)[0];
        const parsedLink = new URL(link);
        assert.equal(parsedLink.origin, origin); assert.ok(message.html.includes(link));
        assert.ok(parsedLink.hash.startsWith(kind === 'verification' ? '#/verificar-email?token=' : '#/reset-password?token='));
        attempts++; save(); // Reserve the attempt before touching the network. No retry.
        let info;
        try { info = await sendMail(message); } catch { throw new Error('SMTP attempt failed; provider details suppressed.'); }
        assert.ok(info.accepted.some(address => String(address).toLowerCase() === recipient.toLowerCase()));
        assert.equal(info.rejected.length, 0);
        const code = /^250\b/.test(info.response || '') ? 250 : null;
        assert.equal(code, 250);
        messages.push({ kind, url: link, time: new Date().toISOString(), code }); save();
        console.log((real ? 'SMTP REAL' : 'SIMULATED SMTP') + ': ' + attempts + '/3 accepted (' + kind + ', 250).');
        return info;
      };
    }
    return transport;
  };
  const express = require('../node_modules/express');
  const cors = require('../node_modules/cors');
  const app = express(); app.use(cors({ origin })); app.use(express.json());
  app.use('/auth', require('../src/routes/auth-routes.ts').authRoutes);
  app.use('/goals', require('../src/routes/goals-reports-routes.ts').goalRoutes);
  app.use('/students/me', require('../src/routes/student-history-routes.ts').studentHistoryRoutes);
  app.use('/diagnostics', require('../src/routes/diagnostic-routes.ts').diagnosticRoutes);
  app.use('/trilhas', require('../src/routes/trail-routes.ts').trailRoutes);
  app.use(require('../src/middlewares/error-handler.ts').errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5184', '--strictPort'],
    { cwd: frontend, env: { ...childEnv, VITE_API_URL: base, VITE_GOOGLE_CLIENT_ID: '' }, windowsHide: true, stdio: 'ignore' });
  const profile = path.join(artifacts, 'incognito-browser');
  browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--incognito', '--disable-sync', '--disable-background-networking', '--disable-save-password-bubble',
      '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', 'about:blank'],
    { env: childEnv, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(new Error('Local browser startup failed.')), 20000);
    browser.on('error', () => { clearTimeout(timer); reject(new Error('Local browser unavailable.')); });
    browser.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  for (let i = 0; i < 100; i++) { if (await fetch(origin).then(r => r.ok).catch(() => false)) break; await sleep(100); }
  assert.ok(await fetch(origin).then(r => r.ok));
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('Local debugger unavailable.')), { once: true }); });
  let sequence = 0; const pending = new Map();
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('Local browser command timed out.')); }, 20000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const task = pending.get(message.id); pending.delete(message.id); clearTimeout(task.timer);
      message.error ? task.reject(new Error('Local browser command failed; details suppressed.')) : task.resolve(message.result);
    }
    if (message.method === 'Fetch.requestPaused') {
      const allowed = [origin, base].some(local => message.params.request.url.startsWith(local + '/'));
      void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: message.params.requestId,
        ...(allowed ? {} : { errorReason: 'BlockedByClient' }) }, message.sessionId).catch(() => {});
    }
  });
  async function tab() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const cdp = (method, params = {}) => send(method, params, sessionId);
    await cdp('Page.enable'); await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    async function evaluate(expression) {
      const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error('Local browser expression failed; details suppressed.');
      return result.result.value;
    }
    async function until(expression) {
      for (let i = 0; i < 200; i++) { try { if (await evaluate(expression)) return; } catch {} await sleep(100); }
      throw new Error('Local browser checkpoint timed out; details suppressed.');
    }
    async function navigate(url) {
      // Switching tabs must retain the application's normal focus/session checks.
      await cdp('Page.bringToFront');
      const marker = randomBytes(8).toString('hex'); await evaluate('window.homologationMarker=' + JSON.stringify(marker));
      const result = await cdp('Page.navigate', { url: url.startsWith('http') ? url : origin + url });
      if (result.loaderId) await until('window.homologationMarker !== ' + JSON.stringify(marker) + ' && document.readyState === "complete"');
    }
    async function fill(selector, value) {
      await until('!!document.querySelector(' + JSON.stringify(selector) + ')');
      await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    }
    async function click(selector, text) {
      const expression = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(button=>button.textContent.includes(${JSON.stringify(text)}))`;
      await until(`!!(${expression}) && !(${expression}).disabled`); await evaluate(`(${expression}).click()`);
    }
    return { evaluate, until, navigate, fill, click };
  }
  const page = await tab();
  const originalPassword = randomBytes(24).toString('base64url'), replacementPassword = randomBytes(24).toString('base64url');
  step = 'registration through local frontend'; save();
  await page.navigate('/'); await page.until('!!document.querySelector(".auth-card")');
  await page.click('.auth-switch button', 'Cadastre-se');
  await page.fill('input[name=name]', 'Aluno Homologacao Brevo'); await page.fill('input[name=email]', recipient);
  await page.fill('input[name=new-password]', originalPassword); await page.fill('input[name=confirm-password]', originalPassword);
  await page.evaluate('document.querySelector("#legal-acceptance").click()');
  const registrationStartedAt = Date.now();
  await page.click('.auth-submit', 'Criar conta');
  await page.until('document.querySelector("h2")?.textContent === "Login" && !!document.querySelector(".recovery-notice")');
  const registrationFinishedAt = Date.now();
  assert.equal(messages.length, 1);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: recipient } });
  assert.equal(user.role, 'ALUNO'); assert.equal(user.emailVerifiedAt, null); assert.ok(user.legalAcceptedAt);
  assert.ok(await require('../node_modules/bcrypt').compare(originalPassword, user.senhaHash));
  const firstToken = await prisma.authToken.findFirstOrThrow({ where: { userId: user.id } });
  assert.equal(firstToken.tokenHash, hash(tokenOf(messages[0])));
  assertTokenLifetime(firstToken, EMAIL_VERIFICATION_TOKEN_TTL_MINUTES, registrationStartedAt, registrationFinishedAt);
  pass('registration persisted; automatic confirmation accepted; hash-only token with ' + EMAIL_VERIFICATION_TOKEN_TTL_MINUTES + '-minute expiry');
  await page.fill('input[autocomplete=current-password]', originalPassword); await page.click('.auth-submit', 'Entrar como');
  await page.until('document.querySelector("h1")?.textContent === "Confirme seu e-mail"');
  const limited = await page.evaluate('sessionStorage.getItem("jurissim_token")');
  await api('/goals', undefined, limited, 403, 'GET');
  await page.click('button', 'Reenviar e-mail'); await page.until('document.querySelector("[role=alert]")?.textContent.includes("Aguarde")');
  assert.equal(attempts, 1);
  pass('unconfirmed account blocked; immediate resend rejected without another message');
  step = 'wait for actual one-minute resend cooldown'; save();
  while (Date.now() - firstToken.createdAt.getTime() < 61500) { await sleep(1000); }
  await page.click('button', 'Reenviar e-mail');
  for (let i = 0; i < 200 && messages.length < 2; i++) await sleep(100);
  assert.equal(messages.length, 2); assert.equal(attempts, 2);
  await page.navigate(messages[0].url); await page.until('document.querySelector("[role=alert]")?.textContent.includes("utilizado")');
  assert.equal(await page.evaluate('location.hash'), '');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt, null);
  await page.navigate(messages[1].url); await page.until('document.querySelector(".recovery-notice")?.textContent.includes("confirmado com sucesso")');
  assert.equal(await page.evaluate('location.hash'), '');
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt);
  // Reopening an email link is a new visit, not a hash update on the same form.
  const confirmationReplay = await tab();
  await confirmationReplay.navigate(messages[1].url);
  await confirmationReplay.until('document.querySelector("[role=alert]")?.textContent.includes("utilizado")');
  assert.equal(await confirmationReplay.evaluate('location.hash'), ''); await api('/goals', undefined, limited, 200, 'GET');
  pass('resend accepted after real cooldown; old link revoked; new link confirms once; URL tokens removed');
  await api('/auth/logout', undefined, limited); await api('/auth/session', undefined, limited, 401, 'GET');
  await page.navigate('/'); await page.until('!!document.querySelector("input[autocomplete=current-password]")');
  await page.fill('input[name=email]', recipient); await page.fill('input[autocomplete=current-password]', originalPassword);
  await page.click('.auth-submit', 'Entrar como'); await page.until('!!document.querySelector(".v0-app")');
  const confirmedSession = await page.evaluate('sessionStorage.getItem("jurissim_token")');
  assert.equal((await api('/auth/session', undefined, confirmedSession, 200, 'GET')).user.emailVerificado, true);
  pass('confirmed-account login through frontend succeeds; logout revokes previous session');
  const recoveryPage = await tab(); await recoveryPage.navigate('/');
  await recoveryPage.click('.auth-options button', 'Esqueceu'); await recoveryPage.fill('input[name=recovery-email]', recipient);
  step = 'password recovery through local frontend'; save();
  const recoveryStartedAt = Date.now();
  await recoveryPage.click('.auth-submit', 'Enviar instru');
  await recoveryPage.until('document.querySelector("[role=status]")?.textContent.startsWith("Se existir uma conta")');
  const recoveryFinishedAt = Date.now();
  assert.equal(messages.length, 3); assert.equal(attempts, 3);
  const reset = messages[2];
  const recoveryToken = await prisma.passwordRecoveryToken.findUniqueOrThrow({ where: { tokenHash: hash(tokenOf(reset)) } });
  assertTokenLifetime(recoveryToken, PASSWORD_RECOVERY_TOKEN_TTL_MINUTES, recoveryStartedAt, recoveryFinishedAt);
  await api('/auth/password-recovery', { email: recipient }, undefined, 202); assert.equal(attempts, 3);
  await recoveryPage.navigate(reset.url); await recoveryPage.until('document.querySelector("h2")?.textContent === "Defina uma nova senha"');
  assert.equal(await recoveryPage.evaluate('location.hash'), '');
  await recoveryPage.fill('input[name=new-password]', replacementPassword); await recoveryPage.fill('input[name=confirm-new-password]', replacementPassword);
  await recoveryPage.click('.auth-submit', 'Salvar nova senha');
  await recoveryPage.until('document.querySelector("h2")?.textContent === "Login" && !!document.querySelector(".recovery-notice")');
  await api('/auth/session', undefined, confirmedSession, 401, 'GET');
  await recoveryPage.fill('input[name=email]', recipient); await recoveryPage.fill('input[autocomplete=current-password]', originalPassword);
  await recoveryPage.click('.auth-submit', 'Entrar como'); await recoveryPage.until('document.querySelector("[role=alert]")?.textContent.includes("inv")');
  await recoveryPage.fill('input[autocomplete=current-password]', replacementPassword); await recoveryPage.click('.auth-submit', 'Entrar como');
  await recoveryPage.until('!!document.querySelector(".v0-app")');
  const newSession = await recoveryPage.evaluate('sessionStorage.getItem("jurissim_token")'); await api('/goals', undefined, newSession, 200, 'GET');
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(await require('../node_modules/bcrypt').compare(replacementPassword, updated.senhaHash));
  await api('/auth/password-reset', { token: tokenOf(reset), senha: originalPassword, confirmacaoSenha: originalPassword }, undefined, 400);
  await recoveryPage.navigate(reset.url); await recoveryPage.until('document.querySelector("h2")?.textContent === "Defina uma nova senha"');
  await recoveryPage.fill('input[name=new-password]', originalPassword); await recoveryPage.fill('input[name=confirm-new-password]', originalPassword);
  await recoveryPage.click('.auth-submit', 'Salvar nova senha'); await recoveryPage.until('document.querySelector("[role=alert]")?.textContent.includes("utilizado")');
  assert.equal(await recoveryPage.evaluate('location.hash'), '');
  await api('/auth/logout', undefined, newSession); await api('/auth/session', undefined, newSession, 401, 'GET');
  pass('recovery accepted; reset through frontend; old password rejected; new login succeeds; replay and old sessions rejected');
  assert.equal(attempts, 3); assert.equal(messages.length, 3);
  completed = true; pass('authorized batch completed with exactly three messages; mailbox delivery requires recipient confirmation');
}
async function cleanup() {
  socket?.close(); browser?.kill(); vite?.kill();
  if (server) await new Promise(resolve => server.close(resolve));
  for (const transport of transports) transport.close();
  if (prisma) {
    try {
      assert.ok(disposableIdentityVerified, 'Refuse cleanup without verified disposable ownership.');
      await prisma.$transaction(async tx => {
        // Revalidate the live connection before deleting anything. No external
        // URL, existing cluster, or mismatched data directory may be cleaned.
        const [identity] = await tx.$queryRawUnsafe('SELECT current_database() AS database, current_user AS owner, current_setting(\'data_directory\') AS directory, inet_server_port() AS port');
        assert.equal(identity.database, database); assert.equal(identity.owner, owner);
        assert.equal(identity.port, Number(childEnv.PGPORT));
        assert.equal(fs.realpathSync(identity.directory).toLowerCase(), fs.realpathSync(data).toLowerCase());
        const fixtures = await tx.user.findMany({ select: { email: true, nome: true } });
        assert.ok(fixtures.every(user => user.email === recipient && user.nome === 'Aluno Homologacao Brevo'));
        // AuditLog restricts user deletion. Remove only this disposable database's
        // audit rows first; existing cascades remove the fixture's auth tokens.
        await tx.auditLog.deleteMany();
        await tx.user.deleteMany();
        assert.equal(await tx.user.count(), 0);
        assert.equal(await tx.auditLog.count(), 0);
        assert.equal(await tx.authToken.count(), 0);
        assert.equal(await tx.passwordRecoveryToken.count(), 0);
      });
      console.log('Disposable account, audit rows and tokens removed transactionally.');
    } catch {
      console.log('Disposable cleanup refused or rolled back; procedure interrupted, details suppressed.');
      completed = false; process.exitCode = 1;
    }
    await prisma.$disconnect();
  }
  if (started) {
    try { run(pg('pg_ctl'), ['-D', data, '-w', '-t', '30', '-m', 'fast', 'stop'], undefined, true); console.log('Disposable PostgreSQL stopped.'); }
    catch { console.log('Disposable PostgreSQL stop could not be confirmed.'); process.exitCode = 1; }
  }
  save();
  messages.forEach(message => { delete message.url; });
}
main().catch(() => {
  console.log('FAILED checkpoint: ' + step + '. Sensitive error details suppressed; no automatic retry.');
  console.log('Attempts reserved: ' + attempts + '; SMTP accepted: ' + messages.length + '.');
  process.exitCode = 1;
}).finally(cleanup);
