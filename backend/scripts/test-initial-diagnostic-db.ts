import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { assertDisposableDatabase } from '../src/__tests__/integration/disposable-database';
import { PrismaInitialDiagnosticRepository } from '../src/repositories/prisma-initial-diagnostic-repository';
import { PrismaInitialDiagnosticResolutionRepository } from '../src/repositories/prisma-initial-diagnostic-resolution-repository';
import { INITIAL_DIAGNOSTIC_COMPOSITION } from '../src/services/initial-diagnostic-composition';
import { InitialDiagnosticService } from '../src/services/initial-diagnostic-service';
import { InitialDiagnosticResolutionService } from '../src/services/initial-diagnostic-resolution-service';

// This script is intentionally reachable only through the disposable-database
// harness. It never loads dotenv or accepts an arbitrary database URL.
const prisma = new PrismaClient();
const db = prisma as any;
const runId = randomUUID();
const id = (name: string) => `${name}-${runId}`;

async function main() {
  await assertDisposableDatabase(prisma);

  const adminId = id('admin');
  const studentId = id('student');
  const rollbackStudentId = id('rollback-student');
  const concurrentStudentId = id('concurrent-student');
  const teacherId = id('teacher');
  await db.user.createMany({ data: [
    { id: adminId, nome: 'Integration reviewer', email: `${adminId}@example.invalid`, senhaHash: 'test-only', role: 'ADMIN' },
    { id: studentId, nome: 'Integration student', email: `${studentId}@example.invalid`, senhaHash: 'test-only', role: 'ALUNO' },
    { id: rollbackStudentId, nome: 'Rollback student', email: `${rollbackStudentId}@example.invalid`, senhaHash: 'test-only', role: 'ALUNO' },
    { id: concurrentStudentId, nome: 'Concurrent student', email: `${concurrentStudentId}@example.invalid`, senhaHash: 'test-only', role: 'ALUNO' },
    { id: teacherId, nome: 'Private question author', email: `${teacherId}@example.invalid`, senhaHash: 'test-only', role: 'PROFESSOR' },
  ] });
  const turma = await db.turma.create({ data: { nome: 'Private integration class', codigoConvite: id('invite') } });

  const candidates: { id: string; discipline: string; level: string; origin: string }[] = [];
  for (const slot of INITIAL_DIAGNOSTIC_COMPOSITION) {
    for (let n = 0; n < slot.quantity; n++) {
      const questionId = randomUUID();
      const official = slot.origin === 'OAB_OFICIAL';
      candidates.push({ id: questionId, discipline: slot.discipline, level: slot.level, origin: slot.origin });
      await db.questao.create({ data: {
        id: questionId,
        enunciado: `Enunciado original de integração ${questionId} com conteúdo suficiente.`,
        disciplina: slot.discipline,
        assunto: 'Assunto de teste',
        nivel: slot.level,
        fundamentacaoJuridica: 'Fundamentação fictícia exclusiva do teste local.',
        publica: true,
        autorId: adminId,
        origem: slot.origin,
        revisaoJuridicaEm: new Date(), revisorJuridicoId: adminId,
        revisaoPedagogicaEm: new Date(), revisorPedagogicoId: adminId,
        liberadaAcervoEm: new Date(), liberadaAcervoPorId: adminId,
        ...(official ? {
          situacaoDireitos: 'AUTORIZADA', direitosVerificadosEm: new Date(), direitosVerificadosPorId: adminId,
          oabExame: 'integration-fixture', oabEdicao: 'fixture', oabTipoProva: 'Tipo 1', oabNumeroQuestao: candidates.length,
          fonteOficialUrl: 'https://example.invalid/fixture.pdf', situacaoQuestaoOficial: 'VALIDA',
          fonteNome: 'Fixture local', fonteReferencia: 'Fixture local', licencaOuAutorizacao: 'Somente dados fictícios de teste',
        } : {}),
        alternativas: { create: ['A', 'B', 'C', 'D'].map((letra, index) => ({
          letra, texto: `Alternativa ${letra} fictícia`, correta: index === 0,
        })) },
      } });
    }
  }

  const excludedFixtures = [
    { label: 'private', autorId: teacherId, turmaId: turma.id, publica: false, origem: 'PROFESSOR' },
    { label: 'unreviewed', autorId: adminId, publica: true, origem: 'IA', omitReview: true },
    { label: 'annulled', autorId: adminId, publica: true, origem: 'OAB_OFICIAL', annulled: true },
    { label: 'no-rights', autorId: adminId, publica: true, origem: 'OAB_OFICIAL', noRights: true },
    { label: 'bad-alternatives', autorId: adminId, publica: true, origem: 'IA', badAlternatives: true },
  ];
  const excludedIds: string[] = [];
  for (const fixture of excludedFixtures) {
    const questionId = id(`excluded-${fixture.label}`);
    excludedIds.push(questionId);
    const isOfficial = fixture.origem === 'OAB_OFICIAL';
    const omitReview = 'omitReview' in fixture;
    const noRights = 'noRights' in fixture;
    await db.questao.create({ data: {
      id: questionId,
      enunciado: `Enunciado fictício excluído ${fixture.label} com conteúdo suficiente.`,
      disciplina: 'Direito Constitucional', assunto: 'Assunto de teste', nivel: 'BASICO',
      fundamentacaoJuridica: 'Fundamentação fictícia de teste.', publica: fixture.publica,
      autorId: fixture.autorId, turmaId: 'turmaId' in fixture ? fixture.turmaId : null, origem: fixture.origem,
      ...(!omitReview ? {
        revisaoJuridicaEm: new Date(), revisorJuridicoId: adminId,
        revisaoPedagogicaEm: new Date(), revisorPedagogicoId: adminId,
        liberadaAcervoEm: new Date(), liberadaAcervoPorId: adminId,
      } : {}),
      ...(isOfficial ? {
        situacaoDireitos: noRights ? 'NEGADA' : 'AUTORIZADA',
        direitosVerificadosEm: new Date(), direitosVerificadosPorId: adminId,
        oabExame: 'integration-fixture', oabEdicao: 'fixture', oabTipoProva: 'Tipo 1', oabNumeroQuestao: 99,
        fonteOficialUrl: 'https://example.invalid/fixture.pdf',
        situacaoQuestaoOficial: 'annulled' in fixture ? 'ANULADA' : 'VALIDA',
        fonteNome: 'Fixture local', fonteReferencia: 'Fixture local', licencaOuAutorizacao: 'Somente dados fictícios',
      } : {}),
      alternativas: { create: ('badAlternatives' in fixture ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D']).map((letra, index) => ({
        letra, texto: `Alternativa ${letra}`, correta: index === 0,
      })) },
    } });
  }

  const repository = new PrismaInitialDiagnosticRepository(prisma);
  const inventory = await repository.listEligibleInventory();
  assert.equal(inventory.length, 30, 'only the 30 complete approved fixtures should be eligible');
  assert.deepEqual(new Set(inventory.map(question => question.id)), new Set(candidates.map(question => question.id)));
  assert.ok(excludedIds.every(questionId => !inventory.some(question => question.id === questionId)));
  console.log('PASS: inventory accepts the 30 approved fixtures and excludes private, unreviewed, annulled, unauthorized, and malformed questions');

  const service = new InitialDiagnosticService(repository, () => 0);
  const created = await service.getOrCreate(studentId);
  if (created.status !== 'IN_PROGRESS') throw new Error(`Expected a ready initial diagnostic, got ${created.status}.`);
  assert.equal(created.attempt.orderedQuestionIds.length, 30);
  const links = await db.questaoSimulado.findMany({
    where: { simuladoId: created.attempt.id }, orderBy: { posicao: 'asc' }, select: { posicao: true, questaoId: true },
  });
  assert.deepEqual(links.map((link: { posicao: number }) => link.posicao), Array.from({ length: 30 }, (_, index) => index + 1));
  assert.deepEqual(links.map((link: { questaoId: string }) => link.questaoId), [...created.attempt.orderedQuestionIds]);
  const recovered = await repository.findInitialAttempt(studentId);
  assert.deepEqual(recovered, created.attempt);
  console.log('PASS: exactly 30 ordered links persist atomically and recovery returns the same attempt');

  const beforeRollback = await db.simulado.count({ where: { alunoId: rollbackStudentId } });
  await assert.rejects(repository.createInitialOrGetExisting({
    studentId: rollbackStudentId,
    orderedQuestionIds: Array.from({ length: 30 }, (_, index) => id(`missing-${index}`)),
  }));
  assert.equal(await db.simulado.count({ where: { alunoId: rollbackStudentId } }), beforeRollback);
  assert.equal(await db.diagnosticoInicial.count({ where: { alunoId: rollbackStudentId } }), 0);
  console.log('PASS: invalid question FK causes full transaction rollback with no orphan Simulado or identity');

  const concurrent = await Promise.all([service.getOrCreate(concurrentStudentId), service.getOrCreate(concurrentStudentId)]);
  const concurrentAttemptIds = concurrent.map(result => {
    if (result.status !== 'IN_PROGRESS') throw new Error('Expected both concurrent calls to return an in-progress diagnostic.');
    return result.attempt.id;
  });
  assert.equal(concurrentAttemptIds[0], concurrentAttemptIds[1]);
  assert.equal(await db.diagnosticoInicial.count({ where: { alunoId: concurrentStudentId } }), 1);
  assert.equal(await db.simulado.count({ where: { alunoId: concurrentStudentId, tipo: 'DIAGNOSTICO' } }), 1);
  console.log('PASS: concurrent requests converge to one initial diagnostic identity and Simulado');

  const resolution = new InitialDiagnosticResolutionService(new PrismaInitialDiagnosticResolutionRepository(prisma));
  const diagnosticQuestions = await resolution.getQuestions(studentId, created.attempt.id);
  for (const [index, question] of diagnosticQuestions.entries()) {
    const alternatives = await db.alternativa.findMany({ where: { questaoId: question.id }, orderBy: { letra: 'asc' } });
    const chosen = alternatives.find((alternative: { correta: boolean }) => alternative.correta === (index !== 0));
    const saved = await resolution.saveAnswer(studentId, created.attempt.id, question.id, chosen.id);
    assert.equal(saved.correct, index !== 0, 'feedback correctness must come from the persisted alternative');
    assert.ok(saved.explanation.length > 0, 'immediate feedback must include the reviewed question foundation');
  }
  const adaptiveResult = await resolution.finalize(studentId, created.attempt.id);
  assert.equal(adaptiveResult.totalQuestions, 30);
  assert.ok(adaptiveResult.performances.some((metric: { tipo: string }) => metric.tipo === 'DISCIPLINA'));
  assert.ok(adaptiveResult.trail && adaptiveResult.trail.disciplinaPrioritaria);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: studentId } })).nivelAtual, adaptiveResult.level);
  assert.equal(await db.trilhaAdaptativa.count({ where: { simuladoId: created.attempt.id } }), 1);
  console.log('PASS: initial diagnostic persists immediate per-question feedback, adaptive metrics/trail and current level atomically');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
