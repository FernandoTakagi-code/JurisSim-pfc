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
