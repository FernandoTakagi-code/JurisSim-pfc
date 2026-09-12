import bcrypt from 'bcrypt';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth-service';

describe('regras de autenticacao', () => {
  it('recusa cadastro com e-mail ja utilizado', async () => {
    const repository = { findByEmail: vi.fn().mockResolvedValue({ id: 'user-1' }) };
    const service = new AuthService(repository as never);
    await expect(service.register('Ana', 'ana@example.com', 'senha-segura')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('autentica usuario cadastrado', async () => {
    process.env.JWT_SECRET = 'uma-chave-de-teste-com-mais-de-trinta-e-dois-caracteres';
    const repository = { findByEmail: vi.fn().mockResolvedValue({ id: 'user-1', nome: 'Ana', email: 'ana@example.com', role: 'ALUNO', senhaHash: await bcrypt.hash('senha-segura', 4) }) };
    const service = new AuthService(repository as never);
    await expect(service.login('ana@example.com', 'senha-segura')).resolves.toHaveProperty('token');
  });
});
