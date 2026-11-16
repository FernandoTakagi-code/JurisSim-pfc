const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const React = require('react'), ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');
const source = fs.readFileSync(path.join(__dirname, '../src/question-editorial.tsx'), 'utf8');
function render({ writes = false, confirmed = false, issues = [], released = false } = {}) {
  let index = 0, requests = 0;
  const exports = {}, question = { id:'question', disciplina:'Direito Civil', assunto:'Contratos', enunciado:'Conteúdo para conferência',
    fundamentacaoJuridica:'Justificativa cadastrada', alternativas:[{id:'option',letra:'A',texto:'Texto seguro <script>',correta:true}],
    fonteNome:'Fonte', fonteReferencia:'Referência', licencaOuAutorizacao:'Autorização', origem:'IA', revisaoJuridicaEm:'2026-11-16', revisaoPedagogicaEm:'2026-11-16', liberadaAcervoEm:released?'2026-11-16':null };
  const values = { 4:{items:[],hasMore:false}, 5:{question,digest:'a'.repeat(64),issues,writesEnabled:writes,history:[]}, 6:'question',
    12:{sourceName:'Fonte',sourceReference:'Referência',license:'Autorização',origin:'IA'},13:'evidencia-conferida',14:confirmed,15:'autorizacao-documentada' };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports, URLSearchParams, require(name) {
      if(name==='react') return {...React,useState(initial){const key=index++;return [key in values?values[key]:typeof initial==='function'?initial():initial,()=>{}];},useRef:value=>({current:value}),useEffect(){}};
      if(name==='react/jsx-runtime')return require(name);
      if(name==='./api')return {apiRequest(){requests++;throw Error('Unexpected request');}};
      if(name==='./navigation')return {navigate(){}};
      return {};
    },
  });
  const html=renderToStaticMarkup(React.createElement(exports.QuestionEditorialPage));
  assert.equal(requests,0);assert.ok(!html.includes('<script>'));
  return html;
}
function disabled(html,label){const button=[...html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)].find(m=>m[2]===label);assert.ok(button,label);return button[1].includes('disabled');}
const readonly=render();
assert.ok(readonly.includes('Consulta disponível'));
assert.ok(disabled(readonly,'Registrar revisão jurídica'));
assert.ok(disabled(readonly,'Liberar versão revisada no acervo público'));
assert.ok(disabled(render({writes:true}),'Registrar revisão jurídica'),'No automatic attestation');
const operational=render({writes:true,confirmed:true});
assert.ok(!disabled(operational,'Registrar revisão jurídica'));
assert.ok(!disabled(operational,'Liberar versão revisada no acervo público'));
assert.ok(disabled(render({writes:true,confirmed:true,issues:['Direitos pendentes']}),'Registrar revisão jurídica'));
assert.ok(disabled(render({writes:true,confirmed:true,released:true}),'Registrar correção documental'));
console.log('OK: editorial readonly, explicit attestation, blockers, published immutability and safe text rendering; no API effects.');
