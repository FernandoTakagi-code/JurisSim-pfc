import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaQuestionImportDatabase } from '../src/repositories/prisma-question-import-database';
import { QuestionImportRepository } from '../src/repositories/question-import-repository';
import { assertDisposableDatabase } from '../src/__tests__/integration/disposable-database';

const client = new PrismaClient();
const q = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function main() {
  await assertDisposableDatabase(client);
  const suffix = randomUUID();
  const admin = await client.user.create({
    data: { nome: 'Integration fixture', email: `${suffix}@example.invalid`, role: 'ADMIN' },
  });
  const repository = new QuestionImportRepository(new PrismaQuestionImportDatabase(client));
  const record = (fingerprint: string, line = 2, optionText = 'Alternativa válida') => ({
    fingerprint,
    enunciado: `Enunciado de integração ${suffix} com extensão suficiente`,
    disciplina: 'Direito Civil',
    assunto: 'Obrigações',
    nivel: 'BASICO' as const,
    fundamentacaoJuridica: 'Fundamentação fictícia para teste local.',
    publica: true as const,
    fonteNome: 'Fonte fictícia de teste',
    fonteReferencia: 'fixture://questao',
    licencaOuAutorizacao: 'Conteúdo original, criado para teste.',
    alternativas: [
      { texto: optionText, correta: true },
      { texto: 'Outra alternativa fictícia', correta: false },
    ],
    line,
  });
  const csv = `integration fixture ${suffix}`;

  // Two NULL fingerprints are allowed while the historical duplicate-aware backfill is pending.
  const legacyA = await client.questao.create({ data: {
    enunciado: `Questão legada ${suffix}`, disciplina: 'Civil', assunto: 'Fixture', nivel: 'BASICO',
    fundamentacaoJuridica: 'Fixture', autorId: admin.id,
  } });
  const legacyB = await client.questao.create({ data: {
    enunciado: `Questão legada ${suffix}`, disciplina: 'Civil', assunto: 'Fixture', nivel: 'BASICO',
    fundamentacaoJuridica: 'Fixture', autorId: admin.id,
  } });
  assert.equal(legacyA.fingerprint, null);
  assert.equal(legacyB.fingerprint, null);

  const fingerprint = `import-${suffix}`;
  const imported = await repository.persistAtomically(admin.id, csv, [record(fingerprint)]);
  assert.equal(imported.imported, 1);
  assert.equal(await client.questao.count({ where: { fingerprint } }), 1);
  assert.equal(await client.alternativa.count({ where: { questaoId: imported.questions[0].id } }), 2);
  await assert.rejects(repository.persistAtomically(admin.id, `${csv} duplicate`, [record(fingerprint)]), { statusCode: 409 });

  // Fail the nested alternative insert at PostgreSQL level and ensure all earlier writes roll back.
  const triggerName = `import_alt_fail_${suffix.replaceAll('-', '')}`;
  const functionName = `${triggerName}_fn`;
  const rollbackFingerprint = `rollback-${suffix}`;
  await client.$executeRawUnsafe(`CREATE FUNCTION public.${q(functionName)}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.texto = 'TRIGGER_FAIL_${suffix}' THEN RAISE EXCEPTION 'fixture alternative failure'; END IF; RETURN NEW; END $$`);
  await client.$executeRawUnsafe(`CREATE TRIGGER ${q(triggerName)} BEFORE INSERT ON public."Alternativa" FOR EACH ROW EXECUTE FUNCTION public.${q(functionName)}()`);
  try {
    await assert.rejects(repository.persistAtomically(admin.id, `${csv} rollback`, [record(rollbackFingerprint, 2, `TRIGGER_FAIL_${suffix}`)]));
    assert.equal(await client.questao.count({ where: { fingerprint: rollbackFingerprint } }), 0);
    assert.equal(await client.loteImportacao.count({ where: { arquivoHash: createHash('sha256').update(`${csv} rollback`).digest('hex') } }), 0);
  } finally {
    await client.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${q(triggerName)} ON public."Alternativa"`);
    await client.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.${q(functionName)}()`);
  }

  // Both writers race on the same deterministic fingerprint; one may commit only once.
  const concurrentFingerprint = `concurrent-${suffix}`;
  const outcomes = await Promise.allSettled([
    repository.persistAtomically(admin.id, `${csv} concurrent 1`, [record(concurrentFingerprint)]),
    repository.persistAtomically(admin.id, `${csv} concurrent 2`, [record(concurrentFingerprint)]),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
  assert.equal(await client.questao.count({ where: { fingerprint: concurrentFingerprint } }), 1);
  console.log('PASS: import transaction, alternatives, rollback, duplicates, NULL fingerprints and concurrent conflict');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await client.$disconnect(); });
