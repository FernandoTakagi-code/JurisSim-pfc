import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { AuthService } from './auth-service';
import { PASSWORD_RECOVERY_TOKEN_TTL_MINUTES, PasswordRecoveryService } from './password-recovery-service';
import { PasswordRecoveryRepository } from '../repositories/password-recovery-repository';
import { GOOGLE_PASSWORD_SENTINEL } from '../repositories/auth-repository';

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(), userUpdateMany: vi.fn(),
  tokenCount: vi.fn(), tokenCreate: vi.fn(), tokenFindUnique: vi.fn(), tokenUpdateMany: vi.fn(), auditCreate: vi.fn(), transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: db.userFindUnique, updateMany: db.userUpdateMany },
    passwordRecoveryToken: { findUnique: db.tokenFindUnique, updateMany: db.tokenUpdateMany },
    auditLog: { create: db.auditCreate },
    $transaction: db.transaction,
  },
}));

const now = new Date('2026-09-27T12:00:00.000Z');
const email = 'aluno@example.com';

function recoveryDependencies(account: { id: string; senhaHash: string | null } | null = { id: 'user-1', senhaHash: '$2b$10$traditional-hash' }) {
  const repository = {
    findAccount: vi.fn().mockResolvedValue(account),
    createToken: vi.fn().mockResolvedValue('recovery-row-1'),
    invalidateToken: vi.fn().mockResolvedValue(undefined),
    isTokenUsable: vi.fn().mockResolvedValue(true),
    consumeAndReset: vi.fn().mockResolvedValue(true),
  };
  const sender = { isConfigured: true, sendPasswordRecovery: vi.fn().mockResolvedValue(undefined) };
  return { repository, sender, service: new PasswordRecoveryService(repository as never, sender, 'http://localhost:5173') };
}

describe('solicitação de recuperação', () => {
  afterEach(() => vi.useRealTimers());

  it('responde de forma neutra para e-mail tradicional existente e inexistente', async () => {
    const existing = recoveryDependencies();
    const missing = recoveryDependencies(null);
    const existingResponse = await existing.service.requestRecovery(email);
    const missingResponse = await missing.service.requestRecovery(email);
    expect(existingResponse).toBe(missingResponse);
    expect(existingResponse).toMatch(/^Se existir uma conta associada/);
    expect(existing.sender.sendPasswordRecovery).toHaveBeenCalledOnce();
    expect(missing.sender.sendPasswordRecovery).not.toHaveBeenCalled();
    expect(missing.repository.createToken).not.toHaveBeenCalled();
  });

  it('não gera token nem envia e-mail para contas Google', async () => {
    const googleAccount = recoveryDependencies({ id: 'google-user', senhaHash: GOOGLE_PASSWORD_SENTINEL });
    const response = await googleAccount.service.requestRecovery(email);
    expect(response).toMatch(/^Se existir uma conta associada/);
    expect(googleAccount.repository.createToken).not.toHaveBeenCalled();
    expect(googleAccount.sender.sendPasswordRecovery).not.toHaveBeenCalled();
  });

  it('gera token aleatório de 32 bytes, persiste apenas SHA-256 e envia link no fragmento', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { service, repository, sender } = recoveryDependencies();
    await service.requestRecovery(email);

    const [userId, tokenHash, createdAt, expiresAt] = repository.createToken.mock.calls[0];
    const message = sender.sendPasswordRecovery.mock.calls[0][0];
    const fragment = new URL(message.resetUrl).hash;
    const rawToken = new URLSearchParams(fragment.slice(fragment.indexOf('?') + 1)).get('token')!;
    expect(Buffer.from(rawToken, 'base64url')).toHaveLength(32);
    expect(tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(tokenHash).not.toBe(rawToken);
    expect(userId).toBe('user-1');
    expect(createdAt).toEqual(now);
    expect(expiresAt.getTime() - createdAt.getTime()).toBe(PASSWORD_RECOVERY_TOKEN_TTL_MINUTES * 60_000);
    expect(message.to).toBe(email);
    expect(message.resetUrl).not.toContain(rawToken + '&');
  });

  it('não consulta e-mail nem cria token enquanto não há provedor configurado', async () => {
    const { repository } = recoveryDependencies();
    const sender = { isConfigured: false, sendPasswordRecovery: vi.fn() };
    const service = new PasswordRecoveryService(repository as never, sender, 'https://jurissim.example');
    await expect(service.requestRecovery(email)).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.findAccount).not.toHaveBeenCalled();
  });

  it('revoga o token se o envio falhar sem registrar token ou destinatário', async () => {
    const { service, repository, sender } = recoveryDependencies();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    sender.sendPasswordRecovery.mockRejectedValue(new Error('provider response contains sensitive details'));
    await expect(service.requestRecovery(email)).resolves.toMatch(/^Se existir uma conta associada/);
    expect(repository.invalidateToken).toHaveBeenCalledWith('recovery-row-1', expect.any(Date));
    expect(log).toHaveBeenCalledWith('Falha no envio do e-mail de recuperação de senha.');
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining(email));
    log.mockRestore();
  });
});

describe('consumo atômico e redefinição', () => {
  let storedToken: { id: string; userId: string; expiresAt: Date; consumedAt: Date | null } | null;
  let account: { id: string; senhaHash: string | null } | null;

  beforeEach(() => {
    storedToken = { id: 'recovery-row-1', userId: 'user-1', expiresAt: new Date(now.getTime() + 60_000), consumedAt: null };
    account = { id: 'user-1', senhaHash: '$2b$10$traditional-hash' };
    db.tokenFindUnique.mockReset().mockImplementation(async () => storedToken);
    db.userFindUnique.mockReset().mockImplementation(async () => account);
    db.tokenUpdateMany.mockReset().mockImplementation(async () => {
      if (!storedToken || storedToken.consumedAt) return { count: 0 };
      storedToken = { ...storedToken, consumedAt: now };
      return { count: 1 };
    });
    db.userUpdateMany.mockReset().mockImplementation(async ({ data }: { data: { senhaHash: string } }) => {
      if (!account || account.senhaHash === GOOGLE_PASSWORD_SENTINEL) return { count: 0 };
      account = { ...account, senhaHash: data.senhaHash };
      return { count: 1 };
    });
    db.auditCreate.mockReset().mockResolvedValue({});
    db.transaction.mockReset().mockImplementation((work: (tx: unknown) => Promise<unknown>) => work({
      passwordRecoveryToken: { count: db.tokenCount, create: db.tokenCreate, findUnique: db.tokenFindUnique, updateMany: db.tokenUpdateMany },
      user: { findUnique: db.userFindUnique, updateMany: db.userUpdateMany },
      auditLog: { create: db.auditCreate },
    }));
  });

  it('rejeita token inválido, expirado e já utilizado sem trocar senha', async () => {
    const repository = new PasswordRecoveryRepository();
    db.tokenFindUnique.mockResolvedValueOnce(null);
    expect(await repository.consumeAndReset('invalid-hash', 'new-hash', now)).toBe(false);
    storedToken = { ...storedToken!, expiresAt: new Date(now.getTime() - 1) };
    expect(await repository.consumeAndReset('expired-hash', 'new-hash', now)).toBe(false);
    storedToken = { ...storedToken!, expiresAt: new Date(now.getTime() + 60_000), consumedAt: now };
    expect(await repository.consumeAndReset('used-hash', 'new-hash', now)).toBe(false);
    expect(db.userUpdateMany).not.toHaveBeenCalled();
  });

  it('consome o token, troca somente o hash da senha e audita em uma transação', async () => {
    const repository = new PasswordRecoveryRepository();
    expect(await repository.consumeAndReset('token-hash', 'new-password-hash', now)).toBe(true);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.tokenUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'recovery-row-1', consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    }));
    expect(db.userUpdateMany).toHaveBeenCalledWith({ where: { id: 'user-1', senhaHash: '$2b$10$traditional-hash' }, data: { senhaHash: 'new-password-hash' } });
    expect(db.auditCreate).toHaveBeenCalledWith({ data: { userId: 'user-1', action: 'PASSWORD_RECOVERY_COMPLETED', occurredAt: now } });
    expect(storedToken?.consumedAt).toEqual(now);
    expect(account?.senhaHash).toBe('new-password-hash');
  });

  it('não altera senha de conta Google nem consome seu token', async () => {
    const repository = new PasswordRecoveryRepository();
    account = { id: 'user-1', senhaHash: GOOGLE_PASSWORD_SENTINEL };
    expect(await repository.consumeAndReset('token-hash', 'new-password-hash', now)).toBe(false);
    expect(db.tokenUpdateMany).not.toHaveBeenCalled();
    expect(db.userUpdateMany).not.toHaveBeenCalled();
  });

  it('usa o hash bcrypt padrão e permite login tradicional com a nova senha', async () => {
    process.env.JWT_SECRET = 'chave-de-teste-da-recuperacao-com-mais-de-32-caracteres';
    const { repository, service } = recoveryDependencies();
    const resetToken = 'x'.repeat(43);
    let savedHash = '';
    repository.consumeAndReset.mockImplementation(async (_tokenHash: string, passwordHash: string) => {
      savedHash = passwordHash;
      return true;
    });
    await service.resetPassword(resetToken, 'nova-senha-segura', 'nova-senha-segura');
    expect(await bcrypt.compare('nova-senha-segura', savedHash)).toBe(true);
    expect(bcrypt.getRounds(savedHash)).toBe(10);
    const authRepository = {
      findByEmail: vi.fn().mockResolvedValue({ id: 'user-1', nome: 'Aluno', email, role: 'ALUNO', senhaHash: savedHash }),
      recordLogin: vi.fn().mockResolvedValue(undefined),
    };
    await expect(new AuthService(authRepository as never).login(email, 'nova-senha-segura')).resolves.toHaveProperty('token');
  });

  it('rejeita tentativa de reutilizar o token e confirmação divergente', async () => {
    const { repository, service } = recoveryDependencies();
    repository.isTokenUsable.mockResolvedValue(false);
    repository.consumeAndReset.mockResolvedValue(false);
    await expect(service.resetPassword('x'.repeat(43), 'nova-senha', 'nova-senha')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.resetPassword('x'.repeat(43), 'nova-senha', 'outra-senha')).rejects.toThrow('As senhas não coincidem.');
    expect(repository.consumeAndReset).not.toHaveBeenCalled();
  });
});
