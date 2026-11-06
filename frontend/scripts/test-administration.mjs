import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
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
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
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
    const loginRole=sessionStorage.getItem('fixture-login-role');
    if(loginRole){window.fixtureSession.user.role=loginRole;window.fixtureSession.nextStep=loginRole==='ALUNO'?'DASHBOARD':'PROFESSOR';window.fixtureSession.administration={enabled:true,globalAdmin:loginRole==='ADMIN',effectiveRole:loginRole,memberships:[]};}
    const ownerRole=sessionStorage.getItem('fixture-context-owner-role');
    if(ownerRole)window.fixtureSession={...window.fixtureSession,user:{...window.fixtureSession.user,id:'owner-ui',role:ownerRole},nextStep:ownerRole==='ALUNO'?'DASHBOARD':'PROFESSOR',administration:{enabled:true,globalAdmin:false,effectiveRole:ownerRole,memberships:[{institutionId:'institution-ui',role:'INSTITUTION_ADMIN',institution:{name:'Curso de teste'}},...(ownerRole==='PROFESSOR'?[{institutionId:'teaching-ui',role:'TEACHER',institution:{name:'Instituição docente'}}]:[])]}};
    if(location.pathname==='/convite-professor') window.fixtureSession={...window.fixtureSession,user:{...window.fixtureSession.user,role:'ALUNO'},nextStep:'DASHBOARD',administration:{enabled:true,globalAdmin:false,effectiveRole:'ALUNO',memberships:[]}};
    window.requests = [];
    window.classData=[];window.studentApproved=false;window.invitationData=[];window.examData=[];window.institutionalFixtures=sessionStorage.getItem('fixture-rich-institution')==='true';window.institutionPatch={};
    if(window.institutionalFixtures){window.classData=[{id:'class-ui',nome:'Turma institucional de teste',archivedAt:null,_count:{alunos:1},professores:[{id:'teacher-ui',nome:'Professor de teste'}]}];window.studentApproved=true;}
    window.institutionStatus = 'PENDING';
    window.fixtureEnabled = sessionStorage.getItem('fixture-institutions-enabled') !== 'false';
    window.fixtureAdmin = sessionStorage.getItem('fixture-global-administration')==='true';
    window.fixtureRegistration = sessionStorage.getItem('fixture-registration')==='true';
    window.fixtureFailure = null;
    window.fetch = async (url, init = {}) => {
      const parsed = new URL(String(url)), p = parsed.pathname, method = init.method || 'GET';
      window.requests.push({p,method,body:init.body,query:parsed.search,headers:init.headers});
      const reply = (data,status=200) => new Response(JSON.stringify(data),{status});
      const page = items => ({items,page:1,hasMore:false});
      if(window.fixtureFailure?.path===p) {if(window.fixtureFailure.network) throw new TypeError('Falha de rede simulada');return reply({message:'Falha controlada de teste'},window.fixtureFailure.status);}
      if(p==='/auth/session') return reply(window.fixtureSession);
      if(p==='/auth/login') {sessionStorage.setItem('fixture-login-body',init.body);return reply({token:'browser-fixture'});}
      if(p==='/audit-logs') return reply([{id:'platform-event-ui',occurredAt:'2026-11-04T00:00:00Z',action:parsed.searchParams.get('action')||'LOGIN_SUCESSO',userId:'admin-ui',resourceId:null,termsVersion:null,privacyVersion:null}]);
      if(p==='/profile/photo') return reply({kind:'default'});
      if(p==='/institutions/availability') {const full=window.fixtureEnabled,admin=full||window.fixtureAdmin,registration=full||window.fixtureRegistration;return reply({enabled:full,administrationEnabled:admin,registrationEnabled:registration,capabilities:{overview:admin,institutions:admin||registration,requests:admin||registration,decisions:admin||registration,users:admin,teachers:admin,classes:admin,audit:admin||registration,notifications:admin||registration,classAssignment:full,institutionalOperations:full}});}
      if(p==='/institutions/invitations/accept') {window.fixtureSession={...window.fixtureSession,user:{...window.fixtureSession.user,role:'PROFESSOR'},nextStep:'PROFESSOR',administration:{enabled:true,globalAdmin:false,effectiveRole:'PROFESSOR',memberships:[{institutionId:'institution-ui',role:'TEACHER',institution:{name:'Curso de teste'}}]}};return reply({message:'Convite aceito.',institutionId:'institution-ui'});}
      if(p==='/institutions/invitations/onboarding') return reply({message:'Consulte as instruções no e-mail convidado. Contas existentes usam o login único.'});
      if(p==='/institutions/invitations/complete') return reply({message:'E-mail confirmado e primeiro acesso concluído. Entre pelo login único.'});
      if(p==='/institutions/invitations/decline-proof') return reply({message:'Convite recusado. Nenhum vínculo de professor foi ativado.'});
      if(p==='/institutions/invitations/inspect') return reply({institution:{id:'institution-ui',name:'Curso de teste'},maskedEmail:'t***@example.invalid',expiresAt:new Date(Date.now()+3600000).toISOString()});
      if(p==='/institutions/admin/summary') return reply({users:12,institutions:2,pending:1,teachers:3,classes:4,errors:0});
      if(p==='/institutions/admin/institutions') return reply(page([{id:'institution-ui',name:'Curso de teste',responsibleName:'Responsável',email:'owner@example.invalid',phone:'11999999999',description:'Instituição fictícia de teste',status:window.institutionStatus}]));
      if(p==='/institutions/admin/institutions/institution-ui' && method==='PATCH') {window.institutionStatus=JSON.parse(init.body).status;return reply({message:'Decisão registrada.'});}
      if(p==='/institutions/admin/users') return reply(page(parsed.searchParams.get('role')==='PROFESSOR'?[{id:'teacher-ui',nome:'Professor de teste',email:'teacher@example.invalid',role:'PROFESSOR',suspended:false,memberships:[]}]:[{id:'student-ui',nome:'Aluno de teste',email:'student@example.invalid',role:'ALUNO',suspended:false,memberships:[]},{...window.fixtureSession.user,suspended:false,memberships:[]}]));
      if(p==='/institutions/admin/classes') return reply(page(window.globalClassFixture?[{id:'class-ui',nome:'Turma legada',professores:[],institutionalClass:null,archivedAt:null}]:[]));
      if(p==='/institutions/requests'&&method==='POST'){const application={...JSON.parse(init.body),id:'application-ui',status:'PENDING'};window.ownerRequests.push(application);return reply(application,201);}
      if(p.startsWith('/institutions/admin/users/') && method==='PATCH') return reply({message:'Conta atualizada.'});
      if(p.endsWith('/logs')) return reply(page([{id:'event-ui',occurredAt:'2026-11-04T00:00:00Z',event:'INSTITUTION_ACTIVE',actorId:'admin-ui',institutionId:'institution-ui',resourceId:'institution-ui',result:'SUCCESS',severity:'INFO'}]));
      if(p==='/institutions/mine') return reply(window.ownerRequests??[{id:'institution-ui',name:'Curso de teste',status:'ACTIVE'}]);
      if(p==='/institutions/institution-ui/summary') return reply({institution:{id:'institution-ui',name:'Curso de teste',responsibleName:'Responsável de teste',email:'owner@example.invalid',status:'ACTIVE',phone:'11999999999',description:'Curso preparatório',createdAt:'2026-11-04T00:00:00Z',...window.institutionPatch},teachers:page(window.institutionalFixtures?[{id:'member-ui',userId:'teacher-ui',active:true,user:{id:'teacher-ui',nome:'Professor de teste',email:'teacher@example.invalid'}}]:[]),classes:page(window.classData),indicators:{classes:window.classData.length,students:window.institutionalFixtures?1:0,completedAttempts:0,activeTeachers:window.institutionalFixtures?1:0,pendingInvitations:0,activeClasses:window.classData.length}});
      if(p.endsWith('/invitations') && method==='POST'){const body=JSON.parse(init.body);window.invitationData.push({id:'invite-ui',email:body.email,invitedName:body.name,status:'PENDING',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});return reply({message:'Convite submetido ao provedor.'});}
      if(p.endsWith('/invitations')) return reply(page(window.invitationData));
      if(p==='/institutions/notifications') return reply(page([]));
      if(p==='/turmas/join') return reply({joined:false,message:'Solicitação enviada. Aguarde aprovação.'});
      if(p==='/questoes') return reply(window.institutionalFixtures?[{id:'question-ui',enunciado:'Questão autorizada de teste',disciplina:'Civil',publica:true,alternativas:[{id:'alternative-a',texto:'A',correta:true},{id:'alternative-b',texto:'B',correta:false}]}]:[]);
      if(p==='/avaliacoes'&&method==='POST'){const body=JSON.parse(init.body),exam={id:'exam-ui',...body,publishedAt:null,turmas:window.classData.filter(c=>body.turmaIds.includes(c.id)),questoes:body.questaoIds.map(questaoId=>({questaoId,posicao:1})),_count:{tentativas:0}};window.examData.push(exam);return reply(exam,201);}
      if(p==='/avaliacoes')return reply(page(window.examData));
      if(p==='/avaliacoes/exam-ui/publish'){window.examData[0].publishedAt=new Date().toISOString();return reply(window.examData[0]);}
      if(p==='/institutions/institution-ui'&&method==='PATCH'){window.institutionPatch=JSON.parse(init.body);return reply({message:'Dados atualizados.'});}
      if(p==='/turmas/students')return reply(page(window.institutionalFixtures?[{id:'student-ui',nome:'Aluno autorizado de teste',email:'student@example.invalid'}]:[]));
      if(p==='/reports/classes')return reply(page(window.classData));
      if(p==='/reports/classes/class-ui')return reply({turma:window.classData[0],summary:{enrolledStudents:1,publishedExams:1,participants:1,startedAttempts:1,completedAttempts:1,inProgressAttempts:0,expiredAttempts:0,participationPercentage:100,meanPercentage:80,meanIncorrectPercentage:20,meanUnansweredPercentage:0,meanCorrectAnswers:4,meanIncorrectAnswers:1,correctAnswers:4,incorrectAnswers:1,unansweredQuestions:0},levelDistribution:[{level:'BASICO',students:1}],disciplineMetrics:[{discipline:'Civil',totalQuestions:5,correctAnswers:4,percentage:80}],exams:page([]),students:page([{id:'student-ui',name:'Aluno autorizado de teste',started:1,completed:1,meanPercentage:80}]),evolution:[]});
      if(p==='/reports/classes/class-ui/students/student-ui')return reply({turma:window.classData[0],student:{id:'student-ui',nome:'Aluno autorizado de teste'},summary:{enrolledStudents:1,publishedExams:1,participants:1,startedAttempts:1,completedAttempts:1,inProgressAttempts:0,expiredAttempts:0,participationPercentage:100,meanPercentage:80,meanIncorrectPercentage:20,meanUnansweredPercentage:0,meanCorrectAnswers:4,meanIncorrectAnswers:1,correctAnswers:4,incorrectAnswers:1,unansweredQuestions:0},evolution:[],attempts:page([])});
      if(p==='/turmas/class-ui/teachers/teacher-ui'&&method==='PUT'){const data=JSON.parse(init.body);window.classData[0].professores=data.assigned?[{id:'teacher-ui',nome:'Professor de teste'}]:[];return reply({message:'Designação atualizada.'});}
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
  const click = async(text) => {
    const expr=`Array.from(document.querySelectorAll('.admin-page button, .v0-sidebar nav button, .auth-layout button, .institution-workspace button')).find(b=>(b.getAttribute('aria-label')===${JSON.stringify(text)}||b.textContent.trim()===${JSON.stringify(text)})&&!b.disabled)`;
    await until('!!('+expr+')');
    return evaluate(expr+'.click()');
  };
  await until(
    'document.body.textContent.includes("Usuários") && document.body.textContent.includes("12")',
  );
  pass("dashboard administrativo renderiza indicadores da API isolada");
  assert.equal(
    await evaluate('document.querySelectorAll(".v0-sidebar nav").length'),
    1,
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".v0-sidebar nav button").length',
    ),
    9,
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".admin-page nav").length'),
    0,
  );
  assert.equal(
    await evaluate(
      'document.querySelector(".v0-sidebar").textContent.includes("Área do professor")',
    ),
    false,
  );
  pass(
    "ADMIN recebe uma navegação própria com nove seções, sem menu de aluno ou professor",
  );
  await click("Instituições");
  await until('document.body.textContent.includes("Curso de teste")');
  await click("Aprovar / reativar");
  await evaluate(
    `{const el=document.querySelector('textarea[maxlength="500"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Dados conferidos');el.dispatchEvent(new Event('input',{bubbles:true}));}`,
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
  await click("Usuários");
  await until('document.body.textContent.includes("Aluno de teste")');
  await click("Suspender");
  await evaluate(
    'const confirm = Array.from(document.querySelectorAll(".admin-page button")).find(b=>b.textContent.trim()==="Confirmar alteração");confirm.click();confirm.click();',
  );
  await until(
    'window.requests.some(r=>r.method==="PATCH"&&r.p.includes("/admin/users/"))',
  );
  pass("suspensão exige confirmação e chama o endpoint de contas");
  assert.equal(
    await evaluate(
      'window.requests.filter(r=>r.method==="PATCH"&&r.p.includes("/admin/users/")).length',
    ),
    1,
  );
  assert.equal(
    await evaluate(
      'Array.from(document.querySelectorAll(".admin-page article")).find(a=>a.textContent.includes("Administrador de teste")).querySelectorAll("button:disabled").length',
    ),
    1,
  );
  pass(
    "clique duplicado envia uma única alteração; autoalterações administrativas ficam desabilitadas",
  );
  await click("Logs e auditoria");
  await until('document.body.textContent.includes("INSTITUTION_ACTIVE")');
  pass("auditoria mostra data, evento, responsável e resultado");
  for (const [title, expected] of [
    ["Solicitações de cadastro", "Pendente"],
    ["Professores", "Professor de teste"],
    ["Segurança", "Segurança da conta administrativa"],
    ["Notificações", "Nenhuma notificação"],
    ["Configurações", "Não há endpoint"],
    ["Visão geral", "Seu painel administrativo"],
  ]) {
    await click(title);
    await until(
      `document.querySelector('.admin-page').textContent.includes(${JSON.stringify(expected)})`,
    );
  }
  assert.ok(
    await evaluate(
      'window.requests.some(r=>r.p==="/institutions/admin/users"&&r.query.includes("role=PROFESSOR"))',
    ),
  );
  pass(
    "nove seções navegam por URLs reais; professores usam filtro contratual e lacunas permanecem explícitas",
  );
  await evaluate(
    'sessionStorage.setItem("fixture-institutions-enabled","false");',
  );
  await cdp("Page.reload");
  await until(
    'document.body.textContent.includes("Capacidade administrativa desativada")',
  );
  for (const title of [
    "Instituições",
    "Solicitações de cadastro",
    "Usuários",
    "Professores",
    "Logs e auditoria",
    "Segurança",
    "Notificações",
    "Configurações",
    "Visão geral",
  ])
    await click(title);
  assert.equal(
    await evaluate(
      'window.requests.some(r=>r.p.startsWith("/institutions/")&&r.p!=="/institutions/availability")',
    ),
    false,
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".dashboard-stats strong")[0].textContent',
    ),
    "—",
  );
  pass(
    "flag desativada mantém navegação sem consultas protegidas, operações ou métricas inventadas",
  );
  assert.ok(await evaluate('window.requests.some(r=>r.p==="/audit-logs")'));
  await click("Logs e auditoria");
  await until(
    'document.querySelector(".admin-page").textContent.includes("LOGIN_SUCESSO")',
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".admin-page .admin-actions").length',
    ),
    0,
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".admin-page").textContent.includes("não fornece total global nem paginação")',
    ),
  );
  await evaluate(
    'const select=Array.from(document.querySelectorAll(".admin-page select")).find(s=>Array.from(s.options).some(o=>o.value==="LOGIN_FALHA"));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,"LOGIN_FALHA");select.dispatchEvent(new Event("change",{bubbles:true}));',
  );
  await click("Consultar registros");
  await until(
    'window.requests.some(r=>r.p==="/audit-logs"&&r.query.includes("action=LOGIN_FALHA"))',
  );
  pass(
    "auditoria independente funciona com flag false e usa action/limit sem inventar paginação, resultado ou gravidade",
  );
  const previousAuditCalls = await evaluate(
    'window.requests.filter(r=>r.p==="/audit-logs").length',
  );
  await click("Consultar registros");
  await until(
    `window.requests.filter(r=>r.p==="/audit-logs").length>${previousAuditCalls}`,
  );
  await click("Configurações");
  await evaluate('window.fixtureFailure={path:"/audit-logs",network:true}');
  await click("Logs e auditoria");
  await until(
    'document.querySelector(".admin-page [role=alert]")?.textContent.includes("Não foi possível conectar")',
  );
  await evaluate("window.fixtureFailure=null");
  await click("Tentar novamente");
  await until(
    'document.querySelector(".admin-page").textContent.includes("LOGIN_SUCESSO")',
  );
  pass(
    "erro de rede da auditoria independente é apresentado sem dados inventados; nova tentativa recupera a consulta",
  );
  await click("Segurança");
  await until(
    'document.querySelector(".admin-page").textContent.includes("admin@example.invalid")',
  );
  await click("Configurações");
  assert.ok(
    await evaluate(
      'document.querySelector(".admin-page").textContent.includes("Preferências pessoais")',
    ),
  );
  await click("Notificações");
  assert.ok(
    await evaluate(
      'document.querySelector(".admin-page").textContent.includes("Não existe uma rota independente GET /notifications")',
    ),
  );
  assert.equal(
    await evaluate(
      'window.requests.some(r=>r.p==="/notifications"||r.p==="/institutions/notifications")',
    ),
    false,
  );
  pass(
    "segurança e preferências permanecem independentes; notificações explicam a rota protegida sem contorná-la",
  );
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  for (const title of ["Professores", "Logs e auditoria", "Configurações"]) {
    await evaluate('document.querySelector(".v0-mobile-menu").click()');
    await click(title);
    await until(
      `document.querySelector('.admin-page h1').textContent===${JSON.stringify(title)}`,
    );
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    );
  }
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  pass(
    "mensagens específicas, tabela de auditoria e preferências não causam rolagem horizontal no celular",
  );
  await evaluate('sessionStorage.removeItem("fixture-institutions-enabled");');
  await cdp("Page.navigate", { url: origin + "/administracao/instituicoes" });
  await until('document.body.textContent.includes("Curso de teste")');
  await evaluate(
    'window.fixtureFailure={path:"/institutions/admin/summary",status:500};const n=await import("/src/navigation.ts");n.navigate("/administracao");',
  );
  await until(
    'document.querySelector(".admin-page [role=alert]")?.textContent.includes("Falha controlada")',
  );
  await evaluate("window.fixtureFailure=null");
  await click("Tentar novamente");
  await until(
    'document.querySelectorAll(".dashboard-stats strong")[0]?.textContent==="12"',
  );
  pass(
    "erro de API é apresentado e nova tentativa recupera indicadores reais do contrato simulado",
  );
  for (const role of ["ALUNO", "PROFESSOR"]) {
    await evaluate(
      `window.fixtureSession.user.role=${JSON.stringify(role)};const s=await import('/src/auth-session.ts');await s.refreshSession(true);`,
    );
    await until('document.body.textContent.includes("Acesso não autorizado")');
    assert.equal(
      await evaluate('document.querySelectorAll(".admin-integrated").length'),
      0,
    );
  }
  pass(
    "papel efetivo ALUNO ou PROFESSOR impede renderização administrativa, independentemente do token de teste",
  );
  await evaluate(
    "window.fixtureSession.user.role='ADMIN';window.fixtureSession.user.emailVerificado=false;const s=await import('/src/auth-session.ts');await s.refreshSession(true);",
  );
  await until('!document.querySelector(".admin-integrated")');
  assert.ok(
    await evaluate(
      'document.body.textContent.toLowerCase().includes("e-mail")',
    ),
  );
  await evaluate(
    "window.fixtureSession.user.emailVerificado=true;const s=await import('/src/auth-session.ts');await s.refreshSession(true);",
  );
  await until('!!document.querySelector(".admin-integrated")');
  pass("ADMIN sem e-mail confirmado permanece no fluxo normal de confirmação");
  await evaluate(
    "window.fixtureFailure={path:'/auth/session',status:401};const s=await import('/src/auth-session.ts');await s.refreshSession(true).catch(()=>{});",
  );
  await until('!document.querySelector(".admin-integrated")');
  assert.equal(
    await evaluate('sessionStorage.getItem("jurissim_token")'),
    null,
  );
  await until('!!document.querySelector(".auth-card")');
  assert.equal(
    await evaluate('document.querySelectorAll(".perfil-switch").length'),
    0,
  );
  assert.equal(
    await evaluate('document.querySelector(".auth-submit").textContent.trim()'),
    "Entrar",
  );
  await evaluate(
    "window.fixtureFailure=null;sessionStorage.setItem('jurissim_perfil','PROFESSOR');for(const [name,value] of [['email','admin@example.invalid'],['current-password','senha-de-teste']]){const input=document.querySelector('input[name=\"'+name+'\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}",
  );
  await evaluate('document.querySelector(".auth-submit").click()');
  await until('!!document.querySelector(".admin-integrated")');
  assert.equal(await evaluate("location.pathname"), "/administracao");
  assert.equal(
    await evaluate(
      'JSON.parse(window.requests.find(r=>r.p==="/auth/login").body).perfil===undefined',
    ),
    true,
  );
  assert.equal(
    await evaluate('sessionStorage.getItem("jurissim_perfil")'),
    null,
  );
  pass(
    "formulário único aceita ADMIN sem seleção de professor e usa exclusivamente o papel de /auth/session",
  );
  await evaluate(
    "const n=await import('/src/navigation.ts');n.navigate('/professor');",
  );
  await until('location.pathname==="/administracao"');
  assert.equal(
    await evaluate('document.querySelectorAll(".professor-shell").length'),
    0,
  );
  pass(
    "ADMIN é redirecionado exclusivamente à administração mesmo ao tentar a URL de professor",
  );
  pass(
    "sessão expirada ou revogada (401) elimina token e painel; nova sessão válida retoma o acesso",
  );
  await evaluate(
    "window.fixtureFailure={path:'/institutions/admin/users',status:403};",
  );
  await click("Usuários");
  await until(
    'document.querySelector(".admin-page [role=alert]")?.textContent.includes("Falha controlada")',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".admin-page article").length'),
    0,
  );
  await evaluate("window.fixtureFailure=null");
  await click("Tentar novamente");
  await until('document.body.textContent.includes("Aluno de teste")');
  await click("Visão geral");
  pass(
    "resposta 403 permanece bloqueada, sem registros ou ações expostos, e pode ser revalidada",
  );
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
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate("document.querySelector('.v0-user-trigger').click()");
  await evaluate(
    "Array.from(document.querySelectorAll('.v0-dropdown button')).find(b=>b.textContent.trim()==='Configurações').click()",
  );
  await until('!!document.querySelector(".v0-theme-options")');
  await evaluate(
    "Array.from(document.querySelectorAll('.v0-theme-options button')).find(b=>b.textContent.includes('Tema escuro')).click()",
  );
  await until('!!document.querySelector(".v0-dark")');
  await click("Visão geral");
  await until('!!document.querySelector(".admin-integrated")');
  assert.ok(
    await evaluate(
      'document.querySelector(".v0-app").classList.contains("v0-dark")',
    ),
  );
  pass(
    "preferências pessoais do ADMIN usam rota própria e o painel preserva o tema escuro oficial",
  );
  await cdp("Emulation.clearDeviceMetricsOverride");
  await evaluate(
    `window.fixtureSession={...window.fixtureSession,user:{...window.fixtureSession.user,role:'ALUNO'},nextStep:'DASHBOARD',administration:{enabled:true,globalAdmin:false,effectiveRole:'ALUNO',memberships:[{institutionId:'institution-ui',role:'INSTITUTION_ADMIN',institution:{name:'Curso de teste'}}]}};const s=await import('/src/auth-session.ts');await s.refreshSession(true);const n=await import('/src/navigation.ts');n.navigate('/instituicoes');`,
  );
  await until('document.body.textContent.includes("Administrar instituição")');
  await click("Administrar instituição");
  await until('!!document.querySelector("[data-testid=institution-dashboard]")');
  await click("Convites");
  await click("Convidar professor");
  await until('!!document.querySelector("input[type=email]")');
  await evaluate(
    `{const el=document.querySelector('input[type=email]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'teacher@example.invalid');el.dispatchEvent(new Event('input',{bubbles:true}));}`,
  );
  await evaluate(`{const el=Array.from(document.querySelectorAll('form input')).find(e=>e.type==='text');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Professor de teste');el.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await click("Enviar convite");
  await until(
    'window.requests.some(r=>r.p.endsWith("/invitations")&&r.method==="POST")',
  );
  pass("administrador institucional convida professor pela interface");
  await click("Configurações");
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
    'document.body.textContent.includes("Aceitar convite")',
  );
  assert.equal(await evaluate("location.hash"), "");
  assert.equal(
    await evaluate(
      'Object.values(sessionStorage).some(v=>v.includes("a".repeat(64)))',
    ),
    false,
  );
  await evaluate(
    'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Aceitar convite").click()',
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
  await evaluate(
    "const n=await import('/src/navigation.ts');n.navigate('/professor');",
  );
  await until(
    'document.querySelector(".professor-shell h1")?.textContent.includes("Seu painel")',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".v0-sidebar").textContent.includes("Banco de questões")',
    ),
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".admin-integrated").length'),
    0,
  );
  pass("dashboard e navegação originais do professor permanecem disponíveis");
  await evaluate(
    "window.fixtureSession.user.role='ALUNO';window.fixtureSession.nextStep='DASHBOARD';window.fixtureSession.administration={enabled:true,globalAdmin:false,effectiveRole:'ALUNO',memberships:[]};const s=await import('/src/auth-session.ts');await s.refreshSession(true);const n=await import('/src/navigation.ts');n.navigate('/dashboard');",
  );
  await until(
    'document.querySelector(".dashboard-heading h1")?.textContent.includes("Seu espaço de estudos")',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".v0-sidebar").textContent.includes("Minhas turmas")',
    ),
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".admin-integrated").length'),
    0,
  );
  pass("dashboard e navegação originais do aluno permanecem disponíveis");
  for (const [role, destination, selector] of [
    ["ALUNO", "/dashboard", ".dashboard-heading"],
    ["PROFESSOR", "/professor", ".professor-shell"],
    ["ADMIN", "/administracao", ".admin-integrated"],
  ]) {
    await evaluate(
      `sessionStorage.setItem('fixture-login-role',${JSON.stringify(role)});window.fixtureSession.user.role=${JSON.stringify(role)};window.fixtureSession.nextStep=${JSON.stringify(role === "ALUNO" ? "DASHBOARD" : "PROFESSOR")};const s=await import('/src/auth-session.ts');s.endSession();`,
    );
    await until('!!document.querySelector(".auth-card")');
    assert.equal(
      await evaluate('document.querySelectorAll(".perfil-switch").length'),
      0,
    );
    await evaluate(
      "for(const [name,value] of [['email','login@example.invalid'],['current-password','senha-de-teste']]){const input=document.querySelector('input[name=\"'+name+'\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}",
    );
    await evaluate('document.querySelector(".auth-submit").click()');
    await until(
      `location.pathname===${JSON.stringify(destination)}&&!!document.querySelector(${JSON.stringify(selector)})`,
    );
    assert.equal(
      await evaluate(
        'JSON.parse(sessionStorage.getItem("fixture-login-body")).perfil===undefined',
      ),
      true,
    );
    pass(
      `login único de ${role} chega ao destino validado sem seleção visual de permissões`,
    );
  }
  await evaluate(
    "sessionStorage.setItem('fixture-institutions-enabled','false');sessionStorage.setItem('fixture-global-administration','true');sessionStorage.setItem('fixture-registration','true');",
  );
  await cdp("Page.reload");
  await until(
    'window.fixtureEnabled===false&&window.fixtureAdmin===true&&document.querySelectorAll(".dashboard-stats strong")[0]?.textContent==="12"',
  );
  await click("Professores");
  await until(
    'document.body.textContent.includes("confirmação de e-mail pendente")',
  );
  await evaluate("window.globalClassFixture=true");
  await evaluate("const n=await import('/src/navigation.ts');n.navigate('/administracao/turmas');");
  await until('document.body.textContent.includes("Gestão pedagógica institucional")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/admin/classes")'),false);
  await click("Notificações");
  await until('document.body.textContent.includes("Nenhuma notificação")');
  await click("Solicitações de cadastro");
  await until('document.body.textContent.includes("Curso de teste")');
  await click("Histórico de decisões e eventos");
  await until('document.body.textContent.includes("INSTITUTION_ACTIVE")');
  assert.equal(
    await evaluate(
      'window.requests.some(r=>r.p.includes("/invitations")||r.method==="PATCH")',
    ),
    false,
  );
  pass(
    "administração global funciona sem ativação institucional; professores, turmas, notificações e decisões usam capacidades próprias",
  );
  await evaluate(
    "const s=await import('/src/auth-session.ts');s.endSession();",
  );
  await until('!!document.querySelector(".auth-card")');
  await evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Represento uma instituição').click()",
  );
  await until(
    'location.pathname==="/instituicoes"&&document.body.textContent.includes("Não é necessário possuir instituição ou vínculo")',
  );
  await evaluate(
    "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Cadastre-se').click()",
  );
  await until(
    'document.body.textContent.includes("Crie seu acesso de responsável")',
  );
  pass(
    "login público oferece caminho explícito para responsável sem instituição e sem seleção de privilégios",
  );
  await evaluate(
    "window.ownerRequests=[];window.fixtureSession.user={id:'owner-ui',nome:'Responsável de teste',email:'owner@example.invalid',role:'ALUNO',emailVerificado:true};window.fixtureSession.nextStep='DASHBOARD';window.fixtureSession.administration={enabled:false,globalAdmin:false,effectiveRole:'ALUNO',memberships:[]};const s=await import('/src/auth-session.ts');await s.establishSession('browser-fixture');",
  );
  await until(
    'document.body.textContent.includes("Nenhuma solicitação ou vínculo institucional")',
  );
  await click("Solicitar cadastro de instituição");
  await evaluate(
    "for(const [name,value] of [['name','Nova instituição de teste'],['responsibleName','Responsável de teste'],['phone','11999999999']]){const el=document.querySelector('.admin-form input[name=\"'+name+'\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}const select=document.querySelector('select[name=\"institutionType\"]');select.value='OUTRA_ORGANIZACAO';select.dispatchEvent(new Event('change',{bubbles:true}));const description=document.querySelector('textarea[name=\"description\"]');description.value='Organização educacional sem CNPJ de demonstração';description.dispatchEvent(new Event('input',{bubbles:true}));",
  );
  assert.equal(
    await evaluate(
      'document.querySelector("input[name=registrationNumber]").required',
    ),
    false,
  );
  await click("Enviar solicitação");
  await until(
    'document.body.textContent.includes("Solicitação enviada para análise")',
  );
  assert.equal(
    await evaluate(
      'window.requests.filter(r=>r.p==="/institutions/requests").length',
    ),
    1,
  );
  assert.equal(
    await evaluate(
      'JSON.parse(window.requests.find(r=>r.p==="/institutions/requests").body).registrationNumber',
    ),
    undefined,
  );
  assert.ok(
    await evaluate(
      'document.body.textContent.includes("Nova instituição de teste")&&document.body.textContent.includes("Pendente")',
    ),
  );
  assert.equal(
    await evaluate(
      'document.body.textContent.includes("Administrar instituição")',
    ),
    false,
  );
  pass(
    "primeira solicitação sem CNPJ usa identidade autenticada, exibe confirmação e status, sem vínculo nem privilégios automáticos",
  );
  await evaluate("sessionStorage.setItem('fixture-institutions-enabled','true')");
  await cdp('Page.navigate',{url:origin+'/convite-professor#/convite-professor?token='+'a'.repeat(64)});
  await until('document.body.textContent.includes("Convite de professor")');
  await evaluate("const s=await import('/src/auth-session.ts');s.endSession();");
  await until('document.body.textContent.includes("Receber confirmação de primeiro acesso")');
  await evaluate(`{const el=document.querySelector('.auth-card input:not([type])');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Professor convidado');el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.auth-card input[type=checkbox]').click();}`);
  await click('Receber confirmação de primeiro acesso');
  await until('document.querySelector("[role=status]")?.textContent.includes("Consulte as instruções")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/auth/register")'),false);
  pass('primeiro acesso usa somente o convite e solicita confirmação por e-mail, sem cadastro público de professor');
  const proofUrl=origin+'/convite-professor#/ativar-professor?convite='+'a'.repeat(64)+'&confirmacao='+'b'.repeat(64);
  await cdp('Page.navigate',{url:proofUrl});
  await until('document.body.textContent.includes("Confirmar e-mail e concluir acesso")');
  assert.equal(await evaluate('location.hash'),'');
  assert.equal(await evaluate('Object.values(sessionStorage).some(v=>v.includes("b".repeat(64)))'),false);
  await evaluate(`for(const input of document.querySelectorAll('.auth-card input[type=password]')){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'SenhaForte123!');input.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await click('Confirmar e-mail e concluir acesso');
  await until('document.querySelector("[role=status]")?.textContent.includes("primeiro acesso concluído")');
  assert.equal(await evaluate('document.querySelectorAll(".professor-shell").length'),0);
  pass('confirmação de primeiro acesso define senha pelo endpoint próprio, remove credenciais da URL e exige login posterior');
  await cdp('Page.navigate',{url:proofUrl});
  await until('document.body.textContent.includes("Recusar sem ativar vínculo")');
  await click('Recusar sem ativar vínculo');
  await until('document.querySelector("[role=status]")?.textContent.includes("Convite recusado")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/accept")'),false);
  pass('recusa com prova de e-mail não aceita o convite nem cria uma sessão de professor');
  for(const role of ['ALUNO','PROFESSOR']){
    await evaluate(`sessionStorage.setItem('fixture-context-owner-role',${JSON.stringify(role)});sessionStorage.setItem('fixture-institutions-enabled','true');`);
    await cdp('Page.navigate',{url:origin+'/instituicoes?instituicao=institution-ui'});
    await until(`!!document.querySelector("[data-testid=institution-dashboard]")&&!!document.querySelector('select[aria-label="Contexto de acesso"]')`);
    assert.equal(await evaluate('document.querySelector(".institution-workspace .sidebar").textContent.includes("Gestão")'),true);
    assert.equal(await evaluate('document.querySelectorAll("aside").length'),1);
    await evaluate("sessionStorage.setItem('jurissim_administration_institution','institution-ui');const api=await import('/src/api.ts');await api.apiRequest('/turmas');");
    assert.equal(await evaluate('window.requests.filter(r=>r.p==="/turmas").at(-1).headers["X-Institution-Context"]'),'administration');
    await evaluate("const el=document.querySelector('select[aria-label=\"Contexto de acesso\"]');el.value='personal';el.dispatchEvent(new Event('change',{bubbles:true}));");
    await until(`location.pathname===${JSON.stringify(role==='ALUNO'?'/dashboard':'/professor')}&&!!document.querySelector('select[aria-label="Contexto de acesso"]')`);
    assert.equal(await evaluate('window.fixtureSession.user.role'),role);
    assert.equal(await evaluate('document.querySelectorAll("aside").length'),1);
    await evaluate("const api=await import('/src/api.ts');await api.apiRequest('/turmas');");
    assert.equal(await evaluate('window.requests.filter(r=>r.p==="/turmas").at(-1).headers["X-Institution-Context"]===undefined'),true);
    await evaluate("const el=document.querySelector('select[aria-label=\"Contexto de acesso\"]');el.value='institution:institution-ui';el.dispatchEvent(new Event('change',{bubbles:true}));");
    await until('location.pathname==="/instituicoes"&&!!document.querySelector("[data-testid=institution-dashboard]")');
    assert.equal(await evaluate('window.fixtureSession.user.role'),role);
    pass('responsável '+role+' alterna contexto institucional e pessoal sem alterar identidade ou enviar autorização administrativa no estudo pessoal');
  }
  await evaluate("sessionStorage.removeItem('fixture-context-owner-role')");
  await evaluate("sessionStorage.setItem('fixture-context-owner-role','ALUNO');sessionStorage.setItem('fixture-rich-institution','true');sessionStorage.setItem('fixture-institutions-enabled','true');");
  await cdp('Page.navigate',{url:origin+'/instituicoes?instituicao=institution-ui&secao=overview'});
  await until('document.querySelector(".institution-workspace .metric-copy strong")?.textContent==="1"');
  assert.equal(await evaluate('document.querySelectorAll(".institution-workspace .nav-groups .nav-item").length'),11);
  assert.equal(await evaluate('document.querySelectorAll("aside").length'),1);
  assert.equal(await evaluate('document.body.textContent.includes("Faculdade Alfa")||document.body.textContent.includes("12,4%")'),false);
  const modules=[['overview','Visão geral','/institutions/institution-ui/summary'],['institution','Minha instituição','/institutions/institution-ui/summary'],['teachers','Professores','/institutions/institution-ui/summary'],['invitations','Convites','/institutions/institution-ui/invitations'],['classes','Turmas','/turmas'],['students','Alunos','/turmas/students'],['performance','Desempenho acadêmico','/reports/classes'],['exams','Simulados','/avaliacoes'],['reports','Relatórios','/reports/classes'],['notifications','Notificações','/institutions/notifications'],['settings','Configurações','/institutions/institution-ui/logs']];
  for(const [section,label,endpoint] of modules){
    await evaluate(`const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui',${JSON.stringify(section)});`);
    await until(`document.querySelector('.institution-workspace .breadcrumb strong')?.textContent===${JSON.stringify(label)}`);
    await until(`window.requests.some(r=>r.p===${JSON.stringify(endpoint)})`);
    assert.equal(await evaluate('document.querySelector(".institution-workspace .page-body").textContent.includes("Endpoint fora do cenário")'),false);
  }
  pass('onze módulos institucionais navegam pela URL e consultam somente os contratos existentes, sem dados demonstrativos do v0');
  await evaluate("const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui','performance',{turma:'class-ui'});");
  await until('document.querySelector(".institution-workspace .class-report-content")?.textContent.includes("80%")');
  await click('Consultar aluno');
  await until('location.search.includes("aluno=student-ui")&&document.body.textContent.includes("Aluno autorizado de teste")');
  assert.equal(await evaluate('location.pathname'),'/instituicoes');
  await click('Voltar ao relatório da turma');
  await until('!location.search.includes("aluno=")&&!!document.querySelector(".class-report-content")');
  pass('desempenho e relatório individual mantêm contexto institucional e não redirecionam o responsável para o professor');
  await evaluate("const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui','classes');");
  await until('document.body.textContent.includes("Professores designados")');
  await click('Retirar designação');await click('Confirmar retirada');
  await until('document.body.textContent.includes("Nenhum professor designado")');
  await evaluate("const el=document.querySelector('.institution-delegation select');el.value='teacher-ui';el.dispatchEvent(new Event('change',{bubbles:true}));");
  await click('Designar professor');
  await until('window.classData[0].professores.length===1&&!document.querySelector("[role=dialog]")');
  assert.equal(await evaluate('window.requests.filter(r=>r.p==="/turmas/class-ui/teachers/teacher-ui").map(r=>JSON.parse(r.body).assigned).join(",")'),'false,true');
  pass('instituição retira e reatribui delegação por ações reais do contrato; professor não solicita permissão');
  await click('Ver alunos');
  await until('location.pathname==="/instituicoes"&&location.search.includes("secao=students")&&location.search.includes("turma=class-ui")&&!!document.querySelector(".class-students li")');
  assert.equal(await evaluate('window.requests.filter(r=>r.p==="/turmas/class-ui/students").at(-1).headers["X-Institution-Context"]'),'administration');
  await click('Voltar às turmas');
  await until('location.pathname==="/instituicoes"&&location.search.includes("secao=classes")');
  pass('Ver alunos mantém instituição e turma na URL, sem entrar no dashboard docente');
  await evaluate("const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui','exams');");
  await click('Criar simulado');
  await until('document.querySelectorAll(".exam-form input[type=checkbox]").length===2');
  await evaluate(`{const title=document.querySelector('#exam-title');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Simulado institucional de teste');title.dispatchEvent(new Event('input',{bubbles:true}));for(const el of document.querySelectorAll('.exam-form input[type=checkbox]'))el.click();}`);
  await click('Salvar rascunho');
  await until('document.querySelector(".exam-card")?.textContent.includes("Simulado institucional de teste")');
  await click('Publicar simulado');
  await until('document.querySelector(".exam-card")?.textContent.includes("Publicado")');
  assert.equal(await evaluate('window.requests.find(r=>r.p==="/questoes").headers["X-Institution-Context"]'),'administration');
  pass('responsável ALUNO cria e publica simulado pelo contexto administrativo, usando catálogo e turmas autorizados');
  await evaluate("const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui','institution');");
  await click('Editar dados autorizados');
  await evaluate(`{const input=document.querySelector('.profile-card input[name=name]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Instituição atualizada de teste');input.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await click('Salvar dados');
  await until('document.querySelector(".profile-hero")?.textContent.includes("Instituição atualizada de teste")');
  pass('Minha instituição salva campos autorizados e só apresenta a confirmação após resposta de sucesso');
  await evaluate("document.querySelector('button[aria-label=\"Recolher menu\"]').click()");
  await until('!!document.querySelector(".sidebar.collapsed")');
  await evaluate("document.querySelector('button[aria-label=\"Expandir menu\"]').click()");
  await until('!document.querySelector(".sidebar.collapsed")');
  for(const width of [1440,768,720,390,320]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});
    for(const section of ['overview','invitations','classes','reports','settings']){
      await evaluate(`const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui',${JSON.stringify(section)});`);
      await until(`new URLSearchParams(location.search).get('secao')===${JSON.stringify(section)}`);
      await sleep(80);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'responsive '+width+' '+section);
    }
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate("const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui','overview');");
  await until('!!document.querySelector(".metric-grid")');
  const artifactDir=path.join(process.cwd(),'.artifacts');await mkdir(artifactDir,{recursive:true});
  const screen=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(artifactDir,'institution-overview-desktop-test.png'),Buffer.from(screen.data,'base64'));
  const previouslyDark=await evaluate('document.querySelector(".institution-workspace").classList.contains("dark-mode")');
  await evaluate("document.querySelector('button[aria-label=\"Alternar tema\"]').click()");
  await until(`document.querySelector(".institution-workspace").classList.contains("dark-mode")===${!previouslyDark}`);
  pass('layout institucional mantém largura sem transbordamento em desktop e celulares de 390/320 px, com tema escuro funcional');
  const reviewDir=path.join(artifactDir,'institution-final-review');await mkdir(reviewDir,{recursive:true});
  const inventory=[];
  for(const [variant,width,dark] of [['desktop-light',1440,false],['mobile-light',390,false],['desktop-dark',1440,true]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<700});
    const isDark=await evaluate('document.querySelector(".institution-workspace").classList.contains("dark-mode")');
    if(isDark!==dark)await evaluate("document.querySelector('button[aria-label=\"Alternar tema\"]').click()");
    await until(`document.querySelector(".institution-workspace").classList.contains("dark-mode")===${dark}`);
    for(const [section,label] of modules){
      await evaluate(`const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui',${JSON.stringify(section)},${JSON.stringify(section==='performance'||section==='reports'?{turma:'class-ui'}:{})});`);
      await until(`document.querySelector('.institution-workspace .breadcrumb strong')?.textContent===${JSON.stringify(label)}`);
      await until('!Array.from(document.querySelectorAll(".institution-workspace p")).some(p=>p.textContent==="Carregando…")');
      await evaluate('await document.fonts.ready');await sleep(180);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,variant+' '+section);
      assert.equal(await evaluate('Array.from(document.querySelectorAll(".institution-workspace .class-actions > button")).every(b=>b.scrollWidth<=b.clientWidth+1)'),true,'class action text '+variant+' '+section);
      const controls=await evaluate(`Array.from(document.querySelectorAll('.institution-workspace button,.institution-workspace form')).filter(e=>e.getClientRects().length).map(el=>{const props=el[Object.keys(el).find(k=>k.startsWith('__reactProps$'))]||{};return {tag:el.tagName,label:el.getAttribute('aria-label')||el.textContent.trim().replace(/\\s+/g,' ').slice(0,150),disabled:!!el.disabled,handled:el.tagName==='FORM'?typeof props.onSubmit==='function':typeof props.onClick==='function'||!!el.closest('form')&&el.type==='submit'};})`);
      assert.deepEqual(controls.filter(c=>!c.disabled&&!c.handled),[],section+' contains inert actions');
      if(width<700&&section==='overview'){
        await evaluate("document.querySelector('button[aria-label=\"Abrir menu\"]').click()");
        await until('!!document.querySelector(".sidebar.mobile-open")');
        await evaluate("document.querySelector('button[aria-label=\"Fechar menu institucional\"]').click()");
        await until('!document.querySelector(".sidebar.mobile-open")');
      }
      await evaluate(`{let stamp=document.querySelector('#isolated-test-label');if(!stamp){stamp=document.createElement('div');stamp.id='isolated-test-label';stamp.style.cssText='position:fixed;bottom:0;right:0;z-index:99999;padding:5px 9px;background:#fff1b8;color:#352400;font:11px sans-serif;pointer-events:none';document.body.append(stamp);}stamp.textContent='REVISÃO LOCAL · DADOS FICTÍCIOS · SEM SUPABASE';}`);
      const filename=section+'-'+variant+'.png';
      const {cssContentSize}=await cdp('Page.getLayoutMetrics');
      const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.min(12000,Math.ceil(cssContentSize.height)),scale:1}});
      await writeFile(path.join(reviewDir,filename),Buffer.from(shot.data,'base64'));
      inventory.push({section,label,variant,width,file:filename,controls});
    }
  }
  await writeFile(path.join(reviewDir,'inventory.json'),JSON.stringify(inventory,null,2));
  await writeFile(path.join(reviewDir,'index.html'),'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Revisão institucional isolada</title><style>body{font:16px system-ui;background:#eef1f5;padding:24px;color:#14263d}nav{display:flex;flex-wrap:wrap;gap:12px}article{margin:30px 0}img{max-width:100%;border:1px solid #aaa}small{display:block}</style><h1>Onze módulos — revisão local com dados fictícios</h1><p>Capturas automatizadas. Sem Supabase, contas reais ou envio de e-mail.</p><nav>'+modules.map(([id,label])=>`<a href="#${id}">${label}</a>`).join('')+'</nav>'+modules.map(([id,label])=>`<article id="${id}"><h2>${label}</h2>${inventory.filter(r=>r.section===id).map(r=>`<details ${r.variant==='desktop-light'?'open':''}><summary>${r.variant} · ${r.width}px</summary><a href="${r.file}">Abrir PNG</a><br><img loading="lazy" src="${r.file}" alt="${label}, ${r.variant}, dados de teste"></details>`).join('')}</article>`).join('')+'</html>');
  pass('33 capturas dos onze módulos e inventário de ações gerados; desktop/celular/temas e menu móvel validados sem botões inertes');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate("window.requests=[];const n=await import('/src/navigation.ts');n.navigate('/instituicoes?instituicao=foreign');");
  await until('document.body.textContent.includes("Acesso institucional não autorizado")');
  assert.equal(await evaluate('window.requests.some(r=>r.p.includes("/foreign/"))'),false);
  pass('instituição sem vínculo não renderiza o dashboard nem consulta dados institucionais');
  await evaluate("const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui','overview');");
  await until('!!document.querySelector(".metric-grid")');
  for(const failure of [{status:403},{network:true}]){
    await evaluate(`window.fixtureFailure={path:'/institutions/institution-ui/summary',...${JSON.stringify(failure)}};`);
    await evaluate("const n=await import('/src/navigation.ts');n.navigate('/instituicoes');");
    await until('!document.querySelector(".institution-workspace")');
    await evaluate("const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui','overview');");
    await until('!!document.querySelector(".institution-workspace [role=alert]")');
    assert.equal(await evaluate('!!document.querySelector(".metric-grid")'),false);
    await evaluate('window.fixtureFailure=undefined');await click('Tentar novamente');
    await until('!!document.querySelector(".metric-grid")');
  }
  pass('erros 403 e de rede institucionais ocultam conteúdo e permitem nova consulta sem simular sucesso');
  await evaluate("window.fixtureFailure={path:'/auth/session',status:401};const s=await import('/src/auth-session.ts');await s.refreshSession(true).catch(()=>{});");
  await until('!document.querySelector(".institution-workspace")&&!sessionStorage.getItem("jurissim_token")');
  pass('sessão institucional revogada remove o painel e o token, sem manter operações administrativas');
  await evaluate("sessionStorage.setItem('fixture-institutions-enabled','false')");
  await cdp('Page.navigate',{url:origin+'/instituicoes?instituicao=institution-ui'});
  await until('document.body.textContent.includes("Operações institucionais aguardam ativação autorizada")');
  assert.equal(await evaluate('window.requests.some(r=>r.p.includes("/institution-ui/"))'),false);
  pass('flag institucional desativada impede consultas e operações dos onze módulos, sem habilitação implícita');
  console.log(
    `Administração: ${checks} verificações de navegador com API simulada aprovadas. Sem banco ou envio real.`,
  );
} finally {
  socket?.close();
  browser.kill();
  vite.kill();
}
