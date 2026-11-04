import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:5186";
const profile = await mkdtemp(path.join(tmpdir(), "jurissim-admin-ui-"));
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5186",
    "--strictPort",
  ],
  {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      VITE_API_URL: "http://127.0.0.1:1",
      VITE_GOOGLE_CLIENT_ID: "",
      VITE_INITIAL_DIAGNOSTIC_UI_ENABLED: "false",
      VITE_QUESTION_PRACTICE_UI_ENABLED: "false",
    },
  },
);
const browser = spawn(
  process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
    "--use-fake-device-for-media-stream",
  ],
  { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
let checks = 0;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(
      () => reject(new Error("Chrome startup timeout")),
      20000,
    );
    browser.on("error", reject);
    browser.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  for (let i = 0; i < 80; i++) {
    if (
      await fetch(origin)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await sleep(100);
  }
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Unable to connect to local Chrome debugger")),
      { once: true },
    );
  });
  let sequence = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(task.timer);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result);
    }
    // Defense in depth: only Vite assets may actually use the network.
    if (message.method === "Fetch.requestPaused") {
      const allowed = message.params.request.url.startsWith(origin + "/");
      void send(
        allowed ? "Fetch.continueRequest" : "Fetch.failRequest",
        {
          requestId: message.params.requestId,
          ...(allowed ? {} : { errorReason: "BlockedByClient" }),
        },
        message.sessionId,
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
  const cdp = (method, params) => send(method, params, sessionId);
  await cdp("Page.enable");
  await cdp("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  const evaluate = async (expression) => {
    const source = /\bawait\b/.test(expression)
      ? `(async () => { ${expression} })()`
      : expression;
    const result = await cdp("Runtime.evaluate", {
      expression: source,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        "Browser test expression failed: " + expression.slice(0, 160),
      );
    return result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 120; i++) {
      try {
        if (await evaluate(expression)) return;
      } catch {}
      await sleep(50);
    }
    throw new Error(`Condition failed: ${expression}`);
  };
  // Browser interaction checks only. All API responses below are isolated
  // fixtures, not proof of a live Supabase deployment or email delivery.
  const session = {
    user: {
      id: "admin-ui",
      nome: "Administrador de teste",
      email: "admin@example.invalid",
      role: "ADMIN",
      emailVerificado: true,
    },
    nextStep: "PROFESSOR",
    administration: {
      enabled: true,
      globalAdmin: true,
      effectiveRole: "ADMIN",
      memberships: [],
    },
  };
  await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    sessionStorage.setItem('jurissim_token','browser-fixture');
    window.fixtureSession = ${JSON.stringify(session)};
    if(location.pathname==='/convite-professor') window.fixtureSession={...window.fixtureSession,user:{...window.fixtureSession.user,role:'ALUNO'},nextStep:'DASHBOARD',administration:{enabled:true,globalAdmin:false,effectiveRole:'ALUNO',memberships:[]}};
    window.requests = [];
    window.classData=[];window.studentApproved=false;
    window.institutionStatus = 'PENDING';
    window.fetch = async (url, init = {}) => {
      const p = new URL(String(url)).pathname, method = init.method || 'GET';
      window.requests.push({p,method,body:init.body});
      const reply = (data,status=200) => new Response(JSON.stringify(data),{status});
      const page = items => ({items,page:1,hasMore:false});
      if(p==='/auth/session') return reply(window.fixtureSession);
      if(p==='/profile/photo') return reply({kind:'default'});
      if(p==='/institutions/availability') return reply({enabled:true});
      if(p==='/institutions/invitations/accept') {window.fixtureSession={...window.fixtureSession,user:{...window.fixtureSession.user,role:'PROFESSOR'},nextStep:'PROFESSOR',administration:{enabled:true,globalAdmin:false,effectiveRole:'PROFESSOR',memberships:[{institutionId:'institution-ui',role:'TEACHER',institution:{name:'Curso de teste'}}]}};return reply({message:'Convite aceito.',institutionId:'institution-ui'});}
      if(p==='/institutions/admin/summary') return reply({users:12,institutions:2,pending:1,teachers:3,classes:4,errors:0});
      if(p==='/institutions/admin/institutions') return reply(page([{id:'institution-ui',name:'Curso de teste',responsibleName:'Responsável',email:'owner@example.invalid',phone:'11999999999',description:'Instituição fictícia de teste',status:window.institutionStatus}]));
      if(p==='/institutions/admin/institutions/institution-ui' && method==='PATCH') {window.institutionStatus=JSON.parse(init.body).status;return reply({message:'Decisão registrada.'});}
      if(p==='/institutions/admin/users') return reply(page([{id:'student-ui',nome:'Aluno de teste',email:'student@example.invalid',role:'ALUNO',suspended:false,memberships:[]}]));
      if(p.startsWith('/institutions/admin/users/') && method==='PATCH') return reply({message:'Conta atualizada.'});
      if(p.endsWith('/logs')) return reply(page([{id:'event-ui',occurredAt:'2026-11-04T00:00:00Z',event:'INSTITUTION_ACTIVE',actorId:'admin-ui',institutionId:'institution-ui',resourceId:'institution-ui',result:'SUCCESS',severity:'INFO'}]));
      if(p==='/institutions/mine') return reply([{id:'institution-ui',name:'Curso de teste',status:'ACTIVE'}]);
      if(p==='/institutions/institution-ui/summary') return reply({institution:{id:'institution-ui',name:'Curso de teste',phone:'11999999999',description:'Curso preparatório'},teachers:page([]),classes:page([]),indicators:{classes:0,students:0,completedAttempts:0}});
      if(p.endsWith('/invitations') && method==='POST') return reply({message:'Convite submetido ao provedor.'});
      if(p.endsWith('/invitations')) return reply(page([]));
      if(p==='/institutions/notifications') return reply(page([]));
      if(p==='/turmas/join') return reply({joined:false,message:'Solicitação enviada. Aguarde aprovação.'});
      if(p==='/questoes') return reply([]);
      if(p==='/turmas' && method==='POST') {const turma={id:'class-ui',nome:JSON.parse(init.body).nome,archivedAt:null,_count:{alunos:0}};window.classData.push(turma);return reply({turma,inviteCode:'A'.repeat(32),expiresAt:'2026-11-11T00:00:00Z'});}
      if(p==='/turmas') return reply(page(window.classData));
      if(p==='/turmas/requests') return reply(page([]));
      if(p==='/turmas/class-ui/requests') return reply(page([{id:'join-ui',classId:'class-ui',className:'Turma de teste',studentName:'Aluno convidado',status:window.studentApproved?'APPROVED':'PENDING',createdAt:'2026-11-04T00:00:00Z'}]));
      if(p==='/turmas/class-ui/requests/join-ui' && method==='PATCH') {window.studentApproved=JSON.parse(init.body).approve;return reply({message:'Aluno aprovado.'});}
      if(p==='/turmas/class-ui/students') return reply(page(window.studentApproved?[{id:'student-ui',nome:'Aluno convidado'}]:[]));
      if(p==='/students/me/overview') return reply({totals:{},recentActivities:[]});
      if(p==='/goals/dashboard') return reply({streak:{current:0,longest:0,lastActivityDate:null},totalAnsweredQuestions:0,todayAnsweredQuestions:0,todayGoal:null,currentLevel:null});
      return reply({message:'Endpoint fora do cenário de interface.'},404);
    };
  `,
  });
  await cdp("Page.navigate", { url: origin + "/administracao" });
  const pass = (message) => {
    checks++;
    console.log(`OK ${checks}: ${message}`);
  };
  const click = (text) =>
    evaluate(
      `Array.from(document.querySelectorAll('.admin-page button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`,
    );
  await until(
    'document.body.textContent.includes("Usuários") && document.body.textContent.includes("12")',
  );
  pass("dashboard administrativo renderiza indicadores da API isolada");
  await click("Instituições");
  await until('document.body.textContent.includes("Curso de teste")');
  await click("Aprovar / reativar");
  await evaluate(
    `{const el=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Dados conferidos');el.dispatchEvent(new Event('input',{bubbles:true}));}`,
  );
  await click("Confirmar");
  await until(
    'window.requests.some(r=>r.method==="PATCH"&&r.p.includes("/admin/institutions/"))',
  );
  assert.equal(
    JSON.parse(
      await evaluate('window.requests.find(r=>r.method==="PATCH").body'),
    ).status,
    "ACTIVE",
  );
  pass("aprovação institucional envia decisão e justificativa");
  await click("Usuários e professores");
  await until('document.body.textContent.includes("Aluno de teste")');
  await click("Suspender");
  await click("Confirmar alteração");
  await until(
    'window.requests.some(r=>r.method==="PATCH"&&r.p.includes("/admin/users/"))',
  );
  pass("suspensão exige confirmação e chama o endpoint de contas");
  await click("Logs e Auditoria");
  await until('document.body.textContent.includes("INSTITUTION_ACTIVE")');
  pass("auditoria mostra data, evento, responsável e resultado");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= window.innerWidth"),
    true,
  );
  pass("painel administrativo se adapta à largura de celular");
  await cdp("Emulation.clearDeviceMetricsOverride");
  await evaluate(
    `window.fixtureSession={...window.fixtureSession,user:{...window.fixtureSession.user,role:'ALUNO'},nextStep:'DASHBOARD',administration:{enabled:true,globalAdmin:false,effectiveRole:'ALUNO',memberships:[{institutionId:'institution-ui',role:'INSTITUTION_ADMIN',institution:{name:'Curso de teste'}}]}};const s=await import('/src/auth-session.ts');await s.refreshSession(true);const n=await import('/src/navigation.ts');n.navigate('/instituicoes');`,
  );
  await until('document.body.textContent.includes("Administrar instituição")');
  await click("Administrar instituição");
  await until('document.body.textContent.includes("Logs institucionais")');
  await click("Convites");
  await until('!!document.querySelector("input[type=email]")');
  await evaluate(
    `{const el=document.querySelector('input[type=email]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'teacher@example.invalid');el.dispatchEvent(new Event('input',{bubbles:true}));}`,
  );
  await click("Enviar convite");
  await until(
    'window.requests.some(r=>r.p.endsWith("/invitations")&&r.method==="POST")',
  );
  pass("administrador institucional convida professor pela interface");
  await click("Logs institucionais");
  await until(
    'window.requests.some(r=>r.p==="/institutions/institution-ui/logs")',
  );
  pass(
    "auditoria institucional utiliza a rota restrita da própria instituição",
  );
  await evaluate(
    `const n=await import('/src/navigation.ts');n.navigate('/administracao');`,
  );
  await until('document.body.textContent.includes("Acesso não autorizado")');
  pass("conta institucional não renderiza o painel global");
  await evaluate(
    `const n=await import('/src/navigation.ts');n.navigate('/turmas');`,
  );
  await until('!!document.querySelector("#class-input")');
  await evaluate(
    `{const el=document.querySelector('#class-input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'A'.repeat(32));el.dispatchEvent(new Event('input',{bubbles:true}));}`,
  );
  await evaluate(
    'document.querySelector(".class-form button.primary").click()',
  );
  await until('document.body.textContent.includes("Aguarde aprovação")');
  pass("aluno recebe aviso de solicitação pendente ao informar o código");
  await cdp("Page.navigate", {
    url:
      origin + "/convite-professor#/convite-professor?token=" + "a".repeat(64),
  });
  await until(
    'document.body.textContent.includes("Aceitar convite institucional")',
  );
  assert.equal(await evaluate("location.hash"), "");
  assert.equal(
    await evaluate(
      'Object.values(sessionStorage).some(v=>v.includes("a".repeat(64)))',
    ),
    false,
  );
  await evaluate(
    'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Aceitar convite institucional").click()',
  );
  await until(
    'location.pathname==="/professor" && !!document.querySelector(".professor-shell")',
  );
  pass(
    "convite remove token da URL, aceita com conta autenticada e abre o painel de professor",
  );
  await evaluate(
    `const n=await import('/src/navigation.ts');n.navigate('/professor/turmas');`,
  );
  await until('!!document.querySelector("#class-input")');
  await evaluate(
    `{const el=document.querySelector('#class-input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Turma de teste');el.dispatchEvent(new Event('input',{bubbles:true}));}`,
  );
  await evaluate(
    'document.querySelector(".class-form button.primary").click()',
  );
  await until('document.body.textContent.includes("Aluno convidado")');
  pass("professor cria turma e recebe solicitação de entrada na interface");
  await evaluate(
    'Array.from(document.querySelectorAll(".class-list button")).find(b=>b.textContent.trim()==="Aprovar").click()',
  );
  await until(
    'document.body.textContent.includes("Aprovada") && document.body.textContent.includes("Remover da turma")',
  );
  pass("aprovação atualiza solicitação e lista de alunos autorizados");
  console.log(
    `Administração: ${checks} verificações de navegador com API simulada aprovadas. Sem banco ou envio real.`,
  );
} finally {
  socket?.close();
  browser.kill();
  vite.kill();
}
