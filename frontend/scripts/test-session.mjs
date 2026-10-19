import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:5181';
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-session-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5181', '--strictPort'], {
  windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:1', VITE_GOOGLE_CLIENT_ID: '' },
});
const browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
  '--use-fake-device-for-media-stream',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
let checks = 0;
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
  for (let i = 0; i < 80; i++) { if (await fetch(origin).then(r => r.ok).catch(() => false)) break; await sleep(100); }
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('Unable to connect to local Chrome debugger')), { once: true }); });
  let sequence = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const task = pending.get(message.id); pending.delete(message.id); clearTimeout(task.timer);
      if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
    }
    // Defense in depth: only Vite assets may actually use the network.
    if (message.method === 'Fetch.requestPaused') {
      const allowed = message.params.request.url.startsWith(origin + '/');
      void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
        requestId: message.params.requestId, ...(allowed ? {} : { errorReason: 'BlockedByClient' }),
      }, message.sessionId).catch(() => {});
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  await cdp('Page.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  const evaluate = async expression => {
    const source = /\bawait\b/.test(expression) ? `(async () => { ${expression} })()` : expression;
    const result = await cdp('Runtime.evaluate', { expression: source, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser test expression failed: ' + expression.slice(0, 160));
    return result.result.value;
  };
  const until = async expression => {
    for (let i = 0; i < 120; i++) { try { if (await evaluate(expression)) return; } catch {} await sleep(50); }
    throw new Error(`Condition failed: ${expression}`);
  };
  const replaceDocument = async (method, params) => {
    const marker = String(Math.random()); await evaluate(`window.testDocumentMarker = ${JSON.stringify(marker)}`);
    const result = await cdp(method, params);
    if (method === 'Page.reload' || result.loaderId) await until(`window.testDocumentMarker !== ${JSON.stringify(marker)} && document.readyState === 'complete'`);
  };
  const reloadDocument = () => replaceDocument('Page.reload');
  const navigateDocument = url => replaceDocument('Page.navigate', { url });
  const logout = async () => {
    const marker = String(Math.random()); await evaluate(`window.testDocumentMarker = ${JSON.stringify(marker)}`);
    await evaluate('document.querySelector(".v0-sidebar-bottom button").click()');
    await until(`window.testDocumentMarker !== ${JSON.stringify(marker)} && document.readyState === 'complete'`);
  };
  const user = (role = 'ALUNO', verified = true) => ({
    user: { id: 'fixture-user', nome: 'Nome do servidor', email: 'fixture@example.invalid', role, emailVerificado: verified },
    nextStep: role === 'ALUNO' ? 'DASHBOARD' : 'PROFESSOR',
  });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.fixture = JSON.parse(sessionStorage.getItem('test_fixture') || '{}');
    window.persistFixture = () => sessionStorage.setItem('test_fixture', JSON.stringify(window.fixture));
    window.apiCalls = [];
    window.fetch = async (url, init = {}) => {
      const route = new URL(String(url)).pathname;
      window.apiCalls.push({ route, method: init.method || 'GET', auth: init.headers?.Authorization });
      if (route === '/auth/session') {
        if (window.fixture.networkFailure) throw new Error('Simulated network failure');
        if (window.fixture.delaySession) return new Promise(resolve => { window.releaseSession = resolve; });
        return new Response(JSON.stringify(window.fixture.session || { message: 'Sessão inválida.' }), { status: window.fixture.sessionStatus || 200 });
      }
      if (route === '/auth/logout') {
        if (window.fixture.delayLogout) return new Promise(resolve => { window.releaseLogout = resolve; });
        if (window.fixture.logoutStatus) return new Response(JSON.stringify({ message: 'Servidor temporariamente indisponível.' }), { status: window.fixture.logoutStatus });
        return new Response(JSON.stringify({ message: 'Sessões encerradas.' }), { status: 200 });
      }
      if (window.fixture.delayResource) return new Promise(resolve => { window.releaseResource = resolve; });
      if (route.startsWith('/profile/photo')) {
        const reply = (value, status = 200) => new Response(JSON.stringify(value), { status });
        if (window.fixture.photoStatus) return reply({ message: 'Não foi possível atualizar a foto.' }, window.fixture.photoStatus);
        if (init.method === 'DELETE') window.fixture.photo = { kind: 'default' };
        if (route.endsWith('/avatar') && init.method === 'PUT') window.fixture.photo = { kind: 'avatar', avatarId: JSON.parse(init.body).avatarId, version: 'isolated-avatar-version' };
        if (route.endsWith('/image') && init.method === 'PUT') {
          window.fixture.uploadType = new Headers(init.headers).get('Content-Type'); window.fixture.uploadBytes = init.body.size;
          // The backend's real decoder is tested separately; this is only the UI contract.
          const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#305080'; ctx.fillRect(0, 0, 32, 32);
          window.fixture.photo = { kind: 'image', dataUrl: canvas.toDataURL('image/webp'), version: 'isolated-image-version' };
        }
        window.persistFixture(); return reply(window.fixture.photo || { kind: 'default' });
      }
      if (route.startsWith('/goals')) {
        const reply = (value, status = 200) => new Response(JSON.stringify(value), { status });
        if (window.fixture.goalStatus) return reply({ message: 'Metas temporariamente indisponíveis.' }, window.fixture.goalStatus);
        const goals = window.fixture.goals ||= [], body = init.body ? JSON.parse(init.body) : {};
        const update = goal => { if (!goal.completed) goal.resolvedQuestions = window.fixture.goalCount || 0; goal.canComplete = !goal.completed && goal.resolvedQuestions >= goal.targetQuestions; goal.progressPercentage = Math.min(100, Number((goal.resolvedQuestions / goal.targetQuestions * 100).toFixed(2))); return goal; };
        if (route === '/goals' && init.method === 'POST') {
          const goal = update({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ...body, completed: false, resolvedQuestions: 0 }); goals.push(goal); window.persistFixture(); return reply(goal, 201);
        }
        if (route === '/goals') {
          const status = new URL(String(url)).searchParams.get('status');
          return reply({ items: goals.map(update).filter(goal => !status || goal.completed === (status === 'completed')), page: 1, hasMore: false });
        }
        const goal = goals.find(item => item.id === route.split('/')[2]);
        if (!goal) return reply({ message: 'Meta indisponível para esta conta.' }, 404);
        if (route.endsWith('/complete')) { update(goal); if (!goal.canComplete && !goal.completed) return reply({ message: 'A quantidade de questões registrada ainda não atingiu esta meta.' }, 409); goal.completed = true; }
        else if (init.method === 'PATCH') Object.assign(goal, body);
        update(goal); window.persistFixture(); return reply(goal);
      }
      if (route.startsWith('/reports/')) {
        const reply = (value, status = 200) => new Response(JSON.stringify(value), { status });
        if (window.fixture.reportStatus) return reply({ message: 'Relatório indisponível para esta conta.' }, window.fixture.reportStatus);
        if (route === '/reports/classes') return reply({ items: window.fixture.reportClasses || [], page: 1, hasMore: false });
        const parts = route.split('/');
        const report = parts[4] === 'students' ? window.fixture.reportIndividuals?.[parts[3] + ':' + parts[5]] : window.fixture.reports?.[parts[3]];
        return reply(report || { message: 'Relatório indisponível para esta conta.' }, report ? 200 : 404);
      }
      if (route.startsWith('/turmas') || route.startsWith('/avaliacoes')) {
        const body = init.body ? JSON.parse(init.body) : {};
        const reply = (value, status = 200) => new Response(JSON.stringify(value), { status });
        const student = window.fixture.session.user.role === 'ALUNO';
        const classes = window.fixture.classData ||= [];
        const exams = window.fixture.exams ||= [];
        if (window.fixture.classStatus) return reply({ message: 'Recurso indisponível para esta conta.' }, window.fixture.classStatus);
        if (route === '/turmas/join') {
          if (body.code !== 'A'.repeat(32)) return reply({ message: 'Convite inválido.' }, 404);
          window.fixture.enrolled = true; window.persistFixture(); return reply({ joined: true, message: 'Matrícula realizada.' });
        }
        if (route === '/turmas/students' || /^\\/turmas\\/[^/]+\\/students$/.test(route)) return reply({ items: window.fixture.classMembers || [], page: 1, hasMore: false });
        if (route === '/turmas' && init.method === 'POST') {
          const turma = { id: '44444444-4444-4444-8444-444444444444', nome: body.nome, archivedAt: null, _count: { alunos: 0 } };
          classes.push(turma); window.persistFixture(); return reply({ turma, inviteCode: 'A'.repeat(32), expiresAt: '2026-10-24T12:00:00Z' }, 201);
        }
        if (route === '/turmas') return reply({ items: student && !window.fixture.enrolled ? [] : classes, page: 1, hasMore: false });
        if (route.startsWith('/turmas/')) {
          const turma = classes.find(item => item.id === route.split('/')[2]);
          if (route.endsWith('/invite')) return reply({ inviteCode: 'B'.repeat(32), expiresAt: '2026-10-24T12:00:00Z' });
          if (init.method === 'PATCH') { if (body.nome) turma.nome = body.nome; if (body.archived) turma.archivedAt = new Date().toISOString(); window.persistFixture(); return reply(turma); }
        }
        if (route === '/avaliacoes' && init.method === 'POST') {
          const exam = { ...body, id: '55555555-5555-4555-8555-555555555555', publishedAt: null, questoes: body.questaoIds.map((id, index) => ({ questaoId: id, posicao: index + 1 })), turmas: classes.filter(item => body.turmaIds.includes(item.id)), _count: { tentativas: 0, questoes: body.questaoIds.length } };
          exams.push(exam); window.persistFixture(); return reply(exam, 201);
        }
        if (route === '/avaliacoes') return reply({ items: student ? window.fixture.enrolled ? exams.filter(item => item.publishedAt).map(item => ({ ...item, tentativas: window.fixture.classAttempt ? [{ id: window.fixture.classAttempt.id, finalizadoEm: window.fixture.classAttempt.result ? new Date().toISOString() : null }] : [] })) : [] : exams, page: 1, hasMore: false });
        if (route.startsWith('/avaliacoes/attempts/')) {
          const attempt = window.fixture.classAttempt;
          if (!attempt || window.fixture.membershipDenied) return reply({ message: 'Tentativa indisponível.' }, 404);
          if (route.includes('/answers/')) {
            const q = attempt.questions.find(item => item.id === route.split('/')[5]);
            q.selectedOptionId = body.selectedOptionId; window.persistFixture(); return reply({ message: 'Resposta registrada.' });
          }
          if (route.endsWith('/finalize')) {
            attempt.status = 'COMPLETED'; attempt.result = { overallPercentage: 100, totalQuestions: 1, correctAnswers: 1, incorrectAnswers: 0, unansweredQuestions: 0 };
            window.persistFixture(); return reply(attempt.result);
          }
          return reply({ ...attempt, serverTime: new Date().toISOString() });
        }
        const exam = exams.find(item => item.id === route.split('/')[2]);
        if (route.endsWith('/publish')) { exam.publishedAt = new Date().toISOString(); window.persistFixture(); return reply(exam); }
        if (route.endsWith('/attempts')) {
          if (!window.fixture.enrolled || window.fixture.membershipDenied) return reply({ message: 'Simulado indisponível.' }, 404);
          window.fixture.classAttempt ||= { id: '66666666-6666-4666-8666-666666666666', titulo: exam.titulo, status: 'IN_PROGRESS', result: null, deadline: null, questions: window.fixture.questions.filter(q => exam.questaoIds.includes(q.id)).map(q => ({ id: q.id, statement: q.enunciado, discipline: q.disciplina, selectedOptionId: null, alternatives: q.alternativas.map(a => ({ id: a.id, text: a.texto })) })) };
          window.persistFixture(); return reply({ id: window.fixture.classAttempt.id });
        }
        if (init.method === 'PUT') { Object.assign(exam, body); window.persistFixture(); return reply(exam); }
      }
      if (route.startsWith('/students/me/')) {
        if (window.fixture.historyStatus) return new Response(JSON.stringify({ message: 'Histórico temporariamente indisponível.' }), { status: window.fixture.historyStatus });
        const empty = { totals: { completedActivities: 0, completedDiagnostics: 0, completedTrails: 0, totalQuestions: 0, answeredQuestions: 0, correctAnswers: 0, incorrectAnswers: 0, unansweredQuestions: 0 }, evolution: [], recentActivities: [], latestDiagnosticId: null };
        if (route === '/students/me/overview') return new Response(JSON.stringify(window.fixture.overview || empty), { status: 200 });
        const cursor = new URL(String(url)).searchParams.get('cursor') || 'first';
        return new Response(JSON.stringify(window.fixture.historyPages?.[cursor] || { items: [], nextCursor: null }), { status: 200 });
      }
      if (/^\\/diagnostics\\/[^/]+\\/result$/.test(route) || /^\\/trilhas\\/attempts\\/[^/]+\\/result$/.test(route)) {
        const value = window.fixture.results?.[route];
        return new Response(JSON.stringify(value || { message: 'Resultado não encontrado.' }), { status: value ? 200 : 404 });
      }
      if (route === '/auth/nome') {
        if (window.fixture.nameStatus) return new Response(JSON.stringify({ message: 'Falha controlada ao salvar nome.' }), { status: window.fixture.nameStatus });
        window.fixture.session.user.nome = JSON.parse(init.body).nome;
        sessionStorage.setItem('test_fixture', JSON.stringify(window.fixture));
        return new Response(JSON.stringify({ usuario: window.fixture.session.user }), { status: 200 });
      }
      if (route === '/auth/email-verification') return new Response(JSON.stringify({ message: 'Reenvio simulado.' }), { status: 202 });
      if (route === '/auth/login') {
        if (window.fixture.loginSuccess) return new Response(JSON.stringify({ token: 'local-login-fixture-token' }), { status: 200 });
        return new Response(JSON.stringify({ message: 'Credenciais inválidas.' }), { status: 401 });
      }
      if (route.startsWith('/questoes')) {
        if (window.fixture.resourceStatus) return new Response(JSON.stringify({ message: 'Acesso negado.' }), { status: window.fixture.resourceStatus });
        const items = window.fixture.questions ||= [];
        const id = route.split('/')[2];
        if (init.method === 'POST') {
          const item = { ...JSON.parse(init.body), id: 'created-fixture', autorId: window.fixture.session.user.id };
          items.push(item); return new Response(JSON.stringify(item), { status: 201 });
        }
        if (init.method === 'PUT') {
          const item = items.find(q => q.id === id); Object.assign(item, JSON.parse(init.body));
          return new Response(JSON.stringify(item), { status: 200 });
        }
        if (init.method === 'DELETE') { window.fixture.questions = items.filter(q => q.id !== id); return new Response(null, { status: 204 }); }
        return new Response(JSON.stringify(items), { status: 200 });
      }
      throw new Error('Unexpected isolated test request');
    };
  ` });
  await cdp('Page.navigate', { url: origin });
  await until('!!document.querySelector(".auth-card")');
  const boot = async (config, pathname = '/dashboard', claimedRole = 'ADMIN') => {
    const token = `test.${Buffer.from(JSON.stringify({ id: 'forged-id', role: claimedRole })).toString('base64url')}.test`;
    await evaluate(`sessionStorage.setItem('test_fixture', ${JSON.stringify(JSON.stringify(config))}); sessionStorage.setItem('jurissim_token', ${JSON.stringify(token)}); sessionStorage.setItem('jurissim_email_verificado', 'true'); sessionStorage.setItem('jurissim_user_name', 'Nome adulterado'); sessionStorage.setItem('unrelated-key', 'preserve');`);
    await navigateDocument(origin + pathname);
    await until('window.apiCalls?.some(call => call.route === "/auth/session")');
  };
  const pass = message => { checks++; console.log('PASS: ' + message); };

  await boot({ session: user() }, '/professor');
  await until('!!document.querySelector(".dashboard-page") && location.pathname === "/dashboard"');
  assert.equal(await evaluate('!!document.querySelector(".professor-shell")'), false);
  assert.equal(await evaluate('document.body.textContent.includes("Nome adulterado")'), false);
  assert.equal(await evaluate('document.querySelector(".dashboard-heading h1").textContent'), 'Seu espaço de estudos');
  pass('aluno usa sessão do servidor e mantém dashboard original mesmo com URL de professor e JWT de ADMIN');

  for (const role of ['PROFESSOR', 'ADMIN']) {
    await boot({ session: user(role) }, '/dashboard', 'ALUNO');
    await until('!!document.querySelector(".professor-shell") && location.pathname === "/professor"');
    pass(role + ' usa a área existente conforme perfil validado, independentemente do JWT');
  }
  await boot({ session: user('PROFESSOR') }, '/professor', 'ADMIN');
  await until('!!document.querySelector(".professor-shell")');
  await evaluate(`[...document.querySelectorAll('nav button')].find(b => b.textContent.includes('Cadastrar')).click()`);
  await until('!!document.querySelector(".question-form")');
  await evaluate(`
    for (const input of document.querySelectorAll('.question-form input:not([type]), .question-form textarea')) {
      const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, input.tagName === 'TEXTAREA' ? 'Texto da questão para teste isolado' : 'Fixture');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  `);
  await evaluate('document.querySelector(".form-actions .primary").click()');
  await until('!!document.querySelector(".question-card")');
  assert.equal(await evaluate('window.fixture.questions.length'), 1);
  await evaluate(`[...document.querySelectorAll('.question-card-actions button')].find(b => b.textContent.includes('Editar')).click()`);
  await until('!!document.querySelector(".question-form")');
  await evaluate(`const input = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Enunciado atualizado no teste isolado'); input.dispatchEvent(new Event('input', { bubbles: true }));`);
  await evaluate('document.querySelector(".form-actions .primary").click()');
  await until('document.querySelector(".question-card h3")?.textContent === "Enunciado atualizado no teste isolado"');
  await evaluate(`[...document.querySelectorAll('.question-card-actions button')].find(b => b.textContent.includes('Excluir')).click()`);
  await until('!!document.querySelector(".confirm-delete")');
  await evaluate(`[...document.querySelectorAll('.confirm-delete button')].find(b => b.textContent.toLowerCase().includes('excluir')).click()`);
  await until('window.fixture.questions.length === 0 && !document.querySelector(".question-card")');
  assert.deepEqual(await evaluate('window.apiCalls.filter(c => ["POST", "PUT", "DELETE"].includes(c.method)).map(c => c.method)'), ['POST', 'PUT', 'DELETE']);
  pass('CRUD original do professor cria, edita e exclui usando cliente autenticado, incluindo resposta 204');
  for (const role of ['ALUNO', 'PROFESSOR', 'ADMIN']) {
    await boot({ session: user(role, false) });
    await until('document.querySelector("h1")?.textContent === "Confirme seu e-mail"');
    assert.equal(await evaluate('window.apiCalls.some(call => call.route === "/questoes")'), false);
    await evaluate('document.querySelector("button.primary").click()');
    await until('document.querySelector(".recovery-notice")?.textContent === "Reenvio simulado."');
    await evaluate('window.fixture.session.user.emailVerificado = true; window.dispatchEvent(new Event("focus"))');
    await until(role === 'ALUNO' ? '!!document.querySelector(".dashboard-page")' : '!!document.querySelector(".professor-shell")');
    pass(role + ' pendente é bloqueado apesar do cache e reconhece confirmação após revalidar');
  }

  await boot({ sessionStatus: 401 });
  await until('!!document.querySelector(".auth-card") && !sessionStorage.getItem("jurissim_token")');
  assert.equal(await evaluate('sessionStorage.getItem("unrelated-key")'), 'preserve');
  pass('401 na sessão remove autenticação sem apagar dados alheios do navegador');

  await boot({ session: user(), networkFailure: true });
  await until('document.querySelector("[role=alert]")?.textContent.includes("conectar")');
  assert.equal(await evaluate('!!document.querySelector(".dashboard-page")'), false);
  await evaluate('window.fixture.networkFailure = false; [...document.querySelectorAll("button")].find(b => b.textContent === "Tentar novamente").click()');
  await until('!!document.querySelector(".dashboard-page")');
  pass('falha de rede não libera cache; nova tentativa restaura sessão validada');

  for (const logoutStatus of [200, 503]) {
    await boot({ session: user(), networkFailure: true, logoutStatus });
    await until('document.querySelector("[role=alert]")?.textContent.includes("conectar")');
    await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent === "Sair").click()');
    await until('!!document.querySelector(".auth-card") && !sessionStorage.getItem("jurissim_token")');
    assert.equal(await evaluate('window.apiCalls.filter(c => c.route === "/auth/logout" && c.method === "POST").length'), 1);
    assert.equal(await evaluate('sessionStorage.getItem("unrelated-key")'), 'preserve');
    assert.equal(await evaluate('!!sessionStorage.getItem("jurissim_logout_notice")'), logoutStatus === 503);
    if (logoutStatus === 503) assert.equal(await evaluate('document.body.textContent.includes("Não foi possível confirmar")'), true);
    pass('Sair na tela de erro tenta revogação e limpa sessão; resposta remota ' + logoutStatus);
  }

  await boot({ session: { ...user(), user: { ...user().user, role: 'INVALIDO' } } });
  await until('document.querySelector("[role=alert]")?.textContent.includes("validar")');
  assert.equal(await evaluate('!!document.querySelector(".professor-shell")'), false);
  pass('resposta de sessão inválida não escolhe permissões pelo cache');

  await boot({ session: user() });
  await until('!!document.querySelector(".dashboard-page")');
  await evaluate(`window.client = await import('/src/api.ts'); window.sessions = await import('/src/auth-session.ts'); window.fixture.resourceStatus = 403;`);
  const count = await evaluate('window.apiCalls.filter(call => call.route === "/auth/session").length');
  assert.equal(await evaluate(`window.client.apiRequest('/questoes').then(() => 0, error => error.status)`), 403);
  await until(`window.apiCalls.filter(call => call.route === '/auth/session').length > ${count}`);
  assert.equal(await evaluate('!!sessionStorage.getItem("jurissim_token")'), true);
  await until('!!document.querySelector(".dashboard-page")');
  pass('403 mantém sessão válida, propaga mensagem e reconsulta o perfil');

  await evaluate('window.fixture.resourceStatus = 401');
  assert.equal(await evaluate(`window.client.apiRequest('/questoes').then(() => 0, error => error.status)`), 401);
  await until('!!document.querySelector(".auth-card") && !sessionStorage.getItem("jurissim_token")');
  pass('401 de recurso protegido encerra a sessão centralmente');

  await boot({ session: user('ADMIN') });
  await until('!!document.querySelector(".professor-shell")');
  await evaluate(`window.client = await import('/src/api.ts'); window.fixture.session = ${JSON.stringify(user())}; window.fixture.resourceStatus = 403; await window.client.apiRequest('/questoes').catch(() => {});`);
  await until('!!document.querySelector(".dashboard-page") && !document.querySelector(".professor-shell")');
  pass('redução de perfil após 403 remove a área anterior sem novo login');

  await boot({ session: user() });
  await until('!!document.querySelector(".dashboard-page")');
  await evaluate(`window.sessions = await import('/src/auth-session.ts'); window.fixture.delaySession = true; window.oldSession = window.sessions.refreshSession().catch(() => null);`);
  await until('typeof window.releaseSession === "function"');
  await evaluate(`window.fixture.delaySession = false; window.fixture.session.user.nome = 'Nova sessão'; await window.sessions.establishSession('new-local-fixture-token'); window.releaseSession(new Response(JSON.stringify({ ...window.fixture.session, user: { ...window.fixture.session.user, role: 'ADMIN', nome: 'Resposta antiga' } }), { status: 200 })); await window.oldSession;`);
  assert.equal(await evaluate('sessionStorage.getItem("jurissim_token") === "new-local-fixture-token"'), true);
  assert.equal(await evaluate('sessionStorage.getItem("jurissim_user_name")'), 'Nova sessão');
  assert.equal(await evaluate('!!document.querySelector(".professor-shell")'), false);
  pass('resposta atrasada de sessão anterior não sobrescreve login novo');

  await evaluate(`window.client = await import('/src/api.ts'); window.fixture.delayResource = true; window.oldResource = window.client.apiRequest('/questoes').catch(() => null);`);
  await until('typeof window.releaseResource === "function"');
  await evaluate(`window.fixture.delayResource = false; await window.sessions.establishSession('newer-local-fixture-token'); window.releaseResource(new Response(JSON.stringify({ message: 'Sessão antiga' }), { status: 401 })); await window.oldResource;`);
  assert.equal(await evaluate('sessionStorage.getItem("jurissim_token") === "newer-local-fixture-token"'), true);
  await evaluate(`await window.client.apiRequest('/auth/login', { method: 'POST', body: '{}' }, { authenticated: false }).catch(() => {});`);
  assert.equal(await evaluate('sessionStorage.getItem("jurissim_token") === "newer-local-fixture-token"'), true);
  pass('401 atrasado e erro de credenciais públicas não encerram outra sessão válida');
  const go = async path => { await evaluate(`window.nav = await import('/src/navigation.ts'); window.nav.navigate(${JSON.stringify(path)});`); await until(`location.pathname === ${JSON.stringify(path)}`); };
  const clickText = async (selector, text) => {
    const expression = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(button => button.textContent.includes(${JSON.stringify(text)}))`;
    const marker = text === 'Sair' ? String(Math.random()) : undefined;
    if (marker) await evaluate(`window.testDocumentMarker = ${JSON.stringify(marker)}`);
    await until(`!!(${expression})`); await evaluate(`(${expression}).click()`);
    if (marker) await until(`window.testDocumentMarker !== ${JSON.stringify(marker)} && document.readyState === 'complete'`);
  };
  const setName = async name => evaluate(`const input = document.querySelector('#profile-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(name)}); input.dispatchEvent(new Event('input', { bubbles: true }));`);
  for (const role of ['ALUNO', 'PROFESSOR', 'ADMIN']) {
    const base = role === 'ALUNO' ? '' : '/professor';
    await boot({ session: user(role) }, base + '/perfil');
    await until('!!document.querySelector("#profile-name")');
    assert.equal(await evaluate('document.querySelector("#profile-name").value'), 'Nome do servidor');
    assert.equal(await evaluate('document.querySelector("#profile-email").value'), 'fixture@example.invalid');
    await setName('Nome atualizado ' + role);
    await evaluate('document.querySelector(".v0-panel form").requestSubmit()');
    await until('document.querySelector(".v0-panel [role=status]")?.textContent.includes("sucesso")');
    assert.equal(await evaluate('document.querySelector(".v0-user-trigger strong").textContent'), 'Nome atualizado ' + role);
    assert.equal(await evaluate('document.querySelector(".v0-sidebar-account strong").textContent'), 'Nome atualizado ' + role);
    assert.equal(await evaluate('window.apiCalls.filter(c => c.route === "/auth/nome" && c.method === "PUT").length'), 1);
    await until('document.querySelector(".v0-photo button")?.disabled === false');
    await go(base + '/configuracoes');
    await until('!!document.querySelector(".v0-theme-options")');
    for (const [text, dark] of [['Tema escuro', true], ['Tema claro', false]]) {
      await clickText('.v0-theme-options button', text);
      await until(`document.querySelector('.v0-app').classList.contains('v0-dark') === ${dark}`);
    }
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await clickText('.v0-theme-options button', 'Usar tema do sistema');
    await until('document.querySelector(".v0-app").classList.contains("v0-dark")');
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await until('!document.querySelector(".v0-app").classList.contains("v0-dark")');
    await reloadDocument();
    await until('document.querySelector(".v0-app")?.dataset.theme === "system"');
    await go(base + '/perfil');
    await until('!!document.querySelector("#profile-name")');
    assert.equal(await evaluate('document.querySelector("#profile-name").value'), 'Nome atualizado ' + role);
    await go(base + '/configuracoes');
    await evaluate('history.back()');
    await until('location.pathname.endsWith("/perfil") && !!document.querySelector("#profile-name")');
    await evaluate('history.forward()');
    await until('location.pathname.endsWith("/configuracoes") && !!document.querySelector(".v0-theme-options")');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate('document.querySelector(".v0-mobile-menu").click()');
    await until('document.querySelector(".v0-sidebar").classList.contains("v0-open")');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".v0-sidebar")).display'), 'flex');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await clickText('.v0-sidebar nav button', 'Meu perfil');
    await until('!!document.querySelector("#profile-name") && !document.querySelector(".v0-sidebar").classList.contains("v0-open")');
    await evaluate('document.querySelector(".v0-mobile-menu").click()');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await until('!document.querySelector(".v0-sidebar").classList.contains("v0-open")');
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Abrir menu');
    await evaluate('document.querySelector(".v0-user-trigger").click()');
    await until('!!document.querySelector(".v0-dropdown")');
    await clickText('.v0-dropdown button', 'Configurações');
    await until('location.pathname.endsWith("/configuracoes") && !document.querySelector(".v0-dropdown")');
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(profile, `mobile-${role}.png`), Buffer.from(shot.data, 'base64'));
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await clickText('.v0-menu-preference button', 'Recolher');
    await until('document.querySelector(".v0-app").classList.contains("v0-collapsed")');
    await clickText('.v0-menu-preference button', 'Expandir');
    await until('!document.querySelector(".v0-app").classList.contains("v0-collapsed")');
    await evaluate('document.querySelector(".v0-user-trigger").click()');
    await clickText('.v0-dropdown button', 'Sair');
    await until('!!document.querySelector(".auth-card") && !sessionStorage.getItem("jurissim_token")');
    await evaluate('history.back()');
    await until('!!document.querySelector(".auth-card")');
    assert.equal(await evaluate('!!document.querySelector(".v0-app")'), false);
    assert.equal(await evaluate('sessionStorage.getItem("unrelated-key")'), 'preserve');
    pass(role + ': perfil real, nome persistido, temas e sistema dinâmico, histórico, menu móvel/desktop e logout');
  }
  await boot({ session: user(), nameStatus: 500 }, '/perfil');
  await until('!!document.querySelector("#profile-name")');
  await setName('Nome não salvo');
  await evaluate('document.querySelector(".v0-panel form").requestSubmit()');
  await until('!!document.querySelector(".v0-panel [role=alert]")');
  assert.equal(await evaluate('document.querySelector(".v0-user-trigger strong").textContent'), 'Nome do servidor');
  assert.equal(await evaluate('!!document.querySelector(".v0-panel [role=status]")'), false);
  pass('erro ao salvar nome é exibido sem falso sucesso ou alteração da sessão');

  const otherQuestion = { id: 'other-question', autorId: 'other-user', enunciado: 'Questão pública de outro professor', disciplina: 'Direito Civil', assunto: 'Contratos', nivel: 'BASICO', publica: true, fundamentacaoJuridica: 'Fundamentação', alternativas: [{ id: 'a', texto: 'Alternativa', correta: true }] };
  await boot({ session: user('PROFESSOR'), questions: [otherQuestion] }, '/professor/questoes/other-question/editar');
  await until('document.querySelector(".v0-original h1")?.textContent.includes("indisponível para edição")');
  assert.equal(await evaluate('!!document.querySelector(".question-form")'), false);
  await go('/professor/questoes');
  await until('!!document.querySelector(".segmented")');
  await clickText('.segmented button', 'Banco completo');
  await until('!!document.querySelector(".question-card")');
  assert.equal(await evaluate('[...document.querySelectorAll(".question-card-actions button")].some(b => /Editar|Excluir/.test(b.textContent))'), false);
  await go('/professor/questoes/nova');
  await until('!!document.querySelector(".question-form")');
  await evaluate('history.back()');
  await until('location.pathname === "/professor/questoes" && !!document.querySelector(".segmented")');
  await clickText('.segmented button', 'Banco completo');
  await until('!!document.querySelector(".question-card")');
  await evaluate('history.forward()');
  await until('location.pathname.endsWith("/nova") && !!document.querySelector(".question-form")');
  await reloadDocument();
  await until('location.pathname.endsWith("/nova") && !!document.querySelector(".question-form")');
  pass('professor não edita questão alheia; CRUD mantém voltar/avançar e URL após recarregar');
  await boot({ session: user('ADMIN'), questions: [otherQuestion] }, '/professor/questoes/other-question/editar');
  await until('!!document.querySelector(".question-form")');
  pass('administrador mantém permissão existente de edição sem concedê-la ao professor');

  for (const [role, paths] of [['ALUNO', ['/metas']], ['PROFESSOR', ['/professor/relatorios', '/professor/desempenho']]]) {
    await boot({ session: user(role) }, paths[0]);
    await until('!!document.querySelector(".v0-app")');
    for (const route of paths) {
      await go(route);
      await until(role === 'ALUNO' ? '[...document.querySelectorAll(".goals-page h2")].some(h2 => h2.textContent === "Nenhuma meta encontrada")' : '!!document.querySelector(".report-class-selector") && document.querySelector(".report-class-selector").textContent.includes("Nenhuma turma")');
      assert.equal(await evaluate('document.querySelector(".v0-original").hidden'), false);
    }
    assert.equal(await evaluate('window.apiCalls.some(call => /goals|reports/.test(call.route))'), true);
    pass(role + ': metas/relatórios consultam API real e exibem estado vazio');
  }
  await boot({ session: user() });
  await until('!!document.querySelector(".dashboard-page")');
  await go('/questoes');
  await until('!!document.querySelector(".question-item") || document.querySelector(".heading h1")?.textContent.includes("Questões cadastradas")');
  await evaluate('history.back()');
  await until('location.pathname === "/dashboard" && !!document.querySelector(".dashboard-page")');
  await evaluate('history.forward()');
  await until('location.pathname === "/questoes" && !document.querySelector(".dashboard-page")');
  pass('banco do aluno usa endpoint real e volta/avança sem trocar permissões');

  for (const role of ['ALUNO', 'PROFESSOR']) {
    await boot({ session: user(role), loginSuccess: true });
    await until('!!document.querySelector(".v0-app")');
    await logout();
    await until('!!document.querySelector(".auth-card")');
    await evaluate(`for (const [selector, value] of [['input[name=email]', 'fixture@example.invalid'], ['input[autocomplete=current-password]', 'isolated-fixture-password']]) { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }`);
    await evaluate('document.querySelector(".auth-submit").click()');
    await until(role === 'ALUNO' ? 'location.pathname === "/dashboard" && !!document.querySelector(".dashboard-page")' : 'location.pathname === "/professor" && !!document.querySelector(".professor-shell")');
    pass(role + ': login oficial com API isolada redireciona pelo perfil validado');
  }
  for (const role of ['ALUNO', 'PROFESSOR']) {
    const base = role === 'ALUNO' ? '' : '/professor';
    await boot({ session: user(role) }, base + '/configuracoes');
    await until('!!document.querySelector(".v0-theme-options")');
    await clickText('.v0-theme-options button', 'Tema escuro');
    await go(role === 'ALUNO' ? '/dashboard' : '/professor/questoes/nova');
    await until(role === 'ALUNO' ? '!!document.querySelector(".dashboard-page")' : '!!document.querySelector(".question-form")');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".v0-original .content")).backgroundColor'), 'rgb(16, 24, 39)');
    for (const width of [1366, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(profile, `dark-original-${role}-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await go(base + '/configuracoes');
    await until('!!document.querySelector(".v0-theme-options")');
    await clickText('.v0-theme-options button', 'Tema claro');
    pass(role + ': página original em tema escuro sem overflow em desktop/celular');
  }
  const historyActivity = { id: '11111111-1111-4111-8111-111111111111', type: 'DIAGNOSTICO', startedAt: '2026-10-17T10:00:00.000Z', finalizedAt: '2026-10-17T10:10:00.000Z', totalQuestions: 10, answeredQuestions: 9, correctAnswers: 7, incorrectAnswers: 2, unansweredQuestions: 1, overallPercentage: 70 };
  const trailActivity = { ...historyActivity, id: '22222222-2222-4222-8222-222222222222', type: 'PERSONALIZADO', overallPercentage: 80, correctAnswers: 8, incorrectAnswers: 1 };
  const storedResult = { id: historyActivity.id, finalizedAt: historyActivity.finalizedAt, totalQuestions: 10, answeredQuestions: 9, correctAnswers: 7, incorrectAnswers: 2, unansweredQuestions: 1, overallPercentage: 70, level: 'INTERMEDIARIO', recommendation: 'Recomendação persistida de teste', performances: [{ tipo: 'DISCIPLINA', disciplina: 'Civil', percentual: 70 }], trail: { id: 'saved-trail', disciplinaPrioritaria: 'Civil', assuntoPrioritario: 'Contratos', nivelRecomendado: 'INTERMEDIARIO', quantidadeRecomendada: 10, justificativa: 'Fixture persistida', simuladoGeradoId: trailActivity.id } };
  const populated = {
    session: user(), loginSuccess: true,
    overview: { latestDiagnosticId: historyActivity.id, totals: { completedActivities: 2, completedDiagnostics: 1, completedTrails: 1, totalQuestions: 20, answeredQuestions: 18, correctAnswers: 15, incorrectAnswers: 3, unansweredQuestions: 2 }, evolution: [historyActivity], recentActivities: [trailActivity, historyActivity] },
    results: { [`/diagnostics/${historyActivity.id}/result`]: storedResult, [`/trilhas/attempts/${trailActivity.id}/result`]: { ...storedResult, id: trailActivity.id, overallPercentage: 80, correctAnswers: 8, trail: null } },
    historyPages: { first: { items: [trailActivity], nextCursor: 'second' }, second: { items: [historyActivity], nextCursor: null } },
  };
  await boot(populated);
  await until('document.querySelector(".dashboard-stats article:nth-child(2) strong")?.textContent === "70%"');
  assert.equal(await evaluate('document.querySelector(".dashboard-heading h1").textContent'), 'Seu espaço de estudos');
  assert.equal(await evaluate('document.querySelectorAll(".study-recent li").length'), 2);
  assert.equal(await evaluate('document.querySelector(".study-evolution strong").textContent'), '70%');
  const captureStudyPage = async name => {
    for (const width of [1366, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(profile, `history-${name}-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  };
  await captureStudyPage('dashboard');
  const overviewCalls = await evaluate('window.apiCalls.filter(call => call.route === "/students/me/overview").length');
  await go('/perfil'); await until('!!document.querySelector("#profile-name")');
  await go('/dashboard'); await until('!!document.querySelector(".dashboard-page")');
  assert.equal(await evaluate('window.apiCalls.filter(call => call.route === "/students/me/overview").length'), overviewCalls);
  await reloadDocument();
  await until('document.querySelector(".dashboard-stats article:nth-child(2) strong")?.textContent === "70%"');
  pass('dashboard original restaura último diagnóstico, evolução e atividade após recarga, sem refetch ao navegar pelo perfil');
  await go('/desempenho'); await until('!!document.querySelector(".study-indicators")');
  assert.equal(await evaluate('[...document.querySelectorAll(".study-indicators dl div")].find(item => item.querySelector("dt").textContent === "Respostas erradas").querySelector("dd").textContent'), '3');
  assert.equal(await evaluate('[...document.querySelectorAll(".study-indicators dl div")].find(item => item.querySelector("dt").textContent === "Não respondidas").querySelector("dd").textContent'), '2');
  await captureStudyPage('performance');
  pass('indicadores diferenciam erros e não respondidas sem criar evolução com um único diagnóstico');
  await go('/historico'); await until('!!document.querySelector(".study-history-list")');
  assert.equal(await evaluate('document.querySelector(".study-history-list h2").textContent'), 'Trilha de exercícios');
  await captureStudyPage('activities');
  await clickText('.study-pagination button', 'Próxima');
  await until('document.querySelector(".study-history-list h2")?.textContent === "Diagnóstico"');
  await clickText('.study-history-list button', 'Ver resultado');
  await until('document.querySelector(".study-result .score b")?.textContent === "70%"');
  assert.equal(await evaluate('document.querySelector(".study-result").textContent.includes("2 respostas erradas")'), true);
  await captureStudyPage('result');
  await reloadDocument();
  await until('document.querySelector(".study-result .score b")?.textContent === "70%"');
  await go(`/resultados/trilha/${trailActivity.id}`);
  await until('document.querySelector(".study-result .score b")?.textContent === "80%"');
  await evaluate('history.back()');
  await until('document.querySelector(".study-result .score b")?.textContent === "70%"');
  pass('histórico paginado e resultados persistidos de diagnóstico/trilha funcionam por URL, recarga e voltar');
  await logout(); await until('!!document.querySelector(".auth-card")');
  await evaluate(`for (const [selector, value] of [['input[name=email]', 'fixture@example.invalid'], ['input[autocomplete=current-password]', 'isolated-fixture-password']]) { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }`);
  await evaluate('document.querySelector(".auth-submit").click()');
  await until('document.querySelector(".dashboard-stats article:nth-child(2) strong")?.textContent === "70%"');
  pass('logout e novo login oficial recuperam histórico e último resultado pela API');
  await boot({ session: user() }); await until('!!document.querySelector(".dashboard-page") && !document.querySelector(".study-notice")');
  assert.equal(await evaluate('document.querySelectorAll(".study-recent li").length'), 0);
  assert.equal(await evaluate('document.querySelector(".dashboard-stats article:nth-child(2) strong").textContent'), '—');
  await go('/historico'); await until('document.querySelector(".study-history h2")?.textContent === "Nenhuma atividade registrada"');
  pass('outra conta vazia não herda dados da sessão anterior nem recebe pontuações artificiais');
  await boot({ session: user(), historyStatus: 503 });
  await until('document.querySelector(".study-notice[role=alert]")?.textContent.includes("temporariamente")');
  await evaluate('window.fixture.historyStatus = undefined');
  await clickText('.study-notice button', 'Tentar carregar');
  await until('!document.querySelector(".study-notice")');
  await go('/resultados/diagnostico/33333333-3333-4333-8333-333333333333');
  await until('document.querySelector(".study-result [role=alert]")?.textContent.includes("não encontrado")');
  assert.equal(await evaluate('!!document.querySelector(".study-result .score")'), false);
  pass('falhas de histórico e resultado indisponível têm erro explícito, retry e nenhuma pontuação falsa');
  const fill = async (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const bankQuestion = { ...otherQuestion, id: '77777777-7777-4777-8777-777777777777', autorId: 'fixture-user', enunciado: 'Questão autorizada para o simulado da turma', alternativas: [{ id: '88888888-8888-4888-8888-888888888888', texto: 'Alternativa correta registrada', correta: true }, { id: '99999999-9999-4999-8999-999999999999', texto: 'Outra alternativa', correta: false }] };
  await boot({ session: user('PROFESSOR'), questions: [bankQuestion], loginSuccess: true }, '/professor/turmas');
  await until('!!document.querySelector("input[name=class-name]")');
  await fill('input[name=class-name]', 'Turma criada no teste');
  await evaluate('document.querySelector(".class-form").requestSubmit()');
  await until('document.querySelector("#new-invite")?.value.length === 32');
  assert.equal(await evaluate('document.querySelector("#new-invite").readOnly'), true);
  await captureStudyPage('classes-teacher');
  await clickText('.class-invite button', 'Ocultar');
  await until('!document.querySelector("#new-invite")');
  await clickText('.class-list button', 'Editar turma');
  await fill('input[name=class-name]', 'Turma atualizada no teste');
  await evaluate('document.querySelector(".class-form").requestSubmit()');
  await until('document.querySelector(".class-list h2")?.textContent === "Turma atualizada no teste"');
  pass('professor cria e edita turma real pela API e o convite é exibido somente na ação explícita');
  await clickText('.class-list button', 'Ver alunos');
  await until('document.querySelector(".class-exams-page h2")?.textContent === "Nenhum aluno matriculado"');
  await evaluate('window.fixture.classMembers = [{ id: "student-fixture", nome: "Aluno matriculado de teste", email: "student@example.invalid" }]; window.persistFixture()');
  await reloadDocument();
  await until('document.querySelector(".class-students strong")?.textContent === "Aluno matriculado de teste"');
  await go('/professor/alunos');
  await until('!!document.querySelector(".class-students li")');
  pass('alunos matriculados e estado vazio usam a consulta de turmas autorizadas');
  await go('/professor/simulados');
  await until('!!document.querySelector(".class-exams-page>.primary")');
  await clickText('.class-exams-page>.primary', 'Criar simulado');
  await until('document.querySelectorAll(".exam-form fieldset input[type=checkbox]").length === 2');
  await fill('#exam-title', 'Simulado criado pelo professor');
  await fill('#exam-description', 'Descrição persistida pela API isolada');
  await fill('#exam-duration', '60');
  await evaluate('for (const input of document.querySelectorAll(".exam-form fieldset input[type=checkbox]")) input.click()');
  await captureStudyPage('exam-form');
  await evaluate('document.querySelector(".exam-form").requestSubmit()');
  await until('!!document.querySelector(".exam-card") && !document.querySelector(".exam-form")');
  await clickText('.exam-card button', 'Editar simulado');
  await until('!!document.querySelector("#exam-title")');
  await fill('#exam-title', 'Simulado atualizado pelo professor');
  await evaluate('document.querySelector(".exam-form").requestSubmit()');
  await until('document.querySelector(".exam-card h2")?.textContent === "Simulado atualizado pelo professor"');
  await clickText('.exam-card button', 'Publicar simulado');
  await until('[...document.querySelectorAll(".exam-card button")].find(b => b.textContent.includes("Editar")).disabled');
  assert.equal(await evaluate('window.fixture.exams[0].duracaoSegundos'), 3600);
  pass('rascunho configura título, descrição, quantidade, duração, questões e turmas; publicação bloqueia edição');
  const classFixture = await evaluate('window.fixture');
  await boot({ ...classFixture, session: user(), enrolled: false }, '/turmas');
  await until('!!document.querySelector("input[name=invite-code]")');
  await fill('input[name=invite-code]', 'A'.repeat(32));
  await evaluate('document.querySelector(".class-form").requestSubmit()');
  await until('!!document.querySelector(".class-list h2")');
  await go('/simulados');
  await until('!!document.querySelector(".exam-card")');
  await clickText('.exam-card .primary', 'Realizar');
  await until('!!document.querySelector(".exam-question input[type=radio]")');
  await evaluate('document.querySelector(".exam-question input[type=radio]").click()');
  await until('document.querySelector(".exam-question input[type=radio]").checked && !document.querySelector(".exam-question input[type=radio]").disabled');
  await reloadDocument();
  await until('!!document.querySelector(".exam-question input[type=radio]:checked")');
  await captureStudyPage('exam-attempt');
  await clickText('.exam-attempt>.primary', 'Finalizar');
  await until('document.querySelector(".exam-result strong")?.textContent === "100%"');
  await reloadDocument();
  await until('document.querySelector(".exam-result strong")?.textContent === "100%"');
  assert.equal(await evaluate('[...document.querySelectorAll(".exam-question input")].every(input => input.disabled)'), true);
  pass('aluno ingressa, realiza simulado e recupera resposta/resultado após recarga; finalizado permanece bloqueado');
  const completedFixture = await evaluate('window.fixture');
  completedFixture.classAttempt = { ...completedFixture.classAttempt, result: null, status: 'EXPIRED', deadline: '2020-01-01T00:00:00Z' };
  await boot(completedFixture, '/simulados/tentativas/' + completedFixture.classAttempt.id);
  await until('document.querySelector(".exam-attempt [role=status]")?.textContent.includes("Tempo encerrado")');
  assert.equal(await evaluate('[...document.querySelectorAll(".exam-question input")].every(input => input.disabled)'), true);
  pass('tempo encerrado bloqueia edição na interface e oferece finalização');
  await boot({ ...classFixture, session: user(), membershipDenied: true, enrolled: true, classStatus: 404 }, '/simulados/tentativas/66666666-6666-4666-8666-666666666666');
  await until('document.querySelector(".exam-attempt [role=alert]")?.textContent.includes("indisponível")');
  assert.equal(await evaluate('!!document.querySelector(".exam-question")'), false);
  pass('tentativa indisponível exibe erro sem revelar questões ou resultados');
  await boot({ ...classFixture, session: user('PROFESSOR') }, '/professor/turmas');
  await until('!!document.querySelector(".class-list")');
  await clickText('.class-list button', 'Arquivar turma');
  await until('!!document.querySelector(".class-confirm")');
  await clickText('.class-confirm button', 'Confirmar');
  await until('document.querySelector(".class-list .muted")?.textContent.includes("Arquivada")');
  assert.equal(await evaluate('[...document.querySelectorAll(".class-list button")].some(b => b.textContent.includes("Editar turma"))'), false);
  pass('arquivamento explícito preserva a turma e remove ações de edição/convite');
  await boot({ session: user(), goalCount: 2, loginSuccess: true }, '/metas');
  await until('!!document.querySelector("#goal-target")');
  await fill('#goal-date', '2026-10-17'); await fill('#goal-target', '10');
  await evaluate('document.querySelector(".goal-form").requestSubmit()');
  await until('document.querySelector(".goal-ring strong")?.textContent === "20%"');
  assert.equal(await evaluate('[...document.querySelectorAll(".goal-card button")].find(b => b.textContent.includes("Concluir")).disabled'), true);
  await clickText('.goal-card button', 'Editar meta'); await fill('#goal-target', '3');
  await evaluate('document.querySelector(".goal-form").requestSubmit()');
  await until('document.querySelector(".goal-ring strong")?.textContent === "66.67%"');
  pass('aluno cria e edita meta com progresso real da API e não conclui abaixo da quantidade');
  await evaluate('window.fixture.goalCount = 3; window.persistFixture()');
  await reloadDocument();
  await until('document.querySelector(".goal-ring strong")?.textContent === "100%"');
  await clickText('.goal-card button', 'Concluir meta');
  await until('document.querySelector(".goal-card .gold")?.textContent === "CONCLUÍDA"');
  assert.equal(await evaluate('document.querySelectorAll(".goal-card button").length'), 0);
  await captureStudyPage('goals-completed');
  await reloadDocument();
  await until('document.querySelector(".goal-card .gold")?.textContent === "CONCLUÍDA"');
  await clickText('.goals-page .v0-tabs button', 'Pendentes');
  await until('[...document.querySelectorAll(".goals-page h2")].some(h2 => h2.textContent === "Nenhuma meta encontrada")');
  await clickText('.goals-page .v0-tabs button', 'Concluídas');
  await until('!!document.querySelector(".goal-card")');
  pass('conclusão e filtros de metas persistem após recarga, com quantidade verificada');
  await logout();
  await until('!!document.querySelector(".auth-card")');
  await fill('input[name=email]', 'fixture@example.invalid'); await fill('input[autocomplete=current-password]', 'isolated-fixture-password');
  await evaluate('document.querySelector(".auth-submit").click()');
  await until('!!document.querySelector(".dashboard-page")');
  await go('/metas'); await until('document.querySelector(".goal-card .gold")?.textContent === "CONCLUÍDA"');
  pass('novo login oficial recupera metas sem depender do estado em memória');

  const reportClassId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', reportStudentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const reportClass = { id: reportClassId, nome: 'Turma autorizada de teste', archivedAt: null };
  const reportSummary = { enrolledStudents: 2, publishedExams: 2, participants: 2, startedAttempts: 4, completedAttempts: 3, inProgressAttempts: 1, expiredAttempts: 0, participationPercentage: 100, meanPercentage: 50, meanIncorrectPercentage: 16.67, meanUnansweredPercentage: 33.33, meanCorrectAnswers: 1, meanIncorrectAnswers: 0.33, correctAnswers: 3, incorrectAnswers: 1, unansweredQuestions: 2 };
  const examReports = [
    { id: 'exam-one', title: 'Primeiro simulado da turma', publishedAt: '2026-10-15T12:00:00Z', started: 2, completed: 2, inProgress: 0, expired: 0, meanPercentage: 25, meanIncorrectPercentage: 25, meanUnansweredPercentage: 50, meanCorrectAnswers: 0.5, meanIncorrectAnswers: 0.5 },
    { id: 'exam-two', title: 'Segundo simulado da turma', publishedAt: '2026-10-16T12:00:00Z', started: 2, completed: 1, inProgress: 1, expired: 0, meanPercentage: 100, meanIncorrectPercentage: 0, meanUnansweredPercentage: 0, meanCorrectAnswers: 2, meanIncorrectAnswers: 0 },
  ];
  const classReport = { turma: reportClass, summary: reportSummary, exams: { items: examReports, page: 1, hasMore: false }, students: { items: [{ id: reportStudentId, name: 'Aluno autorizado de teste', started: 2, completed: 2, meanPercentage: 75 }], page: 1, hasMore: false }, evolution: examReports };
  const individualReport = { turma: reportClass, student: { id: reportStudentId, nome: 'Aluno autorizado de teste' }, summary: { ...reportSummary, enrolledStudents: 1, participants: 1, startedAttempts: 2, completedAttempts: 2, inProgressAttempts: 0, meanPercentage: 75, meanIncorrectPercentage: 25, meanUnansweredPercentage: 0, meanCorrectAnswers: 1.5, meanIncorrectAnswers: 0.5, correctAnswers: 3, incorrectAnswers: 1, unansweredQuestions: 0 }, evolution: examReports.map((exam, i) => ({ ...exam, meanPercentage: i ? 100 : 50 })), attempts: { items: examReports.map((exam, i) => ({ id: exam.id, examId: exam.id, title: exam.title, startedAt: exam.publishedAt, finalizedAt: exam.publishedAt, status: 'COMPLETED', percentage: i ? 100 : 50, correctAnswers: i ? 2 : 1, incorrectAnswers: i ? 0 : 1, unansweredQuestions: 0 })), page: 1, hasMore: false } };
  const reportFixture = { session: user('PROFESSOR'), reportClasses: [reportClass], reports: { [reportClassId]: classReport }, reportIndividuals: { [reportClassId + ':' + reportStudentId]: individualReport } };
  await boot(reportFixture, '/professor/relatorios');
  await until('!!document.querySelector(".report-class-buttons button")');
  await clickText('.report-class-buttons button', 'Turma autorizada');
  await until('!!document.querySelector(".class-report-content .report-metrics")');
  assert.equal(await evaluate('document.querySelectorAll(".report-chart circle").length'), 2);
  assert.equal(await evaluate('document.querySelectorAll(".report-exam").length'), 2);
  assert.equal(await evaluate('document.querySelector(".report-details").textContent.includes("16.67%")'), true);
  await captureStudyPage('teacher-report');
  assert.equal(await evaluate('document.querySelector(".v0-sidebar button[aria-current=page]")?.textContent.includes("Relatórios")'), true);
  const captureReportChart = async name => {
    for (const width of [1366, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 760 });
      await evaluate('document.querySelector(".report-chart").closest(".panel").scrollIntoView({ block: "center" })');
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(profile, `report-chart-${name}-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate('scrollTo(0, 0)');
  };
  await captureReportChart('light');
  assert.equal(await evaluate('document.querySelector(".report-chart circle").getAttribute("tabindex")'), '0');
  await go('/professor/configuracoes'); await until('!!document.querySelector(".v0-theme-options")');
  await clickText('.v0-theme-options button', 'Tema escuro');
  await go('/professor/relatorios/turmas/' + reportClassId); await until('!!document.querySelector(".report-chart circle")');
  await captureReportChart('dark');
  await go('/professor/configuracoes'); await until('!!document.querySelector(".v0-theme-options")');
  await clickText('.v0-theme-options button', 'Tema claro');
  await go('/professor/desempenho/turmas/' + reportClassId);
  await until('document.querySelector(".teacher-reports h1")?.textContent === "Desempenho por turma" && !!document.querySelector(".report-metrics")');
  assert.equal(await evaluate('document.querySelector(".v0-sidebar button[aria-current=page]")?.textContent.includes("Desempenho")'), true);
  await reloadDocument(); await until('document.querySelectorAll(".report-chart circle").length === 2');
  pass('relatórios/desempenho usam participação, médias e evolução da API com gráficos responsivos e recarga por URL');
  await clickText('.report-students button', 'Consultar aluno');
  await until('document.querySelector(".individual-report h1")?.textContent === "Aluno autorizado de teste"');
  assert.equal(await evaluate('document.querySelectorAll(".report-attempts li").length'), 2);
  await captureStudyPage('teacher-individual');
  await evaluate('history.back()');
  await until('!!document.querySelector(".teacher-reports") && !!document.querySelector(".report-metrics")');
  await go('/professor/relatorios/turmas/dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  await until('document.querySelector(".class-report-content [role=alert]")?.textContent.includes("indisponível")');
  assert.equal(await evaluate('document.querySelectorAll(".report-metrics").length'), 0);
  pass('consulta individual mantém o escopo da turma e navegar para turma não autorizada remove os resultados anteriores');
  const emptySummary = { ...reportSummary, enrolledStudents: 0, publishedExams: 0, participants: 0, startedAttempts: 0, completedAttempts: 0, inProgressAttempts: 0, expiredAttempts: 0, participationPercentage: null, meanPercentage: null, meanIncorrectPercentage: null, meanUnansweredPercentage: null, meanCorrectAnswers: null, meanIncorrectAnswers: null, correctAnswers: 0, incorrectAnswers: 0, unansweredQuestions: 0 };
  await boot({ ...reportFixture, reports: { [reportClassId]: { ...classReport, summary: emptySummary, evolution: [], exams: { items: [], page: 1, hasMore: false }, students: { items: [], page: 1, hasMore: false } } } }, '/professor/relatorios/turmas/' + reportClassId);
  await until('!!document.querySelector(".report-chart-empty")');
  assert.equal(await evaluate('document.querySelector(".report-details").textContent.includes("Sem resultado")'), true);
  assert.equal(await evaluate('document.querySelectorAll(".report-chart circle").length'), 0);
  await captureStudyPage('teacher-report-empty');
  pass('turma sem atividades mostra médias ausentes e gráfico vazio, sem estatísticas inventadas');
  await boot({ session: user(), goalStatus: 503 }, '/metas');
  await until('document.querySelector(".goals-page [role=alert]")?.textContent.includes("temporariamente")');
  await evaluate('window.fixture.goalStatus = undefined');
  await clickText('.goals-page [role=alert] button', 'Tentar novamente');
  await until('[...document.querySelectorAll(".goals-page h2")].some(h2 => h2.textContent === "Nenhuma meta encontrada")');
  pass('falha de metas é explícita e nova tentativa recupera o estado sem expor dados de outra sessão');
  const openPhoto = async () => { await until('document.querySelector(".v0-photo button")?.disabled === false'); await clickText('.v0-photo button', 'Alterar foto'); await until('!!document.querySelector(".photo-editor")'); };
  const photoWrites = () => evaluate('window.apiCalls.filter(c => c.route.startsWith("/profile/photo") && c.method !== "GET").length');
  const choosePhotoFile = async (mime = 'image/png', size) => evaluate(`
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 40; canvas.getContext('2d').fillRect(0, 0, 40, 40);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const photoFile = new File([${size ? `new Uint8Array(${size})` : 'blob'}], 'fixture-image', { type: ${JSON.stringify(mime)} });
    const dt = new DataTransfer(); dt.items.add(photoFile); const input = document.querySelector('.photo-upload input'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  `);
  for (const role of ['ALUNO', 'PROFESSOR']) {
    const path = role === 'ALUNO' ? '/perfil' : '/professor/perfil';
    await boot({ session: user(role), loginSuccess: true }, path); await openPhoto();
    assert.equal(await evaluate('document.querySelectorAll(".photo-gallery button").length'), 9);
    await clickText('.photo-gallery button', 'Balança da justiça');
    assert.equal(await photoWrites(), 0);
    await clickText('.photo-confirm button', 'Cancelar');
    assert.equal(await evaluate('!!document.querySelector(".v0-user-trigger img")'), false);
    await openPhoto(); await clickText('.photo-gallery button', 'Balança da justiça');
    await clickText('.photo-confirm button', 'Salvar foto');
    await until('document.querySelector(".v0-user-trigger img")?.getAttribute("src") === "/avatars/justice.svg"');
    assert.equal(await evaluate('document.querySelector(".v0-sidebar-account img").getAttribute("src")'), '/avatars/justice.svg');
    assert.equal(await evaluate('document.querySelector(".v0-photo img").getAttribute("src")'), '/avatars/justice.svg');
    await reloadDocument(); await until('document.querySelector(".v0-photo img")?.getAttribute("src") === "/avatars/justice.svg"');
    await logout(); await until('!!document.querySelector(".auth-card")');
    await fill('input[name=email]', 'fixture@example.invalid'); await fill('input[autocomplete=current-password]', 'isolated-fixture-password');
    await evaluate('document.querySelector(".auth-submit").click()'); await until(role === 'ALUNO' ? '!!document.querySelector(".dashboard-page")' : '!!document.querySelector(".professor-shell")');
    await go(path); await until('document.querySelector(".v0-photo img")?.getAttribute("src") === "/avatars/justice.svg"');
    pass(`avatar de ${role}: confirmação/cancelamento, identidade compartilhada, recarga e novo login oficial`);
    await openPhoto(); await choosePhotoFile(); await until('!!document.querySelector(".photo-preview>img")');
    assert.equal(await photoWrites(), 0);
    await clickText('.photo-confirm button', 'Salvar foto'); await until('document.querySelector(".v0-user-trigger img")?.getAttribute("src").startsWith("data:image/webp;base64,")');
    assert.equal(await evaluate('window.fixture.uploadType'), 'image/png'); assert.equal(await evaluate('window.fixture.uploadBytes > 0'), true);
    await openPhoto(); await clickText('.photo-source-actions button', 'Remover foto'); assert.equal(await photoWrites(), 1);
    await clickText('.photo-confirm button', 'Salvar foto'); await until('!document.querySelector(".photo-editor") && !document.querySelector(".v0-user-trigger img")');
    await reloadDocument(); await until('!!document.querySelector(".v0-photo button") && !document.querySelector(".v0-photo button").disabled');
    assert.equal(await evaluate('!!document.querySelector(".v0-user-trigger img")'), false);
    pass(`upload binário, prévia e remoção persistida de ${role} usam o contrato real sem alterar o nome`);
  }
  await boot({ session: user() }, '/perfil'); await openPhoto();
  await choosePhotoFile('image/svg+xml'); await until('document.querySelector(".photo-editor [role=alert]")?.textContent.includes("JPEG")');
  await choosePhotoFile('image/png', 5242881); await until('document.querySelector(".photo-editor [role=alert]")?.textContent.includes("5 MB")');
  assert.equal(await photoWrites(), 0);
  await choosePhotoFile(); await until('!!document.querySelector(".photo-preview>img")'); await evaluate('window.fixture.photoStatus = 413');
  await clickText('.photo-confirm button', 'Salvar foto'); await until('document.querySelector(".photo-editor [role=alert]")?.textContent.includes("atualizar")');
  assert.equal(await evaluate('!!document.querySelector(".v0-user-trigger img")'), false);
  await evaluate('window.fixture.photoStatus = undefined'); await clickText('.photo-confirm button', 'Salvar foto'); await until('!document.querySelector(".photo-editor")');
  pass('formatos e limites inválidos não enviam arquivo; falha do backend mantém foto anterior e permite nova tentativa');

  await cdp('Browser.setPermission', { permission: { name: 'camera' }, setting: 'denied', origin });
  await openPhoto(); await clickText('.photo-source-actions button', 'Usar câmera');
  await until('document.querySelector(".photo-editor [role=alert]")?.textContent.includes("negada")');
  assert.equal(await evaluate('!!document.querySelector("video")'), false);
  pass('permissão de câmera negada no navegador oferece alternativa de upload sem gravar ou enviar');
  await cdp('Browser.setPermission', { permission: { name: 'camera' }, setting: 'granted', origin });
  await evaluate('window.realMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async constraints => { window.cameraCalls = (window.cameraCalls || 0) + 1; window.cameraStream = await window.realMedia(constraints); return window.cameraStream; }');
  const previousWrites = await photoWrites();
  await clickText('.photo-source-actions button', 'Usar câmera'); await until('document.querySelector("video")?.videoWidth > 0');
  assert.equal(await evaluate('window.cameraStream.getAudioTracks().length'), 0);
  await evaluate('document.querySelector(".photo-camera").scrollIntoView({ block: "center" })');
  const cameraShot = await cdp('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(profile, 'photo-camera-simulated.png'), Buffer.from(cameraShot.data, 'base64'));
  await clickText('.photo-camera button', 'Capturar foto'); await until('!!document.querySelector(".photo-preview>img") && !document.querySelector("video")');
  assert.equal(await evaluate('window.cameraStream.getTracks().every(track => track.readyState === "ended")'), true); assert.equal(await photoWrites(), previousWrites);
  await clickText('.photo-preview button', 'Repetir'); await until('document.querySelector("video")?.videoWidth > 0');
  await clickText('.photo-camera button', 'Capturar foto'); await until('!!document.querySelector(".photo-preview>img")');
  await clickText('.photo-confirm button', 'Salvar foto'); await until('!document.querySelector(".photo-editor")');
  assert.equal(await photoWrites(), previousWrites + 1);
  pass('câmera simulada: inicia somente por ação, captura/repetição local, encerra trilhas e só envia ao confirmar');
  await openPhoto(); await clickText('.photo-source-actions button', 'Usar câmera'); await until('document.querySelector("video")?.videoWidth > 0');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await until('!document.querySelector(".photo-editor")');
  assert.equal(await evaluate('window.cameraStream.getTracks().every(track => track.readyState === "ended")'), true);
  assert.equal(await evaluate('document.activeElement.textContent'), 'Alterar foto');
  await openPhoto(); await clickText('.photo-source-actions button', 'Usar câmera'); await until('document.querySelector("video")?.videoWidth > 0');
  await go('/dashboard'); await until('!document.querySelector(".photo-editor")');
  assert.equal(await evaluate('window.cameraStream.getTracks().every(track => track.readyState === "ended")'), true);
  pass('Escape devolve foco e fecha câmera; navegar para fora do perfil libera todos os recursos');
  await go('/perfil'); await openPhoto();
  await evaluate('navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.resolveLateCamera = resolve; })');
  await clickText('.photo-source-actions button', 'Usar câmera'); await until('typeof window.resolveLateCamera === "function"');
  await clickText('.photo-confirm button', 'Cancelar');
  await evaluate('window.lateStream = await window.realMedia({ video: true, audio: false }); window.resolveLateCamera(window.lateStream);');
  await until('window.lateStream.getTracks().every(track => track.readyState === "ended")');
  pass('resposta tardia de permissão após cancelar não reabre a interface e encerra a câmera');
  await openPhoto();
  await evaluate('navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("No device", "NotFoundError"); }');
  await clickText('.photo-source-actions button', 'Usar câmera'); await until('document.querySelector(".photo-editor [role=alert]")?.textContent.includes("Nenhuma câmera")');
  await evaluate('navigator.mediaDevices.getUserMedia = undefined');
  await clickText('.photo-source-actions button', 'Usar câmera'); await until('document.querySelector(".photo-editor [role=alert]")?.textContent.includes("HTTPS")');
  pass('câmera ausente e API incompatível exibem mensagens específicas');
  await evaluate('navigator.mediaDevices.getUserMedia = window.realMedia');
  await clickText('.photo-confirm button', 'Cancelar');
  for (const [theme, label] of [['light', 'Tema claro'], ['dark', 'Tema escuro']]) {
    await go('/configuracoes'); await until('!!document.querySelector(".v0-theme-options")'); await clickText('.v0-theme-options button', label);
    await go('/perfil'); await openPhoto();
    await clickText('.photo-gallery button', 'Estudante de cabelo ruivo');
    for (const width of [1366, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 760 });
      await evaluate('document.querySelector(".photo-editor").scrollIntoView({ block: "start" })');
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      const shot = await cdp('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(profile, `photo-editor-${theme}-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await clickText('.photo-confirm button', 'Cancelar');
  }
  pass('galeria e prévia responsivas em desktop/celular e claro/escuro sem overflow');
  await boot({ session: user(), photoStatus: 503 }, '/perfil'); await until('document.querySelector(".profile-photo-feature [role=alert]")?.textContent.includes("atualizar")');
  await evaluate('window.fixture.photoStatus = undefined'); await clickText('.profile-photo-feature [role=alert] button', 'Tentar novamente'); await openPhoto();
  assert.equal(await evaluate('document.querySelector(".photo-gallery button").getAttribute("aria-pressed")'), 'true');
  pass('consulta de foto indisponível tem erro e recuperação; conta sem foto usa avatar padrão');
  await boot({ session: user(), logoutStatus: 503 }, '/perfil'); await until('!!document.querySelector(".v0-sidebar-bottom button")'); await logout();
  await until('document.querySelector(".recovery-notice")?.textContent.includes("Não foi possível confirmar")');
  assert.equal(await evaluate('sessionStorage.getItem("jurissim_token")'), null);
  pass('logout remoto indisponível limpa o navegador e informa que a revogação no servidor não foi confirmada');
  await boot({ session: user(), delayLogout: true }); await until('!!document.querySelector(".v0-app")');
  await evaluate('window.sessionModule = await import("/src/auth-session.ts"); window.logoutPromise = window.sessionModule.logoutSession();'); await until('typeof window.releaseLogout === "function"');
  const replacementSession = user('PROFESSOR'); replacementSession.user.id = 'replacement-fixture-user';
  await evaluate(`window.fixture.session = ${JSON.stringify(replacementSession)}; window.persistFixture(); await window.sessionModule.establishSession('replacement-session-fixture');`);
  await evaluate('window.releaseLogout(new Response(JSON.stringify({ message: "Encerrada" }), { status: 200 })); await window.logoutPromise;');
  assert.equal(await evaluate('sessionStorage.getItem("jurissim_token")'), 'replacement-session-fixture');
  await until('!!document.querySelector(".professor-shell")');
  pass('resposta atrasada de logout não encerra nem redireciona a sessão de outra conta');
  await navigateDocument(origin + '/#/verificar-email'); await until('document.querySelector("[role=alert]")?.textContent.includes("incompleto")');
  assert.equal(await evaluate('location.hash'), ''); assert.equal(await evaluate('window.apiCalls.some(call => call.route === "/auth/email-verification/confirm")'), false);
  pass('link de confirmação incompleto tem erro acessível sem publicar token ou tentar confirmação vazia');
  console.log(`Sessão/integração: ${checks} cenários aprovados. API e serviços externos isolados. Capturas: ${profile}`);
} finally {
  socket?.close(); browser.kill(); vite.kill();
}
