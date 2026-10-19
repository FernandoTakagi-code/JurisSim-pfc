import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailVerificationService } from './email-verification-service';
import { AuthRepository } from '../repositories/auth-repository';

const db = vi.hoisted(() => ({ findFirst: vi.fn(), updateMany: vi.fn(), userUpdate: vi.fn(), transaction: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: {
  $transaction: db.transaction,
} }));

function dependencies(url = 'http://localhost:5173/') {
  const repository = {
    findById: vi.fn().mockResolvedValue({ id: 'user-1', email: 'recipient@example.com', emailVerifiedAt: null }),
    createToken: vi.fn().mockResolvedValue({ id: 'token-row' }),
    markTokenUsed: vi.fn().mockResolvedValue({ count: 1 }),
    consumeEmailVerification: vi.fn().mockResolvedValue(true),
  };
  const sender = { isConfigured: true, sendEmailVerification: vi.fn().mockResolvedValue(undefined) };
  return { repository, sender, service: new EmailVerificationService(repository as never, sender, url) };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('envio e reenvio de confirmação', () => {
  it('gera token seguro, persiste somente o hash e envia link sem barra duplicada, válido por 60 minutos', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-10-15T12:00:00Z');
    vi.setSystemTime(now);
    const { repository, sender, service } = dependencies();
    await service.requestVerification('user-1');
    const message = sender.sendEmailVerification.mock.calls[0][0];
    const url = new URL(message.verifyUrl);
    const raw = new URLSearchParams(url.hash.split('?')[1]).get('token')!;
    expect(Buffer.from(raw, 'hex')).toHaveLength(32);
    expect(url.origin).toBe('http://localhost:5173');
    expect(url.pathname).toBe('/');
    expect(url.search).toBe('');
    expect(repository.createToken).toHaveBeenCalledWith('user-1', 'EMAIL_VERIFICATION',
      createHash('sha256').update(raw).digest('hex'), new Date(now.getTime() + 60 * 60_000));
    expect(message.expiresInMinutes).toBe(60);
    await service.requestVerification('user-1');
    expect(sender.sendEmailVerification).toHaveBeenCalledTimes(2);
    expect(repository.createToken.mock.calls[1][2] === repository.createToken.mock.calls[0][2]).toBe(false);
  });

  it.each(['', 'invalid', 'https://app.example/?query=1', 'https://app.example/#/login', 'https://user:password@app.example'])('recusa URL inválida antes de consultar a conta: %s', async url => {
    const { service, repository, sender } = dependencies(url);
    await expect(service.requestVerification('user-1')).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.findById).not.toHaveBeenCalled();
    expect(sender.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('exige HTTPS em produção e não envia sem provedor configurado', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { service, repository } = dependencies();
    await expect(service.requestVerification('user-1')).rejects.toMatchObject({ statusCode: 503 });
    const noProvider = new EmailVerificationService(repository as never, { isConfigured: false, sendEmailVerification: vi.fn() }, 'https://app.example');
    await expect(noProvider.requestVerification('user-1')).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('não gera novo token para conta já confirmada', async () => {
    const { service, repository, sender } = dependencies();
    repository.findById.mockResolvedValue({ id: 'user-1', email: 'recipient@example.com', emailVerifiedAt: new Date() } as never);
    await service.requestVerification('user-1');
    expect(repository.createToken).not.toHaveBeenCalled();
    expect(sender.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('revoga token e omite detalhes do SMTP se o envio falhar', async () => {
    const { service, repository, sender } = dependencies();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    sender.sendEmailVerification.mockRejectedValue(new Error('private provider details'));
    await expect(service.requestVerification('user-1')).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.markTokenUsed).toHaveBeenCalledWith('token-row');
    expect(log).toHaveBeenCalledExactlyOnceWith('Falha no envio do e-mail de confirmação.');
  });

  it('confirma usando o hash e rejeita token recusado pelo repositório', async () => {
    const { service, repository } = dependencies();
    await expect(service.confirm('test-token')).resolves.toHaveProperty('message');
    expect(repository.consumeEmailVerification).toHaveBeenCalledWith(createHash('sha256').update('test-token').digest('hex'), expect.any(Date));
    repository.consumeEmailVerification.mockResolvedValue(false);
    await expect(service.confirm('test-token')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('consumo atômico do token de confirmação', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  let usedAt: Date | null;
  beforeEach(() => {
    vi.resetAllMocks();
    usedAt = null;
    db.findFirst.mockImplementation(async () => usedAt ? null : { id: 'token-row', userId: 'user-1' });
    db.updateMany.mockImplementation(async () => {
      if (usedAt) return { count: 0 };
      usedAt = now;
      return { count: 1 };
    });
    db.userUpdate.mockResolvedValue({ id: 'user-1' });
    db.transaction.mockImplementation(async work => {
      const snapshot = usedAt;
      try { return await work({ $queryRaw: async () => [{ id: 'user-1' }], authToken: { findFirst: db.findFirst, updateMany: db.updateMany }, user: { update: db.userUpdate } }); }
      catch (error) { usedAt = snapshot; throw error; }
    });
  });

  it('valida tipo, validade e conta ativa; consome e audita junto com a confirmação', async () => {
    expect(await new AuthRepository().consumeEmailVerification('token-hash', now)).toBe(true);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.findFirst).toHaveBeenCalledWith({
      where: { tokenHash: 'token-hash', type: 'EMAIL_VERIFICATION', usedAt: null, expiresAt: { gt: now }, user: { deletedAt: null } },
      select: { id: true, userId: true },
    });
    expect(db.updateMany).toHaveBeenCalledWith({ where: { id: 'token-row', usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    expect(db.userUpdate).toHaveBeenCalledWith({ where: { id: 'user-1', deletedAt: null },
      data: { emailVerifiedAt: now, auditLogs: { create: { action: 'EMAIL_CONFIRMADO', occurredAt: now } } }, select: { id: true } });
    expect(await new AuthRepository().consumeEmailVerification('token-hash', now)).toBe(false);
    expect(db.userUpdate).toHaveBeenCalledOnce();
  });

  it('não altera conta para token inválido ou consumo concorrente perdido', async () => {
    db.findFirst.mockResolvedValueOnce(null);
    expect(await new AuthRepository().consumeEmailVerification('missing', now)).toBe(false);
    db.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await new AuthRepository().consumeEmailVerification('race', now)).toBe(false);
    expect(db.userUpdate).not.toHaveBeenCalled();
  });

  it('reverte consumo do token se a confirmação ou auditoria falhar', async () => {
    db.userUpdate.mockRejectedValueOnce(new Error('write failed'));
    await expect(new AuthRepository().consumeEmailVerification('token-hash', now)).rejects.toThrow('write failed');
    expect(usedAt).toBeNull();
    expect(await new AuthRepository().consumeEmailVerification('token-hash', now)).toBe(true);
  });
});
