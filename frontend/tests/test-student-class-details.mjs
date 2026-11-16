// Real diagnostic UI with isolated responses; never uses the shared API or real accounts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const origin = 'http://127.0.0.1:5195';
const browserPath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!browserPath) throw new Error('Defina CHROME_PATH com o caminho do Chrome ou Edge instalado.');
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-pilot-ui-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5195', '--strictPort'], {
  windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:1', VITE_GOOGLE_CLIENT_ID: '', VITE_QUESTION_PRACTICE_UI_ENABLED:'true', VITE_INDIVIDUAL_EXAM_UI_ENABLED:'true' },
});
const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
let closeBrowser;
let checks = 0;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Browser startup timed out')), 20000);
    browser.on('error', error => { clearTimeout(timer); reject(error); });
    browser.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  let ready = false;
  for (let i = 0; i < 100; i++) { if (await fetch(origin).then(r => r.ok).catch(() => false)) { ready = true; break; } await sleep(100); }
  assert(ready, 'Isolated Vite server must start');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) { const task = pending.get(message.id); pending.delete(message.id); clearTimeout(task.timer); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
    if (message.method === 'Fetch.requestPaused') {
      const allowed = message.params.request.url.startsWith(origin + '/');
      void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: message.params.requestId, ...(allowed ? {} : { errorReason: 'BlockedByClient' }) }, message.sessionId).catch(() => {});
    }
  });
  closeBrowser = () => send('Browser.close');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params = {}) => send(method, params, sessionId);
  const evaluate = async expression => { const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error('Isolated browser expression failed: ' + expression.slice(0, 120)); return result.result.value; };
  const until = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(expression).catch(() => false)) return; await sleep(50); } throw new Error('Condition failed: ' + expression); };
  await cdp('Page.enable');await cdp('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  const classId='00000000-0000-4000-8000-000000000321';
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    sessionStorage.setItem('jurissim_token','isolated-class-student');
    const classId=${JSON.stringify(classId)};window.classRequests=[];
    const state=()=>JSON.parse(sessionStorage.getItem('class-state')||'{"mode":"enrolled","started":false,"answer":null,"finished":false}');
    window.classMode=mode=>{const s=state();s.mode=mode;sessionStorage.setItem('class-state',JSON.stringify(s));};
    const result={overallPercentage:100,correctAnswers:1,totalQuestions:1,incorrectAnswers:0,unansweredQuestions:0};
    window.fetch=async(url,init={})=>{
      const p=new URL(String(url),location.origin).pathname,method=init.method||'GET';window.classRequests.push({p,method});const s=state();
      const reply=(value,status=200)=>new Response(JSON.stringify(value),{status});
      if(p==='/auth/session')return reply({user:{id:'fixture',nome:'Aluno de teste',email:'class@example.invalid',role:'ALUNO',emailVerificado:true},nextStep:'DASHBOARD'});
      if(p==='/profile/photo')return reply({kind:'default',version:'fixture'});
      if(p==='/institutions/availability')return reply({enabled:false});
      if(p==='/turmas/requests')return reply({items:s.mode==='pending'?[{id:'request',classId,className:'Teste 1',status:'PENDING',createdAt:'2026-11-15T12:00:00Z'}]:[],page:1,hasMore:false});
      if(p==='/turmas')return reply({items:s.mode==='enrolled'?[{id:classId,nome:'Teste 1',archivedAt:null,_count:{alunos:1}}]:[],page:1,hasMore:false});
      if(p==='/turmas/'+classId){
        if(s.mode!=='enrolled')return reply({message:'Turma indisponível para esta conta.'},404);
        return reply({id:classId,nome:'Teste 1',createdAt:'2026-11-15T12:00:00Z',archivedAt:null,enrollment:{status:'APPROVED',since:null,decidedAt:null},professors:[{id:'teacher',nome:'Professor de teste'}],page:1,hasMore:false,exams:[{id:'exam',titulo:'Simulado da turma',descricao:'Atividade de teste',questionCount:1,duracaoSegundos:null,publishedAt:'2026-11-15T12:00:00Z',attempt:s.started?{id:'attempt',startedAt:'2026-11-15T12:00:00Z',finalizedAt:s.finished?'2026-11-15T12:30:00Z':null,status:s.finished?'COMPLETED':'IN_PROGRESS',result:s.finished?result:null}:null}]});
      }
      if(p==='/avaliacoes/exam/attempts'){s.started=true;sessionStorage.setItem('class-state',JSON.stringify(s));return reply({id:'attempt'});}
      if(p==='/avaliacoes/attempts/attempt/answers/q'){s.answer=JSON.parse(init.body).selectedOptionId;sessionStorage.setItem('class-state',JSON.stringify(s));return reply({message:'Salva'});}
      if(p==='/avaliacoes/attempts/attempt/finalize'){s.finished=true;sessionStorage.setItem('class-state',JSON.stringify(s));return reply(result);}
      if(p==='/avaliacoes/attempts/attempt')return reply({id:'attempt',titulo:'Simulado da turma',serverTime:new Date().toISOString(),deadline:null,status:s.finished?'COMPLETED':'IN_PROGRESS',questions:[{id:'q',statement:'Questão de teste da turma',discipline:'Direito Civil',selectedOptionId:s.answer,alternatives:[{id:'a',text:'Correta'},{id:'b',text:'Incorreta'}]}],result:s.finished?result:null});
      return reply({items:[]});
    };
  `});
  const open=async path=>{await cdp('Page.navigate',{url:origin+path});await sleep(150);};
  const click=async text=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(${JSON.stringify(text)}));if(!b)throw Error('Missing button');b.click()})()`);
  const pass=name=>{console.log('PASS: '+name);checks++;};
  await open('/turmas');await until('document.body.textContent.includes("Acessar turma")');
  assert.equal(await evaluate('!!document.querySelector("input[name=invite-code]")'),true);
  await click('Acessar turma');await until('!!document.querySelector(".class-detail-page")&&document.body.textContent.includes("Professor de teste")');
  assert.equal(await evaluate('document.querySelector(".class-detail-page h1").textContent'),'Teste 1');
  pass('enrolled student sees Access class and opens Teste 1 with professor, enrollment and published activity');
  for(const width of [1440,768,390]){await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);}
  pass('details responsive at desktop, tablet and mobile widths');
  await click('Iniciar simulado');await until('!!document.querySelector(".exam-attempt .answers input")');
  await evaluate('document.querySelector(".exam-attempt .answers input").click()');
  await until('JSON.parse(sessionStorage.getItem("class-state")).answer==="a"');
  await open('/turmas/'+classId);await until('document.body.textContent.includes("Continuar simulado")');await click('Continuar simulado');
  await until('!!document.querySelector(".exam-attempt .answers input:checked")');
  pass('starts and resumes original class exam flow with a persisted answer');
  await click('Finalizar');await until('!!document.querySelector(".exam-result")');
  await open('/turmas/'+classId);await until('document.body.textContent.includes("Ver resultado")');await click('Ver resultado');
  await until('!!document.querySelector(".exam-result")');assert.equal(await evaluate('document.querySelector(".exam-result strong").textContent'),'100%');
  pass('finalized exam is shown in class history and opens the original result component');
  await evaluate('window.classMode("pending")');await open('/turmas');await until('document.body.textContent.includes("Aguardando aprovação do professor")');
  assert.equal(await evaluate('document.body.textContent.includes("Acessar turma")'),false);
  await open('/turmas/'+classId);await until('document.body.textContent.includes("Turma indisponível para esta conta")');
  assert.equal(await evaluate('!!document.querySelector(".class-detail-summary")'),false);
  pass('pending student sees approval status, no access button or protected details');
  await evaluate('window.classMode("outsider")');await open('/turmas/'+classId);await until('document.body.textContent.includes("Turma indisponível para esta conta")');
  pass('non-enrolled student cannot open class details');
  console.log(checks+' browser checks passed with isolated fixtures; actual enrollment permissions tested separately with PostgreSQL.');
}finally{try{await closeBrowser?.();}catch{}socket?.close();browser.kill();vite.kill();}
