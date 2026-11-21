// Teste de contrato de componente isolado; sem rede nem acesso ao banco compartilhado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/trail-launch.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText;
async function launch(props) {
  const requests = [], destinations = [], exports = {};
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === 'react') return { ...React, useRef: value => ({ current: value }),
      useState: value => [value, () => {}], useEffect: effect => effect() };
    if (name === './api') return { apiRequest: async (...args) => {
      requests.push(args); return { id: 'new-attempt' };
    } };
    if (name === './navigation') return { navigate: path => destinations.push(path) };
    return require(name);
  } });
  const tree = exports.TrailLaunchButton(props);
  tree.props.children[0].props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  return { requests, destinations };
}
(async () => {
  for (const completed of [false, true]) {
    const result = await launch({ trail: { id: 'recommendation', simuladoGeradoId: 'owned-attempt' }, generated: true, completed });
    assert.equal(result.requests.length, 0, 'Existing attempts must not generate or write');
    assert.equal(result.destinations[0], completed ? '/resultados/trilha/owned-attempt' : '/diagnostico?trilha=owned-attempt');
  }
  const linked = await launch({ trail: { id: 'recommendation', simuladoGeradoId: 'linked-attempt' } });
  assert.equal(linked.requests.length, 0);
  assert.equal(linked.destinations[0], '/diagnostico?trilha=linked-attempt');
  const legacy = await launch({ trail: { id: 'legacy-recommendation' }, generated: true });
  assert.equal(legacy.requests[0][0], '/trilhas/legacy-recommendation/gerar');
  assert.equal(legacy.destinations[0], '/diagnostico?trilha=new-attempt');
  const fresh = await launch({ trail: { id: 'recommendation' } });
  assert.equal(fresh.requests.length, 1);
  assert.equal(fresh.requests[0][0], '/trilhas/recommendation/gerar');
  assert.equal(fresh.requests[0][1].method, 'POST');
  assert.equal(fresh.destinations[0], '/diagnostico?trilha=new-attempt');
  console.log('OK: resume/result use persisted attempt IDs without writes; generation uses recommendation ID.');
})().catch(error => { console.error(error); process.exitCode = 1; });
