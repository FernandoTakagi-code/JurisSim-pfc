// Renderiza o wrapper real da área: desativar o módulo completo não deve sobrescrever
// as capacidades por funcionalidade verificadas em seguida pelo InstitutionDashboard.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript'),React=require('react');
const exportsObject={},Dashboard=()=>null,Gate=()=>null,Shell=()=>null;
const source=fs.readFileSync(path.join(__dirname,'../src/institution-area.tsx'),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports:exportsObject,URL,window:{location:{origin:'http://localhost:5190'}},
  require(name){
    if(name==='react')return {...React,useEffect(){}};
    if(name==='react/jsx-runtime')return require(name);
    if(name==='./institution-dashboard')return {InstitutionDashboard:Dashboard};
    if(name==='./institution-navigation')return {useInstitutionLocation:()=>'/instituicoes?instituicao=own',canViewInstitution:(session,id)=>session.administration?.memberships.some(m=>m.institutionId===id&&m.role==='INSTITUTION_ADMIN')===true};
    if(name==='./administration')return {InstitutionsPortal:()=>null};
    if(name==='./integration-shell')return {IntegrationShell:Shell};
    if(name==='./email-confirmation-gate')return {EmailConfirmationGate:Gate};
    throw Error(name);
  },
});
const session={user:{role:'ALUNO',emailVerificado:true},administration:{enabled:false,memberships:[{institutionId:'own',role:'INSTITUTION_ADMIN'}]}};
const render=session=>exportsObject.InstitutionArea({session,onSair(){}});
const current=render(session);
assert.equal(current.type,Dashboard);
assert.notEqual(current.props.readOnly,true);
assert.equal(render({...session,user:{...session.user,emailVerificado:false}}).type,Gate);
assert.equal(render({...session,administration:{enabled:false,memberships:[]}}).type,Shell);
console.log('OK: capacidade específica não é anulada pelo módulo completo desligado; vínculo e confirmação continuam obrigatórios.');
