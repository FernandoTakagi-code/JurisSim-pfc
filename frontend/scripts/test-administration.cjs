// Isolated rendering tests: hook states are injected; no API effects execute.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "src/administration.tsx"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
let stateIndex, overrides, dependencies, route;
const navigation = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(path.join(root, "src/admin-navigation.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { exports: navigation },
);
const exportsObject = {};
const availabilityHelpers = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.join(root, "src/administration-availability.ts"),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { exports: availabilityHelpers },
);
vm.runInNewContext(compiled, {
  URLSearchParams,
  exports: exportsObject,
  require(name) {
    if (name === './institution-request') return { InstitutionRequest: () => null };
    if (name === './account-deletion') return { AdminAccountDeletion: () => null, EmailReuseRevocation: () => null };
    if (name === '../../backend/src/institution-registration') return { institutionPendingFields: () => [], noWebsiteDeclaration: 'Não possui website' };
    if (name === "./administration-availability") return availabilityHelpers;
    if (name === "react")
      return {
        ...React,
        useState(initial) {
          const index = stateIndex++;
          return [
            Object.hasOwn(overrides, index)
              ? overrides[index]
              : typeof initial === "function"
                ? initial()
                : initial,
            () => {},
          ];
        },
        useEffect(_effect, deps) {
          dependencies.push(deps);
        },
      };
    if (name === "react/jsx-runtime") return require(name);
    if (name === "./api")
      return {
        apiRequest() {
          throw Error("Network forbidden");
        },
      };
    if (name === "./admin-navigation") return navigation;
    if (name === "./navigation") return { usePath: () => route, navigate() {} };
    if (name === "./auth-session")
      return {
        useSession: () => ({ session: { user: { id: "current-admin" } } }),
      };
    if (name.endsWith(".css")) return {};
    if (["./auth-session", "./navigation", "./invitation-token"].includes(name))
      return {};
    throw Error(`Unexpected import: ${name}`);
  },
});
function render(tab, enabled, extra = {}) {
  route =
    (tab==="classes"?"/administracao/turmas":navigation.adminSections.find((section) => section.id === tab)?.path) ??
    "/administracao/inexistente";
  stateIndex = 0;
  dependencies = [];
  overrides = {
    0: enabled === undefined ? undefined : { enabled },
    ...extra,
  };
  const html = renderToStaticMarkup(
    React.createElement(exportsObject.GeneralAdministration),
  );
  return {
    html,
    paths: dependencies.map((d) => d?.[0]).filter((v) => typeof v === "string"),
  };
}
const sections = [
  "Visão geral",
  "Instituições",
  "Solicitações de cadastro",
  "Usuários",
  "Professores",
  "Logs e auditoria",
  "Segurança",
  "Notificações",
  "Configurações do sistema",
];
let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log(`OK ${name}`);
}
check(
  "nove seções acessíveis sem módulo ativo; nenhuma consulta protegida",
  () => {
    const { html, paths } = render("overview", false);
    assert.deepEqual(
      Array.from(navigation.adminSections, (section) => section.label),
      sections,
    );
    assert.ok(!html.includes("<nav"));
    assert.ok(html.includes("Capacidade administrativa desativada"));
    assert.deepEqual(paths, [
      "/institutions/availability",
      "/audit-logs?limit=5",
    ]);
    assert.ok(!html.includes("Confirmar vínculo"));
  },
);
check("indicadores reais e ausência das métricas fictícias do v0", () => {
  const { html, paths } = render("overview", true, {
    4: { users: 17, teachers: 4 },
  });
  assert.ok(html.includes(">17</strong>"));
  assert.ok(html.includes("Vínculos de professores ativos"));
  assert.ok(paths.includes("/institutions/admin/summary"));
  assert.ok(!html.includes("12.438"));
  assert.ok(html.includes("não está disponível no momento"));
});
for (const [tab, expected] of [
  ["institutions", "/institutions/admin/institutions?page=1"],
  ["requests", "/institutions/admin/institutions?page=1&status=PENDING"],

  ["audit", "/institutions/admin/logs?page=1"],
  ["notifications", "/institutions/notifications?page=1"],
])
  check(`contrato existente: ${tab}`, () => {
    assert.ok(render(tab, true).paths.includes(expected), expected);
    assert.deepEqual(
      render(tab, false).paths,
      tab === "audit"
        ? ["/institutions/availability", "/audit-logs?limit=25"]
        : ["/institutions/availability"],
    );
  });
check('ADMIN has no academic class query',()=>{const result=render('classes',true);assert.ok(result.html.includes('Gestão pedagógica institucional'));assert.ok(!result.paths.some(p=>p.startsWith('/institutions/admin/classes')));});
check('account searches do not load users before a search', () => {
  for (const tab of ['users', 'teachers']) assert.ok(!render(tab, true).paths.some(p => p.startsWith('/institutions/admin/users')));
});
check("carregamento e erro com opção de tentar novamente", () => {
  assert.ok(
    render("overview", undefined, { 2: true }).html.includes("Carregando"),
  );
  const html = render("overview", undefined, { 1: "Falha controlada" }).html;
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes("Tentar novamente"));
});
check("lista vazia não apresenta registros inventados", () => {
  const { html } = render("institutions", true, {
    8: { items: [], hasMore: false },
  });
  assert.ok(html.includes("Nenhuma instituição neste filtro"));
});
check("segurança e configurações não criam endpoints", () => {
  for (const tab of ["security", "settings"])
    assert.deepEqual(render(tab, true).paths, tab==="security"?["/institutions/availability"]:["/institutions/availability", '/health']);
});
check(
  "auditoria independente não desaparece quando a flag ou sua consulta falham",
  () => {
    for (const enabled of [false, undefined]) {
      const { html, paths } = render("audit", enabled, { 7: [] });
      assert.ok(paths.includes("/audit-logs?limit=25"));
      assert.ok(html.includes("Nenhum registro de auditoria neste período"));
      assert.ok(!html.includes("Próxima"));
    }
  },
);
check(
  "mensagens de bloqueio são específicas e notificações não usam endpoint inexistente",
  () => {
    for (const tab of [
      "institutions",
      "requests",
      "users",
      "teachers",
      "classes",
      "notifications",
    ]) {
      const { html } = render(tab, false);
      assert.ok(html.includes(tab==="classes"?"Gestão pedagógica institucional":"Capacidade administrativa desativada"));
    }
    assert.ok(!render('notifications', false).paths.includes('/notifications'));
    assert.ok(render("settings", false).html.includes("Estado do sistema"));
  },
);
check("novos estilos restritos ao painel administrativo", () => {
  const css = fs.readFileSync(
    path.join(root, "src/administration.css"),
    "utf8",
  );
  const added = css.slice(css.indexOf("/* Administrative adaptation"));
  require("postcss")
    .parse(added)
    .walkRules((rule) => {
      for (const selector of rule.selectors)
        assert.ok(selector.startsWith(".admin-workspace ") || selector.includes('.institution-portal '), selector);
    });
});
console.log(
  `${checks} verificações direcionadas aprovadas; sem rede e sem banco.`,
);
