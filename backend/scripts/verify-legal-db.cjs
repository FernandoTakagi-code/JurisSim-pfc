// Run after build and migration. The test transaction is always rolled back.
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { acceptanceData } = require('../dist/services/legal-acceptance');
const versions = require('../src/legal-versions.json');
const prisma = new PrismaClient();
const rollback = new Error('TEST_ROLLBACK');

async function main() {
  const id = randomUUID();
  try {
    await prisma.$transaction(async tx => {
      await tx.user.create({ data: {
        id, nome: 'Verificação transacional', email: `${id}@example.invalid`,
        senhaHash: 'test-only-not-a-valid-login-hash', role: 'ALUNO',
        ...acceptanceData({ accepted: true, ...versions }),
      } });
      const user = await tx.user.findUniqueOrThrow({ where: { id }, select: { legalAcceptedAt: true, termsVersion: true, privacyVersion: true, auditLogs: true } });
      assert.ok(user.legalAcceptedAt instanceof Date);
      assert.equal(user.termsVersion, versions.termsVersion);
      assert.equal(user.privacyVersion, versions.privacyVersion);
      assert.equal(user.auditLogs.length, 1);
      assert.equal(user.auditLogs[0].action, 'ACEITE_TERMOS_E_PRIVACIDADE');
      assert.equal(user.auditLogs[0].occurredAt.getTime(), user.legalAcceptedAt.getTime());
      assert.equal(user.auditLogs[0].termsVersion, versions.termsVersion);
      assert.equal(user.auditLogs[0].privacyVersion, versions.privacyVersion);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await prisma.user.count({ where: { id } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { userId: id } }), 0);
  console.log('PASS: aceite e auditoria lidos no PostgreSQL; transação de teste revertida, sem alterar dados existentes.');
}
main().catch(() => { console.error('Falha na verificação transacional de aceite. Verifique migração e conexão.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
