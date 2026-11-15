const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

let hookIndex = 0;
let hooks = [];
const calls = [];
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
const react = {
  useState(initial) {
    const index = hookIndex++;
    if (!hooks[index]) hooks[index] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
    const slot = hooks[index];
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
  },
  useRef(initial) {
    const index = hookIndex++;
    if (!hooks[index]) hooks[index] = { kind: 'ref', value: { current: initial } };
    return hooks[index].value;
  },
  useEffect(effect) { hookIndex++; },
};
const components = {};
const source = fs.readFileSync(path.join(__dirname, '../src/account-security.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(code, { exports: components, require(name) {
  if (name === 'react') return react;
  if (name === 'react/jsx-runtime') return jsx;
  if (name === './api') return { apiRequest: async (route, init, options) => { calls.push({ route, init, options }); return { message: 'Aceito para teste local.' }; } };
  if (name === './auth-session') return { endSession() {}, useSession: () => ({ session: { user: { email: 'fixture@example.invalid' } } }) };
  if (name === './navigation') return { navigate() {} };
  if (name === './account-confirmation-dialog') return { AccountConfirmationDialog: props => jsx.jsx('dialog', props) };
  if (name === './ui-icon') return { Icon: () => null };
  if (name.endsWith('.css')) return {};
  throw new Error(`Unexpected dependency: ${name}`);
} });
const children = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(children) : [node, ...children(node.props?.children)];
const textOf = node => typeof node === 'string' ? node : !node || typeof node !== 'object' ? '' : Array.isArray(node) ? node.map(textOf).join(' ') : textOf(node.props?.children);
function render(Component, props) { hookIndex = 0; return Component(props); }
function find(tree, predicate) { return children(tree).find(predicate); }
function buttonWithText(tree, text) { return find(tree, n => n.type === 'button' && children(n).some(c => c === text)); }
async function flush() { await new Promise(resolve => setImmediate(resolve)); }

(async () => {
  hooks = [];
  let tree = render(components.AccountEmailChange, { compact: true });
  const trigger = find(tree, n => n.type === 'button' && n.props.className === 'security-action-row' && textOf(n).includes('Alterar e-mail'));
  assert.ok(trigger, 'email action is available');
  trigger.props.onClick();
  tree = render(components.AccountEmailChange, { compact: true });
  const emailFields = children(tree).filter(n => n.type === 'input' && n.props.type === 'email');
  const passwordField = children(tree).find(n => n.type === 'input' && n.props.type === 'password');
  assert.equal(emailFields.length, 2);
  assert.ok(emailFields.every(field => field.props.required && field.props.maxLength === 254));
  assert.ok(passwordField?.props.required);
  emailFields[0].props.onChange({ target: { value: 'new@example.invalid' } });
  emailFields[1].props.onChange({ target: { value: 'other@example.invalid' } });
  passwordField.props.onChange({ target: { value: 'fixture-password' } });
  tree = render(components.AccountEmailChange, { compact: true });
  let submit = find(tree, n => n.type === 'button' && textOf(n).includes('Enviar confirma'));
  assert.equal(submit.props.disabled, true, 'mismatched addresses cannot submit');
  const updatedFields = children(tree).filter(n => n.type === 'input' && n.props.type === 'email');
  updatedFields[1].props.onChange({ target: { value: 'new@example.invalid' } });
  tree = render(components.AccountEmailChange, { compact: true });
  submit = find(tree, n => n.type === 'button' && textOf(n).includes('Enviar confirma'));
  assert.equal(submit.props.disabled, false, 'matching addresses plus current password enable request');
  const form = find(tree, n => n.type === 'form');
  form.props.onSubmit({ preventDefault() {} });
  await flush();
  assert.equal(calls[0].route, '/auth/account/email-change');
  assert.equal(JSON.parse(calls[0].init.body).newEmail, 'new@example.invalid');

  hooks = [];
  tree = render(components.AccountPasswordChange, { compact: true });
  const passwordTrigger = find(tree, n => n.type === 'button' && n.props.className === 'security-action-row' && textOf(n).includes('Redefinir senha'));
  assert.ok(passwordTrigger, 'password action is available');
  passwordTrigger.props.onClick();
  tree = render(components.AccountPasswordChange, { compact: true });
  const send = find(tree, n => n.type === 'button' && textOf(n).includes('Enviar link de redefini'));
  assert.ok(send && !send.props.disabled);
  send.props.onClick();
  await flush();
  assert.equal(calls[1].route, '/auth/password-recovery');
  assert.equal(calls[1].options.authenticated, false);
  assert.equal(JSON.parse(calls[1].init.body).email, 'fixture@example.invalid');
  const emailChangeTests = fs.readFileSync(path.join(__dirname, '../../backend/src/services/account-email-change.test.ts'), 'utf8');
  const recoveryTests = fs.readFileSync(path.join(__dirname, '../../backend/src/__tests__/unit/password-recovery-service.unit.test.ts'), 'utf8');
  assert.match(emailChangeTests, /confirm-email-change\?token=/);
  assert.match(emailChangeTests, /expiresInMinutes\).*30|, 30\)/);
  assert.ok(recoveryTests.includes('reset-password'));
  console.log('PASS: email confirmation form validation, password recovery request and confirmation-link coverage; all API calls mocked, no network or real mail.');
})().catch(error => { console.error(error); process.exitCode = 1; });
