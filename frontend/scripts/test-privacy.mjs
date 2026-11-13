import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:5186';
await mkdir('.artifacts', { recursive: true });
const configDirectory = await mkdtemp(path.resolve('.artifacts/privacy-headers-'));
const configFile = path.join(configDirectory, 'vite.config.mjs');
const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
const headers = Object.fromEntries(vercel.headers[0].headers.map(item => [item.key, item.value]));
assert.equal(headers['Permissions-Policy'], 'camera=(self), microphone=(), geolocation=()');
await writeFile(configFile, `import react from '@vitejs/plugin-react';export default {envDir:false,plugins:[react()],server:{headers:${JSON.stringify(headers)}}};`);
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-privacy-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', configFile, '--configLoader', 'runner', '--host', '127.0.0.1', '--port', '5186', '--strictPort'], {
  windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:1', VITE_GOOGLE_CLIENT_ID: '', VITE_INITIAL_DIAGNOSTIC_UI_ENABLED: 'false' },
});
const browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket, checks = 0;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = ''; const timer = setTimeout(() => reject(Error('Chrome startup timeout')), 20000);
    browser.on('error', reject); browser.stderr.on('data', chunk => { stderr += chunk; const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
  });
  let ready = false;
  for (let i = 0; i < 100; i++) { if (await fetch(origin).then(r => r.ok).catch(() => false)) { ready = true; break; } await sleep(100); }
  assert(ready, 'test Vite must start on its own port');
  const response = await fetch(origin);
  assert.equal(response.headers.get('permissions-policy'), headers['Permissions-Policy']);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-security-policy'), headers['Content-Security-Policy']);
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(Error('Chrome debugger unavailable')), { once: true }); });
  let sequence = 0; const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`Timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); }
    if (m.method === 'Fetch.requestPaused') { const allowed = m.params.request.url.startsWith(origin + '/'); void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: m.params.requestId, ...(allowed ? {} : { errorReason: 'BlockedByClient' }) }, m.sessionId).catch(() => {}); }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params = {}) => send(method, params, sessionId);
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  const evaluate = async expression => { const r = await cdp('Runtime.evaluate', { expression: /\bawait\b/.test(expression) ? `(async()=>{${expression}})()` : expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error('Browser expression failed: ' + expression.slice(0, 120)); return r.result.value; };
  const until = async expression => { for (let i = 0; i < 140; i++) { try { if (await evaluate(expression)) return; } catch {} await sleep(50); } throw Error('Condition failed: ' + expression); };
  const pass = message => { checks++; console.log('PASS PRIVACY: ' + message); };
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.owner='owner-a';window.downloads=[];window.exportCalls=[];window.exportStatus=200;window.delayExport=false;
    sessionStorage.setItem('jurissim_token','privacy-token-a');
    const originalObjectUrl=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.lastExportBlob=blob;return originalObjectUrl(blob);};
    const originalClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.startsWith('jurissim-meus-dados-')){window.downloads.push({name:this.download,blob:window.lastExportBlob});return;}return originalClick.call(this);};
    window.fetch=async(url,init={})=>{const u=new URL(String(url)),route=u.pathname;const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
      if(route==='/auth/session')return reply({user:{id:window.owner,nome:'Privacy fixture',email:window.owner+'@example.invalid',role:'ALUNO',emailVerificado:true},nextStep:'DASHBOARD'});
      if(route==='/profile/photo')return reply({kind:'default'});
      if(route==='/institutions/availability')return reply({enabled:false,registrationEnabled:false,administrationEnabled:false,capabilities:{}});
      if(route==='/institutions/mine')return reply([]);
      if(route==='/students/me/overview')return reply({totals:{completedActivities:0,completedDiagnostics:0,completedTrails:0,totalQuestions:0,answeredQuestions:0,correctAnswers:0,incorrectAnswers:0,unansweredQuestions:0},evolution:[],recentActivities:[],latestDiagnosticId:null});
      if(route.startsWith('/students/me/'))return reply({items:[],nextCursor:null});
      if(route==='/auth/dados'){const page=Number(u.searchParams.get('page')||1),owner=window.owner;window.exportCalls.push({page,owner,authorization:init.headers?.Authorization});const data={schemaVersion:1,page,nextPage:owner==='owner-a'&&page===1?2:null,scope:'Synthetic fixture',profile:{id:owner,email:owner+'@example.invalid'},attempts:[],goals:[],reviews:[],audit:[]};if(window.delayExport)return new Promise(resolve=>{window.releaseExport=()=>resolve(reply(data));});return window.exportStatus===200?reply(data):reply({message:'Exportação temporariamente indisponível.'},window.exportStatus);}
      throw Error('Unexpected isolated request: '+route);
    };
  ` });
  await cdp('Page.navigate', { url: origin + '/perfil?aba=security' });
  await until('!!document.querySelector("[aria-labelledby=privacy-settings-title] button")');
  pass('profile shows personal export without another authentication system');
  const camera = await evaluate(`const policy=document.permissionsPolicy||document.featurePolicy;const allowed=policy.allowsFeature('camera');const media=await navigator.mediaDevices.getUserMedia({video:true,audio:false});const video=document.createElement('video');video.muted=true;video.srcObject=media;await video.play();const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;canvas.getContext('2d').drawImage(video,0,0,320,240);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));media.getTracks().forEach(track=>track.stop());return {allowed,microphone:policy.allowsFeature('microphone'),geolocation:policy.allowsFeature('geolocation'),size:blob.size,stopped:media.getTracks().every(track=>track.readyState==='ended')};`);
  assert.equal(camera.allowed, true); assert.equal(camera.microphone, false); assert.equal(camera.geolocation, false); assert(camera.size > 0); assert(camera.stopped);
  pass('effective Vercel headers permit same-origin fake-camera capture and keep microphone/geolocation denied');
  const click = () => evaluate('document.querySelector("[aria-labelledby=privacy-settings-title] button").click()');
  await click(); await until('window.downloads.length===1');
  assert.equal(await evaluate('window.downloads[0].name'), 'jurissim-meus-dados-1.json');
  assert.equal(await evaluate('return JSON.parse(await window.downloads[0].blob.text()).profile.id;'), 'owner-a');
  await until('document.querySelector("[aria-labelledby=privacy-settings-title] button").textContent.includes("página 2")');
  pass('first JSON page contains only the fixture owner and offers the next page');
  await click(); await until('window.downloads.length===2');
  assert.equal(await evaluate('window.downloads[1].name'), 'jurissim-meus-dados-2.json');
  assert.deepEqual(await evaluate('window.exportCalls.map(call=>call.page)'), [1,2]);
  await until('document.querySelector("[aria-labelledby=privacy-settings-title] [role=status]")?.textContent.includes("concluída")');
  pass('pagination completes without silently repeating the first page');
  await evaluate('window.exportStatus=503'); await click();
  await until('!!document.querySelector("[aria-labelledby=privacy-settings-title] [role=alert]")');
  assert.equal(await evaluate('window.downloads.length'), 2); assert.equal(await evaluate('sessionStorage.getItem("jurissim_token")'), 'privacy-token-a');
  pass('server error preserves authentication and produces no false download or success');
  await evaluate('window.exportStatus=200;window.delayExport=true');
  const before = await evaluate('window.exportCalls.length');
  await evaluate('const b=document.querySelector("[aria-labelledby=privacy-settings-title] button");b.click();b.click();');
  await until('typeof window.releaseExport==="function"'); assert.equal(await evaluate('window.exportCalls.length'), before+1);
  pass('synchronous repeated clicks reserve only one export request');
  await evaluate('const s=await import("/src/auth-session.ts");window.owner="owner-b";await s.establishSession("privacy-token-b");');
  await until('document.querySelector("[aria-labelledby=privacy-settings-title] button")?.textContent==="Baixar meus dados"');
  await evaluate('window.releaseExport();window.delayExport=false;'); await sleep(150);
  assert.equal(await evaluate('window.downloads.length'), 2);
  pass('late response from the previous session cannot download another account data');
  await click(); await until('window.downloads.length===3');
  assert.equal(await evaluate('return JSON.parse(await window.downloads[2].blob.text()).profile.id;'), 'owner-b');
  assert.equal(await evaluate('window.exportCalls.at(-1).page'), 1);
  pass('replacement session restarts pagination and downloads its own data');
  for (const width of [320,768,1366]) { await cdp('Emulation.setDeviceMetricsOverride', { width,height:950,deviceScaleFactor:1,mobile:width<500 }); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true); }
  pass('privacy controls remain responsive at mobile, tablet and desktop widths');
  await evaluate('window.delayExport=true'); await click(); await until('typeof window.releaseExport==="function"');
  await evaluate('const s=await import("/src/auth-session.ts");s.endSession();window.releaseExport();'); await sleep(150);
  assert.equal(await evaluate('window.downloads.length'), 3);
  pass('logout/unmount suppresses an outstanding export without storing personal data');
  console.log(`Privacy browser: ${checks} checks passed; API simulated, downloads intercepted, fake camera with effective headers; no real database or email.`);
} finally { socket?.close(); browser.kill(); vite.kill(); }
