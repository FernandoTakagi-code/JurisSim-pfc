const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
function load(name) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "../src", name), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
        },
      },
    ).outputText,
    { exports },
  );
  return exports;
}
const { sessionDestination, sessionRedirectTarget } = load("auth-routing.ts");
const { adminSections, adminSection, isAdministrationPath } = load(
  "admin-navigation.ts",
);
const session = (role, nextStep = "DASHBOARD") => ({
  user: { role, emailVerificado: true },
  nextStep,
});
assert.equal(sessionDestination(session("ADMIN")), "/administracao");
for (const path of [
  "/professor",
  "/professor/questoes",
  "/instituicoes",
  "/convite-professor",
]) {
  assert.equal(sessionRedirectTarget(session("ADMIN"), path), "/administracao");
}
assert.equal(new Set(adminSections.map((section) => section.path)).size, 9);
assert.ok(!adminSections.some(section=>section.id==='classes'));
assert.equal(adminSection('/administracao/turmas').id,'classes');
for (const section of adminSections) {
  assert.ok(isAdministrationPath(section.path));
  assert.equal(adminSection(section.path).id, section.id);
  assert.equal(sessionRedirectTarget(session("ADMIN"), section.path), null);
}
assert.equal(adminSection("/administracao/inexistente"), undefined);
assert.equal(isAdministrationPath("/administracaofalsa"), false);
assert.equal(
  sessionRedirectTarget(session("ADMIN"), "/dashboard"),
  "/administracao",
);
assert.equal(
  sessionRedirectTarget(session("ADMIN"), "/estudar"),
  "/administracao",
);
assert.equal(
  sessionRedirectTarget(session("ADMIN"), "/administracao/perfil"),
  null,
);
assert.equal(
  sessionRedirectTarget(session("ADMIN"), "/administracao/preferencias"),
  null,
);
assert.equal(sessionDestination(session("ALUNO")), "/dashboard");
assert.equal(sessionDestination(session("PROFESSOR")), "/professor");
assert.equal(
  sessionDestination(session("ALUNO", "INITIAL_DIAGNOSTIC")),
  "/diagnostico-inicial",
);
assert.equal(sessionRedirectTarget(session("ALUNO"), "/dashboard"), null);
assert.equal(sessionRedirectTarget(session("PROFESSOR"), "/professor"), null);
assert.equal(
  sessionRedirectTarget(session("ALUNO", "INITIAL_DIAGNOSTIC"), "/dashboard"),
  "/diagnostico-inicial",
);
assert.equal(
  sessionDestination({
    ...session("ALUNO"),
    administration: { memberships: [{ role: "INSTITUTION_ADMIN" }] },
  }),
  "/instituicoes",
);
console.log(
  "OK: nove menus administrativos e rota legada, destinos por papel e preservação dos destinos de aluno/professor/instituição. Sem rede.",
);
