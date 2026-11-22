// O diagnóstico do início dos estudos pede 5 questões à API (POST /diagnostics).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "..", "src", "main.tsx"), "utf8");
const constant = source.match(/const LEGACY_DIAGNOSTIC_QUESTION_COUNT = (\d+);/);
assert.ok(constant, "a quantidade do diagnóstico fica numa constante nomeada");
assert.equal(Number(constant[1]), 5);
assert.match(source, /JSON\.stringify\(\{ questionCount: LEGACY_DIAGNOSTIC_QUESTION_COUNT \}\)/);
assert.doesNotMatch(source, /questionCount: 30/);
console.log("OK: diagnóstico inicial com 5 questões");
