import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordRecoveryService } from './password-recovery-service';
import { PasswordRecoveryRepository } from '../repositories/password-recovery-repository';
import { errorHandler } from '../middlewares/error-handler';

// All database methods are doubles. No PrismaClient, SMTP or HTTP server starts.
const db = vi.hoisted(() => ({
  lookup: vi.fn(), transaction: vi.fn(), token: vi.fn(), lock: vi.fn(),
  account: vi.fn(), claim: vi.fn(), update: vi.fn(), audit: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: {
  passwordRecoveryToken: { findUnique: db.lookup }, $transaction: db.transaction,
} }));

const now = new Date('2026-10-20T12:00:00Z');
const input = 'Synthetic-reset-fixture1!';
const currentPasswordHash = bcrypt.hashSync('Current-other-fixture1!', 4);
const token = () => ({ id: 'fixture-token', userId: 'fixture-user',
  expiresAt: new Date(now.getTime() + 60_000), consumedAt: null });
const knownError = (code: string) => new Prisma.PrismaClientKnownRequestError(
  'synthetic private detail', { code, clientVersion: 'fixture' });

function http(error: unknown) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() };
  errorHandler(error, {
    method: 'POST', path: '/auth/password-reset',
    socket: { localAddress: '127.0.0.1', remoteAddress: '127.0.0.1' },
  } as Request, response as never, vi.fn());
  return response;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('PASSWORD_RESET_DIAGNOSTICS', '1');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.lookup.mockResolvedValue({ ...token(), user: { senhaHash: currentPasswordHash, deletedAt: null } });
  db.token.mockResolvedValue(token());
  db.lock.mockResolvedValue([{ id: 'fixture-user' }]);
  db.account.mockResolvedValue({ id: 'fixture-user', senhaHash: currentPasswordHash });
  db.claim.mockResolvedValue({ count: 1 });
  db.update.mockResolvedValue({ count: 1 });
  db.audit.mockResolvedValue({});
  db.transaction.mockImplementation(async work => work({
    passwordRecoveryToken: { findUnique: db.token, updateMany: db.claim },
    $queryRaw: db.lock, user: { findUnique: db.account, updateMany: db.update },
    auditLog: { create: db.audit },
  }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('isolated reset failures through the service and repository', () => {
  it.each([
    ['token lookup', 'lookup', 'P2022'],
    ['transaction opening', 'transaction', 'P2028'],
    ['transaction token lookup', 'token', 'P2021'],
    ['row lock', 'lock', 'P2010'],
    ['account lookup', 'account', 'P2022'],
    ['token claim', 'claim', 'P2024'],
    ['password/session update', 'update', 'P2022'],
    ['audit insert', 'audit', 'P2004'],
  ] as const)('preserves the actual exception at %s instead of calling it an invalid token', async (_stage, method, code) => {
    vi.spyOn(bcrypt, 'hash').mockResolvedValue('fixture-new-hash' as never);
    const error = knownError(code);
    db[method].mockRejectedValueOnce(error);
    const result = new PasswordRecoveryService(new PasswordRecoveryRepository()).resetPassword(input, input, input);
    await expect(result).rejects.toBe(error);
    const response = http(await result.catch(value => value));
    expect(response.status).toHaveBeenCalledWith(500);
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: 'PrismaClientKnownRequestError', codigo: code });
    expect(response.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor.' });
    if (method === 'lookup') expect(bcrypt.hash).not.toHaveBeenCalled();
    if (['lookup', 'transaction', 'token', 'lock', 'account', 'claim'].includes(method)) {
      expect(db.update).not.toHaveBeenCalled();
    }
    if (method !== 'audit') expect(db.audit).not.toHaveBeenCalled();
  });

  it('classifies connection initialization failure without logging its private details', async () => {
    const error = new Prisma.PrismaClientInitializationError('synthetic private detail', 'fixture', 'P1001');
    db.lookup.mockRejectedValue(error);
    await expect(new PasswordRecoveryService().resetPassword(input, input, input)).rejects.toBe(error);
    expect(http(error).status).toHaveBeenCalledWith(500);
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: 'PrismaClientInitializationError', codigo: 'P1001' });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('does not start the password transaction if bcrypt rejects', async () => {
    const error = new Error('synthetic bcrypt failure');
    vi.spyOn(bcrypt, 'hash').mockRejectedValue(error as never);
    await expect(new PasswordRecoveryService().resetPassword(input, input, input)).rejects.toBe(error);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(http(error).status).toHaveBeenCalledWith(500);
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: 'Error' });
  });

  it.each(['missing', 'expired', 'boundary', 'used', 'deleted'])(
    'returns HTTP 400 for a %s token before hashing or writing', async condition => {
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('fixture-new-hash' as never);
      const record = { ...token(), user: { senhaHash: 'fixture-old-hash', deletedAt: null as Date | null } };
      if (condition === 'expired') record.expiresAt = new Date(now.getTime() - 1);
      if (condition === 'boundary') record.expiresAt = now;
      if (condition === 'used') Object.assign(record, { consumedAt: now });
      if (condition === 'deleted') record.user.deletedAt = now;
      db.lookup.mockResolvedValue(condition === 'missing' ? null : record);
      const error = await new PasswordRecoveryService().resetPassword(input, input, input).catch(value => value);
      expect(http(error).status).toHaveBeenCalledWith(400);
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

  it.each(['expired', 'already claimed'])('returns HTTP 400 if the token becomes %s after the precheck', async condition => {
    vi.spyOn(bcrypt, 'hash').mockResolvedValue('fixture-new-hash' as never);
    if (condition === 'expired') db.token.mockResolvedValue({ ...token(), expiresAt: now });
    else db.claim.mockResolvedValueOnce({ count: 0 });
    const error = await new PasswordRecoveryService().resetPassword(input, input, input).catch(value => value);
    expect(http(error).status).toHaveBeenCalledWith(400);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
  });

  it('identifies the explicit account-change guard as another possible generic 500', async () => {
    vi.spyOn(bcrypt, 'hash').mockResolvedValue('fixture-new-hash' as never);
    db.update.mockResolvedValue({ count: 0 });
    const error = await new PasswordRecoveryService().resetPassword(input, input, input).catch(value => value);
    expect(error).toBeInstanceOf(Error);
    expect(http(error).status).toHaveBeenCalledWith(500);
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: 'Error' });
    expect(db.audit).not.toHaveBeenCalled();
  });

  it('passes audit failure out of the transaction callback; it never reports success', async () => {
    const error = knownError('P2010');
    db.audit.mockRejectedValue(error);
    await expect(new PasswordRecoveryRepository().consumeAndReset('fixture-digest', 'fixture-hash', now)).rejects.toBe(error);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { senhaHash: 'fixture-hash', sessionVersion: { increment: 1 } },
    }));
    // These doubles prove rejection propagation, not PostgreSQL rollback/locking.
  });

  it('runs the installed native bcrypt implementation with synthetic input only', async () => {
    vi.useRealTimers();
    const hash = await bcrypt.hash(input, 10);
    expect(bcrypt.getRounds(hash)).toBe(10);
    expect(await bcrypt.compare(input, hash)).toBe(true);
    expect(await bcrypt.compare('different-synthetic-input', hash)).toBe(false);
  });
});
