import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const model = () => Object.fromEntries(['findUnique', 'findFirst', 'findMany', 'create', 'update', 'updateMany'].map(method => [method, vi.fn()]));
  return { user: model(), authToken: model(), passwordRecoveryToken: model(), $queryRaw: vi.fn(), $transaction: vi.fn() };
});
vi.mock("../../../src/lib/prisma", () => ({ prisma: db }));
vi.mock("../../../src/services/account-identity", () => ({ confirmAccountIdentity: vi.fn() }));

import { AccountEmailChangeService } from "../../../src/services/account-email-change";
import type { AccountEmailChangeSender } from "../../../src/services/account-email-change-sender";

let deliveredUrl = '';
const sender: AccountEmailChangeSender = {
  isConfigured: true,
  sendConfirmation: vi.fn(async (_to, url) => { deliveredUrl = url; }),
  sendChangedNotice: vi.fn(async () => {}),
};
const service = () => new AccountEmailChangeService(sender, 'https://app.example.test');
const current = { id: 'user-a', email: 'old@example.test', emailVerifiedAt: new Date(), senhaHash: 'hash-current', sessionVersion: 4, deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks(); deliveredUrl = '';
  db.user.findUnique.mockResolvedValue(current);
  db.user.findMany.mockResolvedValue([]);
  db.authToken.findMany.mockResolvedValue([]);
  db.authToken.create.mockResolvedValue({ id: 'token-record' });
  db.authToken.updateMany.mockResolvedValue({ count: 1 });
  db.passwordRecoveryToken.updateMany.mockResolvedValue({ count: 1 });
  db.user.update.mockResolvedValue({});
  db.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(db));
});
afterEach(() => vi.restoreAllMocks());

it('requires matching addresses and account reauthentication before issuing mail', async () => {
  await expect(service().request('user-a', { newEmail: 'new@example.test', confirmationEmail: 'other@example.test', senhaAtual: 'pw' }))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(sender.sendConfirmation).not.toHaveBeenCalled();
});

it('sends a time-limited confirmation but does not change the email before it is clicked', async () => {
  const result = await service().request('user-a', { newEmail: ' New@Example.Test ', confirmationEmail: 'new@example.test', senhaAtual: 'pw' });
  expect(result.message).toContain('só muda depois');
  expect(sender.sendConfirmation).toHaveBeenCalledWith('new@example.test', expect.stringContaining('#/confirm-email-change?token='), 30);
  expect(db.authToken.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'user-a', type: 'EMAIL_VERIFICATION', expiresAt: expect.any(Date) }) }));
  expect(db.user.update).not.toHaveBeenCalled();
  expect(deliveredUrl).toContain('token=');
});

it('rejects an address already belonging to an account without sending a link', async () => {
  db.user.findMany.mockResolvedValueOnce([{ id: 'another-user' }]);
  await expect(service().request('user-a', { newEmail: 'taken@example.test', confirmationEmail: 'taken@example.test', senhaAtual: 'pw' }))
    .rejects.toMatchObject({ statusCode: 409 });
  expect(sender.sendConfirmation).not.toHaveBeenCalled();
});

it('does not break login identity for accounts that only authenticate through Google', async () => {
  db.user.findUnique.mockResolvedValue({ ...current, senhaHash: '!GOOGLE_OAUTH_ACCOUNT!' });
  await expect(service().request('user-a', { newEmail: 'new@example.test', confirmationEmail: 'new@example.test', senhaAtual: 'pw' }))
    .rejects.toMatchObject({ statusCode: 409 });
  expect(sender.sendConfirmation).not.toHaveBeenCalled();
});

it('confirms once, updates the address atomically, revokes sessions and notifies the old address', async () => {
  await service().request('user-a', { newEmail: 'new@example.test', confirmationEmail: 'new@example.test', senhaAtual: 'pw' });
  const token = new URL(deliveredUrl).hash.split('token=')[1]!;
  db.authToken.findFirst.mockResolvedValue({ id: 'token-record', userId: 'user-a' });
  db.user.findUnique.mockResolvedValue({ email: 'old@example.test', emailVerifiedAt: new Date(), deletedAt: null, sessionVersion: 4 });
  db.user.findMany.mockResolvedValue([]);
  const result = await service().confirm(decodeURIComponent(token));
  expect(result.message).toContain('Entre novamente');
  expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-a', deletedAt: null }, data: expect.objectContaining({ email: 'new@example.test', sessionVersion: { increment: 1 } }) }));
  expect(db.passwordRecoveryToken.updateMany).toHaveBeenCalled();
  expect(sender.sendChangedNotice).toHaveBeenCalledWith('old@example.test');
  expect(db.authToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'user-a', usedAt: null }) }));
});

it('rejects malformed, consumed, or expired links without changing the account', async () => {
  await expect(service().confirm('bad-token')).rejects.toMatchObject({ statusCode: 400 });
  expect(db.$transaction).not.toHaveBeenCalled();
  const forged = `${Buffer.from(JSON.stringify({ purpose: 'account-email-change', userId: 'user-b', newEmail: 'new@example.test' })).toString('base64url')}.${'x'.repeat(43)}`;
  db.authToken.findFirst.mockResolvedValue(null);
  await expect(service().confirm(forged)).rejects.toMatchObject({ statusCode: 400 });
  expect(db.user.update).not.toHaveBeenCalled();
});
