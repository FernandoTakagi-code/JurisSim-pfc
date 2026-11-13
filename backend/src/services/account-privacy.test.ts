import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth-service';
import { AuthController } from '../controllers/auth-controller';

describe('personal data boundaries', () => {
  it('exports only the authenticated identity and rejects abusive pagination', async () => {
    const service = { exportData: vi.fn().mockResolvedValue({ page: 2 }) };
    const controller = new AuthController(service as never);
    const response = { json: vi.fn() };
    await controller.exportarDados({ auth: { userId: 'owner' }, query: { page: '2', userId: 'victim' } } as never, response as never);
    expect(service.exportData).toHaveBeenCalledExactlyOnceWith('owner', 2);
    for (const page of ['0', '-1', '1.5', '100001', ['1', '2'], {}]) {
      await expect(controller.exportarDados({ auth: { userId: 'owner' }, query: { page } } as never, response as never)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(service.exportData).toHaveBeenCalledTimes(1);
  });
  it('preserves the deletion hold even when a caller submits credentials', async () => {
    const repository = { findByIdWithSenha: vi.fn(), anonymizeUser: vi.fn() };
    await expect(new AuthService(repository as never).deleteAccount('owner', 'password')).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.findByIdWithSenha).not.toHaveBeenCalled(); expect(repository.anonymizeUser).not.toHaveBeenCalled();
    const service = { deleteAccount: vi.fn() };
    const controller = new AuthController(service as never);
    await expect(controller.excluirConta({ auth: { userId: 'owner' }, body: { confirmation: 'EXCLUIR', senhaAtual: 'password' } } as never, {} as never)).rejects.toMatchObject({ statusCode: 503 });
    expect(service.deleteAccount).not.toHaveBeenCalled();
  });
});
