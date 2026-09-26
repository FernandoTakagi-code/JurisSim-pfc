import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const browserPath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-legal-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5179', '--strictPort'], { windowsHide: true, stdio: 'ignore' });
const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 20000);
    browser.on('error', reject);
    browser.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  for (let i = 0; i < 50; i++) {
    if (await fetch('http://127.0.0.1:5179').then(r => r.ok).catch(() => false)) break;
    await sleep(100);
  }
  socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id); clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(50); }
    throw new Error(`Condition failed: ${expression}`);
  };
  const navigate = async suffix => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:5179/${suffix}` });
    await until('!!document.querySelector(".auth-card")');
  };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const [hash, title] of [['#/termos', 'Termos de Uso'], ['#/privacidade', 'Política de Privacidade']]) {
    await navigate(hash);
    await until(`document.title === '${title} — JurisSim'`);
    assert.equal(await evaluate('!!sessionStorage.getItem("jurissim_token")'), false);
    await evaluate('document.querySelector(".legal-back").click()');
    await until('!document.querySelector(".legal-page")');
  }
  for (const hash of ['#/termos', '#/privacidade']) {
    await evaluate(`document.querySelector('.auth-form-wrap a[href="${hash}"]').click()`);
    await until('!!document.querySelector(".legal-page")');
    await evaluate('document.querySelector(".legal-back").click()');
    await until('!document.querySelector(".legal-page")');
  }
  await evaluate(`const setInput = (selector, value) => { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }; setInput('input[name="email"]', 'login@example.com'); setInput('input[autocomplete="current-password"]', 'login-password');`);
  await evaluate('document.querySelector(".auth-switch button").click()');
  await until('!!document.querySelector("#legal-acceptance")');
  assert.equal(await evaluate('document.querySelector("input[name=email]").value'), '');
  assert.equal(await evaluate('document.querySelector("input[autocomplete=new-password]").value'), '');
  assert.equal(await evaluate('document.querySelector("input[name=name]").autocomplete'), 'name');
  await evaluate(`window.requests = []; window.fetch = async (url, init) => { window.requests.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ message: 'ok' }), { status: 201 }); };`);
  assert.equal(await evaluate('document.querySelector(".auth-submit").disabled'), true);
  await evaluate('document.querySelector(".auth-submit").click()');
  assert.equal(await evaluate('window.requests.length'), 0);
  await evaluate(`const input = document.querySelector('input[placeholder="Digite seu nome completo"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Ana Teste'); input.dispatchEvent(new Event('input', { bubbles: true }));`);
  for (const hash of ['#/termos', '#/privacidade']) {
    await evaluate(`document.querySelector('.legal-consent a[href="${hash}"]').click()`);
    await until('!!document.querySelector(".legal-page")');
    await evaluate('document.querySelector(".legal-back").click()');
    await until('!document.querySelector(".legal-page")');
    assert.equal(await evaluate(`document.querySelector('input[placeholder="Digite seu nome completo"]').value`), 'Ana Teste');
  }
  await evaluate('document.querySelector("#legal-acceptance").click()');
  await until('!document.querySelector(".auth-submit").disabled');
  await evaluate('document.querySelector(".auth-submit").click()');
  await until('window.requests.length === 1 && !document.querySelector("#legal-acceptance")');
  assert.equal(await evaluate('window.requests[0].body.acceptance.accepted'), true);
  assert.ok(await evaluate('window.requests[0].body.acceptance.termsVersion && window.requests[0].body.acceptance.privacyVersion'));
  const token = `x.${Buffer.from(JSON.stringify({ role: 'ALUNO' })).toString('base64url')}.x`;
  await evaluate(`sessionStorage.setItem('jurissim_token', '${token}')`);
  await cdp('Page.reload');
  await until('!!document.querySelector(".app-legal-footer")');
  for (const width of [1366, 390]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
    for (const hash of ['#/termos', '#/privacidade']) {
      await evaluate(`document.querySelector('.app-legal-footer a[href="${hash}"]').click()`);
      await until('!!document.querySelector(".legal-page")');
      assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
      if (hash === '#/privacidade') {
        const shot = await cdp('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(profile, `privacy-${width}.png`), Buffer.from(shot.data, 'base64'));
      }
      await evaluate('document.querySelector(".legal-back").click()');
      await until('!document.querySelector(".legal-page")');
    }
  }
  console.log('PASS: documentos públicos; links de login/cadastro; preservação do formulário; bloqueio sem aceite; envio com versões; links após login; desktop/mobile sem overflow.');
  console.log(`Screenshots: ${profile}`);
  await cdp('Page.navigate', { url: 'http://127.0.0.1:5179/dashboard' });
  await until('!!document.querySelector(".dashboard-page")');
  assert.equal(await evaluate('document.querySelector(".dashboard-heading h1").textContent'), 'Seu espaço de estudos');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  await evaluate('document.querySelector(".dashboard-panel .text-button").click()');
  await until('location.pathname === "/desempenho" && document.querySelector("h1")?.textContent.includes("Dados ainda indisponíveis")');
  await evaluate('document.querySelector(".page .primary").click()');
  await until('location.pathname === "/dashboard" && !!document.querySelector(".dashboard-page")');
  await evaluate('document.querySelector(".dashboard-heading .primary").click()');
  await until('location.pathname === "/" && !!document.querySelector(".start-card")');
  await evaluate(`window.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    const question = { id: 'q1', position: 1, statement: 'Questao de teste', discipline: 'Civil', topic: 'Contratos', difficulty: 'BASICO', alternatives: [{ id: 'a1', text: 'Alternativa A' }, { id: 'a2', text: 'Alternativa B' }], selectedOptionId: null };
    const trail = { id: 'trail1', disciplinaPrioritaria: 'Civil', assuntoPrioritario: 'Contratos', nivelRecomendado: 'BASICO', quantidadeRecomendada: 1, justificativa: 'Teste' };
    let data = {};
    if (path === '/diagnostics') data = { id: 'diagnostic1' };
    else if (path.includes('/diagnostics/') && path.endsWith('/questions')) data = { questions: [question] };
    else if (path.endsWith('/result')) data = { overallPercentage: 100, level: 'BASICO', recommendation: 'Continue praticando.', performances: [{ tipo: 'DISCIPLINA', disciplina: 'Civil', percentual: 100 }], trail };
    else if (path.endsWith('/trail')) data = { trail };
    else if (path.endsWith('/gerar')) data = { id: 'trailAttempt1' };
    else if (path.includes('/trilhas/attempts/') && path.endsWith('/questions')) data = { questions: [question] };
    else if (path.includes('/trilhas/attempts/') && path.endsWith('/finalize')) data = { overallPercentage: 100, level: 'INTERMEDIARIO', recommendation: 'Bom trabalho.' };
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };`);
  await evaluate('document.querySelector(".start-card .primary").click()');
  await until('!!document.querySelector(".question input[type=radio]")');
  await evaluate('document.querySelector(".question input[type=radio]").click()');
  await until('!document.querySelector(".question button.primary").disabled');
  await evaluate('document.querySelector(".question button.primary").click()');
  await until('document.querySelector(".result h1")?.textContent.includes("desempenho")');
  await evaluate('document.querySelector(".result-dashboard-link").click()');
  await until('!!document.querySelector(".dashboard-page")');
  assert.equal(await evaluate('document.querySelector(".dashboard-stats article:nth-child(2) strong").textContent'), '100%');
  await evaluate('document.querySelector(".dashboard-panel .text-button").click()');
  await until('document.querySelector(".result h1")?.textContent.includes("desempenho")');
  await evaluate('document.querySelector(".trail .primary").click()');
  await until('!!document.querySelector(".question input[type=radio]")');
  await evaluate('document.querySelector(".question input[type=radio]").click()');
  await until('!document.querySelector(".question button.primary").disabled');
  await evaluate('document.querySelector(".question button.primary").click()');
  await until('document.querySelector(".result h1")?.textContent.includes("atualizado")');
  await evaluate('document.querySelector(".result-actions .primary").click()');
  await until('!!document.querySelector(".dashboard-page")');
  await evaluate('history.back()');
  await until('document.querySelector(".result h1")?.textContent.includes("atualizado")');
  await evaluate('document.querySelector(".result-actions .outline-button").click()');
  await until('document.querySelector(".result h1")?.textContent.includes("desempenho")');
  await evaluate('document.querySelector(".result-dashboard-link").click()');
  await until('!!document.querySelector(".dashboard-page")');
  console.log('PASS: autofill separado; rota e responsividade do Dashboard; navegação Dashboard -> desempenho -> Dashboard -> estudar.');
} finally {
  socket?.close();
  browser.kill();
  vite.kill();
}
