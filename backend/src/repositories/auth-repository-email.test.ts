import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { user: { findMany: mocks.findMany, findUnique: mocks.findUnique } } }));
import { AuthRepository } from './auth-repository';
beforeEach(() => vi.resetAllMocks());

it('matches a legacy email without case-dependent login or changing stored identity', async () => {
  const account = { id: 'legacy', email: 'Legacy@Example.invalid' };
  mocks.findMany.mockResolvedValue([account]);
  await expect(new AuthRepository().findByEmail(' legacy@example.invalid ')).resolves.toBe(account);
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'legacy@example.invalid', mode: 'insensitive' } }, take: 2 }));
});
it('does not choose between existing accounts with case variants', async () => {
  mocks.findMany.mockResolvedValue([{ id: 'first' }, { id: 'second' }]);
  await expect(new AuthRepository().findByEmail('legacy@example.invalid')).rejects.toMatchObject({ statusCode: 409 });
});
it('keeps nonexistent accounts unavailable', async () => {
  mocks.findMany.mockResolvedValue([]);
  await expect(new AuthRepository().findByEmail('missing@example.invalid')).resolves.toBeNull();
});

it('does not require the institutional registration column for a regular session while the module is disabled', async () => {
  vi.stubEnv('INSTITUTIONS_ENABLED', 'false');
  vi.stubEnv('ADMINISTRATION_ENABLED', 'false');
  vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED', 'false');
  mocks.findUnique.mockResolvedValue({
    id: 'regular-session', nome: 'Pessoa', email: 'pessoa@local.test', role: 'ALUNO',
    emailVerifiedAt: null, deletedAt: null,
  });

  await expect(new AuthRepository().findById('regular-session')).resolves.toEqual({
    id: 'regular-session', nome: 'Pessoa', email: 'pessoa@local.test', role: 'ALUNO',
    emailVerifiedAt: null, deletedAt: null, registrationIntent: null,
  });
  expect(mocks.findUnique).toHaveBeenCalledWith({
    where: { id: 'regular-session' },
    select: {
      id: true, nome: true, email: true, role: true,
      emailVerifiedAt: true, deletedAt: true,
    },
  });
});

it('keeps the registration intent in the session query when institutional registration is enabled', async () => {
  vi.stubEnv('INSTITUTIONS_ENABLED', 'false');
  vi.stubEnv('ADMINISTRATION_ENABLED', 'false');
  vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED', 'true');
  mocks.findUnique.mockResolvedValue({
    id: 'institutional-session', nome: 'Responsável', email: 'responsavel@local.test', role: 'ALUNO',
    emailVerifiedAt: null, deletedAt: null, registrationIntent: 'INSTITUTION',
  });

  await expect(new AuthRepository().findById('institutional-session')).resolves.toMatchObject({
    id: 'institutional-session', registrationIntent: 'INSTITUTION',
  });
  expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'institutional-session' },
    select: expect.objectContaining({ registrationIntent: true }),
  }));
});
