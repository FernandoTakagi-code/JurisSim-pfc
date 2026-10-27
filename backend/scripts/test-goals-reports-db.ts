// Run only on the harness-owned disposable local cluster. No dotenv or remote URLs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { prisma } from '../src/lib/prisma';
import { authRoutes } from '../src/routes/auth-routes';
import { classRoutes, examRoutes } from '../src/routes/class-exam-routes';
import { goalRoutes, reportRoutes } from '../src/routes/goals-reports-routes';
import { errorHandler } from '../src/middlewares/error-handler';

let server: Server | undefined, base: string, checks = 0;
const pass = (text: string) => { checks++; console.log(`PASS GOAL/REPORT DB: ${text}`); };
async function request(route: string, token?: string, method = 'GET', body?: unknown, status = 200) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, status, `${method} ${route} returned ${response.status}, expected ${status}`);
  return response.json();
}
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.username, 'jurissim_migration_test'); assert.equal(url.password, process.env.JURISSIM_TEST_DB_PASSWORD);
  assert.equal(url.pathname, `/${process.env.JURISSIM_TEST_FRESH_DATABASE}`); assert.ok(url.port && url.port !== '5432'); assert.equal(process.env.DIRECT_URL, url.toString());
  assert.equal(process.env.GMAIL_USER, ''); assert.equal(process.env.GMAIL_APP_PASSWORD, ''); assert.equal(process.env.GROQ_API_KEY, '');
  const expected = fs.realpathSync(process.argv[2] ?? '');
  assert.equal(path.dirname(path.dirname(expected)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(path.dirname(expected)).startsWith('jurissim-migrations-'));
  const [cluster] = await prisma.$queryRaw<{ data_directory: string; database: string; owner: string; port: number; address: string }[]>`
    SELECT current_setting('data_directory') AS data_directory, current_database() AS database,
      current_user AS owner, inet_server_port() AS port, inet_server_addr()::text AS address`;
  assert.equal(cluster.database, process.env.JURISSIM_TEST_FRESH_DATABASE);
  assert.equal(cluster.owner, 'jurissim_migration_test'); assert.equal(cluster.port, Number(url.port)); assert.equal(cluster.address, '127.0.0.1');
  assert.equal(fs.realpathSync(cluster.data_directory).toLowerCase(), expected.toLowerCase());
  const app = express(); app.use(express.json()); app.use('/auth', authRoutes); app.use('/turmas', classRoutes); app.use('/avaliacoes', examRoutes);
  app.use('/goals', goalRoutes); app.use('/reports', reportRoutes); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const hash = await bcrypt.hash('goal-report-fixture-password', 4);
  const users: Record<string, { id: string; email: string; token: string }> = {};
  const login = async (email: string) => (await request('/auth/login', undefined, 'POST', { email, senha: 'goal-report-fixture-password' })).token as string;
  for (const [name, role] of [['teacherA', 'PROFESSOR'], ['teacherB', 'PROFESSOR'], ['admin', 'ADMIN'], ['alice', 'ALUNO'], ['bob', 'ALUNO'], ['carol', 'ALUNO'], ['dave', 'ALUNO'], ['eve', 'ALUNO'], ['pending', 'ALUNO']] as const) {
    const user = await prisma.user.create({ data: { nome: 'Goal report fixture ' + name, email: `goal-report-${name}@example.invalid`, senhaHash: hash, role, emailVerifiedAt: name === 'pending' ? null : new Date() } });
    users[name] = { id: user.id, email: user.email, token: await login(user.email) };
  }
  const a = users.teacherA.token, b = users.teacherB.token, admin = users.admin.token, alice = users.alice.token;
  assert.deepEqual((await request('/goals', alice)).items, []);
  assert.deepEqual((await request('/reports/classes', a)).items, []);
  const ca = await request('/turmas', a, 'POST', { nome: 'Reports class A' }, 201);
  const cb = await request('/turmas', b, 'POST', { nome: 'Reports class B' }, 201);
  const classA = ca.turma.id, classB = cb.turma.id;
  for (const name of ['alice', 'carol', 'dave', 'eve']) await request('/turmas/join', users[name].token, 'POST', { code: ca.inviteCode });
  for (const name of ['alice', 'bob']) await request('/turmas/join', users[name].token, 'POST', { code: cb.inviteCode });
  const empty = await request(`/reports/classes/${classA}`, a);
  assert.equal(empty.summary.enrolledStudents, 4); assert.equal(empty.summary.publishedExams, 0);
  assert.equal(empty.summary.meanPercentage, null); assert.equal(empty.summary.participationPercentage, null);
  assert.deepEqual(empty.evolution, []); assert.equal(empty.students.items.length, 4);
  pass('empty goals and reports preserve actual enrollment with null averages and no fictional evolution');

  const questions = [];
  for (let i = 0; i < 2; i++) questions.push(await prisma.questao.create({ data: { enunciado: `Report fixture question ${i}`, disciplina: 'Report Civil', assunto: 'Fixture', nivel: 'BASICO', fundamentacaoJuridica: 'Local fixture', autorId: users.teacherA.id,
    alternativas: { create: [{ texto: 'Correct', correta: true }, { texto: 'Incorrect', correta: false }] } }, include: { alternativas: true } }));
  const exam = async (token: string, title: string, turmaIds: string[], duration: number | null = null) => {
    const result = await request('/avaliacoes', token, 'POST', { titulo: title, descricao: '', duracaoSegundos: duration, turmaIds, questaoIds: questions.map(q => q.id) }, 201);
    await request(`/avaliacoes/${result.id}/publish`, token, 'POST'); return result.id as string;
  };
  const shared = await exam(admin, 'Shared A and B', [classA, classB]);
  const next = await exam(a, 'Second A exam', [classA], 3600);
  const onlyB = await exam(b, 'Private B report exam', [classB]);
  const attempt = async (examId: string, name: string, answers?: boolean[]) => {
    const token = users[name].token;
    const started = await request(`/avaliacoes/${examId}/attempts`, token, 'POST');
    if (answers) {
      for (let i = 0; i < answers.length; i++) await request(`/avaliacoes/attempts/${started.id}/answers/${questions[i].id}`, token, 'PUT', { selectedOptionId: questions[i].alternativas.find(q => q.correta === answers[i])!.id });
      await request(`/avaliacoes/attempts/${started.id}/finalize`, token, 'POST');
    }
    return started.id as string;
  };
  const aliceShared = await attempt(shared, 'alice', [true, false]);
  await attempt(shared, 'carol', []); await attempt(shared, 'bob', [true, true]);
  const aliceNext = await attempt(next, 'alice', [true, true]);
  const carolExpired = await attempt(next, 'carol'); await attempt(next, 'dave');
  await prisma.simulado.update({ where: { id: carolExpired }, data: { iniciadoEm: new Date(Date.now() - 7200000) } });
  const bAttempt = await attempt(onlyB, 'alice', [true, true]);
  const report = await request(`/reports/classes/${classA}`, a);
  assert.equal(report.summary.publishedExams, 2); assert.equal(report.summary.participants, 3); assert.equal(report.summary.participationPercentage, 75);
  assert.equal(report.summary.startedAttempts, 5); assert.equal(report.summary.completedAttempts, 3);
  assert.equal(report.summary.inProgressAttempts, 1); assert.equal(report.summary.expiredAttempts, 1);
  assert.equal(report.summary.meanPercentage, 50); assert.equal(report.summary.meanIncorrectPercentage, 16.67); assert.equal(report.summary.meanUnansweredPercentage, 33.33);
  assert.equal(report.summary.correctAnswers, 3); assert.equal(report.summary.incorrectAnswers, 1); assert.equal(report.summary.unansweredQuestions, 2);
  assert.equal(report.summary.meanCorrectAnswers, 1); assert.equal(report.summary.meanIncorrectAnswers, 0.33);
  assert.deepEqual(report.evolution.map((p: { meanPercentage: number }) => p.meanPercentage), [25, 100]);
  assert.ok(!JSON.stringify(report).includes(users.bob.id) && !JSON.stringify(report).includes('Private B report exam'));
  assert.equal(report.students.items.find((s: { id: string }) => s.id === users.eve.id).meanPercentage, null);
  pass('class report has real participation, attempts, averages, errors and evolution; shared exams exclude students from the other class');

  const individual = await request(`/reports/classes/${classA}/students/${users.alice.id}`, a);
  assert.equal(individual.summary.meanPercentage, 75); assert.equal(individual.attempts.items.length, 2);
  assert.ok(!individual.attempts.items.some((item: { id: string }) => item.id === bAttempt));
  assert.deepEqual(individual.evolution.map((p: { meanPercentage: number }) => p.meanPercentage), [50, 100]);
  const pendingReport = await request(`/reports/classes/${classA}/students/${users.dave.id}`, a);
  assert.equal(pendingReport.attempts.items[0].percentage, null); assert.equal(pendingReport.attempts.items[0].correctAnswers, null);
  await request(`/reports/classes/${classA}/students/${users.bob.id}`, a, 'GET', undefined, 404);
  await request(`/reports/classes/${classA}`, b, 'GET', undefined, 404);
  await request(`/reports/classes/${classB}`, a, 'GET', undefined, 404);
  await request(`/reports/classes/${classA}`, admin, 'GET', undefined, 404);
  assert.deepEqual((await request('/reports/classes', admin)).items, []);
  await prisma.turma.update({ where: { id: classA }, data: { professores: { connect: { id: users.admin.id } } } });
  await request(`/reports/classes/${classA}`, admin);
  await request(`/reports/classes/${classB}`, admin, 'GET', undefined, 404);
  pass('individual reports are class-scoped, unfinished scores stay private and ADMIN requires an explicit responsible-teacher link');

  // Explicit timestamps exercise both local-day boundaries and all existing study types.
  const sharedResponses = await prisma.resposta.findMany({ where: { simuladoId: aliceShared }, orderBy: { questaoId: 'asc' } });
  await prisma.resposta.update({ where: { id: sharedResponses[0].id }, data: { respondidoEm: new Date('2026-10-15T03:00:00Z') } });
  await prisma.resposta.update({ where: { id: sharedResponses[1].id }, data: { respondidoEm: new Date('2026-10-16T02:59:59Z') } });
  const nextResponses = await prisma.resposta.findMany({ where: { simuladoId: aliceNext }, orderBy: { questaoId: 'asc' } });
  await prisma.resposta.update({ where: { id: nextResponses[0].id }, data: { respondidoEm: new Date('2026-10-15T02:59:59Z') } });
  await prisma.resposta.update({ where: { id: nextResponses[1].id }, data: { respondidoEm: new Date('2026-10-16T03:00:00Z') } });
  for (const tipo of ['DIAGNOSTICO', 'PERSONALIZADO'] as const) {
    const personal = await prisma.simulado.create({ data: { tipo, alunoId: users.alice.id, finalizadoEm: new Date(), questoes: { create: { questaoId: questions[0].id, posicao: 1 } } }, include: { questoes: true } });
    await prisma.resposta.create({ data: { simuladoId: personal.id, questaoId: questions[0].id, questaoSimuladoId: personal.questoes[0].id, alternativaEscolhidaId: questions[0].alternativas[0].id, correta: true, respondidoEm: new Date('2026-10-15T12:00:00Z') } });
  }
  assert.equal((await request(`/reports/classes/${classA}/students/${users.alice.id}`, a)).attempts.items.length, 2);
  const goal = await request('/goals', alice, 'POST', { date: '2026-10-15', targetQuestions: 5 }, 201);
  assert.equal(goal.resolvedQuestions, 4); assert.equal(goal.progressPercentage, 80); assert.equal(goal.canComplete, false);
  await request(`/goals/${goal.id}/complete`, alice, 'POST', {}, 409);
  const previousDay = await request('/goals', alice, 'POST', { date: '2026-10-14', targetQuestions: 1 }, 201);
  assert.equal(previousDay.resolvedQuestions, 1);
  const future = await request('/goals', alice, 'POST', { date: '2099-01-01', targetQuestions: 10 }, 201);
  assert.equal(future.resolvedQuestions, 0); assert.equal(future.progressPercentage, 0);
  pass('goal progress uses real diagnostic/trail/exam answers and exact São Paulo day boundaries without counting another student');

  const edited = await request(`/goals/${goal.id}`, alice, 'PATCH', { targetQuestions: 4 });
  assert.equal(edited.canComplete, true);
  const completed = await request(`/goals/${goal.id}/complete`, alice, 'POST', {});
  assert.equal(completed.completed, true); assert.equal(completed.resolvedQuestions, 4);
  assert.deepEqual(await request(`/goals/${goal.id}/complete`, alice, 'POST', {}), completed);
  await request(`/goals/${goal.id}`, alice, 'PATCH', { targetQuestions: 1 }, 409);
  const storedGoal = await prisma.metaDiaria.findUniqueOrThrow({ where: { id: goal.id } });
  assert.equal(storedGoal.cumprida, true); assert.equal(storedGoal.questoesResolvidas, 4);
  assert.equal((await request('/goals?status=completed', alice)).items.length, 1);
  assert.equal((await request('/goals?status=pending', alice)).items.length, 2);
  const ongoing = await request('/goals', alice, 'POST', { date: '2026-10-15', targetQuestions: 5 }, 201);
  await prisma.resposta.update({ where: { id: nextResponses[1].id }, data: { respondidoEm: new Date('2026-10-15T15:00:00Z') } });
  const updatedGoals = await request('/goals', alice);
  assert.equal(updatedGoals.items.find((g: { id: string }) => g.id === ongoing.id).resolvedQuestions, 5);
  assert.equal(updatedGoals.items.find((g: { id: string }) => g.id === goal.id).resolvedQuestions, 4);
  pass('goal editing, verified/idempotent completion and persisted completion snapshot work; pending progress refreshes from new records');

  assert.deepEqual((await request('/goals', users.bob.token)).items, []);
  await request(`/goals/${goal.id}`, users.bob.token, 'PATCH', { targetQuestions: 1 }, 404);
  await request(`/goals/${goal.id}/complete`, users.bob.token, 'POST', {}, 404);
  for (const body of [{ date: '2026-10-15', targetQuestions: 1, alunoId: users.bob.id }, { date: '2026-10-15', targetQuestions: 1, questoesResolvidas: 1000 }]) await request('/goals', alice, 'POST', body, 422);
  for (const route of ['/goals', '/reports/classes']) await request(route, undefined, 'GET', undefined, 401);
  await request('/goals', a, 'GET', undefined, 403);
  await request('/reports/classes', alice, 'GET', undefined, 403);
  await request('/goals', users.pending.token, 'GET', undefined, 403);
  const expired = jwt.sign({ id: users.alice.id, role: 'ALUNO', sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: -1 });
  await request('/goals', expired, 'GET', undefined, 401);
  const revoked = jwt.sign({ id: users.alice.id, role: 'ALUNO', sessionVersion: 8 }, process.env.JWT_SECRET!);
  await request('/goals', revoked, 'GET', undefined, 401);
  await prisma.user.update({ where: { id: users.teacherB.id }, data: { role: 'ALUNO' } });
  await request('/reports/classes', b, 'GET', undefined, 403);
  pass('goal ownership, forged progress, current roles, expired/revoked JWTs and mandatory confirmation remain enforced');

  // Both list bounds are tested without changing report totals or creating fictional scores.
  for (let i = 0; i < 22; i++) await prisma.metaDiaria.create({ data: { alunoId: users.alice.id, data: new Date('2099-02-01T00:00:00Z'), metaQuestoes: i + 1 } });
  const first = await request('/goals?page=1', alice), second = await request('/goals?page=2', alice);
  assert.equal(first.items.length, 20); assert.equal(first.hasMore, true);
  assert.ok(second.items.length > 0 && !second.items.some((goal: { id: string }) => first.items.some((g: { id: string }) => g.id === goal.id)));
  const before = await request('/goals', alice);
  await prisma.$disconnect(); const fresh = await login(users.alice.email);
  assert.deepEqual(await request('/goals', fresh), before);
  await request('/turmas/' + classA, a, 'PATCH', { archived: true });
  assert.equal((await request(`/reports/classes/${classA}`, a)).summary.completedAttempts, 3);
  pass('paginated goals survive reconnection/login and archived classes retain authorized historical reports');
  console.log(`PostgreSQL goals/reports integration: ${checks} scenarios passed.`);
}
main().catch(error => { console.error('Local goals/reports integration failed:', error.message); process.exitCode = 1; })
  .finally(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); await prisma.$disconnect(); });
