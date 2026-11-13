import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../lib/prisma';
import { accountDeletionEnabled } from '../../account-deletion-availability';
import { AccountDeletionService } from '../../services/account-deletion';
import { createAuthRoutes } from '../../routes/auth-routes';
import { createInstitutionRoutes } from '../../routes/institution-routes';
import { errorHandler } from '../../middlewares/error-handler';
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
  it('cannot be enabled by environment variables and repeated requests create no deletion audit', async () => {
    const user = await fixture();
    vi.stubEnv('ACCOUNT_DELETION_ENABLED', 'true'); vi.stubEnv('EMAIL_REUSE_BLOCKS_ENABLED', 'true');
    expect(accountDeletionEnabled()).toBe(false);
    for (let attempt = 0; attempt < 2; attempt++) expect((await request('DELETE', '/auth/conta', user, proof)).status).toBe(503);
    expect(await prisma.auditLog.count({ where: { userId: user.id, action: 'CONTA_EXCLUIDA' } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
  });
});
