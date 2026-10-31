import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const browserPath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-legal-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5179', '--strictPort'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:1', VITE_GOOGLE_CLIENT_ID: '', VITE_QUESTION_PRACTICE_UI_ENABLED: 'false' } });
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
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('Unable to connect to local Chrome debugger')), { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id); clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
    if (message.method === 'Fetch.requestPaused') {
      const allowed = message.params.request.url.startsWith('http://127.0.0.1:5179/');
      void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
        requestId: message.params.requestId, ...(allowed ? {} : { errorReason: 'BlockedByClient' }),
      }, message.sessionId).catch(() => {});
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
    throw new Error(`Condition failed: ${expression}; UI: ${await evaluate('document.body.innerText.slice(0, 500)')}`);
  };
  const navigate = async suffix => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:5179/${suffix}` });
    await until('!!document.querySelector(".auth-card")');
  };
  await cdp('Page.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.fetch = async (url) => {
      if (new URL(String(url)).pathname === '/students/me/overview') {
        const hasLegacyResult = sessionStorage.getItem('test_legacy_result_error') === 'true';
        return new Response(JSON.stringify({ totals: { completedActivities: 0 }, latestDiagnosticId: hasLegacyResult ? 'diagnostic-500' : null, evolution: [], recentActivities: [] }), { status: 200 });
      }
      if (new URL(String(url)).pathname === '/goals/dashboard') return new Response(JSON.stringify({ streak: { current: 0, longest: 0, lastActivityDate: null }, totalAnsweredQuestions: 0, todayAnsweredQuestions: 0, todayGoal: null, currentLevel: null }), { status: 200 });
      if (new URL(String(url)).pathname === '/diagnostics/diagnostic-500/result') return new Response(JSON.stringify({ message: 'Erro interno do servidor.' }), { status: 500 });
      if (new URL(String(url)).pathname === '/auth/session') return new Response(JSON.stringify({ user: { id: 'fixture-user', nome: 'Fixture', email: 'fixture@example.invalid', role: 'ALUNO', emailVerificado: true }, nextStep: 'DASHBOARD' }), { status: 200 });
      throw new Error('Unexpected request in isolated legal test');
    };
  ` });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const [hash, title] of [['#/termos', 'Termos de Uso'], ['#/privacidade', 'Aviso de Privacidade']]) {
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
  await evaluate('document.querySelector(".auth-options button").click()');
  await until('!!document.querySelector("input[name=recovery-email]")');
  const neutralRecoveryMessage = 'Se existir uma conta associada a este e-mail, enviaremos as instruções de recuperação.';
  await evaluate(`window.fillRecoveryInput = (selector, value) => { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }; window.fillRecoveryInput('input[name=recovery-email]', 'unknown@example.com'); window.fetch = async (url, init) => { window.recoveryRequest = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ message: ${JSON.stringify(neutralRecoveryMessage)} }), { status: 202 }); };`);
  await evaluate('document.querySelector(".auth-submit").click()');
  await until('!!document.querySelector(".recovery-notice")');
  assert.equal(await evaluate('document.querySelector(".recovery-notice").textContent'), neutralRecoveryMessage);
  assert.equal(await evaluate('window.recoveryRequest.body.email'), 'unknown@example.com');
  assert.ok(await evaluate('window.recoveryRequest.url.endsWith("/auth/password-recovery")'));
  await evaluate('document.querySelector(".text-button").click()');
  const resetTokenPreview = 'a'.repeat(43);
  await navigate(`?recovery-test=1#/reset-password?token=${resetTokenPreview}`);
  await until('!!document.querySelector(".auth-card")');
  assert.equal(await evaluate('document.querySelector("h2").textContent'), 'Defina uma nova senha');
  await evaluate(`window.fillRecoveryInput = (selector, value) => { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };`);
  assert.equal(await evaluate('document.querySelector("input[name=new-password]").placeholder'), 'Digite uma nova senha');
  assert.equal(await evaluate('document.querySelector("input[name=confirm-new-password]").placeholder'), 'Repita a senha');
  assert.equal(await evaluate('document.querySelectorAll(".password-requirements li").length'), 4);
  await evaluate('window.resetRequests = 0; window.fetch = async () => { window.resetRequests++; throw new Error("Unexpected reset request"); };');
  for (const password of ['joao', 'Ab1!', 'abcdef1!', 'Abcdefg!', 'Abcdefg1', 'Abcdefg1 ', 'A1!' + '?'.repeat(70)]) {
    await evaluate(`window.fillRecoveryInput('input[name=new-password]', ${JSON.stringify(password)}); window.fillRecoveryInput('input[name=confirm-new-password]', ${JSON.stringify(password)});`);
    await until('document.querySelector(".auth-submit").disabled');
    await evaluate('document.querySelector(".auth-card").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))');
    await until('!!document.querySelector("[role=alert]")');
    assert.equal(await evaluate('window.resetRequests'), 0);
  }
  await evaluate(`window.fillRecoveryInput('input[name=new-password]', 'Valid-password1!'); window.fillRecoveryInput('input[name=confirm-new-password]', 'Other-password1!');`);
  await until('document.querySelector("#reset-password-match").textContent === "As senhas n\\u00e3o coincidem."');
  assert.equal(await evaluate('document.querySelector(".auth-submit").disabled'), true);
  assert.equal(await evaluate('document.querySelectorAll(".password-requirements li[data-satisfied=true]").length'), 4);
  await evaluate(`window.fillRecoveryInput('input[name=confirm-new-password]', 'Valid-password1!');`);
  await until('!document.querySelector(".auth-submit").disabled');
  assert.equal(await evaluate('document.querySelector("#reset-password-match").textContent'), '');
  await evaluate(`window.fetch = async () => new Response(JSON.stringify({ message: 'Por seguran\\u00e7a, sua nova senha deve ser diferente da senha atual.' }), { status: 400 });`);
  await evaluate(`window.fillRecoveryInput('input[name=new-password]', 'Current-password1!'); window.fillRecoveryInput('input[name=confirm-new-password]', 'Current-password1!'); document.querySelector('.auth-submit').click();`);
  await until('document.querySelector("[role=alert]")?.textContent === "Por seguran\\u00e7a, sua nova senha deve ser diferente da senha atual."');
  assert.equal(await evaluate('document.querySelectorAll(".password-requirements li[data-satisfied=true]").length'), 4);
  assert.equal(await evaluate('document.querySelector("h2").textContent'), 'Defina uma nova senha');
  for (const width of [360, 1366]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 360 });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  }
  console.log('PASS: pol?tica de senha em tempo real, confirma??o divergente, limite UTF-8, bloqueio de envio inv?lido e responsividade.');
  await evaluate(`window.fillRecoveryInput('input[name=new-password]', 'Senha-nova-segura1!'); window.fillRecoveryInput('input[name=confirm-new-password]', 'Senha-nova-segura1!'); window.fetch = async (url, init) => { window.resetRequest = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ message: 'Senha redefinida. Você já pode entrar com sua nova senha.' }), { status: 200 }); };`);
  await evaluate('document.querySelector(".auth-submit").click()');
  await until('document.querySelector("h2").textContent === "Login" && !!document.querySelector(".recovery-notice")');
  assert.equal(await evaluate('window.resetRequest.url.endsWith("/auth/password-reset")'), true);
  assert.equal(await evaluate('window.resetRequest.body.token'), resetTokenPreview);
  assert.equal(await evaluate('window.resetRequest.body.senha'), 'Senha-nova-segura1!');
  assert.equal(await evaluate('window.location.hash'), '');
  await navigate('');
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
  await evaluate(`for (const [selector, value] of [['input[name=email]', 'registration@example.invalid'], ['input[name=new-password]', 'Fixture-register-password1!'], ['input[name=confirm-password]', 'Fixture-register-password1!']]) { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }`);
  assert.equal(await evaluate('document.querySelector(".auth-submit").disabled'), true);
  assert.equal(await evaluate('!!document.querySelector("#registration-email-error")'), false, '.invalid is syntactically accepted by registration validation');
  await evaluate(`const invalidEmailField = document.querySelector('input[name=email]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(invalidEmailField, 'not-an-email'); invalidEmailField.dispatchEvent(new Event('input', { bubbles: true }));`);
  assert.equal(await evaluate('document.querySelector("#registration-email-error")?.textContent.includes("v\u00e1lido")'), true);
  await evaluate(`const validEmailField = document.querySelector('input[name=email]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(validEmailField, 'registration@example.invalid'); validEmailField.dispatchEvent(new Event('input', { bubbles: true }));`);
  await evaluate(`for (const selector of ['input[name=new-password]', 'input[name=confirm-password]']) { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'A1!' + 'é'.repeat(35)); input.dispatchEvent(new Event('input', { bubbles: true })); }`);
  assert.equal(await evaluate('document.querySelectorAll(".password-requirements li[data-satisfied=true]").length'), 4);
  assert.equal(await evaluate('document.querySelector(".auth-submit").disabled'), true);
  assert.equal(await evaluate('document.querySelector(".password-feedback").textContent.includes("72 bytes")'), true);
  await evaluate(`for (const [selector, value] of [['input[name=new-password]', 'Fixture-register-password1!'], ['input[name=confirm-password]', 'Other-register-password1!']]) { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }`);
  assert.equal(await evaluate('document.querySelector(".auth-submit").disabled'), true);
  assert.equal(await evaluate('document.querySelector("#registration-password-match").textContent'), 'As senhas n\u00e3o coincidem.');
  await evaluate(`const confirmationField = document.querySelector('input[name=confirm-password]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(confirmationField, 'Fixture-register-password1!'); confirmationField.dispatchEvent(new Event('input', { bubbles: true }));`);
  assert.equal(await evaluate('document.querySelector(".auth-submit").disabled'), true);
  assert.equal(await evaluate('document.querySelector("#registration-feedback").textContent.toLowerCase().includes("aceite")'), true);
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
  await evaluate(`sessionStorage.setItem('jurissim_token', '${token}'); sessionStorage.setItem('jurissim_email_verificado', 'true');`);
  await evaluate("window.location.hash = ''");
  await until('!document.querySelector(".legal-page")');
  await evaluate("history.replaceState({}, '', '/desempenho')");
  await cdp('Page.reload');
  await until('!!document.querySelector(".app-legal-footer")');
  await until('!!document.querySelector(".v0-sidebar nav button")');
  await evaluate(`[...document.querySelectorAll('.v0-sidebar nav button')].find(button => button.textContent.includes('Config')).click()`);
  await until('!!document.querySelector(".v0-tabs")');
  await evaluate(`[...document.querySelectorAll('.v0-tabs button')].find(button => button.textContent.includes('Preferências')).click()`);
  await until("!!document.querySelector('#privacy-settings-title')");
  assert.equal(await evaluate(`document.querySelectorAll('#privacy-settings-title ~ .legal-links a[href="#/termos"], #privacy-settings-title ~ .legal-links a[href="#/privacidade"]').length`), 2);
  assert.equal(await evaluate(`document.querySelector('#privacy-settings-title').parentElement.textContent.includes('Em breve')`), false);
  for (const hash of ['#/termos', '#/privacidade']) {
    await evaluate(`document.querySelector('#privacy-settings-title').parentElement.querySelector('.legal-links a[href="${hash}"]').click()`);
    await until('!!document.querySelector(".legal-page")');
    await evaluate('document.querySelector(".legal-back").click()');
    await until('!document.querySelector(".legal-page")');
  }
  await evaluate(`[...document.querySelectorAll('.v0-sidebar nav button')].find(button => button.textContent.includes('Início')).click()`);
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
  await evaluate("sessionStorage.setItem('test_legacy_result_error', 'true')");
  await cdp('Page.navigate', { url: 'http://127.0.0.1:5179/dashboard' });
  await until('!!document.querySelector(".dashboard-page")');
  await until('document.querySelector(".dashboard-page").closest("main").querySelector("[role=alert]")?.textContent.includes("diagnóstico antigo está indisponível")');
  assert.equal(await evaluate('!!document.querySelector(".dashboard-page")'), true);
  await evaluate("sessionStorage.removeItem('test_legacy_result_error'); document.querySelector('.content > .study-notice button').click()");
  await until('!document.querySelector(".content > .study-notice[role=alert]")');
  assert.equal(await evaluate('document.querySelector(".dashboard-heading h1").textContent'), 'Seu espaço de estudos');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  await evaluate('document.querySelector(".dashboard-panel .text-button").click()');
  await until('location.pathname === "/desempenho" && document.querySelector("h1")?.textContent.includes("Dados ainda indisponíveis")');
  await evaluate('document.querySelector(".page .primary").click()');
  await until('location.pathname === "/dashboard" && !!document.querySelector(".dashboard-page")');
  await evaluate('document.querySelector(".dashboard-heading .primary").click()');
  await until('location.pathname === "/estudar" && !!document.querySelector(".study-trail-page")');
  await evaluate('document.querySelector(".study-questions-cta button").click()');
  await until('location.pathname === "/questoes" && !!document.querySelector(".practice-picker")');
  await evaluate(`document.querySelector('#practice-discipline').value = 'Direito Penal'; document.querySelector('#practice-discipline').dispatchEvent(new Event('change', { bubbles: true })); document.querySelectorAll('.practice-quantity input')[1].click()`);
  await until('document.querySelector("#practice-discipline").value === "Direito Penal" && document.querySelectorAll(".practice-quantity input")[1].checked');
  assert.equal(await evaluate('document.querySelector(".practice-picker .primary").disabled'), true);
  assert.match(await evaluate('document.querySelector(".practice-picker [role=status]").textContent'), /indisponível até a validação/i);
  await evaluate('history.pushState({}, "", "/simulados"); window.dispatchEvent(new PopStateEvent("popstate"))');
  await until('!!document.querySelector("#individual-exams-title") && !!document.querySelector(".class-section-heading")');
  await evaluate('history.pushState({}, "", "/questoes"); window.dispatchEvent(new PopStateEvent("popstate"))');
  await until('!!document.querySelector(".practice-picker")');
  await evaluate('history.pushState({}, "", "/diagnostico"); window.dispatchEvent(new PopStateEvent("popstate"))');
  await until('location.pathname === "/diagnostico" && !!document.querySelector(".start-card")');
  await evaluate(`window.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path === '/students/me/overview') return new Response(JSON.stringify({ totals: { completedActivities: 1, completedDiagnostics: 1, completedTrails: 0, totalQuestions: 1, answeredQuestions: 1, correctAnswers: 1, incorrectAnswers: 0, unansweredQuestions: 0 }, latestDiagnosticId: 'diagnostic1', evolution: [], recentActivities: [] }), { status: 200 });
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
  assert.equal(await evaluate('document.querySelector(".dashboard-stats article:nth-child(2) strong").textContent'), '1');
  await evaluate('document.querySelector(".dashboard-panel .text-button").click()');
  await until('document.querySelector(".result h1")?.textContent.includes("desempenho")');
  await evaluate('document.querySelector(".trail .primary").click()');
  await until('!!document.querySelector(".question input[type=radio]")');
  await evaluate('history.pushState({}, "", "/desempenho"); window.dispatchEvent(new PopStateEvent("popstate"))');
  await until('document.querySelector(".result h1")?.textContent.includes("desempenho")');
  await evaluate('history.back()');
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
  console.log('PASS: autofill separado; erro do resultado antigo não descarta o overview; rota e responsividade do Dashboard; navegação Dashboard -> desempenho -> Dashboard -> estudar.');
  // All auth calls are intercepted before app startup: no real delivery or DB writes.
  await cdp('Page.enable');
  const authStub = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.authRequests = { resend: 0, confirm: 0 };
    window.emailConfirmed = false;
    window.fetch = async (url, init = {}) => {
      const path = new URL(String(url)).pathname;
      if (path === '/auth/session') return new Response(JSON.stringify({ user: { id: 'fixture-user', nome: 'Fixture', email: 'fixture@example.invalid', role: 'ALUNO', emailVerificado: window.emailConfirmed }, nextStep: 'DASHBOARD' }), { status: 200 });
      if (path === '/auth/email-verification') {
        window.authRequests.resend++;
        window.resendAuthenticated = Boolean(init.headers.Authorization?.startsWith('Bearer '));
        return new Response(JSON.stringify({ message: window.authRequests.resend === 1 ? 'Envio indisponível.' : 'Confirmação enviada.' }), { status: window.authRequests.resend === 1 ? 503 : 202 });
      }
      if (path === '/auth/email-verification/confirm') {
        window.authRequests.confirm++;
        return new Response(JSON.stringify({ message: 'E-mail confirmado com sucesso!' }), { status: 200 });
      }
      throw new Error('Unexpected request in isolated auth test');
    };
  ` });
  await evaluate("sessionStorage.setItem('jurissim_email_verificado', 'false')");
  await cdp('Page.navigate', { url: 'http://127.0.0.1:5179/dashboard' });
  await until('document.querySelector("h1")?.textContent === "Confirme seu e-mail"');
  await evaluate('document.querySelector("button.primary").click()');
  await until('document.querySelector("small.error")?.textContent === "Envio indisponível."');
  assert.equal(await evaluate('!!document.querySelector(".dashboard-page")'), false);
  await evaluate('document.querySelector("button.primary").click()');
  await until('document.querySelector(".recovery-notice")?.textContent === "Confirmação enviada."');
  assert.equal(await evaluate('window.authRequests.resend'), 2);
  assert.equal(await evaluate('window.resendAuthenticated'), true);
  await evaluate('window.emailConfirmed = true; window.dispatchEvent(new Event("focus"))');
  await until('!!document.querySelector(".dashboard-page")');
  assert.equal(await evaluate("sessionStorage.getItem('jurissim_email_verificado')"), 'true');
  await cdp('Page.navigate', { url: `http://127.0.0.1:5179/?auth-reset=1#/reset-password?token=${resetTokenPreview}` });
  await until('document.querySelector("h2")?.textContent === "Defina uma nova senha"');
  await cdp('Page.navigate', { url: `http://127.0.0.1:5179/?auth-verify=1#/verificar-email?token=${'b'.repeat(64)}` });
  await until('document.querySelector(".recovery-notice")?.textContent === "E-mail confirmado com sucesso!"');
  assert.equal(await evaluate('window.authRequests.confirm'), 1);
  assert.equal(await evaluate('window.location.hash'), '');
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: authStub.identifier });
  console.log('PASS: reenvio autenticado, falha de envio mantém bloqueio, confirmação em outra aba atualiza sessão e links de confirmação/redefinição abrem com sessão ativa.');
} finally {
  socket?.close();
  browser.kill();
  vite.kill();
}
