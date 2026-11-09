// Structural design comparison with the supplied export; no network or database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const postcss = require('postcss');
const root = path.resolve(__dirname, '../..');
const original = postcss.parse(fs.readFileSync(path.join(root, 'referencia-dashboard-institucional-v0/globals.css'), 'utf8'));
const integrated = postcss.parse(fs.readFileSync(path.join(root, 'frontend/src/institution-dashboard.css'), 'utf8'));
function value(tree, selector, property) {
  let result;
  tree.walkRules(rule => {
    if (rule.parent.type !== 'root' || rule.selector !== selector || result !== undefined) return;
    rule.walkDecls(property, declaration => { result = declaration.value.replace(/\s+/g, ''); });
  });
  assert.notEqual(result, undefined, selector + ' ' + property);
  return result;
}
const comparisons = [];
for (const [selector, properties] of [
  [':root', ['--navy', '--gold', '--canvas', '--radius']],
  ['.sidebar', ['width', 'padding']],
  ['.topbar', ['height', 'padding']],
  ['.page-body', ['max-width', 'padding']],
  ['.metric-grid', ['grid-template-columns']],
  ['.content-grid', ['grid-template-columns']],
  ['.bottom-grid', ['grid-template-columns']],
]) {
  const scoped = selector === ':root' ? '.institution-workspace' : '.institution-workspace ' + selector;
  for (const property of properties) {
    const source = value(original, selector, property), actual = value(integrated, scoped, property);
    assert.equal(actual, source, selector + ' ' + property);
    comparisons.push({selector, property, original: source, integrated: actual});
  }
}
const artifact = path.join(root, 'frontend/.artifacts/institution-final-review');
fs.mkdirSync(artifact, {recursive:true});
fs.writeFileSync(path.join(artifact, 'visual-comparison.json'), JSON.stringify({
  purpose:'Structural CSS comparison, not a pixel-perfect certification',
  comparisons,
}, null, 2));
console.log(`OK: ${comparisons.length} propriedades estruturais iguais à exportação v0; sem rede ou banco.`);
