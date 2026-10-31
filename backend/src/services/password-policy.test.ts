import { afterEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { passwordError, validPasswordConfirmation } from '../password-policy';
import { passwordSchema } from './password-policy';
import { PasswordRecoveryService } from './password-recovery-service';
import { AuthService } from './auth-service';
import { AuthController } from '../controllers/auth-controller';

vi.mock('../lib/prisma', () => ({ prisma: {} }));
afterEach(() => vi.restoreAllMocks());

const weak = ['joao', 'Ab1!', 'abcdef1!', 'Abcdefg!', 'Abcdefg1', 'Abcdefg1 ', 'Ábcdefg1á'];
const valid = 'Fixture-password1!';

describe('central password policy', () => {
  it.each(weak)('rejects weak synthetic case %#', password => {
    expect(passwordSchema.safeParse(password).success).toBe(false);
    expect(passwordError(password)).toBeTypeOf('string');
    expect(validPasswordConfirmation(password, password)).toBe(false);
  });

  it.each(['Abcdef1!', 'Ábcdef1!', 'Valid1!' + 'x'.repeat(65)])('accepts valid synthetic case %#', password => {
    expect(passwordSchema.safeParse(password).success).toBe(true);
    expect(validPasswordConfirmation(password, password)).toBe(true);
  });

  it('preserves bcrypt byte limit including multibyte characters', () => {
    expect(passwordSchema.safeParse('A1!' + 'é'.repeat(35)).success).toBe(false);
    expect(passwordSchema.safeParse('A1!' + 'x'.repeat(70)).success).toBe(false);
    expect(validPasswordConfirmation(valid, valid + 'different')).toBe(false);
  });
});

describe('rejects invalid passwords before any effect', () => {
  it.each(weak)('service refuses weak synthetic reset %# before reading or consuming token', async password => {
    const repository = { getUsablePasswordHash: vi.fn(), consumeAndReset: vi.fn() };
    const hash = vi.spyOn(bcrypt, 'hash');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new PasswordRecoveryService(repository as never);
    await expect(service.resetPassword('synthetic-token', password, password)).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.getUsablePasswordHash).not.toHaveBeenCalled();
    expect(repository.consumeAndReset).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('refuses weak registration even when service is invoked directly', async () => {
    const repository = { findByEmail: vi.fn(), createUser: vi.fn() };
    await expect(new AuthService(repository as never).register('Fixture', 'fixture@example.invalid', 'joao')).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.findByEmail).not.toHaveBeenCalled();
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it.each(weak)('controller returns 400 without forwarding weak synthetic reset %#', async password => {
    const recovery = { resetPassword: vi.fn() };
    const controller = new AuthController({} as never, recovery as never, {} as never);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await controller.redefinirSenha({ body: { token: 't'.repeat(43), senha: password, confirmacaoSenha: password } } as never, response as never);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ message: passwordError(password) });
    expect(recovery.resetPassword).not.toHaveBeenCalled();
  });

  it('refuses different confirmations before consulting the token', async () => {
    const repository = { getUsablePasswordHash: vi.fn(), consumeAndReset: vi.fn() };
    await expect(new PasswordRecoveryService(repository as never).resetPassword('synthetic-token', valid, valid + 'other')).rejects.toMatchObject({ statusCode: 400, message: 'As senhas não coincidem.' });
    expect(repository.getUsablePasswordHash).not.toHaveBeenCalled();
    expect(repository.consumeAndReset).not.toHaveBeenCalled();
  });
});
