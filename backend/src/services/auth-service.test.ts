import bcrypt from 'bcrypt';
import versions from '../legal-versions.json';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth-service';

describe('regras de autenticacao', () => {
  it.each(['ALUNO', 'PROFESSOR', 'ADMIN'])('login único preserva o papel %s sem exigir escolha visual', async role => {
    vi.stubEnv('INSTITUTIONS_ENABLED', 'false');
    vi.stubEnv('JWT_SECRET', 'login-unico-test-secret-com-mais-de-32-caracteres');
    try {
      const account = { id: 'unique-user', nome: 'Conta de teste', email: 'unique@example.invalid', role, sessionVersion: 0, senhaHash: await bcrypt.hash('senha-isolada', 4) };
      const repository = { findByEmail: vi.fn().mockResolvedValue(account), recordLogin: vi.fn().mockResolvedValue(undefined) };
      const service = new AuthService(repository as never);
      const result = await service.login(account.email, 'senha-isolada');
      expect(service.verifyToken(result.token).role).toBe(role);
      expect(repository.recordLogin).toHaveBeenCalledWith('LOGIN_SUCESSO', account.id);
    } finally { vi.unstubAllEnvs(); }
  });
  it('recusa cadastro com e-mail ja utilizado', async () => { const repository = { findByEmail: vi.fn().mockResolvedValue({ id: 'user-1' }) }; const service = new AuthService(repository as never); await expect(service.register('Ana', 'ana@example.com', 'Senha-segura1!', { accepted: true, ...versions })).rejects.toMatchObject({ statusCode: 409 }); });
  it('autentica aluno sem vinculo com turma', async () => { process.env.JWT_SECRET = 'uma-chave-de-teste-com-mais-de-trinta-e-dois-caracteres'; const repository = { findByEmail: vi.fn().mockResolvedValue({ id: 'user-1', nome: 'Ana', email: 'ana@example.com', role: 'ALUNO', sessionVersion: 0, senhaHash: await bcrypt.hash('senha-segura', 4) }), recordLogin: vi.fn().mockResolvedValue(undefined) }; const service = new AuthService(repository as never); await expect(service.login('ana@example.com', 'senha-segura')).resolves.toHaveProperty('token'); expect(repository.recordLogin).toHaveBeenCalledWith('LOGIN_SUCESSO', 'user-1'); });
});
