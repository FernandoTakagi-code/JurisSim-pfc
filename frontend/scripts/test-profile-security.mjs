// Real diagnostic UI with isolated responses; never uses the shared API or real accounts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const origin = 'http://127.0.0.1:5194';
const browserPath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!browserPath) throw new Error('Defina CHROME_PATH com o caminho do Chrome ou Edge instalado.');
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-pilot-ui-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5194', '--strictPort'], {
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
    sessionStorage.setItem('jurissim_token','isolated-profile-fixture');
    window.profileRequests=[];
    window.fetch=async(url,init={})=>{
      const p=new URL(String(url),location.origin).pathname;window.profileRequests.push({path:p,method:init.method||'GET',body:init.body});
      const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
      if(p==='/auth/session')return reply({user:{id:'fixture',nome:'Aluno de teste',email:'profile@example.invalid',role:'ALUNO',emailVerificado:true},nextStep:'DASHBOARD'});
      if(p==='/profile/photo')return reply({kind:'default',version:'fixture'});
      if(p==='/auth/account/email-change')return reply({message:'Confirmação enviada ao novo endereço de teste.'},202);
      if(p==='/auth/password-recovery')return reply({message:'Solicitação de redefinição recebida.'},202);
      if(p==='/auth/logout')return reply({message:'Sessões encerradas.'});
      return reply({items:[]});
    };
  `});
  await cdp('Page.navigate',{url:origin+'/perfil'});await until('!!document.querySelector("#profile-page-title")');
  const {mkdir}=await import('node:fs/promises');const evidence=path.resolve('..','docs','evidence','profile-layout');await mkdir(evidence,{recursive:true});
  const select=async tab=>{await evaluate(`document.getElementById('profile-tab-${tab}').click()`);await until(`document.getElementById('profile-tab-${tab}').getAttribute('aria-selected')==='true'`);await sleep(40);};
  for(const theme of ['dark','light']){
    await evaluate(`localStorage.setItem('jurissim-theme',${JSON.stringify(theme)})`);await cdp('Page.reload');await sleep(250);await until('!!document.querySelector("#profile-page-title")');
    for(const width of [1440,1024,768,390,320]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
      await evaluate('window.scrollTo(0,0)');let baseline;
      for(const tab of ['personal','security','appearance','personal','appearance','security']){
        await select(tab);
        const state=await evaluate(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width}};const cards=[...document.querySelectorAll('#profile-tab-panel .v0-panel')];return {title:rect('#profile-page-title'),tabs:rect('.profile-page .v0-tabs'),panel:rect('#profile-tab-panel'),cards:cards.map(c=>({bg:getComputedStyle(c).backgroundColor,border:getComputedStyle(c).borderColor,x:c.getBoundingClientRect().x})),themeBg:getComputedStyle(document.querySelector('.v0-app')).getPropertyValue('--v0-panel').trim(),overflow:document.documentElement.scrollWidth>innerWidth,tabsCount:document.querySelectorAll('.profile-page [role=tab]').length}})()`);
        assert.equal(state.tabsCount,3);assert.equal(state.overflow,false,theme+' '+width+' '+tab+' overflow');
        if(!baseline)baseline={title:state.title,tabs:state.tabs,panel:state.panel};
        for(const key of ['title','tabs','panel'])for(const axis of ['x','y','width'])assert.ok(Math.abs(state[key][axis]-baseline[key][axis])<.6,theme+' '+width+' '+tab+' '+key+'.'+axis+' shifted');
        assert.ok(state.cards.length>=1);assert.ok(state.cards.every(c=>c.bg===state.cards[0].bg));
        if(tab==='security')assert.equal(state.cards.length,1,'security has one principal card');
        if(width===1440||width===390){const capture=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(path.join(evidence,theme+'-'+width+'-'+tab+'.png'),Buffer.from(capture.data,'base64'));}
        // Keep a canonical RGB surface for comparison across tab changes.
        if(tab==='personal')baseline.surface=state.cards[0].bg;
        else assert.equal(state.cards[0].bg,baseline.surface,'all tabs share theme surface');
      }
      console.log('PASS: '+theme+' '+width+'px; title, tabs and content fixed through six switches; same card surface; no overflow');checks++;
    }
  }
  await select('personal');assert.equal(await evaluate('document.querySelectorAll("#privacy-settings-title").length'),1);
  await select('security');assert.equal(await evaluate('document.querySelectorAll("#privacy-settings-title").length'),0);
  const click=async text=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(${JSON.stringify(text)}));if(!b)throw Error('Missing button');b.click()})()`);
  await click('Alterar e-mail');await until('!!document.querySelector("[role=alertdialog]")');
  await evaluate(`(()=>{const inputs=document.querySelectorAll('.account-action-form input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;['new@example.invalid','new@example.invalid','Fixture-password1!'].forEach((value,i)=>{set.call(inputs[i],value);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));});})()`);
  await click('Enviar confirmação');await until('!document.querySelector("[role=alertdialog]")');
  assert.equal(await evaluate('window.profileRequests.some(r=>r.path==="/auth/account/email-change"&&r.method==="POST")'),true);
  await click('Redefinir senha');await until('!!document.querySelector("[role=alertdialog]")');await click('Enviar link de redefinição');await until('!document.querySelector("[role=alertdialog]")');
  assert.equal(await evaluate('window.profileRequests.some(r=>r.path==="/auth/password-recovery")'),true);
  await click('Sair de todos os dispositivos');await until('!!document.querySelector("[role=alertdialog]")');
  await click('Cancelar');await until('!document.querySelector("[role=alertdialog]")');
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Excluir minha conta").disabled'),true);
  console.log('PASS: export in personal only; email/password dialogs invoke original endpoints; global logout confirmation preserved; deletion blocked');checks++;
  console.log(checks+' checks passed with isolated API fixtures. Screenshots: '+evidence);
}finally{try{await closeBrowser?.();}catch{}socket?.close();browser.kill();vite.kill();}
