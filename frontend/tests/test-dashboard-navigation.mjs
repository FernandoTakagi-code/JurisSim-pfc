import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:5188';
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-dashboard-navigation-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--configLoader', 'runner', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], {
  windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:1', VITE_GOOGLE_CLIENT_ID: '', VITE_INITIAL_DIAGNOSTIC_UI_ENABLED: 'false', VITE_QUESTION_PRACTICE_UI_ENABLED: 'false' },
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
    if (message.method === 'Runtime.exceptionThrown') console.error('BROWSER_EXCEPTION', JSON.stringify(message.params));

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
  await cdp('Runtime.enable'); await cdp('Log.enable');
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
      window.apiCalls.push({ route, method: init.method || 'GET', auth: init.headers?.Authorization, institution: init.headers?.['X-Institution-Id'] });
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

      if (route.startsWith('/question-practice/catalog/')) return new Response(JSON.stringify({topics:[]}),{status:200});
      if (route.startsWith('/trilhas/') && route.endsWith('/gerar')) {
        const recommendation = route.split('/')[2];
        if (window.fixture.generationError) return new Response(JSON.stringify({message:'Isolated question inventory unavailable'}),{status:409});
        return new Response(JSON.stringify({id: recommendation === 'completed-recommendation' ? 'completed-attempt' : 'active-attempt'}),{status:201});
      }
      if (route.startsWith('/trilhas/attempts/')) {
        if(route.endsWith('/result')) {
          if(route.includes('/active-attempt/')) return new Response(JSON.stringify({message:'Attempt in progress'}),{status:409});
          return new Response(JSON.stringify({id:'completed-attempt',overallPercentage:80,level:'INTERMEDIARIO',recommendation:'Persisted test result',performances:[],totalQuestions:5,correctAnswers:4,trail:null}),{status:200});
        }
        if(route.endsWith('/questions')) return new Response(JSON.stringify({questions:[{id:'q1',position:1,statement:'Persisted adaptive question',discipline:'Civil',topic:'Contratos',difficulty:'BASICO',selectedOptionId:null,alternatives:[{id:'a1',text:'Option one'},{id:'a2',text:'Option two'}]}]}),{status:200});
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
        if (route === '/reports/overview') return reply(window.fixture.overview || { classes: 0, activeClasses: 0, students: 0, publishedExams: 0 });
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
        if(route==='/avaliacoes/eligible-questions')return reply({items:window.fixture.questions||[],page:1,hasMore:false});
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

  const initialDiagnosticSession = { ...user(), nextStep: 'INITIAL_DIAGNOSTIC' };
  await boot({ session: initialDiagnosticSession }, '/dashboard');
  await until('location.pathname === "/diagnostico-inicial" && !!document.querySelector(".initial-diagnostic-intro")');
  assert.equal(await evaluate('!!document.querySelector(".mandatory-diagnostic-screen")'), true);
  assert.equal(await evaluate('!!document.querySelector(".v0-sidebar")'), false);
  assert.match(await evaluate('document.querySelector(".initial-diagnostic-notice").textContent'), /temporariamente indisponível/i);
  assert.equal(await evaluate('document.querySelectorAll(".app-legal-footer a[href*=termos], .app-legal-footer a[href*=privacidade]").length'), 2);
  assert.equal(await evaluate('document.querySelector(".initial-diagnostic-primary").disabled'), true);
  assert.equal(await evaluate('window.apiCalls.some(call => call.route === "/initial-diagnostic")'), false);
  for (const width of [360, 768, 1366]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 360 });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  }
  await cdp('Emulation.clearDeviceMetricsOverride');
  pass('nextStep INITIAL_DIAGNOSTIC shows a standalone unavailable screen without navigation or API calls');

  for (const protectedPath of ['/dashboard', '/questoes', '/simulados', '/turmas', '/desempenho', '/trilha', '/metas', '/historico', '/resultados/diagnostico/legacy-id', '/questoes/pratica/practice-id', '/simulados/tentativas/exam-id']) {
    await boot({ session: initialDiagnosticSession }, protectedPath);
    await until('location.pathname === "/diagnostico-inicial" && !!document.querySelector(".mandatory-diagnostic-screen")');
    assert.equal(await evaluate('!!document.querySelector(".v0-sidebar")'), false, `direct route ${protectedPath} must not render student navigation`);
  }
  pass('direct navigation to dashboard, study, classes, exams, results, practice, and history routes returns to the mandatory assessment');

  await boot({ session: { ...user(), nextStep: 'DIAGNOSTIC' } }, '/');
  await until('location.pathname === "/" && !!document.querySelector(".start-card")');
  assert.equal(await evaluate('window.apiCalls.some(call => call.route === "/initial-diagnostic")'), false);
  pass('legacy nextStep DIAGNOSTIC preserves the old flow and does not call the new diagnostic API');

  await boot({ session: user('PROFESSOR') }, '/dashboard', 'ALUNO');
  await until('!!document.querySelector("[data-testid=teacher-dashboard]") && location.pathname === "/professor"');
  assert.equal(await evaluate('window.apiCalls.some(call => call.route.startsWith("/questoes"))'), false);
  pass('PROFESSOR opens independent dashboard without loading the question module');
  await boot({ session: { ...user('PROFESSOR'), administration: { enabled: true, globalAdmin: false, needsInstitutionLink: true, memberships: [] } } }, '/professor');
  await until('!!document.querySelector("[data-testid=teacher-dashboard]") && document.body.textContent.includes("Vínculo institucional pendente")');
  assert.equal(await evaluate('window.apiCalls.some(call => ["/turmas", "/avaliacoes", "/questoes", "/reports"].some(prefix => call.route.startsWith(prefix)))'), false);
  pass('teacher with pending link sees dashboard and no academic API is requested');
  const multiTeacher = { ...user('PROFESSOR'), administration: { enabled: true, globalAdmin: false, memberships: ['institution-one', 'institution-two'].map(institutionId => ({ institutionId, role: 'TEACHER', institution: { name: institutionId } })) } };
  await boot({ session: multiTeacher }, '/professor/perfil');
  await until('!!document.querySelector("#profile-name")');
  assert.equal(await evaluate('window.apiCalls.some(call => ["/turmas", "/avaliacoes", "/questoes", "/reports"].some(prefix => call.route.startsWith(prefix)))'), false);
  pass('teacher profile opens before choosing among multiple institutions without academic requests');
  await boot({ session: multiTeacher }, '/professor');
  await until('document.body.textContent.includes("Selecione sua instituição de trabalho")');
  assert.equal(await evaluate('document.querySelectorAll(".institution-context select").length'), 1);
  assert.equal(await evaluate('window.apiCalls.some(call => call.route === "/turmas")'), false);
  await evaluate('const picker=document.querySelector(".institution-context select");picker.value="institution-two";picker.dispatchEvent(new Event("change",{bubbles:true}));');
  await until('window.apiCalls.some(call => call.route === "/turmas" && call.institution === "institution-two")');
  assert.equal(await evaluate('window.apiCalls.some(call => call.route.startsWith("/questoes"))'), false);
  pass('single institution picker loads classes only after selection and sends the validated institution context');
  for (const width of [360, 768, 1366]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 360 });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(profile, `h437-teacher-${width}.png`), Buffer.from(shot.data, 'base64'));
  }
  await cdp('Emulation.clearDeviceMetricsOverride');
  pass('teacher dashboard fits mobile, tablet and desktop');
  for (const academicPath of ['/professor/turmas', '/professor/alunos', '/professor/atividades', '/professor/relatorios', '/professor/desempenho', '/professor/simulados']) {
    await evaluate('window.apiCalls=[]');
    await evaluate(`import('/src/navigation.ts').then(n => n.navigate(${JSON.stringify(academicPath)}))`);
    await until('window.apiCalls.some(call => ["/turmas", "/avaliacoes", "/reports/classes"].some(prefix => call.route.startsWith(prefix)))');
    assert.equal(await evaluate('window.apiCalls.some(call => call.route.startsWith("/questoes"))'), false, academicPath);
  }
  pass('all academic teacher pages load their own APIs without mounting the question module');
  await evaluate(`window.fixture.classData=[{id:'class-safe',nome:'Turma autorizada',archivedAt:null,_count:{alunos:0}}];window.apiCalls=[];import('/src/navigation.ts').then(n=>n.navigate('/professor/atividades?turma=class-safe'))`);
  await until('!!document.querySelector(".teacher-activities select option[value=class-safe]")');
  assert.equal(await evaluate('document.body.textContent.includes("Criação de atividades ainda indisponível")'),true);
  assert.equal(await evaluate('document.querySelector(".teacher-activities select").value'),'class-safe');
  await evaluate(`(await import('/src/navigation.ts')).navigate('/professor/atividades?turma=foreign')`);
  await until('document.querySelector(".teacher-activities").textContent.includes("A turma solicitada não está nesta página autorizada")');
  assert.equal(await evaluate('window.apiCalls.some(call=>call.route.includes("foreign")||call.route.startsWith("/atividades")||call.method!=="GET")'),false);
  pass('Atividades mantém contexto e isolamento de turma com API existente, sem criar/publicar funcionalidades indisponíveis');
  await boot({ session: user('ADMIN') }, '/dashboard', 'ALUNO');
  await until('!!document.querySelector(".admin-page") && location.pathname === "/administracao"');
  assert.equal(await evaluate('!!document.querySelector(".professor-shell")'), false);
  pass('ADMIN uses administration and has no professor shell');

  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.b1 = { goals: [], writes: 0, summaryFails: false, loseWriteResponse: false, summaryCalls: 0 };
    const originalFetch = window.fetch;
    window.fetch = async (url, init = {}) => {
      const path = new URL(String(url), location.href).pathname;
      const reply = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {status}));
      if (path === '/goals/dashboard') {
        window.b1.summaryCalls++;
        if (window.b1.summaryFails) return reply({message:'B1 summary offline'},503);
        return reply({streak:{current:1,longest:1,lastActivityDate:null},totalAnsweredQuestions:25,todayAnsweredQuestions:25,todayGoal:window.b1.goals.at(-1) ?? null,currentLevel:'BASICO'});
      }
      if (path === '/goals' || path.startsWith('/goals/')) {
        if (!init.method || init.method === 'GET') return reply({items:window.b1.goals,page:1,hasMore:false});
        window.b1.writes++;
        const body = JSON.parse(init.body || '{}');
        if (init.method === 'POST' && path === '/goals') window.b1.goals.push({id:'goal-'+window.b1.writes,date:body.date,targetQuestions:body.targetQuestions,resolvedQuestions:25,progressPercentage:100,completed:false,canComplete:true});
        else {const goal=window.b1.goals.find(g=>g.id===path.split('/')[2]); if(path.endsWith('/complete')) {goal.completed=true;goal.canComplete=false;} else Object.assign(goal,body);}
        if(window.b1.loseWriteResponse) {window.b1.loseWriteResponse=false;throw new TypeError('B1 lost response');}
        return reply(window.b1.goals.at(-1));
      }
      return originalFetch(url,init);
    };
  ` });
  await boot({session:user()}, '/metas');
  await until('!!document.querySelector(".goal-form") && !!document.querySelector(".goal-streak")');
  await evaluate('document.querySelector(".goal-form").requestSubmit()');
  await until('document.querySelector(".goal-streak")?.textContent.includes("25 de 10") && document.querySelectorAll(".goal-card").length===1');
  assert.equal(await evaluate('window.b1.writes'),1); pass('B1 create refreshes list and today in browser');
  await evaluate('[...document.querySelectorAll(".goal-card button")].find(b=>b.textContent.includes("Editar")).click()');
  await evaluate('Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(document.querySelector("#goal-target"),"20");document.querySelector("#goal-target").dispatchEvent(new Event("input",{bubbles:true}))');
  await evaluate('document.querySelector(".goal-form").requestSubmit()');
  await until('document.querySelector(".goal-streak")?.textContent.includes("25 de 20") && document.querySelector(".goal-card")?.textContent.includes("25 de 20")');
  assert.equal(await evaluate('window.b1.writes'),2); pass('B1 edit refreshes both resources');
  await evaluate('[...document.querySelectorAll(".goal-card button")].find(b=>b.textContent.includes("Concluir")).click()');
  await until('!document.querySelector(".goal-card button") && !document.querySelector(".goal-form .primary").disabled');
  assert.equal(await evaluate('window.b1.writes'),3); pass('B1 completion refreshes without duplicate writes');
  await evaluate('window.b1.summaryFails=true;window.b1.loseWriteResponse=true;document.querySelector(".goal-form").requestSubmit()');
  await until('[...document.querySelectorAll(".goals-page [role=alert]")].some(e=>e.textContent.includes("B1 summary offline")) && document.querySelectorAll(".goal-card").length===2');
  assert.equal(await evaluate('!!document.querySelector(".goal-streak")'),false);
  assert.equal(await evaluate('window.b1.writes'),4);
  await evaluate('window.b1.summaryFails=false;[...document.querySelectorAll(".goals-page [role=alert]")].find(e=>e.textContent.includes("B1 summary offline")).querySelector("button").click()');
  await until('!!document.querySelector(".goal-streak")');
  assert.equal(await evaluate('window.b1.writes'),4); pass('B1 lost write response reconciles; summary retry does not repeat write');
  await boot({session:user()}, '/dashboard');
  await evaluate('window.b1.summaryFails=true');
  // Force a remount without a document reload so the controlled API remains installed.
  await evaluate('history.pushState({},"","/administracao");window.dispatchEvent(new PopStateEvent("popstate"))');
  await until('document.body.textContent.includes("exclusiva")');
  await evaluate('history.pushState({},"","/dashboard");window.dispatchEvent(new PopStateEvent("popstate"))');
  await until('!!document.querySelector(".dashboard-page") && [...document.querySelectorAll("[role=alert]")].some(e=>e.textContent.includes("B1 summary offline"))');
  assert.equal(await evaluate('!!document.querySelector(".dashboard-heading h1")'),true);
  await evaluate('window.b1.summaryFails=false;[...document.querySelectorAll("[role=alert]")].find(e=>e.textContent.includes("B1 summary offline")).querySelector("button").click()');
  await until('![...document.querySelectorAll("[role=alert]")].some(e=>e.textContent.includes("B1 summary offline"))');
  pass('B1 academic dashboard survives isolated goals error and recovers');

  const academicId = '11111111-1111-4111-8111-111111111111';
  const academicResult = {id:academicId,overallPercentage:60,level:'BASICO',recommendation:'Review Civil',performances:[{tipo:'DISCIPLINA',disciplina:'Direito Civil',percentual:60}],correctAnswers:3,totalQuestions:5,trail:{id:'active-recommendation',disciplinaPrioritaria:'Direito Civil',assuntoPrioritario:'Contratos',nivelRecomendado:'BASICO',quantidadeRecomendada:5,justificativa:'Priority from saved diagnostic',simuladoGeradoId:'active-attempt'}};
  const activity = {id:academicId,type:'DIAGNOSTICO',startedAt:'2026-11-11T12:00:00Z',finalizedAt:'2026-11-11T12:30:00Z',totalQuestions:5,answeredQuestions:5,correctAnswers:3,incorrectAnswers:2,unansweredQuestions:0,overallPercentage:60};
  const populated = {session:user(),overview:{latestDiagnosticId:academicId,totals:{completedActivities:1,completedDiagnostics:1,completedTrails:0,totalQuestions:5,answeredQuestions:5,correctAnswers:3,incorrectAnswers:2,unansweredQuestions:0},evolution:[activity],recentActivities:[activity],learning:{disciplines:[{discipline:'Direito Civil',total:5,correct:3,percentage:60}],priorityTopic:null,trailProgress:[{id:'active-recommendation',discipline:'Direito Civil',topic:'Contratos',total:5,answered:1,completed:false,finalizedAt:null},{id:'completed-recommendation',discipline:'Direito Penal',topic:'Crime',total:5,answered:5,completed:true,finalizedAt:'2026-11-11T12:30:00Z'}]}},results:{['/diagnostics/'+academicId+'/result']:academicResult}};
  await boot(populated, '/trilha');
  await until('!!document.querySelector(".adaptive-recommendation .trail-launch button")');
  assert.equal(await evaluate('document.querySelectorAll(".study-module-card").length'),0);
  assert.equal(await evaluate('document.querySelectorAll(".adaptive-attempts li").length'),2);
  assert.equal(await evaluate('document.querySelector(".adaptive-recommendation h2").textContent'),'Direito Civil');
  assert.equal(await evaluate('window.apiCalls.some(c=>c.route.endsWith("/gerar"))'),false);
  pass('B2 adaptive route renders saved recommendation and attempts, with no automatic generation');
  await evaluate('localStorage.setItem("jurissim-learning-progress:fixture-user",JSON.stringify({completed:["civil-contratos"],inProgress:["civil-obrigacoes"],openedSections:{}}));history.pushState({},"","/estudar");window.dispatchEvent(new PopStateEvent("popstate"))');
  await until('!!document.querySelector(".study-module-list")');
  assert.equal(await evaluate('document.querySelector("#study-trail-title").textContent'),'Estudar');
  await until('!!document.querySelector(".study-continue .primary")');
  await evaluate('document.querySelector(".study-continue .primary").click()');
  await until('!!document.querySelector(".study-module-detail .study-lesson")');
  assert.equal(await evaluate('document.querySelector(".study-module-detail h2").textContent'),'Obriga\u00e7\u00f5es');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("jurissim-learning-progress:fixture-user")).completed[0]'),'civil-contratos');
  await evaluate('history.pushState({},"","/trilha");window.dispatchEvent(new PopStateEvent("popstate"))');
  await until('!!document.querySelector(".adaptive-attempts li")');
  await reloadDocument(); await until('!!document.querySelector(".adaptive-attempts li")');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("jurissim-learning-progress:fixture-user")).completed[0]'),'civil-contratos');
  pass('B2 study and adaptive routes are distinct; navigation and reload preserve local reading progress');
  await evaluate('document.querySelector(".adaptive-attempts li .primary").click();document.querySelector(".adaptive-attempts li .primary").click()');
  await until('location.search.includes("trilha=active-attempt") && !!document.querySelector(".question")');
  assert.equal(await evaluate('window.apiCalls.filter(c=>c.route.endsWith("/gerar")).length'),1);
  pass('B2 resume opens the server attempt and suppresses synchronous duplicate clicks');
  await boot(populated,'/trilha'); await until('document.querySelectorAll(".adaptive-attempts li").length===2');
  await evaluate('document.querySelectorAll(".adaptive-attempts li .primary")[1].click()');
  await until('location.pathname==="/resultados/trilha/completed-attempt" && document.body.textContent.includes("80%")');
  pass('B2 completed trail opens persisted result');
  await boot({...populated,generationError:true},'/trilha'); await until('!!document.querySelector(".adaptive-recommendation .primary")');
  await evaluate('document.querySelector(".adaptive-recommendation .primary").click()');
  await until('document.querySelector(".trail-launch [role=alert]")?.textContent.includes("inventory")');
  assert.equal(await evaluate('location.pathname'),'/trilha');
  pass('B2 inventory errors remain explicit without fabricated questions or navigation');
  await boot({session:user()},'/trilha'); await until('!!document.querySelector(".adaptive-recommendation h2")');
  assert.equal(await evaluate('document.querySelectorAll(".trail-launch").length'),0);
  assert.equal(await evaluate('document.querySelectorAll(".study-module-card").length'),0);
  pass('B2 empty adaptive state does not impersonate personalized recommendations');
  await boot(populated,'/dashboard'); await until('!!document.querySelector(".student-entry-cards")');
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.setItem("jurissim_theme","dark")'});
  for(const theme of ['light','dark']) {
    await evaluate(`document.querySelector('.v0-app').classList.toggle('v0-dark',${theme==='dark'})`);
    for(const route of ['/dashboard','/estudar','/trilha','/metas','/historico','/perfil']) {
      await evaluate(`history.pushState({},'',${JSON.stringify(route)});window.dispatchEvent(new PopStateEvent('popstate'))`);
      const selector=route==='/trilha'?'.adaptive-trail-page':route==='/estudar'?'.study-trail-page':route==='/dashboard'?'.dashboard-page':route==='/metas'?'.goals-page':route==='/historico'?'.study-history':'#profile-name';
      await until(`!!document.querySelector(${JSON.stringify(selector)})`);
      if(theme==='dark' && ['/dashboard','/trilha'].includes(route)) {
        const contrast = await evaluate(`(() => {
          const rgb = text => text.match(/[0-9.]+/g).slice(0,3).map(Number);
          const luminance = values => values.map(value=>{value/=255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
          const background=luminance(rgb(getComputedStyle(document.querySelector('.adaptive-trail-page .panel,.dashboard-page .panel')).backgroundColor));
          return [...document.querySelectorAll('.adaptive-trail-page .text-button, .dashboard-page .text-button')].map(button=>{const foreground=luminance(rgb(getComputedStyle(button).color));return (Math.max(foreground,background)+0.05)/(Math.min(foreground,background)+0.05);});
        })()`);
        assert.ok(contrast.length>0 && contrast.every(value=>value>=4.5),'new dark-mode text actions meet 4.5 contrast');
      }

      for(const width of [1366,768,390]) {
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<760});
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,theme+' '+route+' '+width+' '+JSON.stringify(await evaluate('[...document.querySelectorAll(".v0-workspace *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right}))')));
        if(width===390||width===1366){const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(path.join(profile,`b2-${theme}-${route.slice(1)}-${width}.png`),Buffer.from(shot.data,'base64'));}
      }
    }
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate('history.pushState({},"","/trilha");window.dispatchEvent(new PopStateEvent("popstate"))');
  await until('!!document.querySelector(".adaptive-trail-page")');
  await evaluate('document.querySelector(".adaptive-trail-page button").focus()');
  assert.equal(await evaluate('document.activeElement.tagName'),'BUTTON');
  assert.notEqual(await evaluate('getComputedStyle(document.activeElement).outlineStyle'),'none');
  pass('B2 six student routes fit desktop/tablet/mobile in both themes; keyboard focus remains visible');
  console.log('Dashboard B1/B2 browser suite completed: '+checks+' scenarios; API mocked.');
} finally {
  socket?.close(); browser.kill(); vite.kill();
}
