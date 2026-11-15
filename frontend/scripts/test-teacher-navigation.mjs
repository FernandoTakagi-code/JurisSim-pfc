// Real diagnostic UI with isolated responses; never uses the shared API or real accounts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const origin = 'http://127.0.0.1:5197';
const browserPath = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!browserPath) throw new Error('Defina CHROME_PATH com o caminho do Chrome ou Edge instalado.');
const profile = await mkdtemp(path.join(tmpdir(), 'jurissim-pilot-ui-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5197', '--strictPort'], {
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
  const until = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate('Boolean('+expression+')').catch(() => false)) return; await sleep(50); } throw new Error('Condition failed: ' + expression+' '+JSON.stringify(await evaluate('({path:location.pathname,text:document.body.innerText.slice(0,1800)})'))); };
  await cdp('Page.enable');await cdp('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    sessionStorage.setItem('jurissim_token','isolated-teacher-navigation');
    window.teacherRequests=[];
    window.managementRequests=[];
    window.fixtureClasses=[{id:'class-empty',nome:'Turma vazia',archivedAt:null,canDelete:true,deletionAvailable:true,_count:{alunos:0}},{id:'class-history',nome:'Turma com histórico',archivedAt:null,canDelete:true,deletionAvailable:true,_count:{alunos:1}}];
    window.fixtureUsers=[{id:'ana',nome:'Ana de teste',email:'ana@example.invalid'},{id:'bruno',nome:'Bruno de teste',email:'bruno@example.invalid'}];
    window.fixtureEnrollments={'class-empty':[],'class-history':['bruno']};
    window.fetch=async(url,init={})=>{
      const parsed=new URL(String(url),location.origin),p=parsed.pathname,method=init.method||'GET',body=init.body?JSON.parse(init.body):undefined;window.teacherRequests.push(p);window.managementRequests.push({p,method,body});
      const reply=body=>new Response(JSON.stringify(body),{status:200});
      const error=(message,status=409)=>new Response(JSON.stringify({message}),{status});
      const pending=sessionStorage.getItem('teacher-pending')==='true';
      if(p==='/auth/session')return reply({user:{id:'teacher',nome:'Professor de teste',email:'teacher@example.invalid',role:'PROFESSOR',emailVerificado:true},nextStep:'PROFESSOR',administration:{enabled:true,needsInstitutionLink:pending,memberships:pending?[]:[{role:'TEACHER',institutionId:'fixture',institution:{name:'Instituição de trabalho'}},{role:'INSTITUTION_ADMIN',institutionId:'fixture',institution:{name:'Instituição de trabalho'}}]}});
      if(p==='/profile/photo')return reply({kind:'default',version:'fixture'});
      if(p==='/reports/overview')return reply({classes:0,activeClasses:0,students:0,publishedExams:0});
      if(p==='/questoes')return reply([]);
      if(p==='/institutions/availability')return reply({enabled:false});
      if(p==='/turmas')return reply({items:window.fixtureClasses.filter(c=>!c.deleted),page:1,hasMore:false});
      const c=window.fixtureClasses.find(c=>p.startsWith('/turmas/'+c.id));
      if(c){
        if(p.endsWith('/student-search'))return reply({items:window.fixtureUsers.filter(s=>(s.nome+' '+s.email).toLowerCase().includes(parsed.searchParams.get('q').toLowerCase())).map(s=>({...s,enrolled:window.fixtureEnrollments[c.id].includes(s.id)})),page:1,hasMore:false});
        if(p.endsWith('/students')&&method==='GET')return reply({items:window.fixtureUsers.filter(s=>window.fixtureEnrollments[c.id].includes(s.id)).map(s=>({...s,turmasComoAluno:[{id:c.id,nome:c.nome}]})),class:c,page:1,hasMore:false});
        if(p.endsWith('/students')&&method==='POST'){
          if(window.failEnrollment){window.failEnrollment=false;return error('Falha temporária de matrícula.',503);}
          const s=window.fixtureUsers.find(s=>s.email===body.email);if(window.fixtureEnrollments[c.id].includes(s.id))return error('Aluno já matriculado.');
          window.fixtureEnrollments[c.id].push(s.id);return reply({message:'Aluno vinculado à turma.'});
        }
        if(p.includes('/students/')&&method==='DELETE'){window.fixtureEnrollments[c.id]=window.fixtureEnrollments[c.id].filter(id=>id!==p.split('/').at(-1));return reply({message:'Aluno removido. Histórico preservado.'});}
        if(method==='PATCH'){if(body.nome)c.nome=body.nome;if(body.archived)c.archivedAt=new Date().toISOString();return reply(c);}
        if(method==='DELETE'&&p==='/turmas/'+c.id){if(body.confirmationName!==c.nome)return error('Nome incorreto.',422);c.deleted=true;return reply({mode:c.id==='class-empty'?'HARD':'SOFT',message:'Turma excluída. Histórico preservado.'});}
      }
      return reply({items:[],page:1,hasMore:false});
    };
  `});
  await cdp('Page.navigate',{url:origin+'/instituicoes?secao=cadastro'});
  await until('location.pathname==="/professor"&&!!document.querySelector("[data-testid=teacher-dashboard]")');
  assert.equal(await evaluate('document.body.textContent.includes("Cadastro institucional")'),false);
  assert.equal(await evaluate('document.body.textContent.includes("Instituições e solicitações")'),false);
  assert.equal(await evaluate('window.teacherRequests.some(p=>p.startsWith("/institutions/"))'),false);
  assert.equal(await evaluate('!!document.querySelector("select[aria-label=\\"Contexto de acesso\\"]")'),false);
  console.log('PASS: direct institutional URL redirects teacher to dashboard without loading institutional modules');checks++;
  const entries=[['Turmas','/professor/turmas'],['Alunos','/professor/alunos'],['Atividades','/professor/atividades'],['Simulados','/professor/simulados'],['Banco de questões','/professor/questoes'],['Desempenho','/professor/desempenho'],['Relatórios','/professor/relatorios']];
  for(const [label,path]of entries){
    await evaluate(`(()=>{const b=[...document.querySelectorAll('.v0-sidebar nav button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing teacher module');b.click()})()`);
    await until('location.pathname==='+JSON.stringify(path));
    assert.equal(await evaluate('document.body.textContent.includes("Instituições e solicitações")'),false);
  }
  console.log('PASS: seven teacher module destinations remain accessible through the original sidebar');checks++;
  const fill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const click=async text=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing action');b.click();})()`);
  await cdp('Page.navigate',{url:origin+'/professor/alunos'});
  await until('!!document.querySelector("select[aria-label=\\"Turma para gerenciar matrículas\\"]")');
  assert.equal(await evaluate('window.managementRequests.some(r=>r.p.endsWith("/students"))'),false);
  await fill('select[aria-label="Turma para gerenciar matrículas"]','class-empty');
  await until('!!document.querySelector(".enrollment-search")');
  await fill('.enrollment-search input','Ana');await click('Pesquisar alunos');
  await until('document.querySelector(".enrollment-search").textContent.includes("Ana de teste")');
  await evaluate('window.failEnrollment=true');await click('Adicionar à turma');
  await until('document.body.textContent.includes("Falha temporária de matrícula.")');
  await click('Adicionar à turma');
  await until('document.body.textContent.includes("Aluno vinculado à turma.")&&document.querySelectorAll(".teacher-enrollments > .panel .class-students li").length===1');
  await until('[...document.querySelectorAll(".enrollment-search button")].some(b=>b.textContent==="Já matriculado"&&b.disabled)');
  assert.equal(await evaluate('document.body.textContent.includes("Turma: Turma vazia")'),true);
  console.log('PASS: class selection, name search, API error, enrollment refresh and duplicate blocking');checks++;
  await click('Remover da turma');
  assert.equal(await evaluate('window.managementRequests.some(r=>r.method==="DELETE")'),false);
  await click('Cancelar');assert.equal(await evaluate('window.fixtureEnrollments["class-empty"].length'),1);
  await click('Remover da turma');await click('Confirmar remoção');
  await until('document.body.textContent.includes("Nenhum aluno matriculado nesta turma.")');
  assert.equal(await evaluate('window.fixtureUsers.length'),2);
  console.log('PASS: confirmed removal refreshes enrollment without deleting the account');checks++;
  await cdp('Page.navigate',{url:origin+'/professor/turmas'});
  await until('document.querySelectorAll(".class-more-actions").length===2');
  await evaluate('document.querySelector(".class-more-actions").open=true');
  await click('Editar turma');await until('document.querySelector(".class-form input")||document.querySelector("input[value=\\"Turma vazia\\"]")');
  await evaluate(`(()=>{const e=[...document.querySelectorAll('input')].find(e=>e.value==='Turma vazia');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Turma editada');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click('Salvar turma');await until('document.querySelector(".class-list").textContent.includes("Turma editada")');
  console.log('PASS: editing a class updates its existing card');checks++;
  await evaluate('document.querySelector(".class-more-actions").open=true');await click('Arquivar turma');
  await evaluate('document.querySelector(".class-confirm .danger").click()');
  await until('document.querySelector(".class-list article").textContent.includes("Arquivada")');
  assert.equal(await evaluate('[...document.querySelectorAll(".class-list article button")].find(b=>b.textContent==="Cadastrar questões").disabled'),true);
  console.log('PASS: archiving retains consultation and blocks new question registration');checks++;
  await evaluate('document.querySelector(".class-more-actions").open=true');await click('Excluir turma');
  await until('!!document.querySelector("dialog[open]")');
  assert.equal(await evaluate('document.querySelector("dialog[open] button.danger").disabled'),true);
  await fill('dialog[open] input','Nome incorreto');assert.equal(await evaluate('document.querySelector("dialog[open] button.danger").disabled'),true);
  await evaluate('document.querySelector("dialog[open] .outline-button:not(.danger)").click()');
  assert.equal(await evaluate('window.managementRequests.some(r=>r.method==="DELETE")'),false);
  await click('Excluir turma');await fill('dialog[open] input','Turma editada');
  await click('Confirmar exclusão da turma');await until('document.querySelectorAll(".class-list > article").length===1');
  assert.equal(await evaluate('document.body.textContent.includes("Turma excluída. Histórico preservado.")'),true);
  console.log('PASS: deletion requires typed name and cancellation never sends a request; successful deletion refreshes cards');checks++;
  await evaluate('document.querySelector(".class-more-actions").open=true');
  for(const width of [1440,768,390,320]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    await click('Excluir turma');await until('!!document.querySelector("dialog[open]")');
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    await evaluate('document.querySelector("dialog[open] .outline-button:not(.danger)").click()');
  }
  await click('Excluir turma');await fill('dialog[open] input','Turma com histórico');await click('Confirmar exclusão da turma');
  await until('document.querySelectorAll(".class-list > article").length===0');
  assert.equal(await evaluate('window.fixtureEnrollments["class-history"].length'),1);
  console.log('PASS: soft deletion keeps enrollment fixtures and cards/dialog fit desktop, tablet and mobile');checks++;
  await evaluate('sessionStorage.setItem("teacher-pending","true")');
  await cdp('Page.navigate',{url:origin+'/instituicoes'});await sleep(150);
  await until('location.pathname==="/professor"&&document.body.textContent.includes("Vínculo institucional pendente")');
  assert.equal(await evaluate('document.body.textContent.includes("Acompanhamento institucional")'),false);
  assert.equal(await evaluate('window.teacherRequests.some(p=>p.startsWith("/institutions/"))'),false);
  console.log('PASS: pending teacher retains enrollment guidance and profile link without institutional registration shortcut');checks++;
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  console.log(checks+' teacher navigation checks passed with isolated API fixtures; no backend data changes.');
}finally{try{await closeBrowser?.();}catch{}socket?.close();browser.kill();vite.kill();}
