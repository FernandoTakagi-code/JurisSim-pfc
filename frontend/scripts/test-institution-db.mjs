// Called only by the guarded disposable-PostgreSQL integration test. No fixtures
// replace fetch/session: the login form and every API request use real Express.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const unified = process.argv.includes('--unified');
// Fail before requests or browser startup when the explicit test harness is absent.
if (!unified && (process.env.NODE_ENV !== 'test' || !process.env.JURISSIM_DB_UI_API || !process.env.DATABASE_URL || !process.env.JURISSIM_TEST_CAPABILITY)) {
  throw new Error('Este teste exige a configuracao explicita do harness de PostgreSQL descartavel. Nao executa contra o backend habitual; nenhuma requisicao foi iniciada.');
}
let localSession;
if (unified) {
  try {
    localSession = JSON.parse(await readFile(path.resolve('../backend/.local/unified-local-session.json'),'utf8'));
  } catch {
    throw new Error('O modo --unified exige um overlay privado local valido, nao versionado. Sem ele, use apenas o harness descartavel autorizado. Nenhuma requisicao foi iniciada.');
  }
  assert.equal(localSession.frontend,'http://localhost:5173');
  assert.equal(localSession.api,'http://127.0.0.1:3333/');
  const identity = await fetch(localSession.api+'__local/identity',{headers:{'x-local-mailbox-key':localSession.mailboxKey}}).then(r=>{assert.equal(r.status,200);return r.json();});
  assert.equal(identity.runId,localSession.runId);
}
const api = new URL(unified ? 'http://localhost:3333' : process.env.JURISSIM_DB_UI_API ?? "");
let localInstitution;
if (unified) {
  const login = await fetch(api.origin+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@institucional.example.invalid',senha:localSession.fixturePassword})}).then(r=>{assert.equal(r.status,200);return r.json();});
  const mine = await fetch(api.origin+'/institutions/mine',{headers:{Authorization:'Bearer '+login.token}}).then(r=>r.json());
  localInstitution = (mine.items??mine.institutions??mine)[0].id;
}
if (!unified) {
const database = new URL(process.env.DATABASE_URL ?? "");
assert.equal(process.env.NODE_ENV, "test");
assert.equal(api.hostname, "127.0.0.1");
assert.equal(api.protocol, "http:");
assert.equal(database.hostname, "127.0.0.1");
assert.match(database.pathname, /^\/js_int_[a-f0-9]{32}$/);
assert.match(process.env.JURISSIM_TEST_CAPABILITY ?? "", /^[a-f0-9]{64}$/);
}
const email = unified ? 'owner@institucional.example.invalid' : process.env.JURISSIM_DB_UI_OWNER,
  password = unified ? localSession.fixturePassword : process.env.JURISSIM_DB_UI_PASSWORD,
  id = unified ? localInstitution : process.env.JURISSIM_DB_UI_INSTITUTION;
assert.match(email ?? "", unified ? /@institucional\.example\.invalid$/ : /@example\.invalid$/);
assert.ok(password && id);
if (!unified) assert.equal(process.env.GOOGLE_CLIENT_ID, "");
const origin = unified ? 'http://localhost:5173' : "http://127.0.0.1:5187",
  profile = await mkdtemp(path.join(tmpdir(), "jurissim-real-db-browser-"));
const vite = unified ? undefined : spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--configLoader", "runner",
    "--host",
    "127.0.0.1",
    "--port",
    "5187",
    "--strictPort",
  ],
  {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      VITE_API_URL: api.origin,
      VITE_GOOGLE_CLIENT_ID: "",
      VITE_INITIAL_DIAGNOSTIC_UI_ENABLED: "false",
    },
  },
);
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
  { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let socket;
try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(
      () => reject(Error("Chrome startup timeout")),
      20000,
    );
    browser.once("error", reject);
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
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await sleep(80);
    }
    console.error(JSON.stringify({path:await evaluate('location.pathname'),buttons:await evaluate('Array.from(document.querySelectorAll("button")).map(b=>b.textContent.trim()).filter(Boolean).slice(0,15)')}));
    throw Error("UI did not reach expected state: " + expression);
  };
  await cdp("Page.enable");
  await cdp("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.navigate", {
    url: origin + "/instituicoes?instituicao=" + encodeURIComponent(id),
  });
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
  // Login legitimately ends at the institution chooser. Wait for that redirect
  // before selecting the institution, rather than racing AuthGate's navigation.
  await until("location.pathname==='/instituicoes'&&location.search===''&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Administrar instituição')");
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Administrar instituição').click()");
  await until('!!document.querySelector(".institution-workspace")');
  const modules = [
    "overview",
    "institution",
    "teachers",
    "invitations",
    "classes",
    "students",
    "performance",
    "exams",
    "reports",
    "notifications",
    "settings",
  ];
  const dir = path.join(process.cwd(), ".artifacts/institution-real-db");
  await mkdir(dir, { recursive: true });
  for (const section of modules) {
    await evaluate(
      `(async()=>{const n=await import('/src/institution-navigation.ts');n.institutionNavigate(${JSON.stringify(id)},${JSON.stringify(section)});})()`,
    );
    await until('!!document.querySelector(".institution-workspace")');
    await sleep(180);
    try {
      await until('!document.querySelector(".institution-workspace [role=alert]")&&!Array.from(document.querySelectorAll(".institution-workspace p")).some(e=>/^Carregando/.test(e.textContent))');
    } catch(error) {
      console.error(JSON.stringify({section,alerts:await evaluate('Array.from(document.querySelectorAll(".institution-workspace [role=alert]")).map(e=>e.textContent)')}));
      throw error;
    }
    assert.equal(
      await evaluate(
        'document.querySelectorAll(".institution-workspace .nav-item[aria-current=page]").length',
      ),
      1,
    );
    assert.equal(
      await evaluate("document.documentElement.scrollWidth<=innerWidth"),
      true,
    );
    if (section === "invitations") {
      // Exercise the exact modal that loads /turmas?page=1. This must carry
      // institutional administration context through the real API, even when
      // the institution has no classes. Opening it must not send an invitation.
      await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Convidar professor').click()");
      await until('!!document.querySelector("[role=dialog] input[type=email]")');
      await until('!document.querySelector("[role=dialog] [role=alert]")&&!Array.from(document.querySelectorAll("[role=dialog] p")).some(e=>/^Carregando/.test(e.textContent))');
      assert.equal(await evaluate('document.querySelector("[role=dialog] select[name=classId]").options[0].text'), "Sem designação inicial");
      assert.equal(await evaluate('document.querySelector("[role=dialog] button[type=submit], [role=dialog] .primary-button").disabled'), false);
      await evaluate("document.querySelector('[role=dialog] button[aria-label=Fechar]').click()");
      await until('!document.querySelector("[role=dialog]")');
      console.log("PASS REAL DB INVITATION MODAL: class query and institution context accepted; no invitation submitted.");
    }
    await evaluate(
      `{let e=document.querySelector('#db-review-label');if(!e){e=document.createElement('div');e.id='db-review-label';e.style.cssText='position:fixed;bottom:0;right:0;z-index:9999;background:#fff1b8;color:#352400;padding:6px;font:11px sans-serif';document.body.append(e);}e.textContent='POSTGRESQL REAL ISOLADO · CONTAS DE TESTE · SEM SUPABASE';}`,
    );
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    await writeFile(
      path.join(dir, section + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  }
  if (unified) {
    const invitedEmail='h412-browser-'+Date.now()+'@institucional.example.invalid';
    await evaluate('(async()=>{const api=await import("/src/api.ts");await api.apiRequest('+JSON.stringify('/institutions/'+id+'/invitations')+',{method:"POST",body:JSON.stringify({email:'+JSON.stringify(invitedEmail)+',name:"Professor novo local"})});})()');
    const mailbox=async()=>fetch(localSession.api+'__local/messages',{headers:{'x-local-mailbox-key':localSession.mailboxKey}}).then(r=>r.json());
    const invitation=(await mailbox()).filter(m=>m.to===invitedEmail).at(-1);
    const token=invitation.text.match(/token=([a-f0-9]{64})/)[1];
    await evaluate('(async()=>{const s=await import("/src/auth-session.ts");await s.logoutSession();})()');
    await cdp('Page.navigate',{url:origin+'/#/convite-professor?token='+token});
    await until('!!document.querySelector("input[name=nome]")');
    assert.equal(await evaluate('document.querySelector("input[type=email]").value'),invitedEmail);
    assert.equal(await evaluate('document.querySelector("input[type=email]").readOnly'),true);
    assert.equal(await evaluate('location.hash'),'');
    for(const width of [1280,390,320]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    }
    await cdp('Emulation.clearDeviceMetricsOverride');
    await evaluate('{for(const [name,value] of '+JSON.stringify([['nome','Professor novo local'],['password',password],['confirmation',password]])+'){const input=document.querySelector("input[name="+name+"]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));}document.querySelector("input[name=acceptance]").click();}');
    await evaluate('document.querySelector("button.auth-submit").click()');
    await until('document.querySelector("[role=status]")?.textContent.includes("Conta criada")');
    assert.equal((await mailbox()).filter(m=>m.to===invitedEmail).length,1);
    await until('!!document.querySelector("input[name=current-password]")');
    assert.equal(await evaluate('document.querySelector("input[name=email]").value'),invitedEmail);
    await evaluate('{for(const [name,value] of '+JSON.stringify([['email',invitedEmail],['current-password',password]])+'){const input=document.querySelector("input[name="+name+"]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));}}');
    await evaluate('document.querySelector("button.auth-submit").click()');
    await until('location.pathname==="/professor"&&!!document.querySelector(".professor-shell")');
    console.log('PASS H4.12 REAL UI: original invite, readonly email, responsive form, password/terms, one captured email, teacher login and dashboard.');
  }
  for (const [role, account, route, selector] of [
    [
      "ADMIN",
      unified ? 'admin@institucional.example.invalid' : process.env.JURISSIM_DB_UI_ADMIN,
      "/administracao",
      ".admin-integrated",
    ],
    [
      "PROFESSOR",
      unified ? 'teacher@institucional.example.invalid' : process.env.JURISSIM_DB_UI_TEACHER,
      "/professor",
      ".professor-shell",
    ],
    ["ALUNO", unified ? 'aluno@institucional.example.invalid' : process.env.JURISSIM_DB_UI_STUDENT, "/", ".v0-app"],
    ...(unified ? [["ALUNO_VINCULADO", 'linked@institucional.example.invalid', '/', '.v0-app']] : []),
  ]) {
    assert.match(account ?? "", unified ? /@institucional\.example\.invalid$/ : /@example\.invalid$/);
    await evaluate(
      "(async()=>{const s=await import('/src/auth-session.ts');await s.logoutSession();})()",
    );
    await until('!!document.querySelector("input[name=email]")');
    await evaluate(
      `{for(const [name,value] of ${JSON.stringify([
        ["email", account],
        ["current-password", password],
      ])}){const e=document.querySelector('input[name="'+name+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}}`,
    );
    await evaluate('document.querySelector("button.auth-submit").click()');
    await until(
      `location.pathname===${JSON.stringify(route)}&&!!document.querySelector(${JSON.stringify(selector)})`,
    );
    if(role.startsWith('ALUNO')) {
      // A fresh student legitimately lands in DIAGNOSTIC. Follow the personal
      // dashboard navigation without fabricating a completed assessment/session.
      await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Início')||location.pathname==='/dashboard'");
      await evaluate("if(location.pathname!=='/dashboard')Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Início').click()");
      await until('location.pathname==="/dashboard"&&!!document.querySelector(".v0-app")');
    }
    await sleep(180);
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    await writeFile(
      path.join(dir, role.toLowerCase() + "-dashboard.png"),
      Buffer.from(shot.data, "base64"),
    );
  }
  console.log(
    "PASS REAL DB UI: login verdadeiro, sessão do backend e onze módulos com PostgreSQL descartável; nenhum fetch/sessão substituído.",
  );
} finally {
  socket?.close();
  browser.kill();
  vite?.kill();
}
