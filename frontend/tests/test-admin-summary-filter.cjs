// Filtro por período da Visão geral do ADMIN: funções puras e renderização isolada, sem rede.
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
  vm.runInNewContext(code, { exports: out, URLSearchParams, Intl, Date, Math, require: requireFn });
  return out;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const m = load("src/admin-summary-period.ts", () => { throw Error("sem dependências"); });

assert.equal(m.suggestGroupBy("2026-09-21", "2026-11-21"), "day");
assert.equal(m.suggestGroupBy("2026-09-20", "2026-11-21"), "week");
assert.equal(m.suggestGroupBy("2025-11-21", "2026-11-21"), "week");
assert.equal(m.suggestGroupBy("2025-11-20", "2026-11-21"), "month");
assert.equal(m.dayDisabled("2025-11-21", "2026-11-21"), false);
assert.equal(m.dayDisabled("2025-11-20", "2026-11-21"), true);
assert.deepEqual(
  plain(m.fillBuckets([{ bucket: "2026-02-01", count: 3 }], "2026-01-15", "2026-03-10", "month", { count: 0 }).map(b => [b.bucket, b.count])),
  [["2026-01-01", 0], ["2026-02-01", 3], ["2026-03-01", 0]],
);
assert.deepEqual(
  plain(m.fillBuckets([], "2026-11-16", "2026-11-29", "week", { count: 0 }).map(b => b.bucket)),
  ["2026-11-16", "2026-11-23"],
);
assert.deepEqual( // período que começa no meio da semana usa a segunda-feira anterior, como o date_trunc
  plain(m.fillBuckets([], "2026-11-19", "2026-11-24", "week", { count: 0 }).map(b => b.bucket)),
  ["2026-11-16", "2026-11-23"],
);
assert.deepEqual(
  plain(m.fillBuckets([{ bucket: "2026-11-02", students: 1, attempts: 2 }], "2026-11-01", "2026-11-03", "day", { students: 0, attempts: 0 })),
  [{ bucket: "2026-11-01", students: 0, attempts: 0 }, { bucket: "2026-11-02", students: 1, attempts: 2 }, { bucket: "2026-11-03", students: 0, attempts: 0 }],
);
assert.equal(m.bucketLabel("2026-11-09", "day"), "09");
assert.equal(m.bucketLabel("2026-11-09", "week"), "09/11");
assert.equal(m.bucketLabel("2026-11-01", "month"), "11/26");
assert.deepEqual(plain(m.readPeriodFromUrl("?de=2021-11-12&ate=2026-11-21&agrupar=month")), { from: "2021-11-12", to: "2026-11-21", groupBy: "month" });
assert.equal(m.readPeriodFromUrl("?de=2021-11-12"), null);
assert.equal(m.readPeriodFromUrl("?de=2021-11-12&ate=2026-11-21&agrupar=ano"), null);
assert.equal(m.periodSearch({ from: "2021-11-12", to: "2026-11-21", groupBy: "month" }), "?de=2021-11-12&ate=2026-11-21&agrupar=month");
assert.equal(m.summaryPath(null), "/institutions/admin/summary");
assert.equal(m.summaryPath({ from: "2021-11-12", to: "2026-11-21", groupBy: "week" }), "/institutions/admin/summary?from=2021-11-12&to=2026-11-21&groupBy=week");
assert.equal(m.periodTitle({ from: "2021-11-12", to: "2026-11-21", groupBy: "month" }), "12/11/2021 a 21/11/2026 · por mês");
console.log("OK: funções do filtro por período");

const view = load("src/admin-summary-view.tsx", (name) => {
  if (name === "react/jsx-runtime") return require(name);
  if (name === "react") return React;
  if (name === "./admin-summary-period") return m;
  throw Error(`Unexpected import: ${name}`);
});
const baseData = {
  users: 19, students: 14, institutions: 3, pending: 1, teachers: 2, classes: 3, archivedClasses: 0, errors: 0,
  publishedExams: 2, publishedActivities: 1, completedActivities: 1, newUsers: 18, activitiesAvailable: true,
  userDistribution: [{ profile: "ALUNO", count: 14 }],
};
const noop = () => {};
const render = (props) => renderToStaticMarkup(React.createElement(view.AdminSummaryView, { enabled: true, loading: false, error: false, onNavigate: noop, ...props }));

const current = render({ data: { ...baseData, period: null, registrationsByDay: [{ day: "2026-11-20", count: 2 }], institutionGrowthByDay: [], participationByDay: [] } });
assert.match(current, /Novos cadastros/);
assert.match(current, /Últimos 30 dias/);
assert.match(current, /Evolução de cadastros/);
assert.doesNotMatch(current, /No período/);

const filtered = render({ data: {
  ...baseData, newUsers: 19, period: { from: "2026-01-15", to: "2026-03-10", groupBy: "month" },
  registrationsByDay: [{ bucket: "2026-02-01", count: 3 }], institutionGrowthByDay: [], participationByDay: [],
} });
assert.doesNotMatch(filtered, /Novos cadastros/);
assert.match(filtered, /No período/);
assert.match(filtered, /15\/01\/2026 a 10\/03\/2026 · por mês/);
assert.equal((filtered.match(/summary-bar-column/g) || []).length, 9); // 3 meses x 3 gráficos
assert.match(filtered, /02\/26/);
assert.doesNotMatch(filtered, /últimos 30 dias/i);
console.log("OK: indicadores com e sem período");

const bar = (props) => renderToStaticMarkup(React.createElement(view.SummaryFilterBar, {
  draft: { from: "", to: "", groupBy: "day" }, applied: null, error: "", onChange: noop, onApply: noop, onClear: noop, ...props,
}));
const longRange = bar({ draft: { from: "2021-11-12", to: "2026-11-21", groupBy: "month" } });
assert.match(longRange, /type="date"/);
assert.match(longRange, /Aplicar/);
assert.match(longRange, /aria-pressed="true"[^>]*>Mês/);
assert.match(longRange, /<button[^>]*disabled=""[^>]*>Dia/);
assert.match(bar({ error: "A data final não pode estar no futuro." }), /role="alert"[^>]*>A data final não pode estar no futuro\./);
assert.match(bar({ applied: { from: "2021-11-12", to: "2026-11-21", groupBy: "month" } }), /Limpar filtro/);
assert.match(bar({ draft: { from: "", to: "", groupBy: "day" } }), /<button[^>]*disabled=""[^>]*>Aplicar/);
console.log("OK: barra de filtro");
