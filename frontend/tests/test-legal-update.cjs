// Termos de Uso vindos da API e tela de novo aceite: módulos isolados, sem rede real.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");
const bundled = require("../../backend/src/legal-versions.json");

function load(file, requireFn, extra = {}) {
  const out = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports: out, Promise, JSON, Date, require: requireFn, ...extra });
  return out;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const current = {
  terms: { version: "2026-11-21.1", publishedAt: "2026-11-21T15:00:00.000Z", sections: [{ title: "1. Novo", body: "Texto novo" }] },
  privacyVersion: bundled.privacyVersion,
};

class ApiError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
function apiModule(handler) {
  const calls = [];
  return { calls, module: { ApiError, apiRequest: async (url, init = {}, options = {}) => { calls.push({ url, init, options }); return handler(url, init); } } };
}
const loadClient = (handler) => {
  const api = apiModule(handler);
  const mod = load("src/terms-of-use.ts", (name) => {
    if (name === "./api") return api.module;
    if (name === "../../backend/src/legal-versions.json") return bundled;
    throw Error(`Unexpected import: ${name}`);
  });
  return { api, mod };
};

(async () => {
  {
    const { api, mod } = loadClient(async () => current);
    assert.deepEqual(plain(await mod.loadCurrentLegal()), current);
    await mod.loadCurrentLegal();
    assert.equal(api.calls.length, 1, "carrega uma vez por página");
    assert.equal(api.calls[0].url, "/legal/current");
    assert.equal(api.calls[0].options.authenticated, false);
    assert.deepEqual(plain(await mod.currentLegalAcceptance()), { accepted: true, termsVersion: "2026-11-21.1", privacyVersion: bundled.privacyVersion });
    await mod.loadCurrentLegal(true);
    assert.equal(api.calls.length, 2, "força nova leitura quando pedido");
  }
  {
    const { mod } = loadClient(async () => { throw new Error("offline"); });
    assert.deepEqual(plain(await mod.currentLegalAcceptance()),
      { accepted: true, termsVersion: bundled.termsVersion, privacyVersion: bundled.privacyVersion },
      "sem API, o cadastro envia a versão empacotada e o servidor decide");
  }
  {
    const { api, mod } = loadClient(async (url) => (url === "/auth/legal-acceptance" ? undefined : current));
    assert.equal(await mod.acceptLegalUpdate({ termsVersion: "2026-11-21.1", privacyVersion: bundled.privacyVersion }), "accepted");
    const post = api.calls.find((call) => call.url === "/auth/legal-acceptance");
    assert.equal(post.init.method, "POST");
    assert.deepEqual(JSON.parse(post.init.body), { accepted: true, termsVersion: "2026-11-21.1", privacyVersion: bundled.privacyVersion });
  }
  {
    const { mod } = loadClient(async (url) => {
      if (url === "/auth/legal-acceptance") throw new ApiError(409, "Os Termos de Uso foram atualizados. Recarregue a página e aceite a versão atual.");
      return current;
    });
    assert.equal(await mod.acceptLegalUpdate({ termsVersion: "2026-11-13.1", privacyVersion: bundled.privacyVersion }), "outdated");
  }
  console.log("OK: cliente dos Termos de Uso");

  const { mod: client } = loadClient(async () => current);
  let stateIndex = 0, overrides = {};
  const hooks = {
    ...React,
    useState(initial) {
      const index = stateIndex++;
      return [Object.hasOwn(overrides, index) ? overrides[index] : typeof initial === "function" ? initial() : initial, () => {}];
    },
    useEffect() {},
  };
  const gate = load("src/legal-update-gate.tsx", (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "react") return hooks;
    if (name === "./terms-of-use") return client;
    if (name === "./account-deletion") return { AccountDeletion: () => React.createElement("section", { className: "account-deletion-stub" }, "Excluir minha conta") };
    if (name === "./legal") return { LegalLinks: () => null, TermsSections: ({ sections }) => React.createElement("div", { className: "terms-sections" }, sections.map((s) => s.title).join("|")) };
    throw Error(`Unexpected import: ${name}`);
  });
  const render = (state = {}) => {
    stateIndex = 0; overrides = state;
    return renderToStaticMarkup(React.createElement(gate.LegalUpdateGate, {
      versions: { termsVersion: "2026-11-21.1", privacyVersion: bundled.privacyVersion }, onAccepted() {}, onSair() {},
    }));
  };
  // Estados: 0 termos carregados, 1 marcado, 2 enviando, 3 mensagem.
  const initial = render({ 0: current.terms });
  assert.match(initial, /Os Termos de Uso foram atualizados/);
  assert.match(initial, /Versão 2026-11-21\.1/);
  assert.match(initial, /1\. Novo/);
  assert.match(initial, /href="#\/privacidade"/);
  assert.match(initial, /type="checkbox"/);
  assert.match(initial, /Li e aceito/);
  assert.match(initial, /<button[^>]*disabled=""[^>]*>Aceitar e continuar/);
  assert.match(initial, />Sair</);
  assert.doesNotMatch(render({ 0: current.terms, 1: true }), /<button[^>]*disabled=""[^>]*>Aceitar e continuar/);
  assert.match(render({ 0: current.terms, 3: "Os Termos foram atualizados de novo. Leia a versão abaixo." }), /role="alert"[^>]*>Os Termos foram atualizados de novo/);
  assert.match(render({ 0: null }), /Carregando os Termos de Uso/);
  // Estado 4: quem não concorda abre a exclusão de conta sem precisar aceitar.
  assert.match(initial, /Não concordo e quero excluir minha conta/);
  assert.doesNotMatch(initial, /account-deletion-stub/);
  assert.match(render({ 0: current.terms, 4: true }), /account-deletion-stub/);
  console.log("OK: tela de novo aceite");

  const legal = load("src/legal.tsx", (name) => {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "react") return hooks;
    if (name === "./terms-of-use") return client;
    if (name === "../../backend/src/legal-versions.json") return bundled;
    throw Error(`Unexpected import: ${name}`);
  }, { document: { title: "" }, window: { scrollTo() {} } });
  const page = (kind, state = {}) => {
    stateIndex = 0; overrides = state;
    return renderToStaticMarkup(React.createElement(legal.LegalPage, { kind, onBack() {} }));
  };
  // Estados da página: 0 Termos carregados, 1 erro.
  const termsPage = page("terms", { 0: current.terms });
  assert.match(termsPage, /Termos de Uso — JurisSim/);
  assert.match(termsPage, /Versão 2026-11-21\.1 · Vigência desde 21\/11\/2026/);
  assert.match(termsPage, /<h2>1\. Novo<\/h2><p>Texto novo<\/p>/);
  assert.doesNotMatch(termsPage, /Sobre o JurisSim/, "o texto antigo não fica mais no código");
  assert.match(page("terms", {}), /Carregando os Termos de Uso/);
  const paragraphs = page("terms", { 0: { ...current.terms, sections: [{ title: "1. Novo", body: "Primeiro parágrafo.\n\nSegundo parágrafo." }, { title: "1. Novo", body: "Repetido" }] } });
  assert.match(paragraphs, /<h2>1\. Novo<\/h2><p>Primeiro parágrafo\.<\/p><p>Segundo parágrafo\.<\/p>/, "linhas em branco separam parágrafos");
  assert.match(page("terms", { 1: true }), /role="alert"[^>]*>Não foi possível carregar os Termos de Uso/);
  const privacyPage = page("privacy");
  assert.match(privacyPage, new RegExp(`Versão ${bundled.privacyVersion.replace(".", "\\.")} · Vigência: ${bundled.date.replace(/\//g, "\\/")}`));
  assert.match(privacyPage, /Aviso de Privacidade — JurisSim/);
  console.log("OK: páginas dos Termos e do Aviso de Privacidade");
})().catch((error) => { console.error(error); process.exit(1); });
