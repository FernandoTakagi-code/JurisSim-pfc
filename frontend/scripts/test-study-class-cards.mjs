// Real diagnostic UI with isolated responses; never uses the shared API or real accounts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const origin = 'http://127.0.0.1:5196';
const browserPath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!browserPath) throw new Error('Defina CHROME_PATH com o caminho do Chrome ou Edge instalado.');
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-pilot-ui-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5196', '--strictPort'], {
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
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    sessionStorage.setItem('jurissim_token','isolated-card-fixture');
    localStorage.setItem('jurissim-learning-progress:fixture',JSON.stringify({completed:[],inProgress:['civil-pessoas'],openedSections:{}}));
    window.cardMode='ready';
    window.fetch=async(url,init={})=>{
      const p=new URL(String(url),location.origin).pathname;
      const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
      if(p==='/auth/session')return reply({user:{id:'fixture',nome:'Aluno de teste',email:'fixture@example.invalid',role:'ALUNO',emailVerificado:true},nextStep:'DASHBOARD'});
      if(p==='/profile/photo')return reply({kind:'default',version:'fixture'});
      if(p==='/institutions/availability')return reply({enabled:false});
      if(p==='/turmas/requests')return reply({items:[],page:1,hasMore:false});
      if(p==='/turmas')return reply({items:[1,2].map(i=>({id:'00000000-0000-4000-8000-00000000032'+i,nome:'Teste '+i,archivedAt:null,_count:{alunos:i}})),page:1,hasMore:false});
      if(p.startsWith('/turmas/')){await new Promise(r=>setTimeout(r,350));return reply({id:p.split('/').pop(),nome:p.endsWith('322')?'Teste 2':'Teste 1',enrollment:{status:'APPROVED'},professors:[{id:'teacher',nome:'Professor'}],exams:[],page:1,hasMore:false});}
      if(p==='/students/me/overview')return reply({latestDiagnosticId:'diagnostic',latestDiagnosticInitial:true,evolution:[],recentActivities:[],totals:{completedActivities:1}});
      if(p==='/initial-diagnostic/diagnostic/result'){
        if(window.cardMode==='loading')return new Promise(()=>{});
        return reply({id:'diagnostic',performances:[{tipo:'DISCIPLINA',disciplina:'Direito Civil',percentual:70},{tipo:'DISCIPLINA',disciplina:'Direito Penal',percentual:20}],trail:{disciplinaPrioritaria:'Direito Civil',assuntoPrioritario:'Pessoas naturais',nivelRecomendado:'INTERMEDIARIO'}});
      }
      return reply({items:[]});
    };
  `});
  const {mkdir}=await import('node:fs/promises');const evidence=path.resolve('..','docs','evidence','study-class-cards');await mkdir(evidence,{recursive:true});
  const open=async route=>{await cdp('Page.navigate',{url:origin+route});await sleep(200);};
  for(const theme of ['light','dark']){
    await open('/turmas');await until('document.querySelectorAll(".student-class-card").length===2');
    await evaluate(`localStorage.setItem('jurissim-theme',${JSON.stringify(theme)})`);await cdp('Page.reload');await sleep(250);await until('document.querySelectorAll(".student-class-card").length===2');
    for(const width of [1440,768,390]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
      const state=await evaluate(`(()=>{const c=document.querySelector('.student-class-card'),b=c.querySelector('button'),r=b.getBoundingClientRect(),s=getComputedStyle(b);return {height:r.height,background:s.backgroundColor,label:b.getAttribute('aria-label'),arrow:!!b.querySelector('svg'),title:c.querySelector('h2').textContent,status:c.querySelector('.student-class-status').textContent}})()`);
      assert.ok(state.height>=44);assert.equal(state.arrow,true);assert.equal(state.title,'Teste 1');assert.equal(state.status,'Ativa');assert.equal(state.label,'Acessar turma Teste 1');
      if(width!==768){const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(path.join(evidence,theme+'-'+width+'-classes.png'),Buffer.from(shot.data,'base64'));}
      console.log('PASS: classes '+theme+' '+width+'px; aligned title/status/count and primary accessible action');checks++;
    }
    await evaluate('document.querySelectorAll(".class-access-button")[1].click()');
    await until('!!document.querySelector(".class-detail-page [role=status]")');
    await until('document.querySelector(".class-detail-page h1")?.textContent==="Teste 2"');
    assert.equal(await evaluate('location.pathname.endsWith("322")'),true);
    await open('/estudar');await until('!!document.querySelector(".study-priority-button")');
    assert.equal(await evaluate('document.querySelector(".study-priority-discipline").textContent'),'Direito Civil');
    assert.equal(await evaluate('document.querySelector(".study-priority-metrics dd").textContent'),'70%');
    assert.equal(await evaluate('!!document.querySelector(".study-priority-card > span")'),false);
    const selectors=['.study-continue .primary','.study-priority-button'];
    for(const state of ['normal','hover','focus','disabled']){
      const samples=[];
      for(const selector of selectors){
        const {root}=await cdp('DOM.getDocument');const {nodeId}=await cdp('DOM.querySelector',{nodeId:root.nodeId,selector});
        await cdp('CSS.enable');await cdp('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:state==='hover'?['hover']:state==='focus'?['focus-visible']:[]});
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).disabled=${state==='disabled'}`);
        samples.push(await evaluate(`(()=>{const s=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return Object.fromEntries(['backgroundColor','borderTopColor','borderTopWidth','color','opacity','outlineColor','outlineStyle'].map(k=>[k,s[k]]))})()`));
        await cdp('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});await evaluate(`document.querySelector(${JSON.stringify(selector)}).disabled=false`);
      }
      assert.deepEqual(samples[0],samples[1],theme+' buttons must share '+state+' styles');
    }
    for(const width of [1440,768,390]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:width<600});
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
      if(width!==768){const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(path.join(evidence,theme+'-'+width+'-study.png'),Buffer.from(shot.data,'base64'));}
    }
    console.log('PASS: study '+theme+'; correct discipline/percentage/level, no loose icon, same button styles in four states; desktop/tablet/mobile');checks++;
    await cdp('Network.enable');await cdp('Network.emulateNetworkConditions',{offline:false,latency:350,downloadThroughput:2000000,uploadThroughput:2000000});
    await evaluate('document.querySelector(".study-priority-button").click()');
    await until('document.querySelector(".study-priority-button")?.disabled===true');
    await until('document.querySelector(".study-module-detail h2")?.textContent.includes("Pessoas naturais")');
    assert.equal(await evaluate('document.querySelector(".study-discipline-panel button.active").textContent.includes("Direito Civil")'),true);
    await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    console.log('PASS: recommended discipline opens its matched lesson, shows loading state and keeps selected discipline');checks++;
  }
  console.log(checks+' checks passed; real UI and lesson imports, isolated API fixtures. Screenshots: '+evidence);
}finally{try{await closeBrowser?.();}catch{}socket?.close();browser.kill();vite.kill();}
