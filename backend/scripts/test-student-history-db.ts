// Executed only by the disposable-cluster harness. Never loads remote URLs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { prisma } from '../src/lib/prisma';
import { authRoutes } from '../src/routes/auth-routes';
import { diagnosticRoutes } from '../src/routes/diagnostic-routes';
import { trailRoutes } from '../src/routes/trail-routes';
import { studentHistoryRoutes } from '../src/routes/student-history-routes';
import { errorHandler } from '../src/middlewares/error-handler';

let server: Server | undefined;
let base: string;
let checks = 0;
const pass = (message: string) => { checks++; console.log(`PASS HISTORY DB: ${message}`); };
async function request(route: string, token?: string, method = 'GET', body?: unknown) {
  return fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function login(email: string) {
  const response = await request('/auth/login', undefined, 'POST', { email, senha: 'history-fixture-password' });
  assert.equal(response.status, 200);
  return (await response.json()).token as string;
}
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.username, 'jurissim_migration_test');
  assert.equal(url.pathname, '/jurissim_fresh'); assert.equal(url.password, '');
  assert.ok(url.port && url.port !== '5432'); assert.equal(process.env.DIRECT_URL, url.toString());
  assert.equal(process.env.GMAIL_USER, ''); assert.equal(process.env.GMAIL_APP_PASSWORD, '');
  assert.equal(process.env.GROQ_API_KEY, '');
  const expected = fs.realpathSync(process.argv[2] ?? '');
  assert.equal(path.dirname(path.dirname(expected)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(path.dirname(expected)).startsWith('jurissim-migrations-'));
  const [cluster] = await prisma.$queryRaw<{ data_directory: string }[]>`SELECT current_setting('data_directory') AS data_directory`;
  assert.equal(fs.realpathSync(cluster.data_directory).toLowerCase(), expected.toLowerCase());

  const password = await bcrypt.hash('history-fixture-password', 4);
  const alice = await prisma.user.create({ data: { nome: 'History fixture Alice', email: 'history-alice@example.invalid', senhaHash: password, role: 'ALUNO', emailVerifiedAt: new Date() } });
  const bob = await prisma.user.create({ data: { nome: 'History fixture Bob', email: 'history-bob@example.invalid', senhaHash: password, role: 'ALUNO', emailVerifiedAt: new Date() } });
  const teacher = await prisma.user.create({ data: { nome: 'History fixture teacher', email: 'history-teacher@example.invalid', senhaHash: password, role: 'PROFESSOR', emailVerifiedAt: new Date() } });
  const pending = await prisma.user.create({ data: { nome: 'History fixture pending', email: 'history-pending@example.invalid', senhaHash: password, role: 'ALUNO' } });
  const app = express(); app.use(express.json());
  app.use('/auth', authRoutes); app.use('/diagnostics', diagnosticRoutes); app.use('/trilhas', trailRoutes);
  app.use('/students/me', studentHistoryRoutes); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const aliceToken = await login(alice.email), bobToken = await login(bob.email), teacherToken = await login(teacher.email);
  const overview = async (token: string) => { const response = await request('/students/me/overview', token); assert.equal(response.status, 200); return response.json(); };
  let data = await overview(aliceToken);
  assert.equal(data.latestDiagnosticId, null); assert.equal(data.totals.completedActivities, 0);
  assert.deepEqual(data.evolution, []); assert.deepEqual(data.recentActivities, []);
  assert.deepEqual((await (await request('/students/me/activities', bobToken)).json()).items, []);
  pass('empty accounts return empty history and actual zero counts, with no artificial scores');

  // Real diagnostic and trail flows write the persistence used by history.
  for (let i = 0; i < 3; i++) await prisma.questao.create({ data: {
    enunciado: `History fixture ${i}`, disciplina: 'History Civil', assunto: 'History Contratos', nivel: 'BASICO',
    fundamentacaoJuridica: 'Local persistence test', autorId: teacher.id, publica: true,
    alternativas: { create: [{ texto: 'Correct', correta: true }, { texto: 'Incorrect', correta: false }] },
  } });
  const started = await request('/diagnostics', aliceToken, 'POST', { questionCount: 3 }); assert.equal(started.status, 201);
  const diagnosticId = (await started.json()).id;
  const questions = (await (await request(`/diagnostics/${diagnosticId}/questions`, aliceToken)).json()).questions;
  for (let i = 0; i < 2; i++) {
    const option = await prisma.alternativa.findFirstOrThrow({ where: { questaoId: questions[i].id, correta: i === 0 } });
    assert.equal((await request(`/diagnostics/${diagnosticId}/answers/${questions[i].id}`, aliceToken, 'PUT', { selectedOptionId: option.id })).status, 200);
  }
  const unfinished = (await (await request('/students/me/activities', aliceToken)).json()).items[0];
  assert.equal(unfinished.answeredQuestions, 2); assert.equal(unfinished.correctAnswers, null);
  assert.equal(unfinished.incorrectAnswers, null); assert.equal(unfinished.overallPercentage, null);
  assert.equal((await overview(aliceToken)).totals.completedActivities, 0);
  assert.equal((await request(`/diagnostics/${diagnosticId}/finalize`, aliceToken, 'POST')).status, 200);
  const result = await (await request(`/diagnostics/${diagnosticId}/result`, aliceToken)).json();
  assert.equal(result.overallPercentage, 33.33);
  assert.equal(result.incorrectAnswers, 1); assert.equal(result.unansweredQuestions, 1);
  data = await overview(aliceToken);
  assert.equal(data.latestDiagnosticId, diagnosticId);
  assert.equal(data.totals.correctAnswers, 1); assert.equal(data.totals.incorrectAnswers, 1);
  assert.equal(data.totals.unansweredQuestions, 1); assert.equal(data.totals.answeredQuestions, 2);
  assert.equal(data.evolution[0].overallPercentage, result.overallPercentage);
  pass('completed diagnostic persists; wrong answers and unanswered questions remain separate');

  const generated = await request(`/trilhas/${result.trail.id}/gerar`, aliceToken, 'POST'); assert.equal(generated.status, 201);
  const trailId = (await generated.json()).id;
  const trailQuestions = (await (await request(`/trilhas/attempts/${trailId}/questions`, aliceToken)).json()).questions;
  assert.equal((await request(`/trilhas/attempts/${trailId}/result`, aliceToken)).status, 409);
  const correct = await prisma.alternativa.findFirstOrThrow({ where: { questaoId: trailQuestions[0].id, correta: true } });
  assert.equal((await request(`/trilhas/attempts/${trailId}/answers/${trailQuestions[0].id}`, aliceToken, 'PUT', { selectedOptionId: correct.id })).status, 200);
  const finalized = await request(`/trilhas/attempts/${trailId}/finalize`, aliceToken, 'POST'); assert.equal(finalized.status, 200);
  const trailResult = await (await request(`/trilhas/attempts/${trailId}/result`, aliceToken)).json();
  assert.equal(trailResult.overallPercentage, (await finalized.json()).overallPercentage);
  data = await overview(aliceToken);
  assert.equal(data.totals.completedActivities, 2); assert.equal(data.totals.completedTrails, 1);
  assert.equal(data.totals.completedDiagnostics, 1); assert.equal(data.evolution.length, 1);
  assert.equal(data.latestDiagnosticId, diagnosticId);
  pass('trail activity and persisted result agree with the existing engine; diagnostic evolution does not mix exercise sessions');

  // Cursor tie-breaking and bounds are exercised with identical timestamps.
  const tied = new Date('2026-10-17T12:00:00.123Z');
  for (let i = 0; i < 32; i++) await prisma.simulado.create({ data: { id: randomUUID(), alunoId: alice.id, tipo: 'DIAGNOSTICO', iniciadoEm: tied, finalizadoEm: tied,
    questoes: { create: { questaoId: questions[0].id, posicao: 1 } } } });
  const all: string[] = []; let cursor: string | null = null;
  do {
    const response = await request(`/students/me/activities?limit=2${cursor ? '&cursor=' + cursor : ''}`, aliceToken);
    assert.equal(response.status, 200); const page = await response.json();
    assert.ok(page.items.length <= 2); all.push(...page.items.map((item: { id: string }) => item.id)); cursor = page.nextCursor;
  } while (cursor);
  assert.equal(all.length, 34); assert.equal(new Set(all).size, 34);
  data = await overview(aliceToken); assert.equal(data.evolution.length, 30);
  const diagnostics = await (await request('/students/me/diagnostics?limit=50', aliceToken)).json();
  assert.equal(diagnostics.items.length, 33); assert.ok(diagnostics.items.every((item: { type: string }) => item.type === 'DIAGNOSTICO'));
  pass('bounded keyset pagination has no duplicate/missing rows at tied timestamps; diagnostics filter and 30-point evolution work');

  assert.deepEqual((await (await request('/students/me/activities', bobToken)).json()).items, []);
  assert.equal((await overview(bobToken)).totals.completedActivities, 0);
  assert.equal((await request(`/diagnostics/${diagnosticId}/result`, bobToken)).status, 404);
  assert.equal((await request(`/trilhas/attempts/${trailId}/result`, bobToken)).status, 403);
  for (const suffix of ['?studentId=' + alice.id, '?alunoId=' + alice.id, '?limit=51', '?cursor=broken']) {
    assert.equal((await request('/students/me/activities' + suffix, bobToken)).status, 422);
  }
  for (const endpoint of ['/overview', '/activities', '/diagnostics']) {
    assert.equal((await request('/students/me' + endpoint)).status, 401);
    assert.equal((await request('/students/me' + endpoint, teacherToken)).status, 403);
    assert.equal((await request('/students/me' + endpoint, await login(pending.email))).status, 403);
  }
  const expired = jwt.sign({ id: alice.id, role: 'ALUNO', sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: -1 });
  assert.equal((await request('/students/me/overview', expired)).status, 401);
  await prisma.user.update({ where: { id: teacher.id }, data: { role: 'ADMIN' } });
  assert.equal((await request('/students/me/overview', teacherToken)).status, 403);
  await prisma.user.update({ where: { id: pending.id }, data: { deletedAt: new Date() } });
  assert.equal((await request('/students/me/overview', jwt.sign({ id: pending.id, role: 'ALUNO', sessionVersion: 0 }, process.env.JWT_SECRET!))).status, 401);
  pass('student isolation, foreign IDs, query tampering, missing/expired JWTs, unverified/deleted accounts and current roles remain enforced');

  const firstResponse = await request('/students/me/overview', aliceToken);
  assert.equal(firstResponse.headers.get('cache-control'), 'no-store');
  const before = await firstResponse.json();
  await prisma.$disconnect();
  const freshToken = await login(alice.email);
  assert.deepEqual(await overview(freshToken), before);
  assert.equal((await request(`/diagnostics/${diagnosticId}/result`, freshToken)).status, 200);
  pass('new database connection and fresh official login recover persisted data with private no-store responses');
  console.log(`PostgreSQL student history integration: ${checks} scenarios passed.`);
}
main().catch(error => { console.error('Local student history integration failed:', error.message); process.exitCode = 1; })
  .finally(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); await prisma.$disconnect(); });
