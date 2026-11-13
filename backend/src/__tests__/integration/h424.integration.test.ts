import { randomUUID, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../lib/prisma';
import { AccountDeletionService } from '../../services/account-deletion';
import { AuthService } from '../../services/auth-service';
import { createAuthRoutes } from '../../routes/auth-routes';
import { createInstitutionRoutes } from '../../routes/institution-routes';
import versions from '../../legal-versions.json';
import { accountDeletionEnabled } from '../../account-deletion-availability';
import { assertDisposableDatabase } from './disposable-database';

const googleVerify = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({ OAuth2Client: class { verifyIdToken = googleVerify; } }));
const password = 'H424-disposable-password1!';
const prefix = `h424-${randomUUID()}`;
const acceptance = { accepted: true, ...versions };
const service = new AccountDeletionService();
let server: Server, base: string, admin: Awaited<ReturnType<typeof fixture>>;
const ids: string[] = [];
async function fixture(role: 'ALUNO' | 'PROFESSOR' | 'ADMIN' = 'ALUNO', google = false) {
  const user = await prisma.user.create({ data: { nome: 'H424 disposable fixture', email: `${prefix}-${randomUUID()}@example.invalid`, role, senhaHash: google ? '!GOOGLE_OAUTH_ACCOUNT!' : await bcrypt.hash(password, 4), emailVerifiedAt: new Date() } });
  ids.push(user.id);
  return user;
}
function token(user: { id: string; role: string; sessionVersion: number }) { return jwt.sign({ id: user.id, role: user.role, sessionVersion: user.sessionVersion }, process.env.JWT_SECRET!, { expiresIn: '1h' }); }
async function request(method: string, path: string, user?: Parameters<typeof token>[0], body?: object) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${token(user)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
beforeAll(async () => {
  await assertDisposableDatabase(prisma);
  admin = await fixture('ADMIN');
  const app = express(); app.use(express.json()); app.use('/auth', createAuthRoutes()); app.use('/institutions', createInstitutionRoutes());
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || (error.name === 'ZodError' ? 400 : 500)).json({ message: error.statusCode ? error.message : 'Invalid request' }));
  server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await prisma.$disconnect(); });

// Preserved legacy positive scenarios. Unavailable while production deletion is
// deliberately blocked; no environment flag can enable this suite or feature.
// Current real-database refusal coverage lives in h424-disabled.integration.test.ts.
describe.skipIf(!accountDeletionEnabled())('H4.24 positive PostgreSQL scenarios — pending explicit activation review', () => {
  it('requires authentication, strict confirmation, and current password', async () => {
    const user = await fixture();
    expect((await request('DELETE', '/auth/conta', undefined, { confirmation: 'EXCLUIR', senhaAtual: password })).status).toBe(401);
    expect((await request('DELETE', '/auth/conta', user, { senhaAtual: password })).status).toBe(400);
    expect((await request('DELETE', '/auth/conta', user, { confirmation: 'EXCLUIR', senhaAtual: 'wrong' })).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).deletedAt).toBeNull();
  });
  it('self deletion anonymizes, revokes sessions and recovery/verification tokens, removes photo, releases email', async () => {
    const user = await fixture();
    await prisma.profilePhoto.create({ data: { userId: user.id, image: Buffer.from('private fixture') } });
    await prisma.authToken.create({ data: { userId: user.id, type: 'EMAIL_VERIFICATION', tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
    await prisma.passwordRecoveryToken.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(randomUUID()).digest('hex'), expiresAt: new Date(Date.now() + 60000) } });
    expect((await request('DELETE', '/auth/conta', user, { confirmation: 'EXCLUIR', senhaAtual: password })).status).toBe(200);
    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(deleted).toMatchObject({ nome: 'Usuário removido', senhaHash: null, sessionVersion: 1 }); expect(deleted.deletedAt).not.toBeNull(); expect(deleted.email).not.toBe(user.email);
    expect(await prisma.profilePhoto.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.authToken.count({ where: { userId: user.id, usedAt: null } })).toBe(0);
    expect(await prisma.passwordRecoveryToken.count({ where: { userId: user.id, consumedAt: null } })).toBe(0);
    expect((await request('GET', '/auth/session', user)).status).toBe(401);
    await expect(new AuthService().login(user.email, password)).rejects.toMatchObject({ statusCode: 401 });
    const registered = await new AuthService().register('New unrelated identity', user.email, password, acceptance);
    expect(registered.usuario.id).not.toBe(user.id); ids.push(registered.usuario.id);
    expect(await prisma.auditLog.count({ where: { userId: user.id, action: 'CONTA_EXCLUIDA' } })).toBe(1);
    expect(await prisma.administrativeEvent.count({ where: { resourceId: user.id, event: 'ACCOUNT_DELETED_EMAIL_RELEASED' } })).toBe(1);
  });
  it('admin block rejects normalized password, Google, institutional, and direct database registrations; revocation permits registration', async () => {
    const user = await fixture();
    expect((await request('DELETE', `/institutions/admin/users/${user.id}`, admin, { confirmation: 'EXCLUIR', blockEmail: true, reason: 'H424 fixture block', senhaAtual: password })).status).toBe(200);
    const block = await prisma.emailReuseBlock.findUniqueOrThrow({ where: { emailNormalized: user.email } }); expect(block.revokedAt).toBeNull();
    await expect(new AuthService().register('Blocked', ` ${user.email.toUpperCase()} `, password, acceptance)).rejects.toMatchObject({ statusCode: 409 });
    await expect(new AuthService().loginWithGoogle(user.email, 'Blocked', acceptance)).rejects.toMatchObject({ statusCode: 409 });
    await expect(prisma.user.create({ data: { nome: 'Bypass attempt', email: user.email.toUpperCase(), role: 'ALUNO' } })).rejects.toThrow();
    expect((await request('POST', '/institutions/admin/email-reuse/revoke', admin, { email: user.email.toUpperCase(), confirmation: 'REVOGAR', reason: 'H424 fixture revocation' })).status).toBe(200);
    const registered = await new AuthService().register('Released identity', user.email, password, acceptance); ids.push(registered.usuario.id);
    expect((await prisma.emailReuseBlock.findUniqueOrThrow({ where: { id: block.id } })).revokedById).toBe(admin.id);
    expect(await prisma.administrativeEvent.count({ where: { resourceId: block.id, event: 'EMAIL_REUSE_BLOCK_REVOKED' } })).toBe(1);
  });
  it('admin release permits reuse, denies self deletion and keeps another active admin', async () => {
    const user = await fixture();
    await service.admin({ userId: admin.id, role: 'ADMIN' }, user.id, false, 'H424 release', { senhaAtual: password });
    const created = await new AuthService().register('Released', user.email, password, acceptance); ids.push(created.usuario.id);
    await expect(service.admin({ userId: admin.id, role: 'ADMIN' }, admin.id, true, 'fixture')).rejects.toMatchObject({ statusCode: 409 });
    const anotherAdmin = await fixture('ADMIN');
    await expect(service.admin({ userId: admin.id, role: 'ADMIN' }, anotherAdmin.id, true, 'fixture', { senhaAtual: password })).resolves.toHaveProperty('message');
  });
  it('denies student, professor and institutional admin administrative deletion and revocation', async () => {
    const target = await fixture();
    for (const role of ['ALUNO', 'PROFESSOR'] as const) {
      const actor = await fixture(role);
      expect((await request('DELETE', `/institutions/admin/users/${target.id}`, actor, { confirmation: 'EXCLUIR', blockEmail: true, reason: 'fixture' })).status).toBe(403);
      expect((await request('POST', '/institutions/admin/email-reuse/revoke', actor, { email: target.email, confirmation: 'REVOGAR', reason: 'fixture' })).status).toBe(403);
    }
    await expect(service.admin({ userId: target.id, role: 'ALUNO', institutionAdmin: true }, target.id, true, 'fixture')).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.admin({ userId: target.id, role: 'ADMIN' }, admin.id, true, 'fixture')).rejects.toMatchObject({ statusCode: 403 });
  });
  it('requires fresh matching Google proof and revokes Google identity', async () => {
    process.env.GOOGLE_CLIENT_ID = 'h424-test-client';
    const user = await fixture('ALUNO', true);
    await expect(service.self(user.id, { senhaAtual: password })).rejects.toMatchObject({ statusCode: 400 });
    googleVerify.mockResolvedValue({ getPayload: () => ({ email: admin.email, email_verified: true, iat: Math.floor(Date.now() / 1000) }) });
    await expect(service.self(user.id, { googleCredential: 'mismatched-test-proof' })).rejects.toMatchObject({ statusCode: 401 });
    googleVerify.mockResolvedValue({ getPayload: () => ({ email: user.email, email_verified: true, iat: Math.floor(Date.now() / 1000) - 600 }) });
    await expect(service.self(user.id, { googleCredential: 'expired-test-proof' })).rejects.toMatchObject({ statusCode: 401 });
    googleVerify.mockResolvedValue({ getPayload: () => ({ email: user.email, email_verified: true, iat: Math.floor(Date.now() / 1000) }) });
    await expect(service.self(user.id, { googleCredential: 'fresh-test-proof' })).resolves.toHaveProperty('message');
    expect((await request('GET', '/auth/session', user)).status).toBe(401);
  });
  it('fails atomically when a responsible owner attempts deletion', async () => {
    const user = await fixture();
    const institution = await prisma.institution.create({ data: { ownerId: user.id, name: 'H424 disposable institution', responsibleName: 'Fixture', email: user.email, phone: '11999999999', description: 'H424 isolated fixture', status: 'PENDING' } });
    await expect(service.self(user.id, { senhaAtual: password })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.admin({ userId: admin.id, role: 'ADMIN' }, user.id, true, 'fixture', { senhaAtual: password })).rejects.toMatchObject({ statusCode: 409 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).deletedAt).toBeNull();
    expect(await prisma.emailReuseBlock.count({ where: { emailNormalized: user.email } })).toBe(0);
    expect(await prisma.institution.count({ where: { id: institution.id } })).toBe(1);
  });
  it('denies disabled feature and rejects repeated deletion without duplicate audit', async () => {
    const user = await fixture(); process.env.EMAIL_REUSE_BLOCKS_ENABLED = 'false';
    await expect(service.self(user.id, { senhaAtual: password })).rejects.toMatchObject({ statusCode: 503 });
    process.env.EMAIL_REUSE_BLOCKS_ENABLED = 'true';
    await service.self(user.id, { senhaAtual: password });
    await expect(service.self(user.id, { senhaAtual: password })).rejects.toMatchObject({ statusCode: 401 });
    expect(await prisma.auditLog.count({ where: { userId: user.id, action: 'CONTA_EXCLUIDA' } })).toBe(1);
  });
});
