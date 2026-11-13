// Real React form, isolated fetch responses. Never connects to the shared API.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const origin = 'http://127.0.0.1:5190';
const browserPath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!browserPath) throw new Error('Defina CHROME_PATH com o caminho do Chrome ou Edge instalado.');
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-question-form-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5190', '--strictPort'], {
  windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:1', VITE_GOOGLE_CLIENT_ID: '' },
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
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    sessionStorage.setItem('jurissim_token', 'isolated-question-form-token');
    window.questions = JSON.parse(sessionStorage.getItem('fixture-questions') || '[]');
    window.requests = [];
    window.fetch = async (url, init = {}) => {
      const route = new URL(String(url)).pathname;
      const method = init.method || 'GET';
      const body = init.body ? JSON.parse(init.body) : undefined;
      window.requests.push({route,method,body});
      const reply = value => new Response(JSON.stringify(value), {status:200});
      if (route === '/auth/session') return reply({user:{id:'teacher-fixture',nome:'Professor de teste',email:'teacher@example.invalid',role:'PROFESSOR',emailVerificado:true},nextStep:'PROFESSOR'});
      if (route === '/profile/photo') return reply({kind:'default'});
      if (route === '/institutions/availability') return reply({enabled:false});
      if (route === '/questoes' && method === 'GET') return reply(window.questions);
      if (route.startsWith('/questoes') && ['POST','PUT'].includes(method)) {
        const id = method === 'POST' ? 'question-fixture' : route.split('/')[2];
        const q = {...body,id,autorId:'teacher-fixture',canManage:true,alternativas:body.alternativas.map((a,i)=>({...a,letra:'ABCD'[i]}))};
        window.questions = method === 'POST' ? [...window.questions,q] : window.questions.map(old=>old.id===id?q:old);
        sessionStorage.setItem('fixture-questions',JSON.stringify(window.questions)); return reply(q);
      }
      throw new Error('Unexpected isolated request: '+route);
    };
  ` });
  await cdp('Emulation.setDeviceMetricsOverride', {width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate', {url:origin+'/professor/questoes/nova'});
  await until('!!document.querySelector(".question-form")');
  assert.equal(await evaluate('document.querySelectorAll(".alternative-row textarea").length'),4);
  assert.equal(await evaluate('document.querySelectorAll(".alternative-row input:checked").length'),0);
  assert.equal(await evaluate('!!document.querySelector(".alternative-row button")'),false);
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Adicionar alternativa"))'),false);
  pass('cadastro oferece A–D fixas e exige escolha explícita do gabarito');
  const fill = async (selector, value) => evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const correctSelector = letter => `[aria-label="Marcar alternativa ${letter} como correta"]`;
  const chooseCorrect = letter => evaluate(`document.querySelector(${JSON.stringify(correctSelector(letter))}).click()`);
  const isCorrect = letter => evaluate(`document.querySelector(${JSON.stringify(correctSelector(letter))}).checked`);
  await fill('.question-form > label textarea','Enunciado autoral de teste do formulário');
  await fill('.question-form input[list]','Direito Constitucional');
  await fill('.question-form .form-row label:nth-child(2) input','Direito de petição');
  await fill('.question-form .form-row:nth-of-type(2) input','CF, art. 5º, XXXIV, a.');
  for (const letter of 'ABCD') await fill(`[aria-label="Texto da alternativa ${letter}"]`,'Resposta de teste '+letter);
  const submit = () => evaluate('document.querySelector(".form-actions .primary").click()');
  await submit();
  await until('document.querySelector(".form-problems")?.textContent.includes("correta")');
  assert.equal(await evaluate('window.requests.filter(r=>r.method==="POST").length'),0);
  pass('sem gabarito, a interface impede o envio');
  await chooseCorrect('C');
  await fill('[aria-label="Texto da alternativa B"]','  RESPOSTA DE TESTE A  ');
  await submit();
  await until('document.querySelector(".form-problems")?.textContent.includes("diferentes")');
  assert.equal(await evaluate('window.requests.filter(r=>r.method==="POST").length'),0);
  pass('textos repetidos são recusados antes de enviar');
  await fill('[aria-label="Texto da alternativa B"]','Resposta de teste B');
  await submit();
  await until('!!document.querySelector(".question-card")');
  const created = await evaluate('window.requests.find(r=>r.method==="POST").body');
  assert.equal(created.alternativas.length,4);
  assert.deepEqual(created.alternativas.map(a=>a.correta),[false,false,true,false]);
  pass('cadastro válido envia quatro alternativas e mantém a seleção C');
  await evaluate('[...document.querySelectorAll(".question-card-actions button")].find(b=>b.textContent.includes("Editar")).click()');
  await until('!!document.querySelector(".question-form")');
  assert.equal(await isCorrect('C'),true);
  await chooseCorrect('D');
  await submit();
  await until('!!document.querySelector(".question-card")');
  assert.deepEqual(await evaluate('window.requests.find(r=>r.method==="PUT").body.alternativas.map(a=>a.correta)'),[false,false,false,true]);
  pass('edição recupera o gabarito e permite alterá-lo para D');
  await evaluate(`sessionStorage.setItem('fixture-complete',JSON.stringify(window.questions[0]));const q=window.questions[0];sessionStorage.setItem('fixture-questions',JSON.stringify([{...q,alternativas:[q.alternativas[3],q.alternativas[1],q.alternativas[0],q.alternativas[2]]}]))`);
  await cdp('Page.navigate',{url:origin+'/professor/questoes/question-fixture/editar'});
  await until('!!document.querySelector(".question-form")');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Texto da alternativa A"]').value`),'Resposta de teste A');
  assert.equal(await isCorrect('D'),true);
  pass('edição ordena letras persistidas mesmo quando a resposta da API vem fora de ordem');
  await evaluate(`{const q=JSON.parse(sessionStorage.getItem('fixture-complete'));sessionStorage.setItem('fixture-questions',JSON.stringify([{...q,alternativas:q.alternativas.slice(0,2).map((a,i)=>({...a,letra:null,correta:i===1}))}]))}`);
  await cdp('Page.navigate',{url:origin+'/professor/questoes/question-fixture/editar'});
  await until('!!document.querySelector(".question-form")');
  assert.equal(await evaluate('document.querySelectorAll(".alternative-row textarea").length'),4);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Texto da alternativa A"]').value`),'Resposta de teste A');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Texto da alternativa C"]').value`),'');
  assert.equal(await isCorrect('B'),true);
  pass('questão antiga com duas opções é preservada e recebe campos vazios C e D');
  await evaluate(`const q=JSON.parse(sessionStorage.getItem('fixture-complete'));q.alternativas=q.alternativas.map(a=>({...a,correta:false}));q.alternativas.push({texto:'Quinta opção antiga',correta:true,letra:null});sessionStorage.setItem('fixture-questions',JSON.stringify([q]))`);
  await cdp('Page.navigate',{url:origin+'/professor/questoes/question-fixture/editar'});
  await until('document.querySelectorAll(".alternative-row textarea").length===5');
  assert.equal(await evaluate('!!document.querySelector(".question-form [role=alert]")'),true);
  await evaluate(`document.querySelector('[aria-label="Remover alternativa E"]').click()`);
  await until('document.querySelectorAll(".alternative-row textarea").length===4');
  assert.equal(await evaluate('document.querySelectorAll(".alternative-row input:checked").length'),0);
  assert.equal(await evaluate('!!document.querySelector(".alternative-row button")'),false);
  pass('questão antiga com cinco opções exige remoção explícita e não escolhe outro gabarito automaticamente');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile(path.join(profile,'question-form-mobile.png'),Buffer.from(shot.data,'base64'));
  pass('formulário funciona sem transbordamento horizontal em 390 px');
  console.log(`Questões: ${checks} verificações aprovadas; API simulada. Captura: ${profile}`);
} finally {
  try { await closeBrowser?.(); } catch {}
  socket?.close(); browser.kill(); vite.kill();
}
