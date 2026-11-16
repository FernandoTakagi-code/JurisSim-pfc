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
    { exports, URLSearchParams, require(name) {
      if (name === './profile-navigation') return load('profile-navigation.ts');
      throw new Error(name);
    } },
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
assert.equal(new Set(adminSections.map((section) => section.path)).size, 5);
assert.ok(!adminSections.some(section=>section.id==='notifications'));
assert.equal(adminSection('/administracao/notificacoes').id,'audit');
assert.ok(!adminSections.some(section=>section.id==='settings'));
assert.equal(adminSection('/administracao/configuracoes').id,'settings');
assert.ok(!adminSections.some(section=>['teachers','security'].includes(section.id)));
assert.equal(adminSection('/administracao/professores').id,'teachers');
assert.equal(adminSection('/administracao/seguranca').id,'security');
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
  '/administracao/perfil?aba=appearance',
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
const institutionalOwner = {
  ...session("ALUNO"),
  registrationIntent: "INSTITUTION",
  administration: { memberships: [{ role: "INSTITUTION_ADMIN" }] },
};
assert.equal(sessionDestination({ ...session("ALUNO"), registrationIntent: "INSTITUTION" }), "/instituicoes");
assert.equal(sessionRedirectTarget(institutionalOwner, "/dashboard"), "/instituicoes");
assert.equal(sessionRedirectTarget(institutionalOwner, "/dashboard", "", true), null);
assert.equal(sessionDestination(institutionalOwner, true), "/dashboard");
assert.equal(sessionRedirectTarget({ ...session("ALUNO"), registrationIntent: "INSTITUTION" }, "/dashboard", "", true), "/instituicoes");
assert.equal(sessionRedirectTarget(session("ALUNO"), "/dashboard"), null);
console.log(
  "OK: cinco menus administrativos e rotas antigas preservadas; destinos por papel. Sem rede.",
);

for (const path of ['/administracao/acervo', '/administracao/acervo/', '/administracao/acervo//']) {
  assert.equal(adminSection(path).id, 'editorial');
  assert.equal(sessionRedirectTarget(session('ADMIN'), path), null);
  assert.equal(sessionRedirectTarget(session('PROFESSOR'), path), '/professor');
}
assert.equal(adminSection('/administracao/acervo-falso'), undefined);
console.log('OK: editorial route aliases retain ADMIN access and reject teacher navigation.');
