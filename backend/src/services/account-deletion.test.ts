import { afterEach, expect, it, vi } from 'vitest';
import { accountDeletionEnabled } from '../account-deletion-availability';
import { AccountDeletionService, assertEmailReusable } from './account-deletion';
import { AuthService } from './auth-service';
import versions from '../legal-versions.json';

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, emailReuseBlock: { findFirst: vi.fn() }, $transaction: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: db }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('cannot enable unvalidated deletion through environment variables', async () => {
  vi.stubEnv('EMAIL_REUSE_BLOCKS_ENABLED', 'true');
  vi.stubEnv('ACCOUNT_DELETION_ENABLED', 'true');
  expect(accountDeletionEnabled()).toBe(false);
  const service = new AccountDeletionService();
  await expect(service.self('student', { senhaAtual: 'unverified' })).rejects.toMatchObject({ statusCode: 503 });
  await expect(service.admin({ userId: 'admin', role: 'ADMIN' }, 'target', true, 'review')).rejects.toMatchObject({ statusCode: 503 });
  await expect(service.revoke({ userId: 'admin', role: 'ADMIN' }, 'fixture@example.invalid', 'review')).rejects.toMatchObject({ statusCode: 503 });
  expect(db.user.findUnique).not.toHaveBeenCalled();
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(db.emailReuseBlock.findFirst).not.toHaveBeenCalled();
});

it.each(['ALUNO', 'PROFESSOR'])('does not grant global deletion or revocation to %s', async role => {
  const service = new AccountDeletionService();
  await expect(service.admin({ userId: 'actor', role, institutionAdmin: true }, 'target', false, 'review')).rejects.toMatchObject({ statusCode: 403 });
  await expect(service.revoke({ userId: 'actor', role, institutionAdmin: true }, 'fixture@example.invalid', 'review')).rejects.toMatchObject({ statusCode: 403 });
  expect(db.$transaction).not.toHaveBeenCalled();
});

it('does not query the new schema during registration while integration is suspended', async () => {
  vi.stubEnv('EMAIL_REUSE_BLOCKS_ENABLED', 'true');
  vi.stubEnv('JWT_SECRET', 'h424-no-database-secret-with-at-least-32-characters');
  await assertEmailReusable('fixture@example.invalid');
  const repository = { findByEmail: vi.fn().mockResolvedValue(null), createUser: vi.fn().mockResolvedValue({ id: 'new', nome: 'Fixture', email: 'fixture@example.invalid', role: 'ALUNO', sessionVersion: 0 }) };
  const result = await new AuthService(repository as never).register('Fixture', 'fixture@example.invalid', 'Fixture-password1!', { accepted: true, ...versions });
  expect(result.usuario.id).toBe('new');
  expect(repository.createUser).toHaveBeenCalledTimes(1);
  expect(db.emailReuseBlock.findFirst).not.toHaveBeenCalled();
});
