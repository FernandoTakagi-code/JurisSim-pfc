// Interface real do diagnóstico com respostas isoladas; nunca usa a API compartilhada nem contas reais.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const origin = 'http://127.0.0.1:5193';
const browserPath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!browserPath) throw new Error('Defina CHROME_PATH com o caminho do Chrome ou Edge instalado.');
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-pilot-ui-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5193', '--strictPort'], {
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
    sessionStorage.setItem('jurissim_token','isolated-performance-fixture');
    const disciplines=['Direito Constitucional','Direito Civil','Direito Administrativo','Direito do Trabalho','Direito Penal'];
    const counts={assigned:20,answered:18,correct:12,incorrect:6,unanswered:2,percentage:66.67};
    window.fixtureMode='ready';window.performanceRequests=[];
    window.fetch=async(url,init={})=>{
      const p=new URL(String(url),location.origin);window.performanceRequests.push(p.pathname+p.search);
      const reply=(value,status=200)=>new Response(JSON.stringify(value),{status});
      if(p.pathname==='/auth/session')return reply({user:{id:'fixture',nome:'Aluno de teste',email:'test@example.invalid',role:'ALUNO',emailVerificado:true},nextStep:'DASHBOARD'});
      if(p.pathname==='/students/me/performance'){
        if(window.fixtureMode==='loading')return new Promise(()=>{});
        if(window.fixtureMode==='error')return reply({message:'Falha sintética de conexão para verificar legibilidade.'},500);
        const empty=window.fixtureMode==='empty';
        return reply({kind:p.searchParams.get('kind')||'all',totals:{...counts,correct:60,incorrect:30,answered:90,activities:empty?0:5},
          modalities:[{kind:'diagnostic',activities:1},{kind:'practice',activities:4}],provisional:true,reviewEnabled:false,
          disciplines:disciplines.map(d=>({...counts,discipline:d})),
          topics:disciplines.map((d,i)=>({...counts,discipline:d,topic:i===0?'Controle de constitucionalidade e direitos fundamentais':'Assunto de teste '+i,provisional:false,reviewCount:0}))});
      }
      if(p.pathname==='/students/me/overview')return reply({latestDiagnosticId:null,evolution:[],recentActivities:[],totals:{completedActivities:0}});
      return reply({items:[]});
    };
  ` });
  const click=async text=>evaluate(`(()=>{const b=[...document.querySelectorAll('.performance-page button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('Missing button');b.click()})()`);
  const checkContrast=async()=>evaluate(`(()=>{
    const rgb=s=>s.match(/[\\d.]+/g).map(Number);
    const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    const background=el=>{for(let e=el;e;e=e.parentElement){const c=rgb(getComputedStyle(e).backgroundColor);if(c.length===3||c[3]===1)return c;}return [255,255,255];};
    const failures=[];let checked=0,min=100;
    for(const el of document.querySelectorAll('.performance-page *')){
      const cs=getComputedStyle(el);
      if(!el.getClientRects().length||!Array.from(el.childNodes).some(n=>n.nodeType===3&&n.textContent.trim()))continue;
      const contrast=ratio(rgb(cs.color),background(el));const size=parseFloat(cs.fontSize);
      const large=size>=24||(size>=18.66&&parseInt(cs.fontWeight)>=700);const required=large?3:4.5;
      checked++;min=Math.min(min,contrast);
      if(contrast<required)failures.push({text:el.textContent.trim().slice(0,60),contrast,required,color:cs.color,bg:background(el)});
    }
    return {checked,min,failures,overflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  await cdp('Page.navigate',{url:origin+'/desempenho'});
  await until('document.querySelectorAll(".performance-stats article").length===4');
  const evidence=path.resolve('.artifacts','evidence','performance-contrast');
  const {mkdir}=await import('node:fs/promises');await mkdir(evidence,{recursive:true});
  for(const theme of ['light','dark']){
    await evaluate(`localStorage.setItem('jurissim-theme',${JSON.stringify(theme)})`);
    await cdp('Page.reload');await sleep(250);await until('document.querySelectorAll(".performance-disciplines progress").length===5');
    for(const width of [1440,768,390,320]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
      const result=await checkContrast();
      assert.deepEqual(result.failures,[],theme+' '+width+' text contrast');
      assert.equal(result.overflow,false,theme+' '+width+' overflow');
      assert.equal(await evaluate('document.querySelectorAll(".performance-disciplines progress").length'),5);
      const bars=await evaluate(`(()=>{const p=document.querySelector('progress');return {fill:getComputedStyle(p,'::-webkit-progress-value').backgroundColor,track:getComputedStyle(p).backgroundColor}})()`);
      if(width===1440||width===390){const capture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(path.join(evidence,theme+'-'+width+'.png'),Buffer.from(capture.data,'base64'));}
      console.log('PASS: '+theme+' '+width+'px; '+result.checked+' textos; contraste mínimo '+result.min.toFixed(2)+':1; sem overflow');checks++;
    }
  }
  await click('Civil');await until('document.querySelectorAll(".performance-topics article").length===1');
  await click('Treinos');await until('window.performanceRequests.includes("/students/me/performance?kind=practice")');
  await until('document.querySelectorAll(".performance-stats article").length===4');
  console.log('PASS: filtros de disciplina e modalidade preservados');checks++;
  for(const mode of ['loading','error','empty']){
    await evaluate('window.fixtureMode='+JSON.stringify(mode));await click('Atualizar dados');
    await until(mode==='loading'?'!!document.querySelector(".performance-state[role=status]")':mode==='error'?'!!document.querySelector(".performance-state[role=alert]")':'document.body.textContent.includes("Nenhuma atividade concluída neste filtro")');
    const result=await checkContrast();assert.deepEqual(result.failures,[],mode+' contrast');assert.equal(result.overflow,false);
    if(mode==='loading'){await evaluate('window.fixtureMode="ready"');await cdp('Page.reload');await until('document.querySelectorAll(".performance-stats article").length===4');}
    console.log('PASS: estado '+mode+' com contraste AA');checks++;
  }
  console.log(checks+' verificações aprovadas; UI real com API simulada. Capturas: '+evidence);
} finally {
  try{await closeBrowser?.();}catch{}
  socket?.close();browser.kill();vite.kill();
}
