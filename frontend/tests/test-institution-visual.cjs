// Paleta compartilhada do JurisSim, estilos com escopo e contraste dos cards; sem rede/banco.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const postcss = require('postcss');
const root = path.resolve(__dirname, '../..');
const shared = postcss.parse(fs.readFileSync(path.join(root, 'frontend/src/integration-shell.css'), 'utf8'));
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
for (const [selector, scoped] of [['.v0-app', '.institution-workspace'], ['.v0-app.v0-dark', '.institution-workspace.dark-mode']]) {
  for (const property of ['--v0-bg', '--v0-panel', '--v0-text', '--v0-muted', '--v0-border']) {
    const source = value(shared, selector, property), actual = value(integrated, scoped, property);
    assert.equal(actual, source, scoped + ' ' + property);
    comparisons.push({selector:scoped, property, shared:source, integrated:actual});
  }
}
integrated.walkRules(rule => {
  if (rule.parent.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
  rule.selectors.forEach(selector => assert.ok(selector.startsWith('.institution-workspace'), selector));
});
integrated.walkDecls(declaration => assert.ok(!/Georgia|\bserif\b/.test(declaration.value), 'Unexpected institutional serif font'));
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(channel => parseInt(channel,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
const background = luminance(value(integrated,'.institution-workspace','--metric-surface'));
const contrast = {};
for (const property of ['--metric-text','--metric-muted','--metric-gold']) {
  const foreground = luminance(value(integrated,'.institution-workspace',property));
  contrast[property] = (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);
  assert.ok(contrast[property] >= 4.5, property + ' WCAG AA contrast');
}
const artifact = path.join(root, 'frontend/.artifacts/institution-final-review');
fs.mkdirSync(artifact, {recursive:true});
fs.writeFileSync(path.join(artifact, 'visual-comparison.json'), JSON.stringify({
  purpose:'Shared theme palette and static contrast checks; browser captures validate actual layout',
  comparisons, contrast,
}, null, 2));
console.log(`OK: ${comparisons.length} tokens iguais ao tema atual, CSS isolado, tipografia sem serifa e contraste AA dos indicadores; sem rede ou banco.`);
