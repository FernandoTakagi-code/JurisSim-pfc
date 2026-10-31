// Called by test-migrations-local.cjs with its own newly created cluster.
// No dotenv loading, SMTP calls, deletes, or external connection parameters.
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma';
import { authRoutes } from '../src/routes/auth-routes';
import { requireAuth, requireRoles } from '../src/middlewares/auth-middleware';
import { errorHandler } from '../src/middlewares/error-handler';

let server: Server | undefined;
let base: string;
const secret = 'local-postgres-stage3-test-key-over-32-characters';
const oldPassword = 'fixture-original-password';
const newPassword = 'Fixture-replacement-password1!';
let checks = 0;
function pass(message: string) { checks++; console.log(`PASS DB: ${message}`); }
function request(method: string, route: string, bearer?: string, body?: unknown) {
  return fetch(`${base}${route}`, { method, headers: {
    'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function login(email: string, password: string) {
  const response = await request('POST', '/auth/login', undefined, { email, senha: password });
  assert.equal(response.status, 200, 'Fixture login failed');
  return (await response.json()).token as string;
}
async function recovery(userId: string, suffix: string, expired = false) {
  const raw = `local-fixture-recovery-${suffix}`.padEnd(64, 'x');
  await prisma.passwordRecoveryToken.create({ data: {
    userId, tokenHash: createHash('sha256').update(raw).digest('hex'),
    expiresAt: new Date(Date.now() + (expired ? -60_000 : 300_000)),
  } });
  return { token: raw, senha: newPassword, confirmacaoSenha: newPassword };
}

async function main() {
  // Validate the explicit local URL before the first database operation.
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.username, 'jurissim_migration_test');
  assert.equal(url.password, process.env.JURISSIM_TEST_DB_PASSWORD);
  assert.equal(url.pathname, `/${process.env.JURISSIM_TEST_FRESH_DATABASE}`);
  assert.ok(url.port && url.port !== '5432', 'Expected an isolated ephemeral port');
  assert.equal(process.env.DIRECT_URL, url.toString());
  assert.equal(process.env.JWT_SECRET, secret);
  assert.equal(process.env.GMAIL_USER, '');
  assert.equal(process.env.GMAIL_APP_PASSWORD, '');
  const expectedData = fs.realpathSync(process.argv[2] ?? '');
  assert.equal(path.basename(expectedData), 'data');
  assert.ok(path.basename(path.dirname(expectedData)).startsWith('jurissim-migrations-'));
  assert.equal(path.dirname(path.dirname(expectedData)).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
  const [cluster] = await prisma.$queryRaw<{ data_directory: string; database: string; owner: string; port: number; address: string }[]>`
    SELECT current_setting('data_directory') AS data_directory, current_database() AS database,
      current_user AS owner, inet_server_port() AS port, host(inet_server_addr()) AS address`;
  assert.equal(cluster.database, process.env.JURISSIM_TEST_FRESH_DATABASE);
  assert.equal(cluster.owner, 'jurissim_migration_test'); assert.equal(cluster.port, Number(url.port)); assert.equal(cluster.address, '127.0.0.1');
  assert.equal(fs.realpathSync(cluster.data_directory).toLowerCase(), expectedData.toLowerCase());
  assert.equal(await prisma.user.count(), 0, 'Runtime fixtures require an empty disposable database');

  const hash = await bcrypt.hash(oldPassword, 4);
  for (const [id, role, verified] of [
    ['stage3-primary', 'ALUNO', true], ['stage3-other', 'PROFESSOR', true],
    ['stage3-pending', 'ALUNO', false], ['stage3-rollback', 'ALUNO', true],
    ['stage3-concurrent', 'ALUNO', true],
  ] as const) {
    await prisma.user.create({ data: { id, nome: 'Fixture', email: `${id}@example.invalid`, role,
      senhaHash: hash, emailVerifiedAt: verified ? new Date() : null } });
  }
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.get('/protected', requireAuth, (_req, res) => res.json({ allowed: true }));
  app.get('/staff', requireAuth, requireRoles('PROFESSOR', 'ADMIN'), (_req, res) => res.json({ allowed: true }));
  app.get('/admin', requireAuth, requireRoles('ADMIN'), (_req, res) => res.json({ allowed: true }));
  app.use(errorHandler);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;

  const primary = await login('stage3-primary@example.invalid', oldPassword);
  const legacy = jwt.sign({ id: 'stage3-primary', role: 'ADMIN' }, secret, { expiresIn: '8h' });
  const other = await login('stage3-other@example.invalid', oldPassword);
  const otherLegacy = jwt.sign({ id: 'stage3-other', role: 'ADMIN' }, secret, { expiresIn: '8h' });
  assert.equal((await request('GET', '/protected', primary)).status, 200);
  assert.equal((await request('GET', '/protected', legacy)).status, 200);
  assert.equal((await request('GET', '/admin', legacy)).status, 403);
  const expiredLink = await recovery('stage3-primary', 'expired', true);
  assert.equal((await request('POST', '/auth/password-reset', undefined, expiredLink)).status, 400);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: 'stage3-primary' } })).sessionVersion, 0);
  pass('expired recovery does not revoke sessions; legacy version-zero JWT respects current profile');

  const resetBody = await recovery('stage3-primary', 'primary');
  assert.equal((await request('POST', '/auth/password-reset', undefined, resetBody)).status, 200);
  for (const bearer of [primary, legacy]) {
    for (const [method, route] of [['GET', '/protected'], ['GET', '/auth/session'], ['POST', '/auth/email-verification']]) {
      assert.equal((await request(method, route, bearer)).status, 401);
    }
  }
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: 'stage3-primary' } });
  assert.equal(updated.sessionVersion, 1);
  assert.ok(updated.emailVerifiedAt);
  assert.equal(updated.role, 'ALUNO');
  assert.equal(await prisma.auditLog.count({ where: { userId: updated.id, action: 'SENHA_REDEFINIDA' } }), 1);
  assert.equal((await request('POST', '/auth/password-reset', undefined, resetBody)).status, 400);
  assert.equal((await request('POST', '/auth/login', undefined, { email: updated.email, senha: oldPassword })).status, 401);
  const fresh = await login(updated.email, newPassword);
  const payload = jwt.verify(fresh, secret) as jwt.JwtPayload;
  assert.ok(payload.sessionVersion === 1 && payload.exp! - payload.iat! === 8 * 60 * 60);
  assert.equal((await request('GET', '/protected', fresh)).status, 200);
  assert.equal((await request('GET', '/staff', fresh)).status, 403);
  pass('real HTTP reset increments version once, revokes all old JWTs and recovery replay, and permits fresh login');

  for (const bearer of [other, otherLegacy]) {
    assert.equal((await request('GET', '/staff', bearer)).status, 200);
    assert.equal((await request('GET', '/admin', bearer)).status, 403);
  }
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: 'stage3-other' } })).sessionVersion, 0);
  await prisma.user.update({ where: { id: 'stage3-other' }, data: { role: 'ALUNO' } });
  assert.equal((await request('GET', '/staff', other)).status, 403);
  pass('other user sessions remain valid and current database profile still controls permissions');

  const expiredJwt = jwt.sign({ id: updated.id, role: 'ADMIN', sessionVersion: 1 }, secret, { expiresIn: -1 });
  const futureJwt = jwt.sign({ id: updated.id, role: 'ADMIN', sessionVersion: 2 }, secret, { expiresIn: '1h' });
  for (const bearer of [expiredJwt, futureJwt]) assert.equal((await request('GET', '/protected', bearer)).status, 401);
  pass('expiration and mismatched versions remain enforced');

  const pendingOld = await login('stage3-pending@example.invalid', oldPassword);
  assert.equal((await request('POST', '/auth/password-reset', undefined, await recovery('stage3-pending', 'pending'))).status, 200);
  const pendingFresh = await login('stage3-pending@example.invalid', newPassword);
  assert.equal((await request('GET', '/protected', pendingOld)).status, 401);
  assert.equal((await request('GET', '/protected', pendingFresh)).status, 403);
  assert.equal((await request('GET', '/auth/session', pendingFresh)).status, 200);
  const confirmation = 'local-fixture-confirmation'.padEnd(64, 'c');
  await prisma.authToken.create({ data: { userId: 'stage3-pending', type: 'EMAIL_VERIFICATION',
    tokenHash: createHash('sha256').update(confirmation).digest('hex'), expiresAt: new Date(Date.now() + 300_000) } });
  assert.equal((await request('POST', '/auth/email-verification/confirm', undefined, { token: confirmation })).status, 200);
  assert.equal((await request('GET', '/protected', pendingFresh)).status, 200);
  assert.equal((await request('GET', '/protected', pendingOld)).status, 401);
  pass('password reset preserves mandatory email confirmation; confirmation does not restore revoked JWTs');

  // Intentionally reject only this fixture's reset audit to prove rollback in PostgreSQL.
  await prisma.$executeRawUnsafe(`CREATE FUNCTION stage3_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture audit rejection'; END; $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER stage3_reject_audit BEFORE INSERT ON "AuditLog"
    FOR EACH ROW WHEN (NEW."userId" = 'stage3-rollback' AND NEW.action = 'SENHA_REDEFINIDA')
    EXECUTE FUNCTION stage3_reject_audit()`);
  const rollbackToken = await login('stage3-rollback@example.invalid', oldPassword);
  const rollbackBody = await recovery('stage3-rollback', 'rollback');
  assert.equal((await request('POST', '/auth/password-reset', undefined, rollbackBody)).status, 500);
  const rolledBack = await prisma.user.findUniqueOrThrow({ where: { id: 'stage3-rollback' } });
  assert.ok(rolledBack.sessionVersion === 0 && rolledBack.senhaHash === hash);
  assert.equal((await prisma.passwordRecoveryToken.findUniqueOrThrow({ where: {
    tokenHash: createHash('sha256').update(rollbackBody.token).digest('hex'),
  } })).consumedAt, null);
  assert.equal((await request('GET', '/protected', rollbackToken)).status, 200);
  pass('audit failure rolls back password, session version and recovery consumption atomically');

  const concurrentBody = await recovery('stage3-concurrent', 'concurrent');
  const responses = await Promise.all([1, 2].map(() => request('POST', '/auth/password-reset', undefined, concurrentBody)));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: 'stage3-concurrent' } })).sessionVersion, 1);
  assert.equal(await prisma.auditLog.count({ where: { userId: 'stage3-concurrent', action: 'SENHA_REDEFINIDA' } }), 1);
  pass('concurrent reuse of the same recovery link has one winner and one version increment');
  console.log(`PostgreSQL revocation integration: ${checks} scenarios passed.`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : 'Unknown failure';
  console.error(`PostgreSQL revocation integration failed; ${message.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, 'postgresql://[REDACTED]@')}`);
  process.exitCode = 1;
})
  .finally(async () => {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await prisma.$disconnect();
  });
