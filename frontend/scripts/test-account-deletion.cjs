const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let role = 'ALUNO', requests = 0;
const availability = {};
function compile(filename, exports, requireModule) {
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env.VITE_GOOGLE_CLIENT_ID', "''");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: requireModule });
}
compile(path.join(__dirname, '../../backend/src/account-deletion-availability.ts'), availability);
const components = {};
compile(path.join(__dirname, '../src/account-deletion.tsx'), components, name => {
  if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
  if (name === '@react-oauth/google') return { GoogleLogin: () => { throw new Error('Google must remain disabled'); } };
  if (name === './api') return { apiRequest: () => { requests++; throw new Error('Network forbidden'); } };
  if (name === './auth-session') return { useSession: () => ({ session: { user: { role } } }), endSession() { throw new Error('No session may be ended'); } };
  if (name === './navigation') return { navigate() { throw new Error('No redirect expected'); } };
  if (name.endsWith('account-deletion-availability')) return availability;
  if (name.endsWith('.css')) return {};
  throw new Error(name);
});
let html = renderToStaticMarkup(React.createElement(components.AccountDeletion));
assert.match(html, /Excluir minha conta/); assert.match(html, /disabled=""/); assert.match(html, /ainda não está disponível/);
for (const otherRole of ['ADMIN', 'PROFESSOR']) { role = otherRole; assert.equal(renderToStaticMarkup(React.createElement(components.AccountDeletion)), ''); }
html = renderToStaticMarkup(React.createElement(components.AdminAccountDeletion, { userId: 'fixture', email: 'fixture@example.invalid', disabled: false, onDone() { throw new Error('No success expected'); } }));
assert.match(html, /Excluir conta/); assert.match(html, /disabled=""/); assert.match(html, /ainda não está disponível/);
html = renderToStaticMarkup(React.createElement(components.EmailReuseRevocation));
assert.match(html, /fieldset disabled=""/);
assert.equal(requests, 0);
console.log('OK: exclusão ADMIN/Aluno e revogação desativadas; zero requisições e zero confirmações de exclusão.');
