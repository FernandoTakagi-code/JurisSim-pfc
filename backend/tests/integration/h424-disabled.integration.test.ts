import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from "../../src/lib/prisma";
import { accountDeletionEnabled } from "../../src/account-deletion-availability";
import { AccountDeletionService } from "../../src/services/accounts/account-deletion";
import { createAuthRoutes } from "../../src/routes/auth-routes";
import { createInstitutionRoutes } from "../../src/routes/institution-routes";
import { errorHandler } from "../../src/middlewares/error-handler";
import { assertDisposableDatabase } from './disposable-database';

const password = 'Disabled-deletion-fixture1!';
let server: Server, base: string, hash: string;
const service = new AccountDeletionService();
async function fixture(role: 'ALUNO' | 'PROFESSOR' | 'ADMIN' = 'ALUNO') {
  return prisma.user.create({ data: { nome: 'Disposable blocked-deletion fixture', email: `disabled-${randomUUID()}@example.invalid`, role, senhaHash: hash, emailVerifiedAt: new Date() } });
}
type User = Awaited<ReturnType<typeof fixture>>;
async function request(method: string, route: string, user?: User, body?: object) {
  const token = user && jwt.sign({ id: user.id, role: user.role, sessionVersion: user.sessionVersion }, process.env.JWT_SECRET!, { expiresIn: '1h' });
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
const proof = { confirmation: 'EXCLUIR', senhaAtual: password };
beforeAll(async () => {
  await assertDisposableDatabase(prisma);
  hash = await bcrypt.hash(password, 4);
  const app = express(); app.use(express.json()); app.use('/auth', createAuthRoutes()); app.use('/institutions', createInstitutionRoutes()); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
// Enable only the existing administrative routing in this disposable test;
// deletion availability remains hard-disabled independently of these flags.
beforeEach(() => vi.stubEnv('ADMINISTRATION_ENABLED', 'true'));
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } await prisma.$disconnect(); });

describe('H4.24 current safety policy against disposable PostgreSQL', () => {
  it('keeps authentication and strict confirmation before the unavailable operation', async () => {
    const user = await fixture();
    expect((await request('DELETE', '/auth/conta', undefined, proof)).status).toBe(401);
    expect((await request('DELETE', '/auth/conta', user, { senhaAtual: password })).status).toBe(400);
    expect((await request('DELETE', '/auth/conta', user, proof)).status).toBe(503);
  });
  it('preserves identity, photos, tokens, session and audits after a correctly confirmed request', async () => {
    const user = await fixture();
    await prisma.profilePhoto.create({ data: { userId: user.id, avatarId: 'books' } });
    await prisma.authToken.create({ data: { userId: user.id, type: 'EMAIL_VERIFICATION', tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
    await prisma.passwordRecoveryToken.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
    const snapshot = async () => prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { profilePhotos: true, authTokens: true, recoveryTokens: true, auditLogs: true } });
    const before = await snapshot();
    expect((await request('DELETE', '/auth/conta', user, proof)).status).toBe(503);
    expect(await snapshot()).toEqual(before);
    expect((await request('GET', '/auth/session', user)).status).toBe(200);
  });
  it('blocks administrative release, email block and revocation without creating policy or audit rows', async () => {
    const admin = await fixture('ADMIN'), user = await fixture();
    for (const blockEmail of [false, true]) expect((await request('DELETE', `/institutions/admin/users/${user.id}`, admin, { ...proof, blockEmail, reason: 'Disposable review' })).status).toBe(503);
    expect((await request('POST', '/institutions/admin/email-reuse/revoke', admin, { email: user.email, confirmation: 'REVOGAR', reason: 'Disposable review' })).status).toBe(503);
    expect(await prisma.emailReuseBlock.count({ where: { emailNormalized: user.email } })).toBe(0);
    expect(await prisma.administrativeEvent.count({ where: { actorId: admin.id } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
  });
  it('preserves ADMIN targets and does not reach deletion for administrator self requests', async () => {
    const admin = await fixture('ADMIN'), target = await fixture('ADMIN');
    for (const userId of [admin.id, target.id]) await expect(service.admin({ userId: admin.id, role: 'ADMIN' }, userId, false, 'Disposable review', { senhaAtual: password })).rejects.toMatchObject({ statusCode: 503 });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).toEqual(admin);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).toEqual(target);
  });
  it('denies ALUNO, PROFESSOR and institutional-admin claims administrative deletion and revocation', async () => {
    const target = await fixture();
    for (const role of ['ALUNO', 'PROFESSOR'] as const) {
      const actor = await fixture(role);
      expect((await request('DELETE', `/institutions/admin/users/${target.id}`, actor, { ...proof, blockEmail: true, reason: 'Disposable review' })).status).toBe(403);
      await expect(service.revoke({ userId: actor.id, role, institutionAdmin: true }, target.email, 'Disposable review')).rejects.toMatchObject({ statusCode: 403 });
    }
  });
  it('does not allow a Google proof to bypass the unavailable operation', async () => {
    const user = await fixture();
    await expect(service.self(user.id, { googleCredential: 'not-a-real-provider-token' })).rejects.toMatchObject({ statusCode: 503 });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
  });
  it('preserves institutional responsibility and membership when deletion is unavailable', async () => {
    const user = await fixture();
    const institution = await prisma.institution.create({ data: { ownerId: user.id, name: 'Disposable institution', responsibleName: 'Fixture', email: user.email, phone: '11999999999', description: 'Disposable safety fixture', status: 'PENDING' } });
    await expect(service.self(user.id, { senhaAtual: password })).rejects.toMatchObject({ statusCode: 503 });
    expect(await prisma.institution.findUniqueOrThrow({ where: { id: institution.id } })).toEqual(institution);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
  });
  it('administrative deletion cannot be enabled by environment variables', async () => {
    const admin = await fixture('ADMIN'), user = await fixture();
    vi.stubEnv('ACCOUNT_DELETION_ENABLED', 'true'); vi.stubEnv('EMAIL_REUSE_BLOCKS_ENABLED', 'true');
    expect(accountDeletionEnabled()).toBe(false);
    for (let attempt = 0; attempt < 2; attempt++) expect((await request('DELETE', `/institutions/admin/users/${user.id}`, admin, { ...proof, blockEmail: false, reason: 'Disposable review' })).status).toBe(503);
    expect(await prisma.auditLog.count({ where: { userId: user.id, action: 'CONTA_EXCLUIDA' } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
  });
});

describe('Student self-deletion against disposable PostgreSQL', () => {
  // DELETE /auth/conta allows 5 requests per 15 min per route instance; the
  // suite above already spent that budget, so these scenarios get a fresh app.
  let selfServer: Server, sharedBase = '';
  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/auth', createAuthRoutes()); app.use(errorHandler);
    selfServer = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => selfServer.once('listening', resolve));
    sharedBase = base; base = `http://127.0.0.1:${(selfServer.address() as { port: number }).port}`;
  });
  afterAll(async () => { base = sharedBase; selfServer.closeAllConnections(); await new Promise<void>(resolve => selfServer.close(() => resolve())); });

  it('stays unavailable while the environment lacks the email-reuse policy', async () => {
    const user = await fixture();
    vi.stubEnv('EMAIL_REUSE_BLOCKS_ENABLED', 'false');
    expect((await request('DELETE', '/auth/conta', user, proof)).status).toBe(503);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
  });
  it('anonymizes the student, revokes the session and keeps the audit once', async () => {
    vi.stubEnv('EMAIL_REUSE_BLOCKS_ENABLED', 'true');
    const user = await fixture();
    expect((await request('DELETE', '/auth/conta', user, { confirmation: 'EXCLUIR', senhaAtual: 'wrong-password' })).status).toBe(400);
    expect((await request('DELETE', '/auth/conta', user, proof)).status).toBe(200);
    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.email).toBe(`deleted-${user.id}@jurissim.invalid`);
    expect(deleted.senhaHash).toBeNull();
    expect((await request('GET', '/auth/session', user)).status).toBe(401);
    expect((await request('DELETE', '/auth/conta', user, proof)).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { userId: user.id, action: 'CONTA_EXCLUIDA' } })).toBe(1);
  });
  it('does not let ADMIN delete itself through the profile route', async () => {
    vi.stubEnv('EMAIL_REUSE_BLOCKS_ENABLED', 'true');
    // Service-level check keeps the route's rate-limit budget for the scenarios above.
    const user = await fixture('ADMIN');
    await expect(service.self(user.id, { senhaAtual: password })).rejects.toMatchObject({ statusCode: 403 });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
  });
  it('anonymizes the teacher and keeps the class, its students and the other teacher', async () => {
    vi.stubEnv('EMAIL_REUSE_BLOCKS_ENABLED', 'true');
    const [teacher, otherTeacher, student] = [await fixture('PROFESSOR'), await fixture('PROFESSOR'), await fixture()];
    const turma = await prisma.turma.create({ data: { nome: 'Disposable class', codigoConvite: `DEL-${randomUUID()}`, professores: { connect: [{ id: teacher.id }, { id: otherTeacher.id }] }, alunos: { connect: { id: student.id } } } });
    expect((await request('DELETE', '/auth/conta', teacher, proof)).status).toBe(200);
    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(deleted).toMatchObject({ nome: 'Usuário removido', email: `deleted-${teacher.id}@jurissim.invalid`, senhaHash: null });
    expect(deleted.deletedAt).not.toBeNull();
    const kept = await prisma.turma.findUniqueOrThrow({ where: { id: turma.id }, include: { professores: true, alunos: true } });
    expect(kept.archivedAt).toBeNull();
    expect(kept.professores.map(user => user.id)).toEqual([otherTeacher.id]);
    expect(kept.alunos.map(user => user.id)).toEqual([student.id]);
    expect((await request('GET', '/auth/session', teacher)).status).toBe(401);
  });
  it('deletes the only teacher of an active class and leaves the class active for its students', async () => {
    vi.stubEnv('EMAIL_REUSE_BLOCKS_ENABLED', 'true');
    const [teacher, student] = [await fixture('PROFESSOR'), await fixture()];
    const turma = await prisma.turma.create({ data: { nome: 'Disposable solo class', codigoConvite: `DEL-${randomUUID()}`, professores: { connect: { id: teacher.id } }, alunos: { connect: { id: student.id } } } });
    await service.self(teacher.id, { senhaAtual: password });
    const kept = await prisma.turma.findUniqueOrThrow({ where: { id: turma.id }, include: { professores: true, alunos: true } });
    expect(kept.archivedAt).toBeNull();
    expect(kept.professores).toEqual([]);
    expect(kept.alunos.map(user => user.id)).toEqual([student.id]);
  });
});
