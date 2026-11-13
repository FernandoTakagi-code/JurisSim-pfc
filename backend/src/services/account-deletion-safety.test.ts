import bcrypt from 'bcrypt';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => {
  const model = () => Object.fromEntries(['findUnique', 'findFirst', 'count', 'upsert', 'updateMany', 'update', 'create'].map(method => [method, vi.fn()]));
  return { user: model(), accountControl: model(), institution: model(), institutionalMembership: model(), emailReuseBlock: model(), authToken: model(), passwordRecoveryToken: model(), administrativeEvent: model(), $queryRaw: vi.fn(), $executeRaw: vi.fn() };
});
// Test-only module double. Production availability remains hard-disabled.
vi.mock('../account-deletion-availability', () => ({ accountDeletionEnabled: () => true, accountDeletionUnavailableMessage: 'fixture only' }));
vi.mock('../lib/prisma', () => ({ prisma: db }));
vi.mock('./institution-service', async original => ({ ...await original<typeof import('./institution-service')>(), institutionalTransaction: async (work: (tx: any) => unknown) => work(db) }));
import { AccountDeletionService } from './account-deletion';
const service = new AccountDeletionService();
const actor = { userId: 'admin', role: 'ADMIN' };
let admin: any, target: any;
beforeEach(async () => {
  vi.resetAllMocks(); vi.stubEnv('EMAIL_REUSE_BLOCKS_ENABLED', 'true');
  admin = { id: 'admin', role: 'ADMIN', email: 'admin@example.invalid', emailVerifiedAt: new Date(), senhaHash: await bcrypt.hash('Admin-fixture1!', 4), sessionVersion: 2, deletedAt: null };
  target = { id: 'target', role: 'ALUNO', email: 'Target@example.invalid', senhaHash: null, sessionVersion: 0, deletedAt: null };
  db.user.findUnique.mockImplementation(({ where }) => where.id === 'admin' ? { ...admin } : { ...target });
  db.user.count.mockResolvedValue(1); db.institution.findFirst.mockResolvedValue(null); db.institutionalMembership.findFirst.mockResolvedValue(null); db.accountControl.findUnique.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
it('does not start a deletion transaction without the ADMIN identity proof', async () => {
  await expect(service.admin(actor, 'target', true, 'Authorized fixture')).rejects.toMatchObject({ statusCode: 400 });
  expect(db.$executeRaw).not.toHaveBeenCalled(); expect(db.user.update).not.toHaveBeenCalled();
});
it('rejects credentials changed between reauthentication and the transaction', async () => {
  db.$executeRaw.mockImplementation(() => { admin.sessionVersion++; });
  await expect(service.admin(actor, 'target', true, 'Authorized fixture', { senhaAtual: 'Admin-fixture1!' })).rejects.toMatchObject({ statusCode: 409 });
  expect(db.emailReuseBlock.upsert).not.toHaveBeenCalled(); expect(db.user.update).not.toHaveBeenCalled();
});
it('protects institutional responsibilities before changing email policy or sessions', async () => {
  db.institution.findFirst.mockResolvedValue({ id: 'owned-institution' });
  await expect(service.admin(actor, 'target', true, 'Authorized fixture', { senhaAtual: 'Admin-fixture1!' })).rejects.toMatchObject({ statusCode: 409 });
  expect(db.emailReuseBlock.upsert).not.toHaveBeenCalled(); expect(db.authToken.updateMany).not.toHaveBeenCalled();
});
it('protects the last active ADMIN and uses the shared administrative lock', async () => {
  target.role = 'ADMIN'; db.user.count.mockResolvedValue(0);
  await expect(service.admin(actor, 'target', false, 'Authorized fixture', { senhaAtual: 'Admin-fixture1!' })).rejects.toMatchObject({ statusCode: 409 });
  expect(db.$executeRaw).toHaveBeenCalled(); expect(db.user.update).not.toHaveBeenCalled();
  expect(db.user.count.mock.calls[0][0].where).toMatchObject({ id: { not: 'target' }, role: 'ADMIN', deletedAt: null });
});
it('allows an ADMIN target only when another active ADMIN remains (mock persistence only)', async () => {
  target.role = 'ADMIN'; db.user.count.mockResolvedValue(1);
  await service.admin(actor, 'target', false, 'Authorized fixture', { senhaAtual: 'Admin-fixture1!' });
  expect(db.user.update.mock.calls[0][0].where.id).toBe('target');
});
it('student self deletion prepares release of the normalized email after current password proof (mock persistence only)', async () => {
  target.senhaHash = await bcrypt.hash('Student-fixture1!', 4);
  await service.self('target', { senhaAtual: 'Student-fixture1!' });
  expect(db.emailReuseBlock.upsert).not.toHaveBeenCalled();
  expect(db.emailReuseBlock.updateMany.mock.calls[0][0].where).toMatchObject({ emailNormalized: 'target@example.invalid', revokedAt: null });
  expect(db.user.update.mock.calls[0][0].where.id).toBe('target');
});
it.each([false, true])('prepares atomic email policy %s, token/session invalidation and audit without storing credentials (mock persistence only)', async blockEmail => {
  await service.admin(actor, 'target', blockEmail, 'Authorized fixture', { senhaAtual: 'Admin-fixture1!' });
  if (blockEmail) expect(db.emailReuseBlock.upsert.mock.calls[0][0].where.emailNormalized).toBe('target@example.invalid');
  else expect(db.emailReuseBlock.updateMany.mock.calls[0][0].where.emailNormalized).toBe('target@example.invalid');
  expect(db.authToken.updateMany).toHaveBeenCalled(); expect(db.passwordRecoveryToken.updateMany).toHaveBeenCalled();
  expect(db.user.update.mock.calls[0][0].data).toMatchObject({ senhaHash: null, sessionVersion: { increment: 1 }, nome: 'Usuário removido' });
  expect(db.administrativeEvent.create.mock.calls[0][0].data).toMatchObject({ actorId: 'admin', resourceId: 'target' });
  const audit = JSON.stringify(db.administrativeEvent.create.mock.calls);
  expect(audit).toContain('Authorized fixture'); expect(audit).not.toContain('Admin-fixture1!'); expect(audit).not.toContain(admin.senhaHash);
});

it('preserves the revocation justification in the administrative audit (mock persistence only)', async () => {
  db.emailReuseBlock.findUnique.mockResolvedValue({ id: 'blocked-email', revokedAt: null });
  await service.revoke(actor, 'fixture@example.invalid', '  Authorized fixture review  ');
  expect(db.administrativeEvent.create).toHaveBeenCalledWith({ data: {
    event: 'EMAIL_REUSE_BLOCK_REVOKED', actorId: actor.userId, resourceId: 'blocked-email',
    result: JSON.stringify({ status: 'SUCCESS', reason: 'Authorized fixture review' }),
  } });
});

it.each(['', '  ', 'x'.repeat(501)])('rejects invalid revocation justification before changing persistence', async reason => {
  await expect(service.revoke(actor, 'fixture@example.invalid', reason)).rejects.toMatchObject({ statusCode: 400 });
  expect(db.emailReuseBlock.update).not.toHaveBeenCalled();
  expect(db.administrativeEvent.create).not.toHaveBeenCalled();
});
