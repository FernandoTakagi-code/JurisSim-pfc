// Only the harness-owned local cluster is accepted. No production seeds or bypasses.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { prisma } from '../src/lib/prisma';
import { prisma as questionPrisma } from '../src/config/prisma';
import { authRoutes } from '../src/routes/auth-routes';
import { classRoutes, examRoutes } from '../src/routes/class-exam-routes';
import questaoRoutes from '../src/routes/questaoRoutes';
import { diagnosticRoutes } from '../src/routes/diagnostic-routes';
import { trailRoutes } from '../src/routes/trail-routes';
import { studentHistoryRoutes } from '../src/routes/student-history-routes';
import { errorHandler } from '../src/middlewares/error-handler';

let server: Server | undefined; let base: string; let checks = 0;
const pass = (text: string) => { checks++; console.log(`PASS CLASS DB: ${text}`); };
async function request(route: string, token?: string, method = 'GET', body?: unknown) {
  return fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function expectStatus(route: string, token: string | undefined, method = 'GET', body?: unknown, status = 200) {
  const response = await request(route, token, method, body);
  assert.equal(response.status, status, `${method} ${route} returned ${response.status}, expected ${status}`);
  return response.json();
}
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.username, 'jurissim_migration_test'); assert.equal(url.password, process.env.JURISSIM_TEST_DB_PASSWORD);
  assert.equal(url.pathname, `/${process.env.JURISSIM_TEST_FRESH_DATABASE}`); assert.ok(url.port && url.port !== '5432');
  assert.equal(process.env.DIRECT_URL, url.toString()); assert.equal(process.env.GMAIL_USER, ''); assert.equal(process.env.GMAIL_APP_PASSWORD, ''); assert.equal(process.env.GROQ_API_KEY, '');
  const expected = fs.realpathSync(process.argv[2] ?? '');
  assert.equal(path.dirname(path.dirname(expected)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(path.dirname(expected)).startsWith('jurissim-migrations-'));
  const [cluster] = await prisma.$queryRaw<{ data_directory: string; database: string; owner: string; port: number; address: string }[]>`
    SELECT current_setting('data_directory') AS data_directory, current_database() AS database,
      current_user AS owner, inet_server_port() AS port, host(inet_server_addr()) AS address`;
  assert.equal(cluster.database, process.env.JURISSIM_TEST_FRESH_DATABASE);
  assert.equal(cluster.owner, 'jurissim_migration_test'); assert.equal(cluster.port, Number(url.port)); assert.equal(cluster.address, '127.0.0.1');
  assert.equal(fs.realpathSync(cluster.data_directory).toLowerCase(), expected.toLowerCase());
  const hash = await bcrypt.hash('classes-fixture-password', 4);
  const people: Record<string, { id: string; email: string; token: string }> = {};
  const app = express(); app.use(express.json()); app.use('/auth', authRoutes); app.use('/turmas', classRoutes); app.use('/avaliacoes', examRoutes);
  app.use('/questoes', questaoRoutes); app.use('/diagnostics', diagnosticRoutes); app.use('/trilhas', trailRoutes); app.use('/students/me', studentHistoryRoutes); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const [name, role] of [['teacherA', 'PROFESSOR'], ['teacherB', 'PROFESSOR'], ['alice', 'ALUNO'], ['bob', 'ALUNO'], ['carol', 'ALUNO'], ['admin', 'ADMIN'], ['pending', 'ALUNO']] as const) {
    const user = await prisma.user.create({ data: { nome: 'Classes fixture ' + name, email: `classes-${name}@example.invalid`, senhaHash: hash, role, emailVerifiedAt: name === 'pending' ? null : new Date() } });
    const login = await expectStatus('/auth/login', undefined, 'POST', { email: user.email, senha: 'classes-fixture-password' });
    people[name] = { id: user.id, email: user.email, token: login.token };
  }
  const a = people.teacherA.token, b = people.teacherB.token, alice = people.alice.token, bob = people.bob.token;
  assert.deepEqual((await expectStatus('/turmas', a)).items, []);
  assert.deepEqual((await expectStatus('/avaliacoes', alice)).items, []);
  const ca = await expectStatus('/turmas', a, 'POST', { nome: 'Class A fixture' }, 201);
  const cb = await expectStatus('/turmas', b, 'POST', { nome: 'Class B fixture' }, 201);
  const classA = ca.turma.id, classB = cb.turma.id;
  assert.match(ca.inviteCode, /^[A-Za-z0-9_-]{32}$/);
  const stored = await prisma.turma.findUniqueOrThrow({ where: { id: classA } });
  assert.equal(stored.codigoConvite, 'sha256:' + createHash('sha256').update(ca.inviteCode).digest('hex'));
  for (const token of [a, alice, people.admin.token]) {
    const response = await request('/turmas', token); assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text(); assert.ok(!text.includes(ca.inviteCode) && !text.includes(stored.codigoConvite));
  }
  await expectStatus(`/turmas/${classA}`, a, 'PATCH', { nome: 'Class A renamed' });
  await expectStatus(`/turmas/${classA}`, b, 'PATCH', { nome: 'Hijack' }, 404);
  await expectStatus(`/turmas/${classA}/invite`, b, 'POST', undefined, 404);
  pass('class create/edit, ownership, one-time high-entropy invitation and hash-only persistence');

  const joins = await Promise.all([1, 2].map(() => expectStatus('/turmas/join', alice, 'POST', { code: ca.inviteCode })));
  assert.equal(joins.filter(value => value.joined).length, 1);
  await expectStatus('/turmas/join', bob, 'POST', { code: cb.inviteCode });
  assert.equal((await prisma.turma.findUniqueOrThrow({ where: { id: classA }, include: { alunos: true } })).alunos.length, 1);
  const rotated = await expectStatus(`/turmas/${classA}/invite`, a, 'POST');
  await expectStatus('/turmas/join', people.carol.token, 'POST', { code: ca.inviteCode }, 404);
  await expectStatus('/turmas/join', people.carol.token, 'POST', { code: rotated.inviteCode });
  await prisma.turma.update({ where: { id: classA }, data: { conviteExpiraEm: new Date(0) } });
  await expectStatus('/turmas/join', bob, 'POST', { code: rotated.inviteCode }, 404);
  const roster = await expectStatus(`/turmas/${classA}/students`, a);
  assert.deepEqual(roster.items.map((s: { id: string }) => s.id).sort(), [people.alice.id, people.carol.id].sort());
  assert.ok(!(await expectStatus('/turmas/students', b)).items.some((s: { id: string }) => s.id === people.alice.id));
  await expectStatus(`/turmas/${classA}/students`, b, 'GET', undefined, 404);
  await expectStatus(`/turmas/${classA}/students`, alice, 'GET', undefined, 403);
  pass('concurrent enrollment is unique; rotated/expired codes fail and roster is isolated by managed class');

  const question = await prisma.questao.create({ data: { enunciado: 'Classes fixture question', disciplina: 'Classes Civil', assunto: 'Contratos', nivel: 'BASICO', fundamentacaoJuridica: 'Fixture', publica: true, autorId: people.teacherA.id,
    alternativas: { create: [{ texto: 'Correct fixture answer', correta: true }, { texto: 'Wrong fixture answer', correta: false }] } }, include: { alternativas: true } });
  const privateQuestion = await prisma.questao.create({ data: { enunciado: 'Private class B question', disciplina: 'Private', assunto: 'Class B', nivel: 'BASICO', fundamentacaoJuridica: 'Fixture', publica: false, autorId: people.teacherB.id, turmaId: classB,
    alternativas: { create: [{ texto: 'Correct', correta: true }, { texto: 'Wrong', correta: false }] } } });
  const input = { titulo: 'Class A exam', descricao: 'Real local persistence fixture', duracaoSegundos: 60, turmaIds: [classA], questaoIds: [question.id] };
  await expectStatus('/avaliacoes', a, 'POST', { ...input, turmaIds: [classB] }, 403);
  await expectStatus('/avaliacoes', a, 'POST', { ...input, questaoIds: [privateQuestion.id] }, 403);
  await expectStatus('/avaliacoes', a, 'POST', { ...input, questaoIds: [question.id, question.id] }, 422);
  const exam = await expectStatus('/avaliacoes', a, 'POST', input, 201);
  await expectStatus(`/avaliacoes/${exam.id}`, a, 'PUT', { ...input, titulo: 'Updated class A exam' });
  await expectStatus(`/avaliacoes/${exam.id}`, b, 'PUT', input, 404);
  await expectStatus(`/avaliacoes/${exam.id}/publish`, b, 'POST', undefined, 404);
  assert.equal((await expectStatus('/avaliacoes', alice)).items.length, 0);
  await expectStatus(`/avaliacoes/${exam.id}/attempts`, alice, 'POST', undefined, 404);
  await expectStatus(`/questoes/${question.id}`, a, 'PUT', { enunciado: 'Forbidden question mutation' }, 409);
  await expectStatus(`/avaliacoes/${exam.id}/publish`, a, 'POST');
  await expectStatus(`/avaliacoes/${exam.id}`, a, 'PUT', input, 409);
  assert.equal((await expectStatus('/avaliacoes', alice)).items.length, 1);
  assert.equal((await expectStatus('/avaliacoes', bob)).items.length, 0);
  await expectStatus(`/avaliacoes/${exam.id}/attempts`, bob, 'POST', undefined, 404);
  pass('draft creation/edit/publication, authorized question bank, class isolation and published question immutability');

  const concurrent = await Promise.all([1, 2].map(() => expectStatus(`/avaliacoes/${exam.id}/attempts`, alice, 'POST')));
  assert.equal(concurrent[0].id, concurrent[1].id); const attemptId = concurrent[0].id;
  assert.equal(await prisma.simulado.count({ where: { alunoId: people.alice.id, avaliacaoId: exam.id } }), 1);
  let attempt = await expectStatus(`/avaliacoes/attempts/${attemptId}`, alice);
  assert.equal(attempt.status, 'IN_PROGRESS'); assert.equal(attempt.result, null);
  assert.ok(attempt.questions.every((q: { alternatives: object[] }) => q.alternatives.every(option => !('correta' in option) && !('correct' in option))));
  await expectStatus(`/avaliacoes/attempts/${attemptId}`, bob, 'GET', undefined, 404);
  await expectStatus(`/avaliacoes/attempts/${attemptId}/finalize`, bob, 'POST', undefined, 404);
  await expectStatus(`/diagnostics/${attemptId}/result`, alice, 'GET', undefined, 404);
  await expectStatus(`/trilhas/attempts/${attemptId}/result`, alice, 'GET', undefined, 404);
  const correct = question.alternativas.find(q => q.correta)!, wrong = question.alternativas.find(q => !q.correta)!;
  await expectStatus(`/avaliacoes/attempts/${attemptId}/answers/${question.id}`, alice, 'PUT', { selectedOptionId: privateQuestion.id }, 422);
  await expectStatus(`/avaliacoes/attempts/${attemptId}/answers/${question.id}`, alice, 'PUT', { selectedOptionId: wrong.id });
  await expectStatus(`/avaliacoes/attempts/${attemptId}/answers/${question.id}`, alice, 'PUT', { selectedOptionId: correct.id });
  await prisma.$disconnect();
  const loginAgain = await expectStatus('/auth/login', undefined, 'POST', { email: people.alice.email, senha: 'classes-fixture-password' });
  attempt = await expectStatus(`/avaliacoes/attempts/${attemptId}`, loginAgain.token);
  assert.equal(attempt.questions[0].selectedOptionId, correct.id);
  assert.equal(await prisma.resposta.count({ where: { simuladoId: attemptId } }), 1);
  assert.equal((await expectStatus(`/avaliacoes/${exam.id}/attempts`, loginAgain.token, 'POST')).id, attemptId);
  const result = await expectStatus(`/avaliacoes/attempts/${attemptId}/finalize`, loginAgain.token, 'POST');
  assert.equal(result.overallPercentage, 100);
  assert.ok(await prisma.desempenhoDiagnostico.count({ where: { simuladoId: attemptId } }) > 0);
  assert.deepEqual(await expectStatus(`/avaliacoes/attempts/${attemptId}/finalize`, alice, 'POST'), result);
  await expectStatus(`/avaliacoes/attempts/${attemptId}/answers/${question.id}`, alice, 'PUT', { selectedOptionId: wrong.id }, 409);
  assert.equal((await expectStatus(`/avaliacoes/attempts/${attemptId}`, alice)).status, 'COMPLETED');
  const overview = await expectStatus('/students/me/overview', alice);
  assert.equal(overview.totals.completedExams, 1); assert.equal(overview.totals.completedTrails, 0);
  assert.equal(overview.latestDiagnosticId, null);
  assert.equal((await expectStatus('/students/me/activities', alice)).items[0].type, 'AVALIACAO');
  pass('one durable attempt per student; answers persist across login/reconnection, finalize stores results, history counts real class exams');

  const timedExam = await expectStatus('/avaliacoes', a, 'POST', { ...input, titulo: 'Timed fixture' }, 201);
  await expectStatus(`/avaliacoes/${timedExam.id}/publish`, a, 'POST');
  const timed = await expectStatus(`/avaliacoes/${timedExam.id}/attempts`, alice, 'POST');
  await prisma.simulado.update({ where: { id: timed.id }, data: { iniciadoEm: new Date(Date.now() - 120000) } });
  assert.equal((await expectStatus(`/avaliacoes/attempts/${timed.id}`, alice)).status, 'EXPIRED');
  await expectStatus(`/avaliacoes/attempts/${timed.id}/answers/${question.id}`, alice, 'PUT', { selectedOptionId: correct.id }, 409);
  const expiredResult = await expectStatus(`/avaliacoes/attempts/${timed.id}/finalize`, alice, 'POST');
  assert.equal(expiredResult.correctAnswers, 0); assert.equal(expiredResult.unansweredQuestions, 1);
  pass('server-enforced duration rejects late answers and records unanswered questions on finalization');

  const shared = await expectStatus('/avaliacoes', a, 'POST', { ...input, duracaoSegundos: null, titulo: 'Archive fixture' }, 201);
  await expectStatus(`/avaliacoes/${shared.id}/publish`, a, 'POST');
  const active = await expectStatus(`/avaliacoes/${shared.id}/attempts`, alice, 'POST');
  await expectStatus(`/turmas/${classA}`, a, 'PATCH', { archived: true });
  await expectStatus(`/turmas/${classA}/invite`, a, 'POST', undefined, 404);
  await expectStatus(`/avaliacoes/${shared.id}/attempts`, people.carol.token, 'POST', undefined, 404);
  await expectStatus(`/avaliacoes/attempts/${active.id}/answers/${question.id}`, alice, 'PUT', { selectedOptionId: correct.id });
  await expectStatus(`/avaliacoes/attempts/${active.id}/finalize`, alice, 'POST');
  assert.equal((await expectStatus('/avaliacoes', alice)).items.length, 0);
  assert.equal((await expectStatus(`/avaliacoes/attempts/${attemptId}`, alice)).result.overallPercentage, 100);
  assert.equal((await expectStatus(`/turmas/${classA}/students`, a)).items.length, 2);
  await expectStatus(`/turmas/${classA}`, a, 'PATCH', { nome: 'Cannot edit archived' }, 409);
  pass('archiving stops new enrollment/start and preserves rosters, open attempts and existing results');

  for (const token of [undefined, people.pending.token]) {
    for (const route of ['/turmas', '/avaliacoes']) await expectStatus(route, token, 'GET', undefined, token ? 403 : 401);
  }
  await expectStatus('/turmas', alice, 'POST', { nome: 'Forbidden' }, 403);
  await expectStatus('/avaliacoes', alice, 'POST', input, 403);
  await expectStatus('/turmas/join', a, 'POST', { code: rotated.inviteCode }, 403);
  await expectStatus(`/avaliacoes/attempts/${attemptId}`, people.admin.token, 'GET', undefined, 403);
  await expectStatus(`/turmas/${classB}`, people.admin.token, 'PATCH', { nome: 'Administrative rename' });
  await prisma.user.update({ where: { id: people.teacherB.id }, data: { role: 'ALUNO' } });
  await expectStatus(`/turmas/${classB}`, b, 'PATCH', { nome: 'Stale permission' }, 403);
  const revoked = jwt.sign({ id: people.alice.id, role: 'ADMIN', sessionVersion: 9 }, process.env.JWT_SECRET!);
  await expectStatus('/avaliacoes', revoked, 'GET', undefined, 401);
  pass('confirmation, actual role, revocation and explicit administrative scope remain enforced');
  console.log(`PostgreSQL class/exam integration: ${checks} scenarios passed.`);
}
main().catch(error => { console.error('Local class/exam integration failed:', error.message); process.exitCode = 1; })
  .finally(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); await prisma.$disconnect(); await questionPrisma.$disconnect(); });
