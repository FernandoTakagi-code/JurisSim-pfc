// Consulta de CEP (ViaCEP) do cadastro de instituição: módulo isolado com fetch simulado, sem rede real.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

const m = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, "src/postal-code.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: m, setTimeout, clearTimeout, AbortController, Promise, JSON, require(name) {
  if (name === "../../backend/src/institution-registration") return { institutionStates: ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] };
  throw Error(`Unexpected import: ${name}`);
} });
const plain = (value) => JSON.parse(JSON.stringify(value));
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

(async () => {
  assert.equal(m.cepDigits("01310-100"), "01310100");
  assert.equal(m.cepDigits(" 01.310 100 "), "01310100");
  assert.equal(m.isCompleteCep("01310-100"), true);
  assert.equal(m.isCompleteCep("0131010"), false);
  assert.equal(m.formatCep("01310100"), "01310-100");
  assert.equal(m.formatCep("0131"), "0131");

  let calledUrl = "";
  const found = await m.lookupCep("01310-100", async (url) => {
    calledUrl = url;
    return response(200, { cep: "01310-100", logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" });
  });
  assert.equal(calledUrl, "https://viacep.com.br/ws/01310100/json/");
  assert.deepEqual(plain(found), { status: "found", address: { street: "Avenida Paulista", district: "Bela Vista", city: "São Paulo", state: "SP" } });

  assert.deepEqual(plain(await m.lookupCep("99999-999", async () => response(200, { erro: true }))), { status: "not_found" });
  assert.deepEqual(plain(await m.lookupCep("99999-999", async () => response(200, { erro: "true" }))), { status: "not_found" });
  assert.deepEqual(plain(await m.lookupCep("01310-100", async () => response(400, {}))), { status: "not_found" });
  assert.deepEqual(plain(await m.lookupCep("01310-100", async () => response(503, {}))), { status: "unavailable" });
  assert.deepEqual(plain(await m.lookupCep("01310-100", async () => { throw new Error("offline"); })), { status: "unavailable" });
  assert.deepEqual(plain(await m.lookupCep("01310-100", async () => response(200, { uf: "XX", localidade: "Cidade" }))), { status: "unavailable" }, "UF fora da lista não é aceita");

  let called = false;
  assert.deepEqual(plain(await m.lookupCep("0131", async () => { called = true; return response(200, {}); })), { status: "invalid" });
  assert.equal(called, false, "CEP incompleto não consulta a rede");

  const slow = await m.lookupCep("01310-100", (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted")));
  }), 30);
  assert.deepEqual(plain(slow), { status: "unavailable" }, "desiste depois do prazo");

  console.log("OK: consulta de CEP");
})().catch((error) => { console.error(error); process.exit(1); });
