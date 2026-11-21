import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import versions from '../../../src/legal-versions.json';

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  findByIdForAuth: vi.fn(),
  findById: vi.fn(),
  recordLegalAcceptance: vi.fn(),
}));
vi.mock('../../../src/services/accounts/terms-of-use', async (importOriginal) => ({
  ...(await importOriginal<object>()), currentLegalVersions: mocks.current,
}));
vi.mock('../../../src/services/institutions/institution-service', async (importOriginal) => ({
  ...(await importOriginal<object>()), currentAccess: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../src/repositories/auth-repository', () => ({
  AuthRepository: class {
    findByIdForAuth = mocks.findByIdForAuth;
    findById = mocks.findById;
    recordLegalAcceptance = mocks.recordLegalAcceptance;
    hasCompletedDiagnostic = vi.fn().mockResolvedValue(true);
    findByEmail = vi.fn().mockResolvedValue(null);
    createUser = vi.fn();
  },
}));

import { AuthService } from '../../../src/services/accounts/auth-service';
import { createAuthRoutes } from '../../../src/routes/auth-routes';
import { errorHandler } from '../../../src/middlewares/error-handler';
import { assertCurrentAcceptance } from '../../../src/services/accounts/legal-acceptance';

const NEW = { termsVersion: '2026-11-21.1', privacyVersion: versions.privacyVersion };
const OLD = { termsVersion: '2026-11-13.1', privacyVersion: versions.privacyVersion };
const userId = '00000000-0000-4000-8000-0000000000a1';
const secret = 'isolated-unit-test-secret-at-least-32-characters';
let server: Server, base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRoutes());
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/auth`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.current.mockResolvedValue(NEW);
  mocks.findByIdForAuth.mockResolvedValue({ id: userId, role: 'ALUNO', deletedAt: null, emailVerifiedAt: new Date(), sessionVersion: 0, ...OLD });
});
const post = (body: unknown) => fetch(`${base}/legal-acceptance`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: userId, role: 'ALUNO', sessionVersion: 0 }, secret, { expiresIn: '1h' })}` },
  body: JSON.stringify(body),
});

describe('aceite validado contra a versão em vigor', () => {
  it('aceita somente as versões em vigor', async () => {
    await expect(assertCurrentAcceptance({ accepted: true, ...NEW })).resolves.toEqual(NEW);
    await expect(assertCurrentAcceptance({ accepted: true, ...OLD }))
      .rejects.toThrow('Os Termos de Uso foram atualizados. Recarregue a página e aceite a versão atual.');
  });

  it('confere o aceite contra a versão lida sem cache, para nunca gravar uma versão já substituída', async () => {
    await assertCurrentAcceptance({ accepted: true, ...NEW });
    expect(mocks.current).toHaveBeenCalledWith({ fresh: true });
  });

  it('cadastro com a versão antiga é recusado antes de criar a conta', async () => {
    const repository = { findByEmail: vi.fn().mockResolvedValue(null), createUser: vi.fn() };
    await expect(new AuthService(repository as never).register('Ana', 'ana@example.com', 'Senha-segura1!', { accepted: true, ...OLD }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it('POST /auth/legal-acceptance grava o aceite da versão em vigor', async () => {
    const response = await post({ accepted: true, ...NEW });
    expect(response.status).toBe(204);
    expect(mocks.recordLegalAcceptance).toHaveBeenCalledWith(userId, { accepted: true, ...NEW });
  });

  it('POST /auth/legal-acceptance com versão antiga responde 409 e não grava', async () => {
    const response = await post({ accepted: true, ...OLD });
    expect(response.status).toBe(409);
    expect((await response.json()).message).toBe('Os Termos de Uso foram atualizados. Recarregue a página e aceite a versão atual.');
    expect(mocks.recordLegalAcceptance).not.toHaveBeenCalled();
  });

  it('POST /auth/legal-acceptance sem aceite explícito responde 400', async () => {
    expect((await post({ accepted: false, ...NEW })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(mocks.recordLegalAcceptance).not.toHaveBeenCalled();
  });

  it('DELETE /auth/conta não é bloqueado para quem ainda não aceitou a nova versão', async () => {
    const response = await fetch(`${base}/conta`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: userId, role: 'ALUNO', sessionVersion: 0 }, secret, { expiresIn: '1h' })}` },
      body: JSON.stringify({}),
    });
    const body = await response.json().catch(() => ({}));
    expect(body.code).not.toBe('LEGAL_UPDATE_REQUIRED');
  });

  it('a sessão informa se é preciso aceitar a nova versão', async () => {
    const base = { id: userId, nome: 'Ana', email: 'ana@example.com', role: 'ALUNO', deletedAt: null, emailVerifiedAt: new Date(), registrationIntent: null };
    mocks.findById.mockResolvedValueOnce({ ...base, ...OLD });
    expect(await new AuthService().session(userId)).toMatchObject({ legalUpdateRequired: true, legalVersions: NEW });
    mocks.findById.mockResolvedValueOnce({ ...base, ...NEW });
    expect(await new AuthService().session(userId)).toMatchObject({ legalUpdateRequired: false, legalVersions: NEW });
  });
});
