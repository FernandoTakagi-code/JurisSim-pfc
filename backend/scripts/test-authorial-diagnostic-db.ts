import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertDisposableDatabase } from '../src/__tests__/integration/disposable-database';
import { getInitialDiagnosticComposition } from '../src/services/initial-diagnostic-composition';
import { PrismaInitialDiagnosticRepository } from '../src/repositories/prisma-initial-diagnostic-repository';
import { PrismaInitialDiagnosticResolutionRepository } from '../src/repositories/prisma-initial-diagnostic-resolution-repository';
import { InitialDiagnosticService } from '../src/services/initial-diagnostic-service';
import { InitialDiagnosticResolutionService } from '../src/services/initial-diagnostic-resolution-service';

// Synthetic content only. No dotenv or arbitrary target. Identity is checked
// before the first write; only the disposable harness can run this scenario.
const prisma = new PrismaClient();
async function main() {
  const target = await assertDisposableDatabase(prisma);
  const suffix = randomUUID();
  const admin = await prisma.user.create({ data: { nome: 'FIXTURE_ONLY reviewer', email: `${suffix}@example.invalid`, role: 'ADMIN' } });
  const student = await prisma.user.create({ data: { nome: 'FIXTURE_ONLY student', email: `student-${suffix}@example.invalid`, role: 'ALUNO' } });
  const date = new Date().toISOString();
  const fixture = { practiceTopics: [], questions: getInitialDiagnosticComposition('AUTORAL_30').flatMap((slot, index) =>
    [0, 1].map(n => ({
      enunciado: `FIXTURE_ONLY estrutura de importação e diagnóstico ${suffix}-${index}-${n}.`,
      disciplina: slot.discipline, assunto: 'FIXTURE_ONLY', nivel: slot.level, origem: 'IA',
      fundamentacaoJuridica: 'FIXTURE_ONLY sem conteúdo jurídico nem aprovação humana real.',
      alternativas: [...'ABCD'].map((letra, i) => ({ letra, texto: `FIXTURE_ONLY ${letra}`, correta: i === 0 })),
      source: { name: 'FIXTURE_ONLY', reference: `fixture:${suffix}-${index}-${n}`, licenseOrAuthorization: 'FIXTURE_ONLY' },
      legalReview: { reviewerId: admin.id, reviewedAt: date, evidenceRef: 'FIXTURE_ONLY' },
      pedagogicalReview: { reviewerId: admin.id, reviewedAt: date, evidenceRef: 'FIXTURE_ONLY' },
      release: { releasedById: admin.id, releasedAt: date, evidenceRef: 'FIXTURE_ONLY' },
    }))) };
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'jurissim-authorial-fixture-')), 'batch.json');
  writeFileSync(file, JSON.stringify(fixture), { flag: 'wx' });
  const args = ['--import', 'tsx', 'scripts/import-eligible-question-batch.ts', '--input', file,
    '--mode', 'AUTORAL_30', '--scope', 'DIAGNOSTIC_ONLY'];
  const env = { ...process.env, NODE_ENV: 'test', JURISSIM_QUESTION_IMPORT_STAGE: 'development',
    QUESTION_IMPORT_DATABASE_URL: target.url, QUESTION_IMPORT_ALLOWED_HOST: '127.0.0.1', QUESTION_IMPORT_ADMIN_ID: admin.id };
  const invoke = (apply = false) => execFileSync(process.execPath, [...args, ...(apply ? ['--apply'] : [])],
    { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8', windowsHide: true, stdio: 'pipe', timeout: 120_000 });
  const before = await prisma.questao.count();
  invoke();
  assert.equal(await prisma.questao.count(), before, 'preview must not persist anything');
  invoke(true);
  assert.equal(await prisma.questao.count(), before + 30);
  const imported = await prisma.questao.findMany({ where: { autorId: admin.id }, include: { alternativas: true } });
  assert.equal(imported.length, 30);
  assert(imported.every(q => q.origem === 'IA' && q.alternativas.length === 4));
  assert.throws(() => invoke(true));
  assert.equal(await prisma.questao.count(), before + 30, 'duplicate batch must leave no partial writes');
  console.log('PASS: authorial CLI preview, atomic import, A-D alternatives and duplicate refusal on disposable PostgreSQL');

  const repository = new PrismaInitialDiagnosticRepository(prisma);
  const service = new InitialDiagnosticService(repository, () => 0, 'AUTORAL_30');
  const created = await service.getOrCreate(student.id);
  if (created.status !== 'IN_PROGRESS') throw new Error('Expected authorial diagnostic.');
  assert.equal(new Set(created.attempt.orderedQuestionIds).size, 30);
  for (const slot of getInitialDiagnosticComposition('AUTORAL_30')) {
    assert.equal(imported.filter(q => created.attempt.orderedQuestionIds.includes(q.id)
      && q.disciplina === slot.discipline && q.nivel === slot.level).length, 2);
  }
  const recovered = await service.getOrCreate(student.id);
  if (recovered.status === 'INSUFFICIENT') throw new Error('Persisted attempt was not recovered.');
  assert.deepEqual(recovered.attempt, created.attempt);
  const resolution = new InitialDiagnosticResolutionService(new PrismaInitialDiagnosticResolutionRepository(prisma));
  const questions = await resolution.getQuestions(student.id, created.attempt.id);
  assert(!JSON.stringify(questions).includes('"correct"'));
  for (const [index, question] of questions.entries()) {
    const stored = imported.find(q => q.id === question.id)!;
    const chosen = stored.alternativas.find(a => a.correta === (index < 15))!;
    const saved = await resolution.saveAnswer(student.id, created.attempt.id, question.id, chosen.id);
    assert(!('correct' in saved));
  }
  const result = await resolution.finalize(student.id, created.attempt.id);
  assert.equal(result.totalQuestions, 30);
  assert.equal(result.correctAnswers, 15);
  assert.equal(result.overallPercentage, 50);
  const finalRecovery = await service.getOrCreate(student.id);
  assert.equal(finalRecovery.status, 'COMPLETED');
  assert.equal(finalRecovery.attempt.id, created.attempt.id);
  console.log('PASS: authorial selection, recovery, 30 answers, 15/30 correction, 50% result and completed-attempt preservation');
}
main().catch(() => {
  console.error('Authorial database scenario failed; driver details suppressed. No external target is accepted.');
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
