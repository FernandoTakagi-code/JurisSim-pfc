import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:5187';
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-attempt-resume-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--configLoader', 'runner', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], {
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
    throw new Error(`Condition failed: ${expression}; DOM: ${await evaluate("document.body.textContent.slice(-2500)")}`);
  };
  const replaceDocument = async (method, params) => {
    const marker = String(Math.random()); await evaluate(`window.testDocumentMarker = ${JSON.stringify(marker)}`);
    const result = await cdp(method, params);
    if (method === 'Page.reload' || result.loaderId) await until(`window.testDocumentMarker !== ${JSON.stringify(marker)} && document.readyState === 'complete'`);
  };
  const reloadDocument = () => replaceDocument('Page.reload');
  const navigateDocument = url => replaceDocument('Page.navigate', { url });

  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    sessionStorage.setItem('jurissim_token','isolated-fixture-session');
    window.f = JSON.parse(sessionStorage.getItem('attempt-regression') || 'null') || { diagnostic: {}, trail: {}, saveCalls:0, finalizeCalls:0, commits:0 };
    window.persist=()=>sessionStorage.setItem('attempt-regression',JSON.stringify(window.f));
    const questions=()=>[0,1].map(i=>({id:'q'+i,position:i+1,statement:'Pergunta isolada '+i,discipline:'Civil',topic:'Contratos',difficulty:'BASICO',alternatives:[{id:'a'+i,text:'Alternativa A'},{id:'b'+i,text:'Alternativa B'}],selectedOptionId:null}));
    window.fetch=async(url,init={})=>{
      const p=new URL(String(url),location.origin).pathname;
      const reply=(value,status=200)=>new Response(JSON.stringify(value),{status});
      if(p==='/auth/session')return reply({user:{id:'isolated-student',nome:'Aluno isolado',email:'aluno@example.invalid',role:'ALUNO',emailVerificado:true},nextStep:'DASHBOARD'});
      if(p==='/profile/photo')return reply({kind:'default'});
      if(p==='/institutions/availability')return reply({enabled:false,capabilities:{}});
      if(p==='/goals/dashboard')return reply({streak:{current:0,longest:0},totalAnsweredQuestions:0,currentLevel:null});
      if(p.startsWith('/initial-diagnostic/')&&p.endsWith('/result'))return reply({id:'initial',overallPercentage:70,level:'INTERMEDIARIO',recommendation:'Baseline preservada.',performances:[],correctAnswers:21,totalQuestions:30,trail:null});
      if(p==='/students/me/overview')return reply({totals:{completedActivities:0,answeredQuestions:0,correctAnswers:0},evolution:[],recentActivities:[],latestDiagnosticId:null});
      if(p.startsWith('/students/me/')&&window.f.historyInitial)return reply({items:[{id:'initial',type:'DIAGNOSTICO',initialDiagnostic:true,startedAt:'2026-11-11T12:00:00Z',finalizedAt:'2026-11-11T12:30:00Z',totalQuestions:30,answeredQuestions:30,unansweredQuestions:0,overallPercentage:70,correctAnswers:21,incorrectAnswers:9}],nextCursor:null});
      if(p.startsWith('/students/me/'))return reply({items:[{id:'legacy',type:'DIAGNOSTICO',startedAt:'2026-11-11T12:00:00Z',finalizedAt:null,totalQuestions:2,answeredQuestions:1,unansweredQuestions:1}],nextCursor:null});
      if(p==='/diagnostics'&&init.method==='POST')return reply({id:'legacy'},201);
      const kind=p.startsWith('/trilhas/')?'trail':'diagnostic';const state=window.f[kind];
      if(p.startsWith('/diagnostics/')||p.startsWith('/trilhas/attempts/')){
        if(window.f.missing)return reply({message:'Attempt not found'},404);
        if(window.f.forbidden)return reply({message:'Acesso negado ? tentativa.'},403);
        state.answers ||= {q0:'a0'};
        if(p.endsWith('/result')){
          if(state.failResult){delete state.failResult;window.persist();throw Error('Falha de rede isolada ap?s conclus?o');}
          if(!state.done)return reply({message:'Finalize a tentativa'},409);
          return reply({id:'legacy',overallPercentage:100,level:'AVANCADO',recommendation:'Resultado persistido.',performances:[],trail:null,correctAnswers:2,totalQuestions:2});
        }
        if(p.endsWith('/questions')){window.f.questionReads=(window.f.questionReads||0)+1;return reply({questions:questions().map(q=>({...q,selectedOptionId:state.answers[q.id]||null}))});}
        if(p.includes('/answers/')){
          if(state.done)return reply({message:'Already completed'},409);
          window.f.saveCalls++;
          if(state.failSave==='before'){delete state.failSave;window.persist();throw Error('Lost connection before commit');}
          const q=p.split('/').pop(), choice=JSON.parse(init.body).selectedOptionId;
          if(state.answers[q]&&state.answers[q]!==choice)return reply({message:'Answer already saved'},409);
          state.answers[q]=choice;window.persist();
          if(state.failSave==='after'){delete state.failSave;window.persist();throw Error('Lost connection after commit');}
          return reply({message:'Answer saved'});
        }
        if(p.endsWith('/finalize')){window.f.finalizeCalls++;if(state.failFinalizeBefore){delete state.failFinalizeBefore;window.persist();throw Error('Lost connection before finalization');}if(!state.done){state.done=true;window.f.commits++;}if(state.failFinalize){delete state.failFinalize;window.persist();throw Error('Falha de rede isolada ap?s conclus?o');}window.persist();return reply({level:'AVANCADO',overallPercentage:100,recommendation:'Resultado persistido.'});}
      }
      return reply({message:'Endpoint fora da fixture: '+p},404);
    };
  ` });
  const pass=message=>{checks++;console.log('OK '+checks+': '+message);};
  const choose=async()=>evaluate('document.querySelector(".answers input").click()');
  const submit=async()=>evaluate('document.querySelector(".question footer .primary").click()');
  await navigateDocument(origin+'/diagnostico?tentativa=legacy');
  await until('document.body.textContent.includes("2 DE 2")');
  pass('URL restores the owned attempt at its first unanswered question');
  await reloadDocument();await until('document.body.textContent.includes("2 DE 2")');
  pass('Refresh preserves server-confirmed answers');
  await evaluate('window.f.diagnostic.failFinalize=true;window.persist()');await choose();await submit();
  await until('document.body.textContent.includes("Seu desempenho")');
  assert.equal(await evaluate('window.f.saveCalls'),1);assert.equal(await evaluate('window.f.commits'),1);
  pass('Timeout after final commit recovers without resubmitting the answer');
  await reloadDocument();await until('document.body.textContent.includes("Seu desempenho")');
  assert.equal(await evaluate('window.f.commits'),1);pass('Completed result survives refresh');
  await navigateDocument(origin+'/diagnostico?trilha=generated');await until('document.body.textContent.includes("2 DE 2")');
  await reloadDocument();await until('document.body.textContent.includes("2 DE 2")');
  await choose();await submit();await until('document.body.textContent.includes("CONCLU")');
  await reloadDocument();await until('document.body.textContent.includes("CONCLU")');
  assert.equal(await evaluate('window.f.commits'),2);pass('Trail answers and results survive remount and refresh');
  await navigateDocument(origin+'/historico');await until('document.body.textContent.includes("Retomar atividade")');
  await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Retomar atividade")).click()');
  await until('location.search.includes("tentativa=legacy")&&document.body.textContent.includes("Seu desempenho")');
  pass('History resumes the persisted attempt by URL');
  await evaluate('window.f.forbidden=true;window.persist()');await reloadDocument();
  await until('document.body.textContent.includes("retomar a tentativa")');
  assert.equal(await evaluate('!!document.querySelector(".question")'),false);
  await evaluate('window.f.forbidden=false;window.persist();Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Tentar novamente").click()');
  await until('document.body.textContent.includes("Seu desempenho")');pass('Forbidden attempts stay hidden and can be revalidated');
  await evaluate('window.f.diagnostic={answers:{q0:"a0",q1:"a1"}};window.persist()');await reloadDocument();
  await until('document.body.textContent.includes("2 DE 2")');const before=await evaluate('window.f.saveCalls');
  await submit();await until('document.body.textContent.includes("Seu desempenho")');assert.equal(await evaluate('window.f.saveCalls'),before);
  pass('Fully saved answers finalize after reload without another PUT');
  await evaluate("window.f.trail={};window.persist();const n=await import('/src/navigation.ts');n.navigate('/diagnostico?trilha=fresh')");
  await until('document.body.textContent.includes("EXERC")&&document.body.textContent.includes("2 DE 2")');
  await evaluate("const n=await import('/src/navigation.ts');n.navigate('/diagnostico?tentativa=legacy')");
  await until('document.body.textContent.includes("Seu desempenho")');
  pass('Changing only the query restores the correct modality without refresh');
  await evaluate('window.f.historyInitial=true;window.persist()');await navigateDocument(origin+'/historico');
  await until('document.body.textContent.includes("Ver resultado")');
  assert.equal(await evaluate('document.body.textContent.includes("Ver corre")'),false);
  await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Ver resultado").click()');
  await until('location.pathname.includes("diagnostico-inicial")&&document.body.textContent.includes("21 acertos de 30")');
  pass('Initial diagnostic history uses its own result API and never the legacy correction route');

  for (const kind of ['diagnostic','trail']) {
    const query=kind==='diagnostic'?'tentativa=legacy':'trilha=generated';
    await evaluate(`window.f.historyInitial=false;window.f[${JSON.stringify(kind)}]={answers:{},failSave:'after'};window.persist()`);
    await navigateDocument(origin+'/diagnostico?'+query);
    await until('document.body.textContent.includes("1 DE 2")');
    const writes=await evaluate('window.f.saveCalls');
    await choose(); await submit();
    await until('document.body.textContent.includes("2 DE 2")');
    assert.equal(await evaluate('window.f.saveCalls'),writes+1);
    assert.equal(await evaluate(`window.f[${JSON.stringify(kind)}].answers.q0`),'a0');
    pass(kind+': lost answer acknowledgement restores saved answers and advances without another write');

    await evaluate(`window.f[${JSON.stringify(kind)}]={answers:{},failSave:'before'};window.persist()`);
    await reloadDocument(); await until('document.body.textContent.includes("1 DE 2")');
    const readsBeforeFailure=await evaluate('window.f.questionReads');
    await choose(); await submit();
    await until(`window.f.questionReads>${readsBeforeFailure} && document.body.textContent.includes("1 DE 2") && !document.querySelector(".answers input:checked")`);
    assert.deepEqual(await evaluate(`window.f[${JSON.stringify(kind)}].answers`),{});
    await choose(); await submit(); await until('document.body.textContent.includes("2 DE 2")');
    assert.equal(await evaluate(`Object.keys(window.f[${JSON.stringify(kind)}].answers).length`),1);
    pass(kind+': failure before saving restores the unanswered question and permits retry');

    await evaluate(`window.f[${JSON.stringify(kind)}]={answers:{q0:'a0'},failSave:'after'};window.persist()`);
    await reloadDocument(); await until('document.body.textContent.includes("2 DE 2")');
    const beforeLast=await evaluate('window.f.saveCalls'), readsBeforeLast=await evaluate('window.f.questionReads');
    await choose(); await submit();
    await until(`window.f.questionReads>${readsBeforeLast} && !!document.querySelector(".question .answers input:checked") && !document.querySelector(".question footer .primary").disabled`);
    assert.equal(await evaluate('window.f.saveCalls'),beforeLast+1);
    await submit(); await until(kind==='diagnostic'?'document.body.textContent.includes("Seu desempenho")':'document.body.textContent.includes("CONCLU")');
    assert.equal(await evaluate('window.f.saveCalls'),beforeLast+1);
    pass(kind+': lost last-answer response is recovered and finalizes without a second PUT');

    await evaluate(`window.f[${JSON.stringify(kind)}]={answers:{q0:'a0',q1:'a1'},failFinalizeBefore:true};window.persist()`);
    await reloadDocument();await until('document.body.textContent.includes("2 DE 2")');
    const beforeFinalize=await evaluate('window.f.saveCalls'), readsBeforeFinalize=await evaluate('window.f.questionReads');
    await submit();await until(`window.f.questionReads>${readsBeforeFinalize} && document.body.textContent.includes("2 DE 2") && !document.querySelector(".question footer .primary").disabled`);
    await submit();await until(kind==='diagnostic'?'document.body.textContent.includes("Seu desempenho")':'document.body.textContent.includes("CONCLU")');
    assert.equal(await evaluate('window.f.saveCalls'),beforeFinalize);
    pass(kind+': failure before finalization is retryable without resending persisted answers');
    await evaluate(`window.f[${JSON.stringify(kind)}]={answers:{q0:'a0',q1:'a1'},failFinalize:true};window.persist()`);
    await reloadDocument();await until('document.body.textContent.includes("2 DE 2")');
    const committedBefore=await evaluate('window.f.commits'), writesBefore=await evaluate('window.f.saveCalls');
    await submit();await until(kind==='diagnostic'?'document.body.textContent.includes("Seu desempenho")':'document.body.textContent.includes("CONCLU")');
    assert.equal(await evaluate('window.f.saveCalls'),writesBefore);
    assert.equal(await evaluate('window.f.commits'),committedBefore+1);
    pass(kind+': lost finalization acknowledgement loads the completed result without another write');

  }
  await evaluate('window.f.diagnostic={answers:{q0:"a0"}};window.persist()');
  await navigateDocument(origin+'/diagnostico?tentativa=legacy');await until('document.body.textContent.includes("2 DE 2")');
  await evaluate('window.auth = await import("/src/auth-session.ts");window.auth.endSession()');
  await until('!!document.querySelector(".auth-card")');
  await evaluate('await window.auth.establishSession("new-isolated-login")');
  await until('document.body.textContent.includes("2 DE 2")');
  pass('a fresh authenticated session restores the attempt from its URL and backend answers');
  await evaluate('window.f.missing=true;window.persist()');await reloadDocument();
  await until('document.body.textContent.includes("retomar a tentativa")');
  assert.equal(await evaluate('!!document.querySelector(".question")'),false);
  pass('missing attempts never expose a previous question or result');
  console.log('Retomada P0: '+checks+' cenarios aprovados; APIs simuladas, sem banco ou e-mail.');
} finally {socket?.close();browser.kill();vite.kill();}
