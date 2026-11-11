import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Run the actual component/hooks with an in-memory hook host and controlled API.
// No server, browser storage, database or network is used.
function host(file, name, request) {
  const slots = []; let cursor = 0, effects = [], dirty = false, output;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; dirty = true; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) {
        const old = slots[i]; slots[i] = { deps, cleanup: old?.cleanup };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, Intl, Date, Error, console,
    require(id) {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (id === './api') return { apiRequest: request };
      return {};
    },
  });
  function render() { cursor = 0; dirty = false; output = module.exports[name](); const pending = effects; effects = []; pending.forEach(fn => fn()); }
  render();
  return {
    get value() { return output; },
    async settle() { for (let i = 0; i < 20; i++) { await Promise.resolve(); if (dirty) render(); } },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const overview = { latestDiagnosticId: null, totals: { completedActivities: 2 } };

test('academic summary succeeds while goals fail; retry requests goals only', async () => {
  const calls = []; let failing = true;
  const app = host('student-progress.tsx', 'useStudentProgress', async path => {
    calls.push(path); if (path === '/goals/dashboard') { if (failing) throw new Error('goals offline'); return { todayAnsweredQuestions: 7 }; } return overview;
  });
  await app.settle();
  assert.equal(app.value.data, overview); assert.equal(app.value.loading, false); assert.equal(app.value.error, '');
  assert.equal(app.value.dashboardError, 'goals offline'); assert.equal(app.value.dashboardLoading, false);
  failing = false; await app.value.refreshDashboard(); await app.settle();
  assert.equal(app.value.studyDashboard.todayAnsweredQuestions, 7); assert.equal(app.value.dashboardError, '');
  assert.equal(calls.filter(p => p === '/students/me/overview').length, 1);
});

test('slow goals do not delay academic success and failed academics do not hide goals', async () => {
  const goal = deferred();
  const app = host('student-progress.tsx', 'useStudentProgress', path => path === '/goals/dashboard' ? goal.promise : Promise.resolve(overview));
  await app.settle(); assert.equal(app.value.loading, false); assert.equal(app.value.dashboardLoading, true); assert.equal(app.value.data, overview);
  goal.resolve({ todayAnsweredQuestions: 1 }); await app.settle(); assert.equal(app.value.dashboardLoading, false);
  const failed = host('student-progress.tsx', 'useStudentProgress', async path => { if (path.includes('overview')) throw new Error('academic offline'); return { todayAnsweredQuestions: 3 }; });
  await failed.settle(); assert.equal(failed.value.error, 'academic offline'); assert.equal(failed.value.studyDashboard.todayAnsweredQuestions, 3);
});

test('late goal responses cannot overwrite a newer refresh', async () => {
  const old = deferred(); let count = 0;
  const app = host('student-progress.tsx', 'useStudentProgress', path => path.includes('overview') ? Promise.resolve(overview) : ++count === 1 ? old.promise : Promise.resolve({ todayAnsweredQuestions: 9 }));
  await app.value.refreshDashboard(); await app.settle(); old.resolve({ todayAnsweredQuestions: 1 }); await app.settle();
  assert.equal(app.value.studyDashboard.todayAnsweredQuestions, 9);
  app.unmount();
});

for (const operation of ['create', 'edit', 'complete', 'ambiguous-write']) for (const refreshFails of [false, true]) {
  test(`goals ${operation}, refresh failure=${refreshFails}: updates both resources with independent retry`, async () => {
    const calls = []; let changed = false, summaryFails = false;
    const goal = { id: 'goal-1', date: '2026-11-11', targetQuestions: 10, resolvedQuestions: 12, canComplete: true, completed: false, progressPercentage: 100 };
    const write = deferred();
    const app = host('goals-reports.tsx', 'GoalsPage', async (path, init) => {
      calls.push({ path, method: init?.method ?? 'GET' });
      if (init?.method) { changed = true; await write.promise; if (operation === 'ambiguous-write') throw new Error('network interrupted'); return goal; }
      if (path === '/goals/dashboard') { if (summaryFails) throw new Error('summary offline'); return { todayAnsweredQuestions: changed ? 12 : 0, todayGoal: changed ? goal : null, streak: { current: 1, longest: 1 } }; }
      return { items: [goal], page: 1, hasMore: false };
    });
    await app.settle();
    if (operation === 'edit') {
      const button = nodes(app.value).find(n => n.type === 'button' && String(n.props.children).includes('Editar'));
      assert.ok(button); button.props.onClick(); await app.settle();
    }
    const trigger = () => operation === 'complete'
      ? nodes(app.value).find(n => n.type === 'button' && typeof n.props.onClick === 'function' && String(n.props.children).includes('Concluir')).props.onClick()
      : nodes(app.value).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
    const mutation = trigger(); trigger(); // Two synchronous submissions must not duplicate the write.
    summaryFails = refreshFails; write.resolve(); await mutation; await app.settle();
    assert.equal(calls.filter(c => c.method !== 'GET').length, 1);
    assert.equal(calls.filter(c => c.path === '/goals/dashboard').length, 2);
    assert.equal(calls.filter(c => c.path.startsWith('/goals?')).length, 2);
    assert.equal(nodes(app.value).some(n => n.props?.className === 'panel goal-streak'), !refreshFails);
    if (!refreshFails) {
      const panel = nodes(app.value).find(n => n.props?.className === 'panel goal-streak');
      assert.ok(JSON.stringify(panel).includes('12'));
      return;
    }
    const states = nodes(app.value).filter(n => typeof n.type === 'function' && 'reload' in n.props);
    const summaryState = states.find(n => n.props.error === 'summary offline'); assert.ok(summaryState);
    summaryFails = false; summaryState.props.reload(); await app.settle();
    const panel = nodes(app.value).find(n => n.props?.className === 'panel goal-streak'); assert.ok(panel);
    assert.equal(calls.filter(c => c.path.startsWith('/goals?')).length, 2);
    assert.equal(calls.filter(c => c.method !== 'GET').length, 1);
    assert.equal(calls.find(c => c.method !== 'GET').method, operation === 'edit' ? 'PATCH' : 'POST');
  });
}

test('goals list failure preserves the refreshed today block; retry never repeats mutation or summary', async () => {
  const calls = []; let changed = false, listFails = false;
  const app = host('goals-reports.tsx', 'GoalsPage', async (path, init) => {
    calls.push({ path, method: init?.method });
    if (init?.method) { changed = true; listFails = true; return {}; }
    if (path === '/goals/dashboard') return { streak: { current: 1, longest: 1 }, todayAnsweredQuestions: changed ? 8 : 0, todayGoal: null };
    if (listFails) throw new Error('list offline');
    return { items: [], page: 1, hasMore: false };
  });
  await app.settle();
  await nodes(app.value).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await app.settle();
  assert.ok(nodes(app.value).some(n => n.props?.className === 'panel goal-streak'));
  const list = nodes(app.value).find(n => typeof n.type === 'function' && n.props.error === 'list offline'); assert.ok(list);
  listFails = false; list.props.reload(); await app.settle();
  assert.equal(calls.filter(c => c.path === '/goals/dashboard').length, 2);
  assert.equal(calls.filter(c => c.method).length, 1);
});

test('academic result loads even when goals are unavailable', async () => {
  const calls = [];
  const app = host('student-progress.tsx', 'useStudentProgress', async path => {
    calls.push(path);
    if (path === '/goals/dashboard') throw new Error('goals offline');
    if (path.includes('overview')) return { ...overview, latestDiagnosticId: 'diagnostic-1' };
    return { id: 'diagnostic-1', level: 'BASICO' };
  });
  await app.settle();
  assert.equal(app.value.latestResult.id, 'diagnostic-1');
  assert.equal(app.value.resultError, '');
  assert.equal(calls.filter(p => p === '/diagnostics/diagnostic-1/result').length, 1);
});

test('goals ignore initial responses arriving after mutation reconciliation', async () => {
  const oldList = deferred(), oldSummary = deferred(); let listCalls = 0, summaryCalls = 0;
  const app = host('goals-reports.tsx', 'GoalsPage', async (path, init) => {
    if (init?.method) return {};
    if (path === '/goals/dashboard') return ++summaryCalls === 1 ? oldSummary.promise : { streak: { current: 1, longest: 1 }, todayAnsweredQuestions: 42, todayGoal: null };
    return ++listCalls === 1 ? oldList.promise : { items: [], page: 1, hasMore: false };
  });
  await nodes(app.value).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await app.settle();
  oldList.resolve({ items: [{ id: 'obsolete' }], page: 1, hasMore: false });
  oldSummary.resolve({ streak: { current: 0, longest: 0 }, todayAnsweredQuestions: 0, todayGoal: null });
  await app.settle();
  const panel = nodes(app.value).find(n => n.props?.className === 'panel goal-streak');
  assert.ok(JSON.stringify(panel).includes('42'));
  assert.equal(nodes(app.value).some(n => n.props?.className === 'panel goal-card'), false);
});
