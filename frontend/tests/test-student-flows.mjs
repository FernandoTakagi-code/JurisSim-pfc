// Real diagnostic UI with isolated responses; never uses the shared API or real accounts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const origin = 'http://127.0.0.1:5192';
const browserPath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!browserPath) throw new Error('Defina CHROME_PATH com o caminho do Chrome ou Edge instalado.');
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-pilot-ui-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5192', '--strictPort'], {
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
  await cdp('Page.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    sessionStorage.setItem('jurissim_token','isolated-student-fixture');
    window.requests=[];
    const disciplines=['Direito Constitucional','Direito Civil','Direito Penal','Direito Administrativo','Direito do Trabalho'];
    const state=()=>JSON.parse(sessionStorage.getItem('flow-state')||'{"answers":{},"mode":"ready"}');
    window.setMode=mode=>{const s=state();s.mode=mode;sessionStorage.setItem('flow-state',JSON.stringify(s));};
    const questions=n=>Array.from({length:n},(_,i)=>({id:'q'+i,position:i+1,statement:'Questão sintética de teste '+(i+1),discipline:disciplines[Math.floor(i/6)%5],topic:'Assunto',level:'BASICO',selectedOptionId:state().answers['q'+i]||null,alternatives:['A','B','C','D'].map(letter=>({id:'q'+i+letter,letter,text:'Alternativa '+letter}))}));
    window.fetch=async(url,init={})=>{
      const p=new URL(String(url),location.origin).pathname, method=init.method||'GET';
      window.requests.push(p);
      const s=state(), reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
      if(p==='/auth/session')return reply({user:{id:'fixture',nome:'Aluno',email:'fixture@example.invalid',role:'ALUNO',emailVerificado:true},nextStep:'DASHBOARD'});
      if(p==='/students/me/overview')return reply({latestDiagnosticId:'diagnostic',latestDiagnosticInitial:true,totals:{completedActivities:1},evolution:[],recentActivities:[],learning:{trailProgress:[]}});
      if(p==='/initial-diagnostic/diagnostic/result')return reply({id:'diagnostic',level:'BASICO',performances:[],recommendation:'Priorize Civil',trail:{id:'trail',disciplinaPrioritaria:'Direito Civil',assuntoPrioritario:'Contratos',nivelRecomendado:'BASICO',quantidadeRecomendada:10,justificativa:'Prioridade baseada no desempenho registrado'}});
      if(p==='/goals/dashboard')return reply({todayAnsweredQuestions:0});
      if(p==='/avaliacoes/disponiveis')return reply({items:[],page:1,hasMore:false});
      if(p==='/trilhas/trail/gerar')return reply({message:'Não há questões elegíveis disponíveis para esta trilha.'},409);
      if(p.endsWith('/availability')){
        if(s.mode==='network')throw new TypeError('network');
        if(s.mode==='backend')return reply({message:'Falha controlada do backend'},500);
        if(p.startsWith('/individual-exams'))return reply({provisional:true,quantity:30,canStart:s.mode!=='empty',disciplines:disciplines.map(d=>({discipline:d,available:s.mode==='empty'?0:6,required:6,missing:s.mode==='empty'?6:0})),activeAttemptId:s.started?'attempt':null});
        return reply({provisional:true,discipline:disciplines[0],availableCount:s.mode==='empty'?0:20,availableQuantities:s.mode==='empty'?[]:[5,10,20],topics:[],activeAttempt:null});
      }
      if(method==='PUT'&&p.includes('/answers/')){
        const id=p.split('/').pop();s.answers[id]=JSON.parse(init.body).alternativeId;sessionStorage.setItem('flow-state',JSON.stringify(s));
        return reply({saved:true,correct:true,correctOptionId:id+'A',selectedOptionId:s.answers[id],explanation:'Explicação sintética',answeredCount:Object.keys(s.answers).length,totalQuestions:5});
      }
      if(method==='POST'&&(p==='/question-practice'||p==='/individual-exams')){if(p==='/individual-exams'){s.started=true;sessionStorage.setItem('flow-state',JSON.stringify(s));}return reply({attempt:{id:'attempt'}});}
      if(p==='/question-practice/attempt')return reply({attempt:{id:'attempt',state:'IN_PROGRESS',discipline:disciplines[0],questions:questions(5)}});
      if(p==='/individual-exams/attempt')return reply({attempt:{id:'attempt',state:s.finished?'COMPLETED':'IN_PROGRESS',quantity:30,questions:questions(30)}});
      if(p.endsWith('/finalize')||p.endsWith('/result')){s.finished=true;sessionStorage.setItem('flow-state',JSON.stringify(s));return reply({result:{total:30,correct:30,percentage:100,disciplines:disciplines.map(d=>({discipline:d,total:6,correct:6})),answers:questions(30).map(q=>({...q,correct:true,correctOptionId:q.id+'A',explanation:'Explicação sintética'}))}});}
      return reply({items:[],page:1,hasMore:false});
    };
  ` });
  const open=async route=>{await cdp('Page.navigate',{url:origin+route});await until('!!document.querySelector(".integration-shell, .app-shell, h1")');};
  const click=async text=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('missing button');b.click()})()`);
  const pass=name=>{checks++;console.log('PASS: '+name);};
  await open('/questoes');
  await until('document.querySelectorAll("input[name=practice-size]:enabled").length===3');
  assert.equal(await evaluate('document.body.textContent.includes("Piloto provisório · revisão humana pendente")'),false);
  assert.equal(await evaluate('window.requests.some(p=>p.startsWith("/students/me")||p.startsWith("/goals"))'),false);
  assert.equal(await evaluate('document.body.textContent.includes("Instituições e solicitações")'),false);
  pass('questões: opções 5/10/20 habilitadas com acervo; sem atalhos institucionais ou consultas acadêmicas extras');
  await click('Começar treino');
  await until('!!document.querySelector("input[name=practice-answer]")');
  await evaluate('document.querySelector("input[name=practice-answer]").click()');
  await click('Confirmar resposta');
  await until('sessionStorage.getItem("flow-state").includes("q0A")');
  await cdp('Page.reload');
  await sleep(200);
  await until('!!document.querySelector("input[name=practice-answer]")');
  assert.equal(await evaluate('JSON.parse(sessionStorage.getItem("flow-state")).answers.q0'),'q0A');
  await until('document.body.textContent.includes("1 de 5 respostas confirmadas")');
  pass('treino: início, confirmação e retomada de resposta após recarregar');
  await evaluate('window.setMode("empty")');
  await open('/questoes');
  await until('document.querySelectorAll("input[name=practice-size]:disabled").length===3');
  pass('questões: indisponibilidade de acervo mantém opções desabilitadas');
  for(const mode of ['network','backend']){
    await evaluate('window.setMode('+JSON.stringify(mode)+')');await open('/questoes');
    await until(mode==='network'?'document.body.textContent.includes("conectar ao servidor")':'document.body.textContent.includes("Falha controlada do backend")');
  }
  pass('questões: falhas de rede e backend exibem mensagens distintas da falta de acervo');
  await evaluate('window.setMode("ready")');
  await open('/simulados');await until('document.body.textContent.includes("Iniciar simulado de 30 questões")');
  assert.equal(await evaluate('document.body.textContent.includes("Piloto provisório · revisão humana pendente")'),false);
  assert.equal(await evaluate('document.querySelectorAll(".individual-inventory > div").length'),5);
  await click('Iniciar simulado de 30 questões');
  await until('!!document.querySelector("input[name=exam-answer]")');
  await evaluate('document.querySelector("input[name=exam-answer]").click()');
  await until('!document.querySelector("input[name=exam-answer]").disabled');
  await cdp('Page.reload');await until('!!document.querySelector("input[name=exam-answer]")');
  assert.equal(await evaluate('JSON.parse(sessionStorage.getItem("flow-state")).answers.q0'), 'q0A');
  pass('simulado: início, salvamento e retomada com 30 questões');
  await open('/simulados');await until('document.body.textContent.includes("Continuar simulado")');
  assert.equal(await evaluate('document.body.textContent.includes("Piloto provisório · revisão humana pendente")'),false);
  await click('Continuar simulado');await until('!!document.querySelector("input[name=exam-answer]")');
  // Finish the remaining persisted fixture answers, then exercise the real UI submission.
  await evaluate('(()=>{const s=JSON.parse(sessionStorage.getItem("flow-state"));for(let i=0;i<30;i++)s.answers["q"+i]="q"+i+"A";sessionStorage.setItem("flow-state",JSON.stringify(s));})()');
  await cdp('Page.reload');await until('!!document.querySelector("input[name=exam-answer]")');
  // After the reload the answer input can render before the submit buttons; wait for them.
  await until('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Revisar e entregar"))');
  await click('Revisar e entregar');await until('!!document.querySelector("dialog[open]")');
  await evaluate('document.querySelector("dialog[open] .individual-primary").click()');
  await until('document.body.textContent.includes("100%")');
  pass('simulado: finalização e resultado; respostas persistidas em fixture isolada');
  await open('/trilha');await until('document.body.textContent.includes("Prioridade baseada no desempenho registrado")');
  await click('Gerar exercícios');await until('document.body.textContent.includes("Não há questões elegíveis disponíveis")');
  assert.equal(await evaluate('document.body.textContent.includes("Prioridade baseada no desempenho registrado")'),true);
  pass('trilha: recomendação histórica preservada mesmo sem acervo para exercícios');
  console.log('Student flows: '+checks+' verificações aprovadas no navegador; API simulada, sem dados reais.');
} finally {
  try { await closeBrowser?.(); } catch {}
  socket?.close();browser.kill();vite.kill();
}
