import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import versions from '../legal-versions.json';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), auditCreate: vi.fn(),
  verifyIdToken: vi.fn(), payload: { email: 'ana@example.com', email_verified: true, name: 'Ana Google' },
}));
const users = new Map<string, Record<string, unknown>>();
vi.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUnique, create: mocks.create, update: mocks.update },
    auditLog: { create: mocks.auditCreate },
    simulado: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock('google-auth-library', () => ({
  OAuth2Client: class { verifyIdToken = mocks.verifyIdToken; },
}));

const acceptance = { accepted: true, termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion };
const secret = 'chave-exclusiva-de-testes-google-com-mais-de-32-caracteres';
let server: Server;
let base: string;

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = 'client-id-de-teste';
  process.env.JWT_SECRET = secret;
  const { authRoutes } = await import('../routes/auth-routes');
  const { errorHandler } = await import('../middlewares/error-handler');
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

beforeEach(() => {
  users.clear();
  mocks.findUnique.mockReset().mockImplementation(({ where }: { where: { email: string } }) => users.get(where.email) ?? null);
  mocks.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const user = { id: 'google-user-1', nome: data.nome, email: data.email, role: data.role, senhaHash: data.senhaHash, legalAcceptedAt: data.legalAcceptedAt, termsVersion: data.termsVersion, privacyVersion: data.privacyVersion };
    users.set(String(user.email), user);
    return { id: user.id, nome: user.nome, email: user.email, role: user.role };
  });
  mocks.update.mockReset().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const [email, current] = [...users.entries()].find(([, user]) => user.id === where.id)!;
    const updated = { ...current, legalAcceptedAt: data.legalAcceptedAt, termsVersion: data.termsVersion, privacyVersion: data.privacyVersion };
    users.set(email, updated);
    return updated;
  });
  mocks.auditCreate.mockReset().mockResolvedValue({});
  mocks.payload = { email: 'ana@example.com', email_verified: true, name: 'Ana Google' };
  mocks.verifyIdToken.mockReset().mockResolvedValue({ getPayload: () => mocks.payload });
});

afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

async function google(body: Record<string, unknown> = { credential: 'google-id-token' }) {
  return fetch(`${base}/auth/google`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('login Google e aceite legal', () => {
  it('solicita aceite no primeiro acesso sem persistir conta antes da confirmação', async () => {
    const response = await google({ credential: 'google-id-token', role: 'ADMIN' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requiresAcceptance: true });
    expect(mocks.verifyIdToken).toHaveBeenCalledWith({ idToken: 'google-id-token', audience: 'client-id-de-teste' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('cria como ALUNO, grava versões e audita somente depois do aceite atual', async () => {
    expect((await google()).status).toBe(200);
    const response = await google({ credential: 'google-id-token', acceptance, role: 'PROFESSOR' });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.usuario).toMatchObject({ id: 'google-user-1', role: 'ALUNO' });
    const saved = mocks.create.mock.calls[0][0].data;
    expect(saved.role).toBe('ALUNO');
    expect(saved.legalAcceptedAt).toBeInstanceOf(Date);
    expect(saved.termsVersion).toBe(versions.termsVersion);
    expect(saved.privacyVersion).toBe(versions.privacyVersion);
    expect(saved.auditLogs.create.map((event: { action: string }) => event.action)).toEqual(['ACEITE_TERMOS_E_PRIVACIDADE', 'USUARIO_CADASTRADO']);
    expect(jwt.verify(result.token, secret)).toMatchObject({ role: 'ALUNO' });
  });

  it('não aceita versões antigas nem aceite falso no primeiro acesso', async () => {
    const old = await google({ credential: 'google-id-token', acceptance: { ...acceptance, termsVersion: 'antiga' } });
    expect(old.status).toBe(400);
    const unchecked = await google({ credential: 'google-id-token', acceptance: { ...acceptance, accepted: false } });
    expect(unchecked.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('faz login direto de conta Google com aceite vigente, sem pedir nova confirmação', async () => {
    users.set('ana@example.com', {
      id: 'google-user-1', nome: 'Ana Google', email: 'ana@example.com', role: 'ALUNO', senhaHash: '!GOOGLE_OAUTH_ACCOUNT!',
      legalAcceptedAt: new Date(), termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion,
    });
    const response = await google();
    expect(response.status).toBe(200);
    expect((await response.json()).usuario.role).toBe('ALUNO');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('pede aceite de conta Google legada e registra nova versão sem recriar usuário', async () => {
    users.set('ana@example.com', {
      id: 'google-user-1', nome: 'Ana Google', email: 'ana@example.com', role: 'ALUNO', senhaHash: '!GOOGLE_OAUTH_ACCOUNT!',
      legalAcceptedAt: null, termsVersion: null, privacyVersion: null,
    });
    expect((await (await google()).json())).toEqual({ requiresAcceptance: true });
    const response = await google({ credential: 'google-id-token', acceptance });
    expect(response.status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'google-user-1' },
      data: expect.objectContaining({ termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion, auditLogs: { create: expect.objectContaining({ action: 'ACEITE_TERMOS_E_PRIVACIDADE' }) } }),
    }));
  });

  it('não vincula uma conta tradicional existente pelo e-mail Google', async () => {
    users.set('ana@example.com', { id: 'password-user', nome: 'Ana', email: 'ana@example.com', role: 'PROFESSOR', senhaHash: '$2b$10$hash-de-senha' });
    const response = await google();
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain('Entre com seu e-mail e senha');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('recusa e-mail não verificado antes de consultar ou criar conta', async () => {
    mocks.payload = { email: 'ana@example.com', email_verified: false, name: 'Ana Google' };
    const response = await google();
    expect(response.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
