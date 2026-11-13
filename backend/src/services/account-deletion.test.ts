import { afterEach, expect, it, vi } from 'vitest';
import { accountDeletionEnabled } from '../account-deletion-availability';
import { assertEmailReusable } from './account-deletion';
import { AuthService } from './auth-service';
import versions from '../legal-versions.json';

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, emailReuseBlock: { findFirst: vi.fn() }, $transaction: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: db }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

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
