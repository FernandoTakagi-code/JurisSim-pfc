// Seção "Termos de uso" do ADMIN: funções do editor e renderização isolada, sem rede.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");

function load(file, requireFn) {
  const out = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports: out, JSON, Date, require: requireFn });
  return out;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

const navigation = load("src/admin-navigation.ts", () => { throw Error("sem dependências"); });
assert.equal(navigation.adminSection("/administracao/termos").id, "terms");
assert.equal(navigation.adminSection("/administracao/termos").label, "Termos de uso");
assert.ok(navigation.adminSections.some((section) => section.id === "terms" && section.path === "/administracao/termos"));
console.log("OK: rota /administracao/termos");

const view = load("src/terms-admin.tsx", (name) => {
  if (name === "react/jsx-runtime") return require(name);
  if (name === "react") return React;
  if (name === "./api") return { apiRequest() { throw Error("Network forbidden"); } };
  if (name === "./legal") return { TermsSections: ({ sections }) => React.createElement("div", { className: "preview" }, sections.map((s) => s.title).join("|")) };
  throw Error(`Unexpected import: ${name}`);
});

const sections = [{ title: "1. Atual", body: "Texto atual" }, { title: "2. Segunda", body: "Outro" }];
assert.equal(view.sectionsChanged(sections, plain(sections)), false);
assert.equal(view.sectionsChanged(sections, [{ ...sections[0], body: "Texto atual " }, sections[1]]), false, "espaços nas bordas não contam como alteração");
assert.equal(view.sectionsChanged(sections, [{ ...sections[0], body: "Novo" }, sections[1]]), true);
assert.deepEqual(plain(view.moveSection(sections, 1, -1)).map((s) => s.title), ["2. Segunda", "1. Atual"]);
assert.deepEqual(plain(view.moveSection(sections, 0, -1)).map((s) => s.title), ["1. Atual", "2. Segunda"], "não sai dos limites");
assert.deepEqual(plain(view.removeSection(sections, 0)).map((s) => s.title), ["2. Segunda"]);
assert.deepEqual(plain(view.addSection(sections)).at(-1), { title: "", body: "" });
assert.equal(view.publishProblem([{ title: "", body: "x" }]), "Preencha o título e o texto de todas as seções.");
assert.equal(view.publishProblem([{ title: "<b>", body: "x" }]), "Os títulos e textos não podem conter os caracteres < ou >.");
assert.equal(view.publishProblem([]), "Inclua ao menos uma seção.");
assert.equal(view.publishProblem(sections), "");
console.log("OK: funções do editor");

const overview = {
  current: { version: "2026-11-13.1", publishedAt: "2026-11-13T03:00:00.000Z", sections },
  history: [
    { version: "2026-11-21.1", publishedAt: "2026-11-21T15:00:00.000Z", publishedBy: "Joao" },
    { version: "2026-11-13.1", publishedAt: "2026-11-13T03:00:00.000Z", publishedBy: null },
  ],
  acceptedCount: 14,
  activeAccounts: 19,
};
const noop = () => {};
const render = (props) => renderToStaticMarkup(React.createElement(view.TermsAdministrationView, {
  overview, draft: sections, preview: false, confirming: false, busy: false, message: "", error: "", viewing: null,
  onChange: noop, onTogglePreview: noop, onAskPublish: noop, onCancelPublish: noop, onConfirmPublish: noop, onView: noop, onCloseView: noop,
  ...props,
}));

const html = render({});
assert.match(html, /Em vigor: 2026-11-13\.1 · desde 13\/11\/2026/);
assert.match(html, /14 de 19 contas aceitaram esta versão/);
assert.match(html, /value="1\. Atual"/);
assert.match(html, />Texto atual<\/textarea>/);
assert.match(html, /<button[^>]*disabled=""[^>]*>Publicar nova versão/, "nada mudou: publicar desativado");
assert.match(html, /2026-11-21\.1/);
assert.match(html, /Joao/);
assert.match(html, /Sistema/);
assert.match(html, /Adicionar seção/);

const edited = render({ draft: [{ title: "1. Atual", body: "Texto alterado" }, sections[1]] });
assert.doesNotMatch(edited, /<button[^>]*disabled=""[^>]*>Publicar nova versão/);

const confirming = render({ draft: [{ title: "1. Atual", body: "Texto alterado" }], confirming: true });
assert.match(confirming, /role="dialog"/);
assert.match(confirming, /Todas as outras contas precisarão aceitar a nova versão no próximo acesso\. Seu aceite será registrado ao publicar\./);
assert.match(confirming, /Confirmar publicação/);

assert.match(render({ error: "Revise as seções." }), /role="alert"[^>]*>Revise as seções\./);
assert.match(render({ message: "Versão 2026-11-21.2 publicada." }), /role="status"[^>]*>Versão 2026-11-21\.2 publicada\./);
assert.match(render({ preview: true }), /class="preview"[^>]*>1\. Atual\|2\. Segunda/);
assert.match(render({ viewing: { version: "2026-11-13.1", publishedAt: "2026-11-13T03:00:00.000Z", sections } }), /Versão 2026-11-13\.1 \(somente leitura\)/);
assert.match(render({ overview: null }), /Carregando os Termos de Uso/);
console.log("OK: tela de Termos de uso do ADMIN");
