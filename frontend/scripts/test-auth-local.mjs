// Real frontend + local API + disposable PostgreSQL. No window.fetch mocks.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:5184', api = process.env.JURISSIM_TEST_API, key = process.env.JURISSIM_TEST_MAIL_KEY;
assert.ok(api && key); assert.equal(new URL(api).hostname, '127.0.0.1'); assert.ok(new URL(api).port && new URL(api).port !== '3333');
const mailbox = async () => {
  const response = await fetch(api + '/__fixture/mail', { headers: { 'x-fixture-key': key } }); assert.equal(response.status, 200, 'Expected the isolated fixture server'); return response.json();
};
await mailbox();
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-auth-stage7-'));
console.log('Local authentication browser artifacts: ' + profile);
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5184', '--strictPort'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_API_URL: api, VITE_GOOGLE_CLIENT_ID: '' } });
const browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)); let socket, checks = 0;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 20000); browser.on('error', reject);
    browser.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  for (let i = 0; i < 100; i++) { if (await fetch(origin).then(r => r.ok).catch(() => false)) break; await sleep(100); }
  socket = new WebSocket(endpoint); await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('Local Chrome unavailable')), { once: true }); });
  let sequence = 0; const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const task = pending.get(message.id); pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
    if (message.method === 'Fetch.requestPaused') {
      const allowed = [origin, api].some(base => message.params.request.url.startsWith(base + '/'));
      void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: message.params.requestId, ...(allowed ? {} : { errorReason: 'BlockedByClient' }) }, message.sessionId).catch(() => {});
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params = {}) => send(method, params, sessionId);
  await cdp('Page.enable'); await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  const evaluate = async expression => {
    const source = /\bawait\b/.test(expression) ? `(async () => { ${expression} })()` : expression;
    const result = await cdp('Runtime.evaluate', { expression: source, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error('Local browser expression failed; credentials omitted'); return result.result.value;
  };
  const until = async expression => { for (let i = 0; i < 160; i++) { try { if (await evaluate(expression)) return; } catch {} await sleep(50); } throw new Error('Local browser checkpoint timed out: ' + expression); };
  const click = async (selector, text) => { const expression = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(b => b.textContent.includes(${JSON.stringify(text)}))`; await until(`!!(${expression}) && !(${expression}).disabled`); await evaluate(`(${expression}).click()`); };
  const fill = async (selector, value) => { await until(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`); };
  const markDocument = async () => { const marker = String(Math.random()); await evaluate(`window.testDocumentMarker = ${JSON.stringify(marker)}`); return marker; };
  const waitDocument = marker => until(`window.testDocumentMarker !== ${JSON.stringify(marker)} && document.readyState === 'complete'`);
  const replaceDocument = async (method, params) => { const marker = await markDocument(); const result = await cdp(method, params); if (method === 'Page.reload' || result.loaderId) await waitDocument(marker); };
  const navigate = async suffix => replaceDocument('Page.navigate', { url: origin + suffix });
  const clickNavigation = async (selector, text) => { const marker = await markDocument(); await click(selector, text); await waitDocument(marker); };
  const pass = message => { checks++; console.log('PASS AUTH BROWSER: ' + message); };
  const screenshot = async name => { const shot = await cdp('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(profile, name + '.png'), Buffer.from(shot.data, 'base64')); };
  const getMail = async (email, kind) => (await mailbox()).filter(m => m.to === email && m.kind === kind).at(-1);
  const apiStatus = (route, token) => fetch(api + route, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.status);
  const original = 'isolated-browser-password', replacement = 'isolated-browser-new-password';
  for (const role of ['ALUNO', 'PROFESSOR']) {
    const email = `browser-auth-${role.toLowerCase()}@example.invalid`, basePath = role === 'ALUNO' ? '' : '/professor';
    await navigate('/'); await until('!!document.querySelector(".auth-card")');
    assert.equal(await evaluate('[...document.scripts].some(script => script.src.includes("accounts.google.com"))'), false);
    await click('.perfil-switch button', role === 'ALUNO' ? 'Aluno' : 'Professor');
    await click('.auth-switch button', 'Cadastre-se');
    await fill('input[name=name]', 'Pessoa de teste ' + role); await fill('input[name=email]', 'invalid');
    await fill('input[name=new-password]', original); await fill('input[name=confirm-password]', original);
    await evaluate('document.querySelector("#legal-acceptance").click()');
    await click('.auth-submit', 'Criar conta');
    assert.equal(await evaluate('document.querySelector("input[name=email]").validity.typeMismatch'), true);
    await fill('input[name=email]', email); await click('.auth-submit', 'Criar conta');
    await until('document.querySelector("h2")?.textContent === "Login" && !!document.querySelector(".recovery-notice")');
    await fill('input[autocomplete=current-password]', original); await clickNavigation('.auth-submit', 'Entrar como');
    await until('document.querySelector("h1")?.textContent === "Confirme seu e-mail"');
    const pendingToken = await evaluate('sessionStorage.getItem("jurissim_token")'); assert.equal(await apiStatus(role === 'ALUNO' ? '/goals' : '/reports/classes', pendingToken), 403);
    await click('button', 'Reenviar e-mail'); await until('document.querySelector("[role=alert]")?.textContent.includes("Aguarde")');
    await screenshot('pending-' + role.toLowerCase());
    const mail = await getMail(email, 'verification'); assert.ok(mail); await replaceDocument('Page.navigate', { url: mail.url });
    await until('document.querySelector(".recovery-notice")?.textContent.includes("confirmado com sucesso")'); assert.equal(await evaluate('location.hash'), '');
    await navigate(basePath + (role === 'ALUNO' ? '/dashboard' : '')); await until(role === 'ALUNO' ? '!!document.querySelector(".dashboard-page")' : '!!document.querySelector(".professor-shell")');
    assert.equal(await apiStatus(role === 'ALUNO' ? '/goals' : '/reports/classes', pendingToken), 200);
    await navigate(basePath + '/perfil'); await until('!!document.querySelector("#profile-name")'); assert.equal(await evaluate('document.querySelector("#profile-email").value'), email);
    pass(`${role}: cadastro real, validação nativa/aceite, login limitado, reenvio controlado, confirmação e redirecionamento`);

    await clickNavigation('.v0-sidebar-bottom button', 'Sair'); await until('!!document.querySelector(".auth-card")'); assert.equal(await apiStatus('/auth/session', pendingToken), 401);
    await fill('input[name=email]', email); await fill('input[autocomplete=current-password]', original); await clickNavigation('.auth-submit', 'Entrar como');
    await until(role === 'ALUNO' ? '!!document.querySelector(".v0-app") && location.pathname === "/"' : '!!document.querySelector(".professor-shell")');
    const liveToken = await evaluate('sessionStorage.getItem("jurissim_token")');
    const recovered = await fetch(api + '/auth/password-recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); assert.equal(recovered.status, 202);
    const reset = await getMail(email, 'recovery'); assert.ok(reset); await replaceDocument('Page.navigate', { url: reset.url });
    await until('document.querySelector("h2")?.textContent === "Defina uma nova senha"'); assert.equal(await evaluate('location.hash'), '');
    await fill('input[name=new-password]', replacement); await fill('input[name=confirm-new-password]', replacement); await click('.auth-submit', 'Salvar nova senha');
    await until('document.querySelector("h2")?.textContent === "Login" && !!document.querySelector(".recovery-notice")');
    assert.equal(await apiStatus('/auth/session', liveToken), 401); assert.equal(await evaluate('!!sessionStorage.getItem("jurissim_token")'), false);
    await fill('input[name=email]', email); await fill('input[autocomplete=current-password]', original); await click('.auth-submit', 'Entrar como');
    await until('document.querySelector("[role=alert]")?.textContent.includes("inválidos")');
    await fill('input[autocomplete=current-password]', replacement);
    // Enter exercises native form submission rather than an onClick-only login.
    await evaluate('document.querySelector("input[autocomplete=current-password]").focus()');
    const enterMarker = await markDocument();
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitDocument(enterMarker);
    await until(role === 'ALUNO' ? '!!document.querySelector(".v0-app") && location.pathname === "/"' : '!!document.querySelector(".professor-shell")');
    await replaceDocument('Page.reload'); await until(role === 'ALUNO' ? '!!document.querySelector(".v0-app") && location.pathname === "/"' : '!!document.querySelector(".professor-shell")');
    await navigate(basePath + '/perfil'); await until('!!document.querySelector("#profile-email")'); assert.equal(await evaluate('document.querySelector("#profile-email").value'), email);
    await screenshot('profile-' + role.toLowerCase());
    pass(`${role}: logout no servidor, reset com sessão ativa, revogação, senha anterior recusada, Enter e nova sessão persistida`);
    await clickNavigation('.v0-sidebar-bottom button', 'Sair'); await until('!!document.querySelector(".auth-card")');
    await replaceDocument('Page.navigate', { url: mail.url }); await until('document.querySelector("[role=alert]")?.textContent.includes("já utilizado")');
    assert.equal(await evaluate('location.hash'), ''); await screenshot('verification-reused-' + role.toLowerCase());
    await click('.auth-submit', 'Ir para o Login');
    for (const width of [1366, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true); await screenshot(`login-${role.toLowerCase()}-${width}`);
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    pass(`${role}: link reutilizado tem erro seguro e páginas reais mantêm responsividade desktop/celular`);
  }
  await navigate('/'); await until('!!document.querySelector(".auth-options button")'); await click('.auth-options button', 'Esqueceu');
  await fill('input[name=recovery-email]', 'missing-browser@example.invalid'); await click('.auth-submit', 'Enviar instruções');
  await until('document.querySelector("[role=status]")?.textContent.startsWith("Se existir uma conta")'); await screenshot('recovery-neutral');
  await navigate('/#/reset-password?token=invalid-fixture-link'); await until('document.querySelector("h2")?.textContent === "Defina uma nova senha"');
  assert.equal(await evaluate('!!document.querySelector(".recovery-notice")'), false);
  await fill('input[name=new-password]', replacement); await fill('input[name=confirm-new-password]', replacement); await click('.auth-submit', 'Salvar nova senha');
  await until('!!document.querySelector("[role=alert]")'); assert.equal(await evaluate('location.hash'), ''); await screenshot('reset-invalid');
  pass('recuperação real permanece neutra para conta ausente; token inválido é removido da URL e erro é acessível');
  console.log(`Local authentication browser: ${checks} scenarios passed. Captures: ${profile}`);
} finally { socket?.close(); browser.kill(); vite.kill(); }
