// Chamado apenas pelo teste de integração protegido em PostgreSQL descartável. Nenhuma fixture
// substitui fetch/sessão: o formulário de login e todas as requisições à API usam o Express real.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from 'node:url';
// Este executável aceita apenas o harness descartável, nunca o backend real.
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
// Mantém diagnósticos limitados, sem credenciais, páginas, bodies de requisição ou tokens.
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
// Um checkout novo no CI não tem o .env do desenvolvedor nem um cache do Vite já aquecido.
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
      VITE_INITIAL_DIAGNOSTIC_UI_ENABLED: "false",
    },
  },
);
vite?.stdout.on('data', value => remember('vite', value));
vite?.stderr.on('data', value => remember('vite', value));
vite?.on('error', error => remember('vite', error.message));
vite?.on('exit', (code, signal) => remember('vite', `\nexit=${code}; signal=${signal}\n`));
// O harness descartável propositalmente descarta o ambiente do usuário. O inicializador
// do Google no Linux ainda precisa de diretórios HOME/XDG graváveis (mesmo com
// --user-data-dir); mantém todos eles privados a esta execução do navegador.
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
  await cdp("Page.navigate", {url: origin + '/administracao/acervo'});
  await until('!!document.querySelector("input[name=email]")');
  await evaluate(
    `{for(const [name,value] of ${JSON.stringify([
      ["email", email],
      ["current-password", password],
    ])}){const e=document.querySelector('input[name="'+name+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}}`,
  );
  await evaluate('document.querySelector("button.auth-submit").click()');
  await until(
    '!!sessionStorage.getItem("jurissim_token")&&!document.querySelector("input[name=current-password]")',
  );

  await until("location.pathname==='/administracao'");
  await evaluate("import('/src/navigation.ts').then(n=>n.navigate('/administracao/acervo'))");
  await until("!!document.querySelector('.editorial-item button')");
  await evaluate("document.querySelector('.editorial-item button').click()");
  await until("document.querySelector('.editorial-detail').textContent.includes('Consulta dispon\u00edvel')");
  assert.equal(await evaluate("!!document.querySelector('input[name=email]')"),false);
  for(const target of ['/administracao/acervo/','/administracao/acervo']) {
    await cdp('Page.navigate',{url:origin+target});
    await until("!!document.querySelector('.editorial-item button')");
    assert.equal(await evaluate('location.pathname'),target);
  }
  assert.equal(diagnostics.runtime,'','No JavaScript exceptions');
  console.log('PASS: normal ADMIN login, real API list/detail, readonly state, same-tab navigation and authenticated reload with/without trailing slash.');
} finally {
  socket?.close(); browser.kill(); vite?.kill();
}
