// Cadastro repetido de conta que ainda aguarda a confirmação do e-mail: aviso com o caminho para reenviar o link.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");

class ApiError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const out = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, "src/registration-errors.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText, {
  exports: out,
  require(name) {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "./api") return { ApiError };
    throw Error(`Unexpected import: ${name}`);
  },
});

const pending = new ApiError(409, "Esta conta já existe e aguarda a confirmação do e-mail. Entre com sua senha para receber um novo link de confirmação.", "EMAIL_PENDING_CONFIRMATION");
assert.equal(out.isPendingConfirmation(pending), true);
assert.equal(out.isPendingConfirmation(new ApiError(409, "E-mail já cadastrado.")), false);
assert.equal(out.isPendingConfirmation(new Error("qualquer")), false);
assert.equal(out.isPendingConfirmation(undefined), false);

const html = renderToStaticMarkup(React.createElement(out.PendingConfirmationNotice, { email: "ana@example.com", message: pending.message, onLogin() {} }));
assert.match(html, /role="alert"/);
assert.match(html, /aguarda a confirmação do e-mail/);
assert.match(html, /ana@example\.com/);
assert.match(html, /<button[^>]*type="button"[^>]*>Entrar e reenviar o link<\/button>/);
console.log("OK: aviso de conta aguardando confirmação no cadastro");
