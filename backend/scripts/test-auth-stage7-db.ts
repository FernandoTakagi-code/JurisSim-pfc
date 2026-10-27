// This script is never imported by the production server. No dotenv is loaded.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import type { Server } from 'node:http';
import { prisma } from '../src/lib/prisma';
import { AuthController } from '../src/controllers/auth-controller';
import { AuthService } from '../src/services/auth-service';
import { EmailVerificationService } from '../src/services/email-verification-service';
import { PasswordRecoveryService } from '../src/services/password-recovery-service';
import { createAuthRoutes } from '../src/routes/auth-routes';
import { studentHistoryRoutes } from '../src/routes/student-history-routes';
import { goalRoutes, reportRoutes } from '../src/routes/goals-reports-routes';
import { classRoutes, examRoutes } from '../src/routes/class-exam-routes';
import { profilePhotoRoutes } from '../src/routes/profile-photo-routes';
import questaoRoutes from '../src/routes/questaoRoutes';
import { errorHandler } from '../src/middlewares/error-handler';
import versions from '../src/legal-versions.json';

let server: Server | undefined, base: string, checks = 0, failNext = false;
const frontendOrigin = 'http://127.0.0.1:5184', fixtureKey = randomUUID();
type Mail = { kind: 'verification' | 'recovery'; to: string; url: string };
const outbox: Mail[] = [];
const send = async (message: Mail) => { if (failNext) { failNext = false; throw new Error('Isolated delivery failure'); } outbox.push(message); };
const pass = (message: string) => { checks++; console.log(`PASS AUTH DB: ${message}`); };
const tokenOf = (mail: Mail) => new URLSearchParams(new URL(mail.url).hash.split('?')[1]).get('token')!;
const hashOf = (value: string) => createHash('sha256').update(value).digest('hex');
const latest = (email: string, kind: Mail['kind']) => outbox.filter(mail => mail.to === email && mail.kind === kind).at(-1)!;
async function request(route: string, body?: unknown, token?: string, status = 200, method = 'POST') {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, status, `${method} ${route}: expected ${status}, got ${response.status}`);
  return response.json();
}
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.username, 'jurissim_migration_test'); assert.equal(url.password, process.env.JURISSIM_TEST_DB_PASSWORD);
  assert.equal(url.pathname, `/${process.env.JURISSIM_TEST_FRESH_DATABASE}`); assert.ok(url.port && url.port !== '5432'); assert.equal(process.env.DIRECT_URL, url.toString());
  assert.equal(process.env.GMAIL_USER, ''); assert.equal(process.env.GMAIL_APP_PASSWORD, ''); assert.equal(process.env.GOOGLE_CLIENT_ID, ''); assert.equal(process.env.NODE_ENV, 'test');
  const expected = fs.realpathSync(process.argv[2] ?? '');
  assert.equal(path.dirname(path.dirname(expected)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase()); assert.ok(path.basename(path.dirname(expected)).startsWith('jurissim-migrations-'));
  const [cluster] = await prisma.$queryRaw<{ data_directory: string; database: string; owner: string; port: number; address: string }[]>`
    SELECT current_setting('data_directory') AS data_directory, current_database() AS database,
      current_user AS owner, inet_server_port() AS port, inet_server_addr()::text AS address`;
  assert.equal(cluster.database, process.env.JURISSIM_TEST_FRESH_DATABASE);
  assert.equal(cluster.owner, 'jurissim_migration_test'); assert.equal(cluster.port, Number(url.port)); assert.equal(cluster.address, '127.0.0.1');
  assert.equal(fs.realpathSync(cluster.data_directory).toLowerCase(), expected.toLowerCase());
  process.env.APP_PUBLIC_URL = frontendOrigin;

  const controller = new AuthController(new AuthService(), new PasswordRecoveryService(undefined, { isConfigured: true, sendPasswordRecovery: async email => send({ kind: 'recovery', to: email.to, url: email.resetUrl }) }, frontendOrigin), new EmailVerificationService(undefined, { isConfigured: true, sendEmailVerification: async email => send({ kind: 'verification', to: email.to, url: email.verifyUrl }) }, frontendOrigin));
  const app = express(); app.use(cors({ origin: frontendOrigin })); app.use(express.json()); app.use('/auth', createAuthRoutes(controller));
  app.use('/students/me', studentHistoryRoutes); app.use('/goals', goalRoutes); app.use('/reports', reportRoutes); app.use('/profile/photo', profilePhotoRoutes);
  app.use('/turmas', classRoutes); app.use('/avaliacoes', examRoutes); app.use('/questoes', questaoRoutes);
  // Local fixture mail viewer: exists ONLY in this guarded test script, never in src/server.
  app.get('/__fixture/mail', (req, res) => { if (req.get('x-fixture-key') !== fixtureKey) { res.sendStatus(403); return; } res.set('Cache-Control', 'no-store').json(outbox); });
  app.use(errorHandler); server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server!.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const password = 'isolated-stage7-original', nextPassword = 'isolated-stage7-replacement';
  const acceptance = { accepted: true, ...versions };
  const registration = (email: string, role = 'ALUNO') => ({ nome: 'Auth integration fixture', email, senha: password, confirmacaoSenha: password, role, acceptance });
  await request('/auth/register', { ...registration('auth-invalid@example.invalid'), role: 'ADMIN' }, undefined, 400);
  await request('/auth/register', { ...registration('auth-invalid@example.invalid'), confirmacaoSenha: 'different' }, undefined, 400);
  const email = 'auth-stage7-alice@example.invalid', teacherEmail = 'auth-stage7-teacher@example.invalid';
  const registered = await request('/auth/register', registration(email), undefined, 201);
  const teacher = await request('/auth/register', registration(teacherEmail, 'PROFESSOR'), undefined, 201);
  await request('/auth/register', registration(email), undefined, 409);
  const race = await Promise.all([1, 2].map(() => fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(registration('auth-stage7-race@example.invalid')) })));
  assert.deepEqual(race.map(response => response.status).sort(), [201, 409]);
  for (const response of race) await response.arrayBuffer();
  assert.equal(await prisma.user.count({ where: { email: 'auth-stage7-race@example.invalid' } }), 1);
  const row = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal(row.role, 'ALUNO'); assert.equal(row.emailVerifiedAt, null); assert.ok(row.legalAcceptedAt); assert.equal(bcrypt.getRounds(row.senhaHash!), 10);
  assert.ok(await bcrypt.compare(password, row.senhaHash!)); assert.equal(await prisma.auditLog.count({ where: { userId: row.id, action: 'ACEITE_TERMOS_E_PRIVACIDADE' } }), 1);
  pass('real registration stores safe hash/legal acceptance, rejects invalid profiles/password confirmation and duplicate email');

  const login = async (address = email, senha = password, perfil = 'ALUNO') => (await request('/auth/login', { email: address, senha, perfil })).token as string;
  const pending = await login(); assert.equal((await request('/auth/session', undefined, pending, 200, 'GET')).user.emailVerificado, false);
  for (const route of ['/goals', '/profile/photo', '/students/me/activities']) await request(route, undefined, pending, 403, 'GET');
  await request('/auth/login', { email, senha: password, perfil: 'PROFESSOR' }, undefined, 403);
  const first = tokenOf(latest(email, 'verification'));
  const stored = await prisma.authToken.findFirstOrThrow({ where: { userId: row.id } }); assert.equal(stored.tokenHash, hashOf(first)); assert.notEqual(stored.tokenHash, first);
  await request('/auth/email-verification', undefined, pending, 429);
  await prisma.authToken.updateMany({ where: { userId: row.id }, data: { createdAt: new Date(Date.now() - 61000) } });
  await request('/auth/email-verification', undefined, pending, 202);
  await request('/auth/email-verification/confirm', { token: first }, undefined, 400);
  const active = tokenOf(latest(email, 'verification'));
  await request('/auth/email-verification/confirm', { token: active }); await request('/auth/email-verification/confirm', { token: active }, undefined, 400);
  assert.equal((await request('/auth/session', undefined, pending, 200, 'GET')).user.emailVerificado, true);
  await request('/goals', undefined, pending, 200, 'GET');
  await request('/auth/email-verification/confirm', { token: tokenOf(latest(teacherEmail, 'verification')) });
  pass('limited login, confirmation requirement, hashed delivery, cooldown, invalidated old link and one-time confirmation work through real routes');

  const teacherToken = await login(teacherEmail, password, 'PROFESSOR');
  await request('/reports/classes', undefined, teacherToken, 200, 'GET'); await request('/reports/classes', undefined, pending, 403, 'GET');
  await request('/auth/logout', { userId: teacher.usuario.id }, pending);
  await request('/auth/session', undefined, pending, 401, 'GET'); await request('/reports/classes', undefined, teacherToken, 200, 'GET');
  const afterLogout = await login(); await request('/goals', undefined, afterLogout, 200, 'GET');
  pass('authoritative profile redirects/permissions and server logout revoke only the authenticated account sessions');

  const neutral = await request('/auth/password-recovery', { email }, undefined, 202);
  assert.deepEqual(await request('/auth/password-recovery', { email: 'missing-auth@example.invalid' }, undefined, 202), neutral);
  const expired = tokenOf(latest(email, 'recovery'));
  await prisma.passwordRecoveryToken.updateMany({ where: { userId: row.id }, data: { expiresAt: new Date(Date.now() - 1), createdAt: new Date(Date.now() - 61000) } });
  await request('/auth/password-reset', { token: expired, senha: nextPassword, confirmacaoSenha: nextPassword }, undefined, 400);
  const previousMailCount = outbox.length;
  await Promise.all([1, 2, 3].map(() => request('/auth/password-recovery', { email }, undefined, 202)));
  assert.equal(outbox.length, previousMailCount + 1);
  const recovery = tokenOf(latest(email, 'recovery'));
  const sibling = 'isolated-legacy-recovery-link-for-stage7';
  await prisma.passwordRecoveryToken.create({ data: { userId: row.id, tokenHash: hashOf(sibling), expiresAt: new Date(Date.now() + 600000) } });
  assert.equal((await prisma.passwordRecoveryToken.findUniqueOrThrow({ where: { tokenHash: hashOf(recovery) } })).consumedAt, null);
  await request('/auth/password-reset', { token: recovery, senha: nextPassword, confirmacaoSenha: nextPassword });
  await request('/auth/password-reset', { token: recovery, senha: nextPassword, confirmacaoSenha: nextPassword }, undefined, 400);
  await request('/auth/password-reset', { token: sibling, senha: nextPassword, confirmacaoSenha: nextPassword }, undefined, 400);
  await request('/auth/session', undefined, afterLogout, 401, 'GET'); await request('/auth/login', { email, senha: password }, undefined, 401);
  await login(email, nextPassword); await request('/reports/classes', undefined, teacherToken, 200, 'GET');
  pass('neutral recovery, expiry, concurrent cooldown, single-use reset, new bcrypt hash and previous-session revocation preserve other users');
  await prisma.passwordRecoveryToken.updateMany({ where: { userId: row.id }, data: { createdAt: new Date(Date.now() - 61000) } });
  await request('/auth/password-recovery', { email }, undefined, 202);
  const cappedCount = outbox.length;
  await prisma.passwordRecoveryToken.updateMany({ where: { userId: row.id }, data: { createdAt: new Date(Date.now() - 61000) } });
  assert.deepEqual(await request('/auth/password-recovery', { email }, undefined, 202), neutral); assert.equal(outbox.length, cappedCount);

  const failedEmail = 'auth-stage7-failed@example.invalid'; failNext = true;
  const failed = await request('/auth/register', registration(failedEmail), undefined, 201); assert.equal(failed.emailVerification.status, 'unavailable');
  const failedUser = await prisma.user.findUniqueOrThrow({ where: { email: failedEmail } });
  assert.equal(failedUser.emailVerifiedAt, null); assert.ok((await prisma.authToken.findFirstOrThrow({ where: { userId: failedUser.id } })).usedAt);
  const failedToken = await login(failedEmail); await request('/goals', undefined, failedToken, 403, 'GET');
  // Existing token tables provide a durable hourly limit, including concurrent requests.
  await prisma.authToken.updateMany({ where: { userId: failedUser.id }, data: { createdAt: new Date(Date.now() - 61000) } });
  const replies = await Promise.all([1, 2, 3].map(async () => (await fetch(base + '/auth/email-verification', { method: 'POST', headers: { Authorization: `Bearer ${failedToken}` } })).status));
  assert.deepEqual(replies.sort(), [202, 429, 429]);
  await prisma.authToken.updateMany({ where: { userId: failedUser.id }, data: { createdAt: new Date(Date.now() - 61000) } });
  await request('/auth/email-verification', undefined, failedToken, 202);
  await prisma.authToken.updateMany({ where: { userId: failedUser.id }, data: { createdAt: new Date(Date.now() - 61000) } });
  await request('/auth/email-verification', undefined, failedToken, 429);
  const newest = latest(failedEmail, 'verification'); await prisma.authToken.updateMany({ where: { tokenHash: hashOf(tokenOf(newest)) }, data: { expiresAt: new Date(Date.now() - 1) } });
  await request('/auth/email-verification/confirm', { token: tokenOf(newest) }, undefined, 400);
  pass('simulated delivery failure leaves confirmation mandatory; durable three/hour quota and concurrent resend cannot be bypassed');

  // Deleted accounts and stale JWT permissions remain rejected across stage-1–6 resources.
  await prisma.user.update({ where: { id: failedUser.id }, data: { deletedAt: new Date() } });
  await request('/auth/login', { email: failedEmail, senha: password }, undefined, 401);
  const mailCount = outbox.length; assert.deepEqual(await request('/auth/password-recovery', { email: failedEmail }, undefined, 202), neutral); assert.equal(outbox.length, mailCount);
  await request('/auth/logout', undefined, failedToken, 401);
  await prisma.user.update({ where: { email: teacherEmail }, data: { role: 'ALUNO' } });
  await request('/reports/classes', undefined, teacherToken, 403, 'GET'); await prisma.user.update({ where: { email: teacherEmail }, data: { role: 'PROFESSOR' } });
  pass('deleted-account issuance/recovery and changed roles cannot bypass authorization; goals, photos and reports keep existing guards');

  if (process.env.JURISSIM_RUN_BROWSER_TEST === '1') {
    // Browser/Vite validation is an explicit opt-in phase, separate from database checks.
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve('../frontend/scripts/test-auth-local.mjs')], { cwd: path.resolve('../frontend'), windowsHide: true, env: { ...process.env, JURISSIM_TEST_API: base, JURISSIM_TEST_MAIL_KEY: fixtureKey }, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', chunk => process.stdout.write(chunk)); child.stderr.on('data', chunk => process.stderr.write(chunk)); child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error('Local authentication browser test failed')));
    });
  } else {
    console.log('SKIP: browser/Vite stage is separate from the PostgreSQL integration run.');
  }
  console.log(`PostgreSQL stage7 authentication integration: ${checks} scenarios passed.`);
}
main().catch(error => { console.error('Isolated stage7 validation failed:', error.message); process.exitCode = 1; }).finally(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); await prisma.$disconnect(); });
