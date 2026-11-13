const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/teacher-access.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { teacherAccess } = exportsObject;
const session = { user: { role: 'PROFESSOR', emailVerificado: true } };
const membership = id => ({ role: 'TEACHER', institutionId: id, institution: { name: id } });
assert.equal(teacherAccess(session, null).canLoadAcademicData, true);
const pending = { ...session, administration: { enabled: true, needsInstitutionLink: true, memberships: [] } };
assert.equal(teacherAccess(pending, null).canLoadAcademicData, false);
assert.equal(teacherAccess(pending, null).pendingLink, true);
const single = { ...session, administration: { enabled: true, memberships: [membership('one')] } };
assert.equal(teacherAccess(single, 'stale').institutionId, 'one');
assert.equal(teacherAccess(single, null).canLoadAcademicData, true);
const multiple = { ...session, administration: { enabled: true, memberships: [membership('one'), membership('two')] } };
for (const candidate of [null, 'stale']) {
  assert.equal(teacherAccess(multiple, candidate).needsSelection, true);
  assert.equal(teacherAccess(multiple, candidate).canLoadAcademicData, false);
}
assert.equal(teacherAccess(multiple, 'two').canLoadAcademicData, true);
assert.equal(teacherAccess(multiple, 'two').institutionId, 'two');
for (const role of ['ALUNO', 'ADMIN']) assert.equal(teacherAccess({ ...session, user: { role, emailVerificado: true } }, null).canLoadAcademicData, false);
assert.equal(teacherAccess({ ...session, user: { role: 'PROFESSOR', emailVerificado: false } }, null).canLoadAcademicData, false);
console.log('OK: acesso do Professor, vínculo pendente, seleção única/múltipla, contexto revogado e isolamento por papel; sem rede ou banco.');
