import bcrypt from 'bcrypt';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth-service';
import { GOOGLE_PASSWORD_SENTINEL } from '../repositories/auth-repository';

describe('non-destructive account deactivation', () => {
  it('requires the current password and delegates the checked hash to the transaction', async () => {
    const hash = await bcrypt.hash('Isolated-password1!', 4);
    const repository = { findByIdWithSenha: vi.fn().mockResolvedValue({ id: 'owner', senhaHash: hash }), deactivateUser: vi.fn() };
    const service = new AuthService(repository as never);
    await expect(service.deactivateAccount('owner', 'wrong')).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.deactivateUser).not.toHaveBeenCalled();
    await expect(service.deactivateAccount('owner', 'Isolated-password1!')).resolves.toHaveProperty('message');
    expect(repository.deactivateUser).toHaveBeenCalledWith('owner', hash);
  });
  it.each([null, GOOGLE_PASSWORD_SENTINEL])('does not deactivate Google accounts without reauthentication', async senhaHash => {
    const repository = { findByIdWithSenha: vi.fn().mockResolvedValue({ id: 'owner', senhaHash }), deactivateUser: vi.fn() };
    await expect(new AuthService(repository as never).deactivateAccount('owner', 'anything')).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.deactivateUser).not.toHaveBeenCalled();
  });
  it('keeps deletion disabled until explicitly enabled after migration', async () => {
    const repository = { anonymizeUser: vi.fn() };
    await expect(new AuthService(repository as never).deleteAccount('owner', 'anything')).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.anonymizeUser).not.toHaveBeenCalled();
  });
});
