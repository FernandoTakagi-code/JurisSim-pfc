const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const ts = require("typescript"),
  postcss = require("postcss");
const root = path.join(__dirname, "..");
const exportsObject = {},
  calls = [];
const memory = new Map();
const source = fs.readFileSync(
  path.join(root, "src/institution-navigation.ts"),
  "utf8",
);
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  {
    exports: exportsObject,
    URLSearchParams,
    require(name) {
      if (name === "react") return { useSyncExternalStore() {} };
      if (name === "./navigation")
        return { navigate: (url) => calls.push(url) };
      throw new Error(name);
    },
    sessionStorage: { setItem: (k, v) => memory.set(k, v) },
  },
);
const { institutionSections, canManageInstitution, institutionNavigate } =
  exportsObject;
assert.equal(institutionSections.length, 11);
assert.equal(new Set(institutionSections.map((s) => s.id)).size, 11);
const session = (role) => ({
  user: { role, emailVerificado: true },
  administration: {
    enabled: true,
    memberships: [{ institutionId: "authorized", role: "INSTITUTION_ADMIN" }],
  },
});
for (const role of ["ALUNO", "PROFESSOR"]) {
  assert.equal(canManageInstitution(session(role), "authorized"), true);
  assert.equal(canManageInstitution(session(role), "foreign"), false);
  assert.equal(
    canManageInstitution(
      { ...session(role), user: { role, emailVerificado: false } },
      "authorized",
    ),
    false,
  );
}
assert.equal(canManageInstitution(session("ADMIN"), "authorized"), false);
assert.equal(
  canManageInstitution(
    {
      ...session("PROFESSOR"),
      administration: {
        enabled: true,
        memberships: [{ institutionId: "authorized", role: "TEACHER" }],
      },
    },
    "authorized",
  ),
  false,
);
assert.equal(
  canManageInstitution(
    {
      ...session("ALUNO"),
      administration: {
        enabled: false,
        memberships: session("ALUNO").administration.memberships,
      },
    },
    "authorized",
  ),
  false,
);
for (const section of institutionSections) {
  institutionNavigate("authorized", section.id, { turma: "class" });
  const url = new URL(calls.at(-1), "http://127.0.0.1");
  assert.equal(url.pathname, "/instituicoes");
  assert.equal(url.searchParams.get("secao"), section.id);
  assert.equal(url.searchParams.get("instituicao"), "authorized");
}
assert.equal(memory.get("jurissim_administration_institution"), "authorized");
assert.equal(memory.has("jurissim_institution"), false);
const css = postcss.parse(
  fs.readFileSync(path.join(root, "src/institution-dashboard.css"), "utf8"),
);
css.walkRules((rule) => {
  for (const selector of rule.selectors)
    assert.ok(selector.startsWith(".institution-workspace"), selector);
});
css.walkAtRules("import", () =>
  assert.fail("Unexpected external/framework CSS import"),
);
for (const name of ["institution-dashboard.tsx", "institution-area.tsx"]) {
  const text = fs.readFileSync(path.join(root, "src", name), "utf8");
  for (const forbidden of [
    "next/",
    "@vercel/analytics",
    "Faculdade Alfa",
    "André Soares",
    "12,4%",
    "Convite enviado com sucesso",
  ])
    assert.ok(!text.includes(forbidden), forbidden);
}
assert.deepEqual(
  JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8")).include,
  ["src"],
);
console.log(
  "OK: onze módulos, papel pessoal preservado, autorização por vínculo, rotas contextualizadas e CSS isolado; sem rede ou banco.",
);
