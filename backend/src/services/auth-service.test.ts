import bcrypt from 'bcrypt';
import versions from '../legal-versions.json';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth-service';

// Login unit tests use repository doubles and must never consult the shared database.
vi.mock('./institution-service', async importOriginal => ({
  ...await importOriginal<typeof import('./institution-service')>(),
  currentAccess: vi.fn().mockResolvedValue(undefined),
}));

describe('regras de autenticacao', () => {
  it('keeps a newly invited identity in invitation onboarding without student diagnosis or teacher privileges',async()=>{
    const repository={findById:vi.fn().mockResolvedValue({id:'pending',nome:'Pending',email:'pending@example.invalid',role:'ALUNO',emailVerifiedAt:new Date(),registrationIntent:'TEACHER_INVITATION'}),hasCompletedDiagnostic:vi.fn(),hasCompletedInitialDiagnostic:vi.fn()};
    expect(await new AuthService(repository as never).session('pending')).toMatchObject({registrationIntent:'TEACHER_INVITATION',nextStep:'INVITATION',user:{role:'ALUNO'}});
    expect(repository.hasCompletedDiagnostic).not.toHaveBeenCalled();expect(repository.hasCompletedInitialDiagnostic).not.toHaveBeenCalled();
  });
  it('invitation login with Google cannot implicitly create a public student account',async()=>{
    const repository={findGoogleAccountsByEmail:vi.fn().mockResolvedValue([]),createGoogleUser:vi.fn()};
    await expect(new AuthService(repository as never).loginWithGoogle('unknown@example.invalid','Unknown',{accepted:true,...versions},undefined,undefined,true)).rejects.toMatchObject({statusCode:409});
    expect(repository.createGoogleUser).not.toHaveBeenCalled();
  });
  it('does not report global logout success when the account was not updated', async () => {
    const repository = { revokeSessions: vi.fn().mockResolvedValue({ count: 0 }) };
    await expect(new AuthService(repository as never).logout('missing')).rejects.toMatchObject({ statusCode: 401 });
  });
  it('persists Google institutional intent for a new individual account without assigning institutional privileges', async () => {
    vi.stubEnv('JWT_SECRET', 'isolated-intent-test-secret-with-more-than-32-characters');
    const repository = {
      findGoogleAccountsByEmail: vi.fn().mockResolvedValue([]),
      createGoogleUser: vi.fn().mockResolvedValue({ id: 'applicant', nome: 'Applicant', email: 'applicant@example.invalid', role: 'ALUNO', sessionVersion: 0 }),
      recordLogin: vi.fn(),
    };
    try {
      const service = new AuthService(repository as never);
      const result = await service.loginWithGoogle('applicant@example.invalid', 'Applicant', { accepted: true, ...versions }, undefined, 'INSTITUTION');
      expect(repository.createGoogleUser).toHaveBeenCalledWith('Applicant', 'applicant@example.invalid', expect.anything(), 'INSTITUTION');
      expect('token' in result && service.verifyToken(result.token).role).toBe('ALUNO');
    } finally { vi.unstubAllEnvs(); }
  });
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
