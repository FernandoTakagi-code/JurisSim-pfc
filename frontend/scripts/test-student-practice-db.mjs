// Called only by the guarded disposable-PostgreSQL integration test. No fixtures
// replace fetch/session: the login form and every API request use real Express.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from 'node:url';
// This executable only accepts the disposable harness, never the real backend.
assert.equal(process.env.NODE_ENV,'test');
const api=new URL(process.env.JURISSIM_DB_UI_API ?? '');
const database=new URL(process.env.DATABASE_URL ?? '');
assert.equal(api.hostname,'127.0.0.1'); assert.equal(api.protocol,'http:');
assert.equal(database.hostname,'127.0.0.1');
assert.match(database.pathname,/^\/js_int_[a-f0-9]{32}$/);
assert.match(process.env.JURISSIM_TEST_CAPABILITY ?? '',/^[a-f0-9]{64}$/);
const email=process.env.JURISSIM_DB_UI_OWNER, password=process.env.JURISSIM_DB_UI_PASSWORD;
assert.match(email ?? '',/@example\.invalid$/); assert.ok(password);
assert.equal(process.env.GOOGLE_CLIENT_ID,'');
const origin='http://127.0.0.1:5187', profile=await mkdtemp(path.join(tmpdir(),'jurissim-editorial-db-browser-'));
// Keep bounded diagnostics, not credentials, pages, request bodies or tokens.
const sanitize = (value) => String(value)
  .replaceAll(password, '[REDACTED]')
  .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DATABASE_URL]')
  .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
  .replace(/([?&#](?:token|confirmacao|proof|key)=)[^\s&#"']+/gi, '$1[REDACTED]')
  .replace(/[a-f0-9]{64}/gi, '[REDACTED]')
  .replace(/[\w.+-]+@[\w.-]+/g, '[EMAIL]');
const diagnostics = { vite: '', chrome: '', runtime: '', network: '', lifecycle: '' };
const pendingRequests = new Map();
const startedAt = Date.now();
const remember = (source, value) => { diagnostics[source] = sanitize(diagnostics[source] + String(value)).slice(-12000); };
// A fresh checkout on CI has neither the developer's .env nor a warm Vite cache.
const viteConfig = path.join(profile, 'vite.config.mjs');
await writeFile(viteConfig, `import config from ${JSON.stringify(pathToFileURL(path.resolve('vite.config.ts')).href)};\nexport default {...config, root:${JSON.stringify(process.cwd())}, envDir:false, cacheDir:${JSON.stringify(path.join(profile, 'vite-cache'))}};\n`);
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--config", viteConfig,
    "--configLoader", "runner",
    "--host",
    "127.0.0.1",
    "--port",
    "5187",
    "--strictPort",
  ],
  {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      VITE_API_URL: api.origin,
      VITE_GOOGLE_CLIENT_ID: "",
      VITE_INITIAL_DIAGNOSTIC_UI_ENABLED: "false", VITE_QUESTION_PRACTICE_UI_ENABLED:'true', VITE_QUESTION_REVIEW_UI_ENABLED:'true',
    },
  },
);
vite?.stdout.on('data', value => remember('vite', value));
vite?.stderr.on('data', value => remember('vite', value));
vite?.on('error', error => remember('vite', error.message));
vite?.on('exit', (code, signal) => remember('vite', `\nexit=${code}; signal=${signal}\n`));
// The disposable harness deliberately drops the user's environment. Google's
// Linux launcher still needs writable HOME/XDG directories (even with
// --user-data-dir); keep all of them private to this browser run.
const browserEnvironment = { ...process.env, HOME: profile,
  XDG_CONFIG_HOME: path.join(profile, 'config'),
  XDG_CACHE_HOME: path.join(profile, 'cache'),
  XDG_DATA_HOME: path.join(profile, 'data'),
};
for (const directory of [browserEnvironment.XDG_CONFIG_HOME, browserEnvironment.XDG_CACHE_HOME, browserEnvironment.XDG_DATA_HOME]) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
}
const browser = spawn(
  process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
    "about:blank",
  ],
  { windowsHide: true, env: browserEnvironment, stdio: ["ignore", "ignore", "pipe"] },
);
browser.stderr.on('data', value => remember('chrome', value));
browser.on('error', error => remember('chrome', error.message));
browser.on('exit', (code, signal) => remember('chrome', `\nexit=${code}; signal=${signal}\n`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let socket;
try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(
      () => reject(Error("Chrome startup timeout")),
      20000,
    );
    browser.once("error", error => { clearTimeout(timer); reject(error); });
    browser.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(Error(`Chrome exited before DevTools startup: code=${code}; signal=${signal}`));
    });
    browser.stderr.on("data", (chunk) => {
      text += chunk;
      const m = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(origin)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await sleep(100);
  }
  socket = new WebSocket(debuggerUrl);
  await new Promise((r, j) => {
    socket.addEventListener("open", r, { once: true });
    socket.addEventListener("error", j, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const key = ++sequence,
        timer = setTimeout(() => {
          pending.delete(key);
          reject(Error("CDP timeout " + method));
        }, 20000);
      pending.set(key, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: key, method, params, sessionId }));
    });
  socket.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.method === 'Page.domContentEventFired') remember('lifecycle', `DOMContentLoaded at ${Date.now() - startedAt}ms\n`);
    if (m.method === 'Network.requestWillBeSent') {
      const url = new URL(m.params.request.url);
      pendingRequests.set(m.params.requestId, `${url.origin}${url.pathname}`);
    }
    if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') pendingRequests.delete(m.params.requestId);
    if (m.method === 'Runtime.exceptionThrown') {
      const detail = m.params.exceptionDetails;
      remember('runtime', (detail.exception?.description ?? detail.text) + '\n');
    }
    if (m.method === 'Network.loadingFailed') remember('network', m.params.errorText + '\n');
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      const response = m.params.response;
      const url = new URL(response.url);
      remember('network', `${response.status} ${url.origin}${url.pathname}\n`);
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      clearTimeout(p.timer);
      m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
    }
    if (m.method === "Fetch.requestPaused") {
      const url = m.params.request.url;
      const allowed =
        url.startsWith(origin + "/") || url.startsWith(api.origin + "/");
      void send(
        allowed ? "Fetch.continueRequest" : "Fetch.failRequest",
        {
          requestId: m.params.requestId,
          ...(allowed ? {} : { errorReason: "BlockedByClient" }),
        },
        m.sessionId,
      ).catch(() => {});
    }
  });
  const { targetId } = await send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const cdp = (m, p) => send(m, p, sessionId);
  const evaluate = async (expression) => {
    let r;
    try { r = await cdp("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }); } catch (error) {
      if (/Inspected target navigated or closed|Cannot find context|Execution context was destroyed/.test(error.message)) return undefined;
      throw error;
    }
    if (r.exceptionDetails) throw Error("Browser evaluation failed");
    return r.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 500; i++) {
      if (await evaluate(expression)) return;
      await sleep(80);
    }
    console.error(JSON.stringify({path:await evaluate('location.pathname'),buttons:await evaluate('Array.from(document.querySelectorAll("button")).map(b=>b.textContent.trim()).filter(Boolean).slice(0,15)')}));
    throw Error("UI did not reach expected state: " + expression);
  };
  await cdp("Page.enable");
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp('Page.navigate',{url:origin+'/questoes'});
  await until('!!document.querySelector("input[name=email]")');
  await evaluate(`{for(const [name,value] of ${JSON.stringify([['email',email],['current-password',password]])}){const e=document.querySelector('input[name="'+name+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}}`);
  await evaluate('document.querySelector("button.auth-submit").click()');
  await until("!document.querySelector('input[name=current-password]')&&!!document.querySelector('.v0-app')");
  const navigate=async route=>{await evaluate(`import('/src/navigation.ts').then(n=>n.navigate(${JSON.stringify(route)}))`);};
  const click=async expression=>evaluate(`(${expression}).click()`);
  const selectDiscipline=async name=>{
    await navigate('/questoes');await until("!!document.querySelector('.practice-disciplines button')");
    await click(`Array.from(document.querySelectorAll('.practice-disciplines button')).find(b=>b.textContent.trim().startsWith(${JSON.stringify(name)}))`);
    await until(`document.querySelector('.practice-summary h2')?.textContent===${JSON.stringify(name)}&&!document.querySelector('.practice-summary .individual-primary').disabled`);
    await click(`Array.from(document.querySelectorAll('.practice-disciplines button')).find(b=>b.textContent.trim().startsWith(${JSON.stringify(name)}))`);
    await until("!document.querySelector('.practice-summary .individual-primary').disabled");
    assert.equal(await evaluate("document.querySelector('input[name=practice-size][value=\"10\"]').disabled"),true);
    assert.equal(await evaluate("document.querySelector('input[name=practice-size][value=\"20\"]').disabled"),true);
  };
  for(const name of ['Civil','Constitucional','Administrativo','Penal','Trabalho']){
    await selectDiscipline(name);
    if(name==='Civil'){
      await evaluate("{const s=document.querySelector('#practice-topic');s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));}");
      await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Treinar 5 com todos'))");
      assert.equal(await evaluate("document.querySelector('.practice-summary .individual-primary').disabled"),true);
      await click("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Treinar 5 com todos'))");
      await until("!document.querySelector('.practice-summary .individual-primary').disabled");
    }
    await click("document.querySelector('.practice-summary .individual-primary')");
    await until("!!document.querySelector('.practice-question-map')&&!!document.querySelector('input[name=practice-answer]')");
    const attemptPath=await evaluate('location.pathname');
    for(let i=0;i<5;i++){
      await click(`document.querySelectorAll('.practice-question-map button')[${i}]`);
      await until("!document.querySelector('input[name=practice-answer]').disabled&&!document.querySelector('.practice-feedback')");
      await click("document.querySelector('input[name=practice-answer]')");
      await click("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirmar resposta')");
      await until(`document.querySelectorAll('.practice-question-map .is-answered').length===${i+1}&&!!document.querySelector('.practice-feedback')`);
      if(i===0){
        await cdp('Page.navigate',{url:origin+attemptPath});
        await until("document.querySelectorAll('.practice-question-map .is-answered').length===1");
        await navigate('/questoes');await until("!!document.querySelector('.practice-disciplines')");
        await click(`Array.from(document.querySelectorAll('.practice-disciplines button')).find(b=>b.textContent.trim().startsWith(${JSON.stringify(name)}))`);
        await until("document.querySelector('.practice-summary .individual-primary')?.textContent.includes('Continuar treino')");
        await click("document.querySelector('.practice-summary .individual-primary')");
        await until(`location.pathname===${JSON.stringify(attemptPath)}&&document.querySelectorAll('.practice-question-map .is-answered').length===1`);
      }
    }
    await click("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Ver resultado do treino'))");
    await until("!!document.querySelector('.individual-results')");
    assert.ok((await evaluate("document.querySelector('.individual-percentage').textContent")).includes('100'));
    await navigate('/historico');await until("!!document.querySelector('.study-history-list li')");
    await navigate('/desempenho');await until("!!document.querySelector('.performance-stats')");
    console.log('PASS browser training, resume, feedback, completion, history and performance: '+name);
  }
  const originalHistory=await evaluate("import('/src/api.ts').then(m=>m.apiRequest('/students/me/activities')).then(x=>JSON.stringify(x))");
  const originalTotals=await evaluate("import('/src/api.ts').then(m=>m.apiRequest('/students/me/performance?kind=practice')).then(x=>JSON.stringify(x.totals))");
  await navigate('/questoes/revisao?disciplina=Direito%20Civil&filtro=all');await until("!!document.querySelector('.practice-review-filter')");
  assert.equal(await evaluate("document.querySelectorAll('input[name=review-filter]')[1].checked"),true);
  await click("Array.from(document.querySelectorAll('.practice-disciplines button')).find(b=>b.textContent.trim().startsWith('Civil'))");
  await click("document.querySelectorAll('input[name=review-filter]')[1]");
  await until("!document.querySelector('.practice-summary .individual-primary').disabled");
  await click("document.querySelector('.practice-summary .individual-primary')");
  await until("document.querySelectorAll('.practice-question-map button').length===5");
  for(let i=0;i<5;i++){
    await click(`document.querySelectorAll('.practice-question-map button')[${i}]`);await until("!document.querySelector('input[name=practice-answer]').disabled");
    await click("document.querySelector('input[name=practice-answer]')");await click("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirmar resposta')");
    await until(`document.querySelectorAll('.practice-question-map .is-answered').length===${i+1}`);
  }
  await click("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Ver resultado da revis'))");
  await until("!!document.querySelector('.individual-results')");
  assert.equal(await evaluate("import('/src/api.ts').then(m=>m.apiRequest('/students/me/activities')).then(x=>JSON.stringify(x))"),originalHistory);
  assert.equal(await evaluate("import('/src/api.ts').then(m=>m.apiRequest('/students/me/performance?kind=practice')).then(x=>JSON.stringify(x.totals))"),originalTotals);
  console.log('PASS browser review: five Civil questions completed via real UI/API. Original history is asserted by the parent test.');
  assert.equal(diagnostics.runtime,'','No JavaScript exceptions');
} catch(error){ console.error(sanitize(error.stack||error.message),JSON.stringify(diagnostics));throw error; }
finally {socket?.close();browser.kill();vite?.kill();}
