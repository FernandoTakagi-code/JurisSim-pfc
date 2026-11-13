// Real diagnostic UI with isolated responses; never uses the shared API or real accounts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const origin = 'http://127.0.0.1:5191';
const browserPath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!browserPath) throw new Error('Defina CHROME_PATH com o caminho do Chrome ou Edge instalado.');
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-pilot-ui-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5191', '--strictPort'], {
  windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:1', VITE_GOOGLE_CLIENT_ID: '', VITE_INITIAL_DIAGNOSTIC_UI_ENABLED:'true', VITE_INITIAL_DIAGNOSTIC_PILOT_UI_ENABLED:'true' },
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
  const pass = name => { checks++; console.log('PASS: ' + name); };
  await cdp('Page.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  const fixture=JSON.parse(await readFile(new URL('../../backend/scripts/drafts/authorial-diagnostic-30.draft.json',import.meta.url),'utf8'));
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    sessionStorage.setItem('jurissim_token','isolated-pilot-test-token');
    const fixture=${JSON.stringify(fixture.questions)};
    const attemptId='00000000-0000-4000-8000-000000000090';
    window.requests=[];
    const state=()=>JSON.parse(sessionStorage.getItem('pilot-ui-state')||'{"answers":{},"finished":false}');
    window.fetch=async(url,init={})=>{
      const pathname=new URL(String(url),location.origin).pathname,method=init.method||'GET';
      window.requests.push({pathname,method});
      const data=state(),reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
      const result=()=>{const correct=fixture.filter(q=>data.answers[q._draftSlot]===q.gabarito).length;return {
        id:attemptId,provisional:true,finalizedAt:'2026-11-11T19:00:00Z',correctAnswers:correct,totalQuestions:30,answeredQuestions:30,incorrectAnswers:30-correct,unansweredQuestions:0,overallPercentage:correct/30*100,level:'INTERMEDIARIO',weakestDiscipline:'Direito Civil',weakestTopic:null,recommendation:'Priorize os assuntos com menor aproveitamento.',
        performances:[...new Set(fixture.map(q=>q.disciplina))].map(d=>{const acertos=fixture.filter(q=>q.disciplina===d&&data.answers[q._draftSlot]===q.gabarito).length;return {id:d,tipo:'DISCIPLINA',disciplina:d,assunto:null,nivel:null,acertos,totalQuestoes:6,percentual:Number((acertos/6*100).toFixed(2))}}),
        trail:{id:'fixture-trail',disciplinaPrioritaria:'Direito Civil',assuntoPrioritario:null,nivelRecomendado:'BASICO',quantidadeRecomendada:15,justificativa:'Fixture de recomendação'}
      }};
      if(pathname==='/auth/session')return reply({user:{id:'pilot-ui-student',nome:'Estudante de teste',email:'fixture@example.invalid',role:'ALUNO',emailVerificado:true},nextStep:'INITIAL_DIAGNOSTIC'});
      if(pathname==='/initial-diagnostic'&&method==='POST')return reply({attemptId,status:data.finished?'COMPLETED':'IN_PROGRESS',created:!Object.keys(data.answers).length,provisional:true});
      if(pathname.endsWith('/questions'))return reply({questions:fixture.map((q,i)=>({id:q._draftSlot,position:i+1,statement:q.enunciado,discipline:q.disciplina,topic:q.assunto,difficulty:q.nivel,alternatives:q.alternativas.map(a=>({id:q._draftSlot+':'+a.letra,letter:a.letra,text:a.texto})),selectedOptionId:data.answers[q._draftSlot]?q._draftSlot+':'+data.answers[q._draftSlot]:null}))});
      if(pathname.endsWith('/answers')&&method==='GET')return reply({attemptId,provisional:true,answered:Object.keys(data.answers).length,total:30,answers:Object.entries(data.answers).map(([id,letter])=>({questionId:id,selectedOptionId:id+':'+letter,respondedAt:'2026-11-11T18:00:00Z'}))});
      if(pathname.includes('/answers/')&&method==='PUT'){
        const questionId=decodeURIComponent(pathname.split('/').pop()),selected=JSON.parse(init.body).selectedOptionId;
        data.answers[questionId]=selected.split(':').pop();sessionStorage.setItem('pilot-ui-state',JSON.stringify(data));
        return reply({questionId,selectedOptionId:selected,respondedAt:'2026-11-11T18:00:00Z'});
      }
      if(pathname.endsWith('/finalize')&&method==='POST'){
        if(Object.keys(data.answers).length!==30)return reply({message:'Incomplete'},422);
        data.finished=true;sessionStorage.setItem('pilot-ui-state',JSON.stringify(data));return reply(result());
      }
      if(pathname.endsWith('/result'))return data.finished?reply(result()):reply({message:'Ainda em andamento'},409);
      throw new Error('Unexpected isolated request: '+pathname);
    };
  `});
  const clickText=text=>evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Button absent');b.click();})()`);
  await cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:950,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:origin+'/diagnostico-inicial'});
  await until('!!document.querySelector(".initial-diagnostic-intro")');
  assert.equal(await evaluate('!!document.querySelector(".initial-diagnostic-pilot-notice")'),true);
  await clickText('Iniciar ou retomar diagnóstico');
  await until('document.querySelectorAll(".initial-diagnostic-question-nav button").length===30');
  assert.equal(await evaluate('document.querySelectorAll(".initial-diagnostic-answers input").length'),4);
  assert.equal(await evaluate('!!document.querySelector(".initial-diagnostic-pilot-notice")'),true);
  pass('aluno entra no piloto real de 30 questões com quatro alternativas e aviso de revisão');
  await clickText('Ver revisão');
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Finalizar diagnóstico").disabled'),true);
  await clickText('Voltar à questão');
  pass('finalização permanece bloqueada enquanto há questões sem resposta');
  const select=async(index,letter)=>{
    await evaluate(`document.querySelectorAll('.initial-diagnostic-question-nav button')[${index}].click()`);
    await until(`document.querySelector('.initial-diagnostic-question-head p').textContent==='QUESTÃO ${index+1} DE 30'`);
    await evaluate(`document.querySelector('input[value=${JSON.stringify(fixture.questions[index]._draftSlot+':'+letter)}]').click()`);
    await until(`document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')==='${index+1}'`);
  };
  await select(0,fixture.questions[0].gabarito);
  await cdp('Page.reload');
  await until('!!document.querySelector(".initial-diagnostic-workspace")&&document.querySelector("[role=progressbar]").getAttribute("aria-valuenow")==="1"');
  assert.equal(await evaluate('document.querySelectorAll(".initial-diagnostic-answers input:checked").length'),1);
  pass('resposta salva é recuperada após atualizar a página');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  const mobile=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path.join(profile,'pilot-mobile.png'),Buffer.from(mobile.data,'base64'));
  pass('questão e aviso de piloto cabem em tela de 390 px');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1366,height:950,deviceScaleFactor:1,mobile:false});
  for(let i=1;i<30;i++)await select(i,i<15?fixture.questions[i].gabarito:[...'ABCD'].find(l=>l!==fixture.questions[i].gabarito));
  await clickText('Revisar respostas');
  await clickText('Finalizar diagnóstico');
  await until('!!document.querySelector("[role=dialog]")');
  await clickText('Confirmar finalização');
  await until('!!document.querySelector(".initial-diagnostic-result")');
  assert.equal(await evaluate('document.querySelector("#initial-diagnostic-result-title").textContent'),'Seu resultado provisório');
  assert.equal(await evaluate('document.querySelectorAll(".initial-diagnostic-result-summary strong")[0].textContent'),'50%');
  assert.equal(await evaluate('document.querySelectorAll(".initial-diagnostic-result-summary strong")[1].textContent'),'15/30');
  assert.equal(await evaluate('!!document.querySelector(".initial-diagnostic-pilot-notice")'),true);
  const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path.join(profile,'pilot-result.png'),Buffer.from(screenshot.data,'base64'));
  pass('30 respostas produzem resultado provisório de 15 acertos e 50%');
  await cdp('Page.reload');
  await until('!!document.querySelector(".initial-diagnostic-result")');
  assert.equal(await evaluate('document.querySelector("#initial-diagnostic-result-title").textContent'),'Seu resultado provisório');
  assert.equal(await evaluate('window.requests.some(r=>!r.pathname.startsWith("/initial-diagnostic")&&r.pathname!=="/auth/session")'),false);
  pass('resultado concluído é retomado com rótulo provisório, sem requisições imprevistas');
  console.log(`Piloto: ${checks} verificações aprovadas; API simulada. Capturas: ${profile}`);
} finally {
  try { await closeBrowser?.(); } catch {}
  socket?.close(); browser.kill(); vite.kill();
}
