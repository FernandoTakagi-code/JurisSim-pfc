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
    if (name === "./institution-navigation") return { institutionNavigate() {}, canViewInstitution: () => true };
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
    ({classes:'/administracao/turmas',teachers:'/administracao/professores',security:'/administracao/seguranca',settings:'/administracao/configuracoes',notifications:'/administracao/notificacoes'}[tab]??navigation.adminSections.find((section) => section.id === tab)?.path) ??
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
  "Logs e auditoria",
];
let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log(`OK ${name}`);
}
check(
  "cinco seções acessíveis sem módulo ativo; nenhuma consulta protegida",
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
    ]);
    assert.ok(!html.includes("Confirmar vínculo"));
  },
);
check("indicadores reais e ausência das métricas fictícias do v0", () => {
  const { html, paths } = render("overview", true, {
    4: { users: 17, teachers: 4 },
  });
  assert.ok(html.includes(">17</strong>"));
  assert.ok(html.includes("Professores vinculados"));
  assert.ok(paths.includes("/institutions/admin/summary"));
  assert.ok(!html.includes("12.438"));
  assert.ok(html.includes("Sem registros no per"));
});
check('activity indicators stay hidden until their real counters are available', () => {
  for (const activityData of [
    { publishedActivities: null, completedActivities: null },
    {},
  ]) {
    const { html } = render('overview', true, { 4: { users: 15, ...activityData } });
    assert.ok(!html.includes('Atividades publicadas'));
    assert.ok(!html.includes('Atividades concluídas'));
    assert.ok(html.includes('Contas cadastradas'));
    assert.ok(html.includes('>15</strong>'));
  }
  const { html } = render('overview', true, {
    4: { publishedActivities: 0, completedActivities: 3 },
  });
  assert.ok(html.includes('Atividades publicadas'));
  assert.ok(html.includes('Atividades concluídas'));
  assert.ok(html.includes('>0</strong>'));
  assert.ok(html.includes('>3</strong>'));
});
for (const [tab, expected] of [
  ["institutions", "/institutions/admin/institutions?page=1"],
  ["requests", "/institutions/admin/institutions?page=1&status=PENDING"],

  ["audit", "/institutions/admin/logs?page=1"],
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
check('consulta de usuários reúne professores e remove a revogação indisponível',()=>{
  const html=render('users',true).html;
  assert.ok(html.includes('Perfil da conta'));
  assert.ok(html.includes('Professor'));
  assert.ok(!html.includes('Revogar bloqueio de reutilização'));
});
check('estado do sistema explica cadastro pausado sem prometer controles futuros',()=>{
  const html=render('settings',false).html;
  assert.ok(html.includes('Cadastro pausado'));
  assert.ok(html.includes('independente do cadastro de alunos'));
  assert.ok(!html.includes('atualização futura'));
  assert.ok(!html.includes('Não monitorado'));
});
check('a rota antiga de avisos abre auditoria sem consultar notificações do ADMIN',()=>{
  const result=render('notifications',true);
  assert.ok(result.html.includes('Logs e auditoria'));
  assert.ok(result.paths.includes('/institutions/admin/logs?page=1'));
  assert.ok(!result.paths.some(path=>path.startsWith('/institutions/notifications')));
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
      const { html, paths } = render("audit", enabled, { 8: [] });
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
    ]) {
      const { html } = render(tab, false);
      assert.ok(html.includes(tab==="classes"?"Gestão pedagógica institucional":"Capacidade administrativa desativada"));
    }
    assert.ok(!render('notifications', false).paths.includes('/notifications'));
    assert.ok(render("settings", false).html.includes("Disponibilidade da plataforma"));
  },
);
check('auditoria separa históricos e mantém IDs apenas nos detalhes',()=>{
 const management=render('audit',true,{9:{items:[{id:'event-demo',event:'INSTITUTION_ACTIVE',occurredAt:'2026-11-16T00:00:00Z',actorId:'actor-demo',result:'SUCCESS',severity:'INFO'}],hasMore:false}});
 assert.ok(management.html.includes('Instituição aprovada'));
 assert.ok(management.html.includes('<details class="admin-audit-details">'));
 assert.ok(management.html.includes('registros de toda a plataforma'));
 assert.ok(!management.paths.some(p=>p.startsWith('/audit-logs')));
 const accounts=render('audit',true,{4:'accounts',8:[{id:'login-demo',action:'LOGIN_SUCESSO',occurredAt:'2026-11-16T00:00:00Z',userId:'actor-demo'}]});
 assert.ok(accounts.html.includes('Login realizado'));
 assert.ok(accounts.paths.includes('/audit-logs?limit=25'));
 assert.ok(!accounts.paths.some(p=>p.startsWith('/institutions/admin/logs')));
 assert.ok(!accounts.html.includes('Próxima'));
});
check('visão geral prioriza decisões administrativas e atalhos úteis',()=>{
 const result=render('overview',true,{4:{users:17,teachers:4},8:{items:[{id:'decision',event:'PERMISSION_CHANGED',occurredAt:'2026-11-16T00:00:00Z',result:'SUCCESS',severity:'INFO'}],hasMore:false}});
 assert.ok(result.html.includes('Permissão alterada'));
 assert.ok(!result.html.includes('\\u00'));
 assert.ok(result.html.includes('Evolução de cadastros'));
 assert.ok(!result.paths.some(p=>p.startsWith('/audit-logs')));
 assert.ok(!result.html.includes('Gerenciar professores'));
 assert.ok(!result.html.includes('Consultar escopo de turmas'));
});
check('solicitações do professor respeitam a disponibilidade mesmo em requestsOnly',()=>{
 for(const enabled of [false,true]){
   stateIndex=0;dependencies=[];overrides={2:{enabled}};
   const html=renderToStaticMarkup(React.createElement(exportsObject.ClassMembershipManager,{teacher:true,classId:'class-demo',requestsOnly:true}));
   const paths=dependencies.map(d=>d?.[0]).filter(p=>typeof p==='string');
   assert.equal(paths.includes('/turmas/class-demo/requests?page=1'),enabled);
   assert.equal(html.includes('Solicitações de entrada'),enabled);
 }
});
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
