// Renderiza o componente existente sem efeitos/rede para validar as capacidades.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = fs.readFileSync(path.join(__dirname, '../src/class-exams.tsx'), 'utf8');
function render({ published = true, settingsAvailable = false, archived = false, readOnly = false } = {}) {
  let index = 0;
  const exports = {};
  const exam = { id: 'assessment', titulo: 'Avaliação', descricao: 'Descrição preservada',
    publishedAt: published ? '2026-11-13T00:00:00Z' : null, duracaoSegundos: 1800,
    _count: { questoes: 1, tentativas: 0 }, participants: 0, turmas: [],
    settings: archived ? { closedAt: '2026-11-15', archivedAt: '2026-11-16' } : null };
  const data = { items: [exam], hasMore: false, summary: { published: 1, drafts: 0, closed: 0, archived: 0, settingsAvailable } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, URLSearchParams, location: { search: '' },
    window: { location: { search: '' } }, require(name) {
      if (name === 'react') return { ...React, useState(initial) { const current = index++;
        return [current === 7 ? data : current === 8 ? false : typeof initial === 'function' ? initial() : initial, () => {}];
      }, useRef: value => ({ current: value }), useEffect() {}, useCallback: fn => fn, useSyncExternalStore: (_, snapshot) => snapshot() };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === './administration') return { useResource: () => ({ data: { items: [], hasMore: false } }), useMutation: () => ({ busy: false }), ResourceState: () => null };
      if (name === './ui-icon') return { Icon: () => null };
      if (name === './api') return { apiRequest() { throw Error('Unexpected network request'); } };
      if (name === './navigation') return { navigate() {} };
      return {};
    } });
  return renderToStaticMarkup(React.createElement(exports.ExamsPage, { teacher: true, readOnly }));
}
const unavailable = render();
assert.ok(unavailable.includes('Ver detalhes') && unavailable.includes('Ver questões') && unavailable.includes('Ver resultados'));
assert.ok(!unavailable.includes('<summary>Mais ações'));
assert.ok(unavailable.includes('Encerramento e arquivamento aguardam'));
const draft = render({ published: false });
assert.ok(draft.includes('Editar rascunho') && draft.includes('Publicar simulado'));
const operational = render({ settingsAvailable: true });
assert.ok(operational.includes('Encerrar simulado') && operational.includes('Arquivar simulado'));
assert.ok(!operational.includes('Editar rascunho'));
assert.ok(!render({ settingsAvailable: true, archived: true }).includes('<summary>Mais ações'));
assert.ok(!render({ settingsAvailable: true, readOnly: true }).includes('<summary>Mais ações'));
console.log('OK: queries remain available; no empty action menu; draft/published/archived/read-only capabilities preserved.');
