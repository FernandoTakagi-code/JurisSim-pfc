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
    "--configLoader", "runner",
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
      if(window.fixtureFailure?.path===p) {if(window.fixtureFailure.network) throw new TypeError('Falha de rede simulada');return reply({message:window.fixtureFailure.message||'Falha controlada de teste',...(window.fixtureFailure.code?{code:window.fixtureFailure.code}:{})},window.fixtureFailure.status);}
      if(p==='/auth/session') return reply(window.fixtureSession);
      if(p==='/auth/login') {sessionStorage.setItem('fixture-login-body',init.body);return reply({token:'browser-fixture'});}
      if(p==='/auth/institution-register'&&method==='POST') {
        const input=JSON.parse(init.body);window.institutionRegistrationPayload=input;
        window.fixtureSession={user:{id:'owner-ui',nome:input.institution.responsibleName,email:input.email,role:'ALUNO',emailVerificado:false},nextStep:'DIAGNOSTIC',registrationIntent:'INSTITUTION',administration:{enabled:false,globalAdmin:false,effectiveRole:'ALUNO',memberships:[]}};
        window.ownerRequests=[{...input.institution,id:'application-ui',ownerId:'owner-ui',email:input.email,status:'EMAIL_PENDING'}];
        return reply({token:'institution-fixture',institution:{id:'application-ui',status:'EMAIL_PENDING'},emailVerification:{message:'Conta e solicitação recebidas. Confirme o e-mail.'}},201);
      }
      if(p==='/audit-logs') return reply([{id:'platform-event-ui',occurredAt:'2026-11-04T00:00:00Z',action:parsed.searchParams.get('action')||'LOGIN_SUCESSO',userId:'admin-ui',resourceId:null,termsVersion:null,privacyVersion:null}]);
      if(p==='/profile/photo') return reply({kind:'default'});
      if(p==='/health') return reply({status:'ok'});
      if(p==='/institutions/availability') {const full=window.fixtureEnabled,admin=full||window.fixtureAdmin,registration=full||window.fixtureRegistration;return reply({enabled:full,administrationEnabled:admin,registrationEnabled:registration,capabilities:{overview:admin,institutions:admin||registration,requests:admin||registration,decisions:admin||registration,users:admin,teachers:admin,classes:admin,audit:admin||registration,notifications:admin||registration,classAssignment:full,institutionalOperations:full}});}
      if(p==='/institutions/invitations/accept') {window.fixtureSession={...window.fixtureSession,registrationIntent:undefined,user:{...window.fixtureSession.user,role:'PROFESSOR'},nextStep:'PROFESSOR',administration:{enabled:true,globalAdmin:false,effectiveRole:'PROFESSOR',memberships:[{institutionId:'institution-ui',role:'TEACHER',institution:{name:'Curso de teste'}}]}};return reply({message:'Convite aceito.',institutionId:'institution-ui'});}
      if(p==='/institutions/invitations/onboarding') return reply({message:'Consulte as instruções no e-mail convidado. Contas existentes usam o login único.'});
      if(p==='/institutions/invitations/register') {window.fixtureInvitedIdentity=true;window.fixtureSession={...window.fixtureSession,registrationIntent:'TEACHER_INVITATION',user:{...window.fixtureSession.user,role:'ALUNO',emailVerificado:true},nextStep:'INVITATION'};return reply({message:'Sua conta foi criada. Entre para revisar o convite.',nextStep:'LOGIN',invitationPending:true},201);}
      if(p==='/institutions/invitations/complete') return reply({message:'E-mail confirmado e senha definida. Entre para revisar o convite.',nextStep:'LOGIN',invitationPending:true});
      if(p==='/institutions/invitations/decline-proof') return reply({message:'Convite recusado. Nenhum vínculo de professor foi ativado.'});
      if(p==='/institutions/invitations/inspect') return reply({institution:{id:'institution-ui',name:'Curso de teste'},email:window.fixtureSession?.user.email??'teacher@example.invalid',accountExists:window.fixtureInvitedIdentity===true,maskedEmail:'t***@example.invalid',expiresAt:new Date(Date.now()+3600000).toISOString()});
      if(p==='/institutions/admin/summary') return reply({users:12,institutions:2,pending:1,teachers:3,classes:4,errors:0});
      if(p==='/institutions/admin/institutions/institution-ui/decision-email')return reply(window.decisionEmailState??{id:'decision-ui',state:'PENDING',canRetry:true,attempts:0});
      if(p==='/institutions/admin/institutions/institution-ui/decision-email/decision-ui/retry'&&method==='POST'){window.decisionEmailState={id:'decision-ui',state:'SENT',canRetry:false,attempts:1};return reply({state:'SENT',message:'Envio simulado aceito.'});}
      if(p==='/institutions/admin/institutions') return reply(page([{id:'institution-ui',name:'Curso de teste',tradeName:'Curso',registrationNumber:'11222333000181',institutionType:'CURSO_PREPARATORIO',postalCode:'01001000',street:'Rua teste',number:'S/N',district:'Centro',city:'Sao Paulo',state:'SP',contactEmail:'institution@example.invalid',representativePosition:'Diretor',representativePhone:'11999999999',representationEvidence:'Verificar junto a secretaria',representationDeclaration:true,website:'https://example.invalid',responsibleName:'Responsável',email:'owner@example.invalid',phone:'11999999999',description:'Instituição fictícia de teste',status:window.institutionStatus,...window.institutionPresentationPatch}]));
      if(p==='/institutions/admin/institutions/institution-ui' && method==='PATCH') {window.institutionStatus=JSON.parse(init.body).status;return reply({message:'Decisão registrada.'});}
      if(p==='/institutions/admin/users') return reply(page(parsed.searchParams.get('role')==='PROFESSOR'?[{id:'teacher-ui',nome:'Professor de teste',email:'teacher@example.invalid',role:'PROFESSOR',suspended:false,memberships:[]}]:[{id:'student-ui',nome:'Aluno de teste',email:'student@example.invalid',role:'ALUNO',suspended:window.studentSuspended===true,memberships:[]},{...window.fixtureSession.user,suspended:false,memberships:[]}]));
      if(p==='/institutions/admin/classes') return reply(page(window.globalClassFixture?[{id:'class-ui',nome:'Turma legada',professores:[],institutionalClass:null,archivedAt:null}]:[]));
      if(p==='/institutions/requests'&&method==='POST'){const application={...JSON.parse(init.body),id:'application-ui',status:'PENDING'};window.ownerRequests.push(application);return reply(application,201);}
      if(p==='/institutions/requests/application-ui'&&method==='PUT'){window.ownerRequests[0]={...window.ownerRequests[0],...JSON.parse(init.body),status:'PENDING',decisionReason:null};return reply(window.ownerRequests[0]);}
      if(p.startsWith('/institutions/admin/users/') && method==='PATCH') {
        const apply=()=>{const body=JSON.parse(init.body);if(p.endsWith('/student-ui')&&typeof body.suspended==='boolean')window.studentSuspended=body.suspended;return reply({message:'Conta atualizada.'});};
        if(window.delayAccountControl)return new Promise(resolve=>{window.releaseAccountControl=()=>resolve(apply());});
        return apply();
      }
      if(p.endsWith('/logs')) return reply(page([{id:'event-ui',occurredAt:'2026-11-04T00:00:00Z',event:'INSTITUTION_ACTIVE',actorId:'admin-ui',institutionId:'institution-ui',resourceId:'institution-ui',result:'SUCCESS',severity:'INFO'}]));
      if(p==='/reports/overview')return reply({classes:window.classData.length,activeClasses:window.classData.filter(c=>!c.archivedAt).length,students:0,publishedExams:0});
      if(p==='/institutions/mine') return reply(window.ownerRequests??[{id:'institution-ui',name:'Curso de teste',status:'ACTIVE',decisionReason:'É uma instituição'}]);
      if(p==='/institutions/institution-ui/summary') return reply({institution:{id:'institution-ui',name:'Curso de teste',responsibleName:'Responsável de teste',email:'owner@example.invalid',status:'ACTIVE',phone:'11999999999',description:'Curso preparatório',createdAt:'2026-11-04T00:00:00Z',...window.institutionPatch},teachers:page(window.institutionalFixtures?[{id:'member-ui',userId:'teacher-ui',active:true,user:{id:'teacher-ui',nome:'Professor de teste',email:'teacher@example.invalid'}}]:[]),classes:page(window.classData),indicators:{classes:window.classData.length,students:window.institutionalFixtures?1:0,completedAttempts:0,activeTeachers:window.institutionalFixtures?1:0,pendingInvitations:0,activeClasses:window.classData.length}});
      if(p.endsWith('/invitations') && method==='POST'){const body=JSON.parse(init.body);window.invitationData.push({id:'invite-ui',email:body.email,invitedName:body.name,status:'PENDING',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});return reply({message:'Convite submetido ao provedor.'});}
      if(p==='/institutions/institution-ui/invitations/revoked-ui/resend'&&method==='POST'){window.invitationData.push({id:'resent-ui',email:'revoked@example.invalid',status:'PENDING',deliveryState:'ACCEPTED_BY_PROVIDER',sentAt:new Date().toISOString(),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});return reply({message:'Convite submetido ao provedor.'});}
      if(p.endsWith('/invitations')) return reply(page(window.invitationData));
      if(p==='/institutions/notifications') return reply(page([]));
      if(p==='/turmas/join') return reply({joined:false,message:'Solicitação enviada. Aguarde aprovação.'});
      if(p==='/questoes') return reply(window.institutionalFixtures?[{id:'question-ui',enunciado:'Questão autorizada de teste',disciplina:'Civil',publica:true,alternativas:[{id:'alternative-a',texto:'A',correta:true},{id:'alternative-b',texto:'B',correta:false}]}]:[]);
      if(p==='/avaliacoes'&&method==='POST'){const body=JSON.parse(init.body),exam={id:'exam-ui',...body,publishedAt:null,turmas:window.classData.filter(c=>body.turmaIds.includes(c.id)),questoes:body.questaoIds.map(questaoId=>({questaoId,posicao:1})),_count:{tentativas:0}};window.examData.push(exam);return reply(exam,201);}
      if(p==='/avaliacoes')return reply(page(window.examData));
      if(p==='/avaliacoes/eligible-questions')return reply(page(window.institutionalFixtures?[{id:'question-ui',enunciado:'Questão autorizada de teste',disciplina:'Civil',publica:true}]:[]));
      if(p==='/avaliacoes/exam-ui/publish'){window.examData[0].publishedAt=new Date().toISOString();return reply(window.examData[0]);}
      if(p==='/institutions/institution-ui'&&method==='PATCH'){window.institutionPatch=JSON.parse(init.body);return reply({message:'Dados atualizados.'});}
      if(p==='/turmas/students')return reply(page(window.institutionalFixtures?[{id:'student-ui',nome:'Aluno autorizado de teste',email:'student@example.invalid'}]:[]));
      if(p==='/reports/classes')return reply(page(window.classData));
      if(p==='/reports/classes/class-ui')return reply({turma:window.classData[0],summary:{enrolledStudents:1,publishedExams:1,participants:1,startedAttempts:1,completedAttempts:1,inProgressAttempts:0,expiredAttempts:0,participationPercentage:100,meanPercentage:80,meanIncorrectPercentage:20,meanUnansweredPercentage:0,meanCorrectAnswers:4,meanIncorrectAnswers:1,correctAnswers:4,incorrectAnswers:1,unansweredQuestions:0},levelDistribution:[{level:'BASICO',students:1}],disciplineMetrics:[{discipline:'Civil',totalQuestions:5,correctAnswers:4,percentage:80}],exams:page([]),students:page([{id:'student-ui',name:'Aluno autorizado de teste',started:1,completed:1,meanPercentage:80}]),evolution:[]});
      if(p==='/reports/classes/class-ui/students/student-ui')return reply({turma:window.classData[0],student:{id:'student-ui',nome:'Aluno autorizado de teste'},summary:{enrolledStudents:1,publishedExams:1,participants:1,startedAttempts:1,completedAttempts:1,inProgressAttempts:0,expiredAttempts:0,participationPercentage:100,meanPercentage:80,meanIncorrectPercentage:20,meanUnansweredPercentage:0,meanCorrectAnswers:4,meanIncorrectAnswers:1,correctAnswers:4,incorrectAnswers:1,unansweredQuestions:0},evolution:[],attempts:page([])});
      if(p==='/turmas/class-ui/teachers/teacher-ui'&&method==='PUT'){const data=JSON.parse(init.body);window.classData[0].professores=data.assigned?[{id:'teacher-ui',nome:'Professor de teste'}]:[];return reply({message:'Designação atualizada.'});}
      if(p==='/turmas' && method==='POST') {const turma={id:'class-ui',nome:JSON.parse(init.body).nome,archivedAt:null,_count:{alunos:0}};window.classData.push(turma);return reply({turma,inviteCode:'A'.repeat(32),expiresAt:'2026-11-11T00:00:00Z'});}
      if(p==='/turmas') {const current=Number(parsed.searchParams.get('page')||1);return reply(window.invitePagination?{items:[{id:'pagination-class-'+current,nome:'Turma fictícia '+current,archivedAt:null,_count:{alunos:0}}],page:current,hasMore:current===1}:page(window.classData));}
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
    const expr=`Array.from(document.querySelectorAll('.admin-page button, .v0-sidebar nav button, .auth-layout button, .account-confirmation-layer button, .email-confirmation-screen button, .institution-workspace button')).find(b=>(b.getAttribute('aria-label')===${JSON.stringify(text)}||b.textContent.trim()===${JSON.stringify(text)})&&!b.disabled)`;
    await until('!!('+expr+')');
    return evaluate(expr+'.click()');
  };
  const searchAccounts = async () => {
    await until(`!!document.querySelector('.admin-page input[maxlength="120"]')`);
    await evaluate(`{const el=document.querySelector('.admin-page input[maxlength="120"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'teste');el.dispatchEvent(new Event('input',{bubbles:true}));}`);
    await click('Pesquisar');
  };
  if (process.env.INSTITUTION_REGISTRATION_UI_ONLY === 'true') {
    await until('document.body.textContent.includes("12")');
    await evaluate(`const s=await import('/src/auth-session.ts');s.endSession();const n=await import('/src/navigation.ts');n.navigate('/');`);
    await click('Cadastre-se');await click('Represento uma instituição');
    await until(`!!document.querySelector('.institution-wizard')`);
    const fill=async(name,value)=>evaluate(`{const el=document.querySelector('[name=${JSON.stringify(name)}]');Object.getOwnPropertyDescriptor(${name==='representationEvidence'?'HTMLTextAreaElement':name==='institutionType'||name==='state'?'HTMLSelectElement':'HTMLInputElement'}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('${name==='institutionType'||name==='state'?'change':'input'}',{bubbles:true}));}`);
    const values={name:'Instituição de teste isolado',tradeName:'Academy de teste',registrationNumber:'123',contactEmail:'institution@example.invalid',phone:'11999999999',postalCode:'01001000',street:'Rua de teste',number:'S/N',district:'Centro',city:'São Paulo',institutionType:'CURSO_PREPARATORIO',state:'SP'};
    for(const [name,value] of Object.entries(values))await fill(name,value);
    await evaluate(`document.querySelector('[name=noWebsite]').click()`);
    await click('Continuar');
    await until(`!!document.querySelector('.institution-wizard [role=alert]')`);
    assert.equal(await evaluate(`window.requests.some(r=>r.p==='/auth/institution-register')`),false);
    await fill('registrationNumber','12ABC34501DE35');await click('Continuar');
    await until(`document.querySelector('.institution-wizard').textContent.includes('Etapa 2 de 3')`);
    await fill('responsibleName','Responsável de teste');await click('Voltar');
    assert.equal(await evaluate(`document.querySelector('[name=name]').value`),values.name);
    await click('Continuar');assert.equal(await evaluate(`document.querySelector('[name=responsibleName]').value`),'Responsável de teste');
    await fill('representativePosition','Diretor');await fill('representativePhone','11999999999');await fill('email','owner@example.invalid');await fill('emailConfirmation','wrong@example.invalid');await fill('representationEvidence','Referência de teste verificável junto à secretaria.');
    await evaluate(`document.querySelector('[name=representationDeclaration]').click()`);await click('Continuar');
    await until(`document.querySelector('.institution-wizard [role=alert]')?.textContent.includes('e-mails')`);
    await fill('emailConfirmation','owner@example.invalid');await click('Continuar');
    await fill('senha','Local-secret9!');await fill('confirmacaoSenha','Different-secret9!');await evaluate(`document.querySelector('[name=accepted]').click()`);await click('Enviar solicitação para análise');
    await until(`document.querySelector('.institution-wizard [role=alert]')?.textContent.includes('senhas')`);
    await fill('confirmacaoSenha','Local-secret9!');
    const artifactDir=path.join(process.cwd(),'.artifacts','institution-registration');await mkdir(artifactDir,{recursive:true});
    for(const width of [1280,390]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
      for(const step of [3,2,1]){
        await evaluate('await document.fonts.ready');await sleep(100);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'registration step '+step+' width '+width);
        const {cssContentSize}=await cdp('Page.getLayoutMetrics');const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.ceil(cssContentSize.height),scale:1}});await writeFile(path.join(artifactDir,'step-'+step+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
        if(step>1)await click('Voltar');
      }
      await click('Continuar');await click('Continuar');
    }
    await evaluate(`{const button=Array.from(document.querySelectorAll('.institution-wizard button')).find(b=>b.textContent==='Enviar solicitação para análise');button.click();button.click();}`);
    await until(`document.body.textContent.includes('Confirme seu e-mail')&&!document.querySelector('.institution-wizard')`);
    assert.equal(await evaluate(`window.requests.filter(r=>r.p==='/auth/institution-register').length`),1);
    assert.equal(await evaluate(`location.pathname`),'/instituicoes');
    assert.equal(await evaluate(`window.institutionRegistrationPayload.institution.registrationNumber`),'12ABC34501DE35');
    await evaluate(`window.fixtureSession.user.emailVerificado=true;window.ownerRequests[0].status='PENDING';const s=await import('/src/auth-session.ts');await s.refreshSession(true);`);
    await until(`document.body.textContent.includes('Meus vínculos e solicitações')`);
    assert.equal(await evaluate(`document.querySelector('.v0-sidebar nav').textContent.includes('Estudar')`),false);
    await evaluate(`const n=await import('/src/navigation.ts');n.navigate('/dashboard');`);
    await until(`location.pathname==='/instituicoes'`);
    pass('three-step registration validates CNPJ/email/password, preserves draft, prevents duplicate submission and redirects to institutional tracking');
    pass('all three steps captured at desktop/mobile widths without overflow; API fully simulated');
    await evaluate(`window.ownerRequests[0].status='REJECTED';window.ownerRequests[0].decisionReason='Corrigir referência de representação.';const n=await import('/src/navigation.ts');n.navigate('/perfil');`);
    await until(`location.pathname==='/perfil'`);
    await evaluate(`const n=await import('/src/navigation.ts');n.navigate('/instituicoes');`);
    await click('Corrigir e reenviar solicitação');
    await until(`!!document.querySelector('.institution-wizard')`);
    await evaluate(`document.querySelector('[name=noWebsite]').click()`);
    await click('Continuar');
    assert.equal(await evaluate(`document.querySelector('[name=email]').readOnly`),true);
    await click('Continuar');
    assert.equal(await evaluate(`!!document.querySelector('[name=senha]')`),false);
    await evaluate(`document.querySelector('[name=accepted]').click()`);
    await click('Enviar solicitação para análise');
    await until(`window.ownerRequests[0].status==='PENDING'&&!document.querySelector('.institution-wizard')`);
    assert.equal(await evaluate(`window.requests.filter(r=>r.p==='/auth/institution-register').length`),1);
    assert.equal(await evaluate(`window.requests.filter(r=>r.p==='/institutions/requests/application-ui'&&r.method==='PUT').length`),1);
    assert.equal(await evaluate(`window.fixtureSession.user.emailVerificado`),true);
    pass('confirmed existing account resubmits its rejected application without another user, password or email confirmation');
  } else if (process.env.INSTITUTION_EMAIL_UI_ONLY === 'true') {
    await until('!!document.querySelector(".admin-page")');
    await evaluate(`const n=await import('/src/navigation.ts');n.navigate('/administracao/solicitacoes');`);
    await until('!!document.querySelector(".admin-page article")');
    await evaluate(`Array.from(document.querySelectorAll('summary')).find(s=>s.textContent==='Dados cadastrais e análise').click()`);
    for(const [state,text,retry] of [['PENDING','Aguardando envio',true],['SENDING','Envio em andamento',false],['SENT','Aceito pelo provedor',false],['FAILED','Envio não aceito',true],['UNKNOWN','Recebimento indeterminado',false]]){
      await evaluate(`window.decisionEmailState=${JSON.stringify({id:'decision-ui',state,canRetry:retry,attempts:state==='PENDING'?0:1,lastAttemptAt:state==='PENDING'?undefined:'2026-11-12T04:00:00Z',lastError:state==='FAILED'?{code:'DELIVERY_NOT_ACCEPTED'}:undefined})}`);
      await click('Consultar notificação por e-mail');
      await until(`Array.from(document.querySelectorAll('[role=status]')).some(el=>el.textContent.includes(${JSON.stringify(text)}))`);
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Tentar envio seguro')`),retry);
      assert.ok(await evaluate(`document.body.textContent.includes('Tentativas de processamento:')`));
      for(const width of [1280,390]){await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
    }
    assert.equal(await evaluate(`window.requests.some(r=>r.method==='PATCH'||r.p.endsWith('/retry'))`),false);
    await evaluate(`window.decisionEmailState={id:'decision-ui',state:'PENDING',canRetry:true,attempts:0}`);await click('Consultar notificação por e-mail');
    await until(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Tentar envio seguro')`);await click('Tentar envio seguro');
    await until(`document.body.textContent.includes('Envio simulado aceito')`);
    assert.equal(await evaluate(`window.requests.filter(r=>r.p.endsWith('/retry')&&r.method==='POST').length`),1);
    pass('email states, attempt metadata, safe recovery and responsive layout validated with fully mocked API; no real send');
  } else if (process.env.ADMIN_H3_UI_ONLY === 'true') {
    await until('document.body.textContent.includes("12")');
    const fixtureCases=[
      {homologationApproval:false,approvalReview:{pendingFields:['CNPJ'],canApprove:false}},
      {homologationApproval:true,approvalReview:{pendingFields:[],canApprove:true}},
      {homologationApproval:true,street:null,approvalReview:{pendingFields:['Logradouro'],canApprove:false}},
      {homologationApproval:true,owner:{emailVerifiedAt:null},approvalReview:{pendingFields:[],canApprove:false}},
      {homologationApproval:true},
    ];
    for(const [index,patch] of fixtureCases.entries()) {
      const eligible=patch.approvalReview?.canApprove===true;
      await evaluate(`window.institutionPresentationPatch=${JSON.stringify({registrationNumber:null,...patch})};const n=await import('/src/navigation.ts');n.navigate('/administracao/${index%2?'solicitacoes':'instituicoes'}');`);
      await until('!!document.querySelector(".admin-page article")');
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('.admin-page button')).find(b=>b.textContent.trim()==='Aprovar / reativar')?.disabled`),!eligible);
      if(eligible) {
        await evaluate(`Array.from(document.querySelectorAll('summary')).find(s=>s.textContent==='Dados cadastrais e análise').click()`);
        assert.ok(await evaluate(`document.body.textContent.includes('dispensa restrita de CNPJ')`));
        assert.equal(await evaluate(`document.body.textContent.includes('Cadastro incompleto')`),false);
        assert.ok(await evaluate(`document.body.textContent.includes('Sem pendências cadastrais identificadas')`));
        assert.ok(await evaluate(`document.body.textContent.includes('Sem CNPJ')`));
        for(const width of [1280,390]){await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
      }
      if(index===2)assert.ok(await evaluate(`document.body.textContent.includes('1 pendências para análise')`));
    }
    assert.equal(await evaluate(`window.requests.some(r=>r.method==='PATCH')`),false);
    pass('fixture approval UI requires backend eligibility; no mutation submitted');
  } else if (process.env.ADMIN_REFINEMENT_ONLY === 'true' || process.env.ADMIN_PRESENTATION_ONLY === 'true') {
    await until('document.body.textContent.includes("12")');
    if(process.env.ADMIN_PRESENTATION_ONLY === 'true') await evaluate(`window.institutionPresentationPatch={institutionType:null,tradeName:null,website:null};`);
    const artifactDir=path.join(process.cwd(),'.artifacts','admin-refinement');await mkdir(artifactDir,{recursive:true});
    if (process.env.ADMIN_PRESENTATION_ONLY !== 'true') {
    for (const route of ['usuarios','professores']) {
      await evaluate(`const n=await import('/src/navigation.ts');n.navigate('/administracao/${route}');`);
      await until('!!document.querySelector(".admin-page form")');
      const before=await evaluate('window.requests.filter(r=>r.p==="/institutions/admin/users").length');await sleep(180);
      assert.equal(await evaluate('window.requests.filter(r=>r.p==="/institutions/admin/users").length'),before);
      await searchAccounts();await until('!!document.querySelector(".admin-page article")');
      assert.ok(await evaluate('window.requests.filter(r=>r.p==="/institutions/admin/users").at(-1).query.includes("search=teste")'));
      pass(route+': explicit search required');
    }
    await evaluate(`const n=await import('/src/navigation.ts');n.navigate('/administracao/usuarios');`);
    await searchAccounts();await until('!!document.querySelector(".admin-page article")');
    await click('Suspender');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Confirmar alteração').disabled`),true);
    await evaluate(`{const el=document.querySelector('textarea[maxlength="500"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Authorized isolated review');el.dispatchEvent(new Event('input',{bubbles:true}));}`);
    await click('Confirmar alteração');
    await until('window.requests.some(r=>r.method==="PATCH"&&r.p.includes("/admin/users/"))');
    assert.equal(JSON.parse(await evaluate('window.requests.find(r=>r.method==="PATCH"&&r.p.includes("/admin/users/")).body')).reason,'Authorized isolated review');
    pass('account mutation requires explicit confirmation and reason');
    }
    for(const width of [1280,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
      for(const route of (process.env.ADMIN_PRESENTATION_ONLY === 'true' ? ['configuracoes','instituicoes','solicitacoes'] : ['usuarios','professores','configuracoes','instituicoes','solicitacoes'])) {
        await evaluate(`const n=await import('/src/navigation.ts');n.navigate('/administracao/${route}');`);await sleep(300);
        if(route==='usuarios'||route==='professores'){await searchAccounts();await until('!!document.querySelector(".admin-page article")');}
        if(route==='configuracoes') {
          assert.ok(await evaluate('document.body.textContent.includes("A opção de pausar temporariamente novas solicitações institucionais estará disponível em uma atualização futura.")'));
          assert.equal(await evaluate(`Array.from(document.querySelectorAll('.admin-settings section')).at(-1).querySelectorAll('button,input,select').length`),0);
        }
        if(route==='instituicoes'||route==='solicitacoes') {
          const title=route==='instituicoes'?'Instituições cadastradas':'Análise de solicitações';
          assert.equal(await evaluate(`document.querySelector('.admin-section-content h2').textContent`),title);
          await evaluate(`Array.from(document.querySelectorAll('summary')).find(s=>s.textContent==='Dados cadastrais e análise').click()`);
          await until(`!!document.querySelector('details[open]')`);
          const count=await evaluate(`document.querySelector('.admin-page article > p:nth-of-type(3)')?.textContent.match(/([0-9]+) pendências/)?.[1]`);
          const items=await evaluate(`document.querySelectorAll('[aria-label="Pendências cadastrais"] li').length`);
          if(count) assert.equal(items,Number(count),'pending count preserved');
          if(process.env.ADMIN_PRESENTATION_ONLY === 'true') {assert.equal(Number(count),3);assert.equal(items,3);}
          if(items) assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Pendências cadastrais"] h4').length`),5);
          assert.ok(await evaluate(`Array.from(document.querySelectorAll('dt')).some(el=>el.textContent==='Tipo de instituição')`));
        }
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,route+' '+width);
        const {cssContentSize}=await cdp('Page.getLayoutMetrics');
        const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.ceil(cssContentSize.height),scale:1}});await writeFile(path.join(artifactDir,route+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
      }
    }
    pass('presentation checked and captured at desktop and mobile widths without overflow');
    console.log(`Refinement: ${checks} browser checks passed. Mock API only; no shared database.`);
  } else {
  await until(
    'document.body.textContent.includes("Usuários") && document.body.textContent.includes("12")',
  );
  pass("dashboard administrativo renderiza indicadores da API isolada");
  assert.equal(
    await evaluate('document.querySelectorAll(".v0-sidebar nav").length'),
    2,
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".v0-sidebar nav button").length',
    ),
    10,
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
    "ADMIN recebe navegação própria e um único acesso a perfil e configurações, sem menu de aluno ou professor",
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
  await searchAccounts();
  await until('document.body.textContent.includes("Aluno de teste")');
  for (const dark of [false, true]) {
    await evaluate(`document.querySelector('.v0-app').classList.toggle('v0-dark',${dark})`);
    for (const width of [320, 390, 1366]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
      assert.equal(await evaluate('[...document.querySelectorAll(".account-action-button")].every(b=>b.getBoundingClientRect().height>=42&&getComputedStyle(b).opacity==="1")'), true);
    }
  }
  await evaluate('document.querySelector(".v0-app").classList.remove("v0-dark")');
  await cdp('Emulation.clearDeviceMetricsOverride');
  assert.equal(await evaluate('[...document.querySelectorAll(".account-action-danger")].every(b=>b.disabled)'), true);
  assert.equal(await evaluate('window.requests.some(r=>r.method==="DELETE"&&r.p.includes("/admin/users/"))'), false);
  pass('ações administrativas têm 42px, contraste desabilitado, temas e layout responsivo; exclusão não envia requisição');
  await click("Suspender");
  await evaluate(`{const el=document.querySelector('[role="alert"] textarea[maxlength="500"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Authorized review');el.dispatchEvent(new Event('input',{bubbles:true}));}`);
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
    2,
  );
  pass(
    "clique duplicado envia uma única alteração; autoalterações administrativas ficam desabilitadas",
  );
  await until('[...document.querySelectorAll(".account-action-button")].some(b=>b.textContent==="Reativar")');
  const readsBeforeFailure = await evaluate('window.requests.filter(r=>r.p==="/institutions/admin/users"&&r.method==="GET").length');
  await evaluate('window.fixtureFailure={path:"/institutions/admin/users/student-ui",status:409}');
  await click('Reativar');
  await evaluate(`{const el=document.querySelector('[role="alert"] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Reactivation fixture review');el.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await click('Confirmar alteração');
  await until('document.body.textContent.includes("Falha controlada de teste")');
  assert.equal(await evaluate('window.requests.filter(r=>r.p==="/institutions/admin/users"&&r.method==="GET").length'), readsBeforeFailure);
  assert.equal(await evaluate('[...document.querySelectorAll(".account-action-button")].some(b=>b.textContent==="Reativar")'), true);
  await evaluate('window.fixtureFailure=null;window.delayAccountControl=true');
  await click('Confirmar alteração');
  await until('typeof window.releaseAccountControl==="function"');
  assert.equal(await evaluate('window.requests.filter(r=>r.p==="/institutions/admin/users"&&r.method==="GET").length'), readsBeforeFailure);
  assert.equal(await evaluate('[...document.querySelectorAll(".account-action-button")].some(b=>b.textContent==="Salvando..."&&b.disabled)'), true);
  await evaluate('window.releaseAccountControl();window.delayAccountControl=false');
  await until('window.requests.filter(r=>r.p==="/institutions/admin/users"&&r.method==="GET").length>'+readsBeforeFailure);
  await until('[...document.querySelectorAll(".account-action-button")].some(b=>b.textContent==="Suspender")');
  pass('reativação mantém listagem no erro e durante carregamento; atualiza somente após sucesso da API simulada');
  await click("Logs e auditoria");
  await until('document.body.textContent.includes("INSTITUTION_ACTIVE")');
  pass("auditoria mostra data, evento, responsável e resultado");
  for (const [title, expected] of [
    ["Solicitações de cadastro", "Pendente"],
    ["Professores", "Professor de teste"],
    ["Segurança", "Segurança da conta administrativa"],
    ["Notificações", "Nenhuma notificação"],
    ["Configurações do sistema", "Estado do sistema"],
    ["Visão geral", "Seu painel administrativo"],
  ]) {
    await click(title);
    if (title === "Professores") await searchAccounts();
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
    "Configurações do sistema",
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
      'document.querySelector(".admin-page").textContent.includes("Exibindo") && document.querySelector(".admin-page").textContent.includes("até o limite de")',
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
  await click("Configurações do sistema");
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
  await click("Configurações do sistema");
  assert.ok(
    await evaluate(
      'document.querySelector(".admin-page").textContent.includes("Controles administrativos")',
    ),
  );
  assert.equal(
    await evaluate(
      'window.requests.some(r=>r.p==="/notifications")',
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
  for (const title of ["Professores", "Logs e auditoria", "Configurações do sistema"]) {
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
    await until(role === 'PROFESSOR' ? 'location.pathname === "/professor" && !!document.querySelector("[data-testid=teacher-dashboard]")' : 'document.body.textContent.includes("Acesso não autorizado")');
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
    await evaluate('document.querySelectorAll(".teacher-dashboard, .professor-shell").length'),
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
  await searchAccounts();
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
    "Array.from(document.querySelectorAll('.v0-dropdown button')).find(b=>b.textContent.trim()==='Perfil e configurações').click()",
  );
  await evaluate("Array.from(document.querySelectorAll('.v0-tabs button')).find(b=>b.textContent.trim()==='Aparência').click()");
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
  assert.equal(await evaluate('document.querySelector(".institution-review-note > p").textContent'),'É uma instituição');
  assert.equal(await evaluate('document.querySelector(".institution-review-note > span").textContent'),'Observação registrada na análise');
  assert.equal(await evaluate('document.querySelector(".institution-manage-button").getBoundingClientRect().height>=42'),true);
  assert.equal(await evaluate('document.querySelector(".institution-manage-button").getBoundingClientRect().top>=document.querySelector(".institution-review-note").getBoundingClientRect().bottom'),true);
  pass('portal separa rótulo e observação do backend sem alterar conteúdo; ação primária tem 42px e não sobrepõe a nota');
  await click("Administrar instituição");
  await until('!!document.querySelector("[data-testid=institution-dashboard]")');
  await click("Convites");
  await click("Convidar professor");
  await until('!!document.querySelector("input[type=email]")');
  assert.equal(await evaluate('document.activeElement.name'),'name');
  assert.equal(await evaluate('document.querySelector(".institution-dialog-layer").parentElement===document.body'),true);
  assert.equal(await evaluate('document.querySelector(".institution-workspace:not(.institution-dialog-layer)").inert'),true);
  assert.equal(await evaluate('!!document.querySelector(".institution-class-pagination")'),false);
  for(const width of [320,390,1440]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:width<600});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert.equal(await evaluate('(()=>{const r=document.querySelector("[role=dialog]").getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()'),true);
  }
  await cdp('Emulation.clearDeviceMetricsOverride');
  await evaluate('[...document.querySelectorAll("[role=dialog] button")].at(-1).focus()');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Fechar');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await until('!document.querySelector("[role=dialog]")');
  assert.equal(await evaluate('document.activeElement.textContent.trim()'),'Convidar professor');
  assert.equal(await evaluate('document.querySelector(".institution-workspace").inert'),false);
  await click('Convidar professor');await until('!!document.querySelector("[role=dialog]")');
  await evaluate('document.querySelector("[role=dialog] button[aria-label=Fechar]").click()');
  await until('!document.querySelector("[role=dialog]")');
  await click('Convidar professor');await until('!!document.querySelector("[role=dialog]")');
  await evaluate('[...document.querySelectorAll("[role=dialog] button")].find(b=>b.textContent.trim()==="Fechar").click()');
  await until('!document.querySelector("[role=dialog]")');
  pass('modal usa portal, fundo inerte, foco inicial/retorno, Tab e fechamento X/Fechar/Escape; cabe no desktop e mobile sem paginação desnecessária');
  await evaluate('window.invitePagination=true;window.fixtureSession.administration.restricted=true;(await import("/src/auth-session.ts")).refreshSession(true)');
  await click('Convidar professor');
  await until('!!document.querySelector(".institution-class-pagination")');
  assert.equal(await evaluate('document.querySelector("[role=dialog]").textContent.includes("autorização prévia")'),true);
  await evaluate('const sel=document.querySelector("[name=classId]");sel.value="pagination-class-1";sel.dispatchEvent(new Event("change",{bubbles:true}));');
  const invitationWrites=await evaluate('window.requests.filter(r=>r.p.endsWith("/invitations")&&r.method==="POST").length');
  await click('Mais turmas');
  await until('document.querySelector("[name=classId]")?.textContent.includes("Turma fictícia 2")');
  assert.equal(await evaluate('document.querySelector("[name=classId]").value'),'pagination-class-1');
  assert.equal(await evaluate('window.requests.filter(r=>r.p.endsWith("/invitations")&&r.method==="POST").length'),invitationWrites);
  await evaluate(
    `{const el=document.querySelector('input[type=email]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'teacher@example.invalid');el.dispatchEvent(new Event('input',{bubbles:true}));}`,
  );
  await evaluate(`{const el=Array.from(document.querySelectorAll('form input')).find(e=>e.type==='text');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Professor de teste');el.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await evaluate('window.fixtureFailure={path:"/institutions/institution-ui/invitations",status:403,message:"Convite não enviado: destinatário fora do escopo autorizado da homologação."}');
  await evaluate('const send=[...document.querySelectorAll("[role=dialog] button")].find(b=>b.textContent.trim()==="Enviar convite");send.click();send.click()');
  await until('document.querySelector("[role=dialog]")?.textContent.includes("fora do escopo autorizado")');
  assert.equal(await evaluate('window.requests.filter(r=>r.p.endsWith("/invitations")&&r.method==="POST").length'),invitationWrites+1);
  pass('paginação de turmas preserva seleção e não envia formulário; recusa de escopo mantém modal aberto sem sucesso e duplo clique envia uma vez');
  for (const failure of [
    { status: 403, message: 'Administração institucional não autorizada.' },
    { status: 409, message: 'A conta destinatária não está elegível para convite docente.' },
    { status: 409, message: 'Já existe um convite pendente para este e-mail.' },
    { status: 503, message: 'O serviço de envio de convites está indisponível. Nenhum convite foi enviado.' },
  ]) {
    await evaluate(`window.fixtureFailure={path:'/institutions/institution-ui/invitations',...${JSON.stringify(failure)}}`);
    await click('Enviar convite');
    await until(`document.querySelector('[role=dialog] [role=alert]')?.textContent.includes(${JSON.stringify(failure.message)})`);
    assert.equal(await evaluate('document.querySelector("input[type=email]").value'), 'teacher@example.invalid');
  }
  await evaluate('window.fixtureFailure=null');
  pass('convite distingue permissão, inelegibilidade, duplicidade e falha de envio; preserva formulário sem falso sucesso');
  await click("Enviar convite");
  await until(
    'window.requests.some(r=>r.p.endsWith("/invitations")&&r.method==="POST")',
  );
  await until('!document.querySelector("[role=dialog]")');
  await evaluate('window.invitePagination=false;delete window.fixtureSession.administration.restricted;(await import("/src/auth-session.ts")).refreshSession(true)');
  pass("administrador institucional convida professor pela interface");
  await click('Professores');
  await until('new URL(location.href).searchParams.get("secao")==="teachers"');
  await evaluate(`window.invitationData=[{id:'uncertain-ui',email:'uncertain@example.invalid',status:'PENDING',deliveryState:'UNCONFIRMED',sentAt:null,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()},{id:'revoked-ui',email:'revoked@example.invalid',status:'CANCELLED',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}];(await import('/src/navigation.ts')).navigate('/instituicoes?instituicao=institution-ui&secao=invitations')`);
  await until('document.body.textContent.includes("Envio não confirmado")');
  assert.equal(await evaluate(`{const row=[...document.querySelectorAll('tr')].find(r=>r.textContent.includes('uncertain@example.invalid'));[...row.querySelectorAll('button')].find(b=>b.textContent==='Reenviar').disabled}`),true);
  assert.equal(await evaluate(`{const row=[...document.querySelectorAll('tr')].find(r=>r.textContent.includes('revoked@example.invalid'));row.textContent.includes('Revogado')&&[...row.querySelectorAll('button')].find(b=>b.textContent==='Reenviar').disabled===false}`),true);
  await evaluate(`{const row=[...document.querySelectorAll('tr')].find(r=>r.textContent.includes('revoked@example.invalid'));[...row.querySelectorAll('button')].find(b=>b.textContent==='Reenviar').click()}`);
  await until('window.requests.some(r=>r.p.endsWith("/revoked-ui/resend")&&r.method==="POST")&&document.querySelectorAll("tbody tr").length===3');
  pass('envio incerto bloqueia reenvio; convite revogado pode gerar novo convite apenas após sucesso da API simulada');
  await click("Auditoria institucional");
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
    'location.pathname==="/professor" && !!document.querySelector(".teacher-dashboard, .professor-shell")',
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
    'document.querySelector("[data-testid=teacher-dashboard] h1")?.textContent.includes("Olá,")',
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
    ["PROFESSOR", "/professor", ".teacher-dashboard, .professor-shell"],
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
    'document.querySelector(".admin-page h1")?.textContent==="Professores"',
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
  assert.equal(await evaluate('document.querySelectorAll(".auth-card").length'),1);
  assert.equal(await evaluate('[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="Represento uma instituição").length'),0);
  await click('Cadastre-se');
  await until('!!document.querySelector(".registration-choice")');
  assert.equal(await evaluate('document.querySelectorAll(".auth-card").length'),1);
  assert.equal(await evaluate('[...document.querySelectorAll(".registration-choice button")].filter(b=>b.textContent.trim()==="Represento uma instituição").length'),1);
  await click('Represento uma instituição');
  await until('location.pathname==="/instituicoes"&&document.body.textContent.includes("Cadastro institucional completo")');
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
  assert.equal(await evaluate('document.querySelector(".institution-request-form").checkValidity()'),false);
  for(const width of [320,390,768,1280]) {
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  }
  await cdp('Emulation.clearDeviceMetricsOverride');
  const fillApplication=async(name,value)=>evaluate(`{const el=document.querySelector('[name=${name}]');Object.getOwnPropertyDescriptor(${name==='representationEvidence'?'HTMLTextAreaElement':name==='institutionType'||name==='state'?'HTMLSelectElement':'HTMLInputElement'}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('${name==='institutionType'||name==='state'?'change':'input'}',{bubbles:true}));}`);
  for(const [name,value] of Object.entries({name:'Nova instituição de teste',tradeName:'Academy de teste',registrationNumber:'12.ABC.345/01DE-35',postalCode:'01001-000',street:'Rua de teste',number:'S/N',district:'Centro',city:'São Paulo',contactEmail:'institution@example.invalid',phone:'11999999999',institutionType:'OUTRA_ORGANIZACAO',state:'SP'}))await fillApplication(name,value);
  await evaluate(`document.querySelector('[name=noWebsite]').click()`);
  await click('Continuar');
  for(const [name,value] of Object.entries({responsibleName:'Responsável de teste',representativePosition:'Diretor',representativePhone:'11999999999',representationEvidence:'Vínculo confirmado junto à secretaria institucional.'}))await fillApplication(name,value);
  await evaluate(`document.querySelector('[name=representationDeclaration]').click()`);
  await click('Continuar');
  await evaluate(`document.querySelector('[name=accepted]').click()`);
  assert.equal(
    await evaluate(
      'document.querySelector("input[name=registrationNumber]").required',
    ),
    true,
  );
  await click("Enviar solicitação para análise");
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
    '12ABC34501DE35',
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
    "primeira solicitação com CNPJ e declaração usa identidade autenticada, exibe confirmação e status, sem vínculo nem privilégios automáticos",
  );
  await evaluate("sessionStorage.setItem('fixture-institutions-enabled','false')");
  await cdp('Page.navigate',{url:origin+'/convite-professor#/convite-professor?token='+'f'.repeat(64)});
  await until('document.body.textContent.includes("Convite de professor")');
  await evaluate(`window.fixtureEnabled=false;window.fixtureSession.user.email='teacher@example.invalid';(await import('/src/auth-session.ts')).endSession();window.requests=[];`);
  await until('document.body.textContent.includes("Entre para validar seu convite")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/inspect")'),false);
  assert.equal(await evaluate('window.requests.some(r=>r.method!=="GET")'),false);
  assert.equal(await evaluate('location.hash'), '');
  assert.equal(await evaluate('Object.values(sessionStorage).some(value=>value.includes("f".repeat(64)))'),false);
  await click('Já tenho conta — Entrar');
  await evaluate(`for(const [name,value] of [['email','teacher@example.invalid'],['current-password','Test-password9!']]){const input=document.querySelector('input[name="'+name+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await click('Entrar');
  await until('document.body.textContent.includes("Convite pronto para aceitação")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/accept")'),false);
  assert.equal(await evaluate('window.fixtureSession.user.role'),'ALUNO');
  pass('homologação restrita pede login antes de inspecionar, preserva token em memória e retorna ao convite sem aceite ou promoção');
  const inspectionsBeforeConfirmation=await evaluate('window.requests.filter(r=>r.p==="/institutions/invitations/inspect").length');
  await evaluate(`window.fixtureSession.user.emailVerificado=false;await (await import('/src/auth-session.ts')).refreshSession(true)`);
  await until('document.body.textContent.includes("Confirme seu e-mail")');
  assert.equal(await evaluate('window.requests.filter(r=>r.p==="/institutions/invitations/inspect").length'),inspectionsBeforeConfirmation);
  await evaluate('window.fixtureSession.user.emailVerificado=true');await click('Já confirmei meu e-mail');
  await until('document.body.textContent.includes("Convite pronto para aceitação")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/accept")'),false);
  pass('confirmação existente é reutilizada e retorna ao mesmo convite sem reenviar e-mail nem aceitar automaticamente');
  for(const [index,state] of [
    {code:'INVITATION_EXPIRED',message:'Este convite expirou.'},
    {code:'INVITATION_REVOKED',message:'Este convite foi revogado.'},
    {code:'INVITATION_ACCEPTED',message:'Este convite já foi aceito.'},
    {code:'INVITATION_WRONG_ACCOUNT',message:'Entre com a conta destinatária.',status:403},
  ].entries()){
    await evaluate(`window.fixtureFailure={path:'/institutions/invitations/inspect',status:409,...${JSON.stringify(state)}};location.hash='#/convite-professor?token='+${JSON.stringify(String(index+1).repeat(64))}`);
    await until(`document.querySelector('[role=alert]')?.textContent.includes(${JSON.stringify(state.message)})`);
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(button=>button.textContent==='Aceitar convite')`),false);
  }
  await evaluate(`window.fixtureFailure={path:'/institutions/invitations/inspect',network:true};location.hash='#/convite-professor?token='+'a'.repeat(64)`);
  await until('document.body.textContent.includes("Não foi possível conectar")');
  await evaluate('window.fixtureFailure=null');await click('Tentar novamente');
  await until('document.body.textContent.includes("Convite pronto para aceitação")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/accept")'),false);
  pass('estados expirado/revogado/aceito/conta incorreta e falha de comunicação não aceitam convite; retry preserva token');
  await evaluate("window.fixtureEnabled=true;sessionStorage.setItem('fixture-institutions-enabled','true')");
  await cdp('Page.navigate',{url:origin+'/convite-professor#/convite-professor?token='+'a'.repeat(64)});
  await until('document.body.textContent.includes("Convite de professor")');
  await evaluate("const s=await import('/src/auth-session.ts');s.endSession();");
  await until('document.body.textContent.includes("Primeiro acesso — Criar minha conta")');
  await click('Primeiro acesso — Criar minha conta');
  await until('!!document.querySelector(".auth-card input[name=nome]")');
  assert.equal(await evaluate('!!document.querySelector("[data-invitation-email]")&&!document.querySelector(".invitation-details input")'),true);
  for(const width of [1280,390,320]) {
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert.equal(await evaluate('Array.from(document.querySelectorAll(".auth-form-wrap input")).every(input=>input.labels.length>0)'),true);
  }
  await cdp('Emulation.clearDeviceMetricsOverride');
  await evaluate(`{const el=document.querySelector('.auth-card input[name=nome]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Professor convidado');el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.auth-card input[type=checkbox]').click();for(const input of document.querySelectorAll('.auth-card input[type=password]')){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'SenhaForte123!');input.dispatchEvent(new Event('input',{bubbles:true}));}}`);
  await evaluate(`{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Criar minha conta');button.click();button.click()}`);
  await until('!!document.querySelector("input[name=current-password]")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/onboarding")'),false);
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/auth/register")'),false);
  assert.equal(await evaluate('window.requests.filter(r=>r.p==="/institutions/invitations/register").length'),1);
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/accept")'),false);
  assert.equal(await evaluate('window.fixtureSession.user.role'),'ALUNO');
  assert.equal(await evaluate('window.fixtureSession.registrationIntent'),'TEACHER_INVITATION');
  assert.equal(await evaluate('document.body.textContent.includes("Sou aluno")'),false);
  await evaluate(`for(const [name,value] of [['email',window.fixtureSession.user.email],['current-password','SenhaForte123!']]){const input=document.querySelector('input[name="'+name+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await click('Entrar');await until('document.body.textContent.includes("Convite pronto para aceitação")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/accept")'),false);
  await click('Aceitar convite');await until('location.pathname==="/professor"');
  assert.equal(await evaluate('window.requests.filter(r=>r.p==="/institutions/invitations/accept").length'),1);
  assert.equal(await evaluate('window.fixtureSession.user.role'),'PROFESSOR');
  pass('primeiro acesso cria apenas identidade; login preserva convite e somente o aceite explícito libera Professor na API simulada');
  await cdp('Page.navigate',{url:origin+'/convite-professor'});
  await until('document.body.textContent.includes("O convite não está disponível nesta aba")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/inspect")'),false);
  await evaluate("location.hash='#/convite-professor?token=invalid'");
  await until('document.body.textContent.includes("O link do convite está incompleto ou inválido")');
  assert.equal(await evaluate('location.hash'),'');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/inspect")'),false);
  pass('nova navegação sem contexto e link inválido orientam reabrir o e-mail sem consultar ou consumir convite');
  const proofUrl=origin+'/convite-professor#/ativar-professor?convite='+'a'.repeat(64)+'&confirmacao='+'b'.repeat(64);
  await cdp('Page.navigate',{url:proofUrl});
  await until('document.body.textContent.includes("Definir minha senha")');
  await evaluate("(await import('/src/auth-session.ts')).endSession()");
  assert.equal(await evaluate('location.hash'),'');
  assert.equal(await evaluate('Object.values(sessionStorage).some(v=>v.includes("b".repeat(64)))'),false);
  await evaluate(`for(const input of document.querySelectorAll('.auth-card input[type=password]')){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'SenhaForte123!');input.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await click('Definir minha senha');
  await until('!!document.querySelector("input[name=current-password]")');
  assert.equal(await evaluate('document.querySelectorAll(".teacher-dashboard, .professor-shell").length'),0);
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/accept")'),false);
  pass('confirmação legada define senha sem aceitar, remove prova da URL e conserva o convite para o login');
  await cdp('Page.navigate',{url:proofUrl});
  await until('document.body.textContent.includes("Recusar sem ativar vínculo")');
  await click('Recusar sem ativar vínculo');
  await until('!!document.querySelector("[role=alertdialog]")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/decline-proof")'),false);
  assert.equal(await evaluate('document.querySelector(".teacher-invitation").inert'),true);
  assert.equal(await evaluate('document.activeElement.hasAttribute("data-confirmation-cancel")'),true);
  await click('Cancelar');
  await until('!document.querySelector("[role=alertdialog]")');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/decline-proof")'),false);
  await click('Recusar sem ativar vínculo');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  await until('!document.querySelector("[role=alertdialog]")');
  assert.equal(await evaluate('document.activeElement.textContent'),'Recusar sem ativar vínculo');
  assert.equal(await evaluate('window.requests.some(r=>r.p==="/institutions/invitations/decline-proof")'),false);
  await click('Recusar sem ativar vínculo');
  await click('Sim, recusar convite');
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
  await until('document.querySelector(".institution-workspace .institution-key-metrics .metric-card strong")?.textContent==="1"');
  assert.equal(await evaluate('document.querySelectorAll(".institution-workspace .nav-groups .nav-item").length'),11);
  assert.equal(await evaluate('document.querySelectorAll("aside").length'),1);
  assert.equal(await evaluate('document.body.textContent.includes("Faculdade Alfa")||document.body.textContent.includes("12,4%")'),false);
  const modules=[['overview','Visão geral','/institutions/institution-ui/summary'],['institution','Minha instituição','/institutions/institution-ui/summary'],['teachers','Professores','/institutions/institution-ui/summary'],['invitations','Convites','/institutions/institution-ui/invitations'],['classes','Turmas','/turmas'],['students','Alunos','/turmas/students'],['performance','Desempenho acadêmico','/reports/classes'],['exams','Simulados','/avaliacoes'],['reports','Relatórios','/reports/classes'],['notifications','Notificações','/institutions/notifications'],['settings','Auditoria institucional','/institutions/institution-ui/logs']];
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
  await click('Ir para turmas');
  await until('location.pathname==="/instituicoes"&&location.search.includes("secao=classes")');
  pass('Ver alunos mantém instituição e turma na URL, sem entrar no dashboard docente');
  await evaluate("const n=await import('/src/institution-navigation.ts');n.institutionNavigate('institution-ui','exams');");
  await click('Criar simulado');
  await until('document.querySelectorAll(".exam-form fieldset:first-of-type input[type=checkbox]").length===1');
  await evaluate('document.querySelector(".exam-form fieldset:first-of-type input[type=checkbox]").click()');
  await until('document.querySelectorAll(".exam-form fieldset:last-of-type input[type=checkbox]").length===1');
  await evaluate(`{const title=document.querySelector('#exam-title');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'Simulado institucional de teste');title.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.exam-form fieldset:last-of-type input[type=checkbox]').click();}`);
  await click('Salvar rascunho');
  await until('document.querySelector(".exam-card")?.textContent.includes("Simulado institucional de teste")');
  await click('Publicar simulado');
  await until('document.querySelector(".exam-card")?.textContent.includes("Publicado")');
  assert.equal(await evaluate('window.requests.find(r=>r.p==="/avaliacoes/eligible-questions").headers["X-Institution-Context"]'),'administration');
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
  await evaluate("sessionStorage.removeItem('fixture-context-owner-role');sessionStorage.setItem('fixture-login-role','ALUNO');");
  await cdp('Page.navigate',{url:origin+'/diagnostico'});
  await until('document.body.textContent.includes("diagnóstico legado")');
  assert.equal(await evaluate('document.querySelector(".stats")?.textContent.includes("30")'),false);
  assert.equal(await evaluate('document.querySelector(".stats")?.textContent.includes("autorais")'),false);
  pass('entrada do diagnóstico legado não promete quantidade nem origem inexistentes');
  await evaluate(`
    window.legacyCalls=[];
    window.legacyAnswers={};window.legacyCompleted=false;
    const originalFetch=window.fetch;
    window.fetch=async(input,init={})=>{
      const p=new URL(typeof input==='string'?input:input.url,location.origin).pathname;
      if(!p.startsWith('/diagnostics'))return originalFetch(input,init);
      window.legacyCalls.push({path:p,method:init.method||'GET'});
      const reply=(x,status=200)=>Promise.resolve(new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}}));
      if(p==='/diagnostics')return reply({id:'legacy-seven',totalQuestions:7});
      if(p.endsWith('/questions'))return reply({questions:Array.from({length:7},(_,i)=>({id:'legacy-q-'+i,statement:'Item técnico de interface '+(i+1),discipline:'Disciplina de teste',selectedOptionId:window.legacyAnswers['legacy-q-'+i]??null,alternatives:[{id:'legacy-a-'+i,text:'Alternativa técnica'}]}))});
      if(p.includes('/answers/')&&init.method==='PUT'){window.legacyAnswers[p.split('/').pop()]=JSON.parse(init.body).selectedOptionId;return reply({message:'Resposta registrada.'});}
      if(p.endsWith('/finalize')){window.legacyCompleted=true;return reply({message:'Concluído.'});}
      if(p.endsWith('/result'))return window.legacyCompleted?reply({level:'BASICO',overallPercentage:0,recommendation:'Resultado técnico de teste',performances:[],trail:{id:'legacy-trail',disciplinaPrioritaria:'Disciplina de teste',assuntoPrioritario:null,nivelRecomendado:'BASICO',quantidadeRecomendada:5}}):reply({message:'Finalize o diagnóstico.'},409);
      if(p.endsWith('/trail'))return reply({trail:{id:'legacy-trail',disciplinaPrioritaria:'Disciplina de teste',assuntoPrioritario:null,nivelRecomendado:'BASICO',quantidadeRecomendada:5}});
      return reply({message:'Operação técnica capturada'});
    };
  `);
  const clickLegacy = async (label) => {
    const button = `Array.from(document.querySelectorAll('.landing button, .content button')).find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)})&&!b.disabled)`;
    await until('!!('+button+')');
    await evaluate(button+'.click()');
  };
  await clickLegacy('Iniciar diagnóstico');
  await until('document.body.textContent.includes("QUESTÃO 1 DE 7")');
  for(let i=0;i<7;i++){
    await until('document.body.textContent.includes("QUESTÃO '+(i+1)+' DE 7")');
    await evaluate('document.querySelector("input[type=radio]").click()');
    await clickLegacy(i===6?'Finalizar diagnóstico':'Próxima questão');
  }
  await until('document.body.textContent.includes("SUA TRILHA PERSONALIZADA")');
  assert.equal(await evaluate('window.legacyCalls.filter(c=>c.method==="PUT").length'),7);
  assert.equal(await evaluate('window.legacyCalls.filter(c=>c.path.endsWith("/finalize")).length'),1);
  pass('diagnóstico legado mostra sete questões retornadas pela API simulada, conclui na sétima e apresenta a trilha');
  console.log(
    `Administração: ${checks} verificações de navegador com API simulada aprovadas. Sem banco ou envio real.`,
  );
  }
} finally {
  socket?.close();
  browser.kill();
  vite.kill();
}
