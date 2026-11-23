import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => ({ findByIdForAuth: vi.fn() }));
vi.mock('../../../src/repositories/auth-repository', () => ({
  AuthRepository: class { findByIdForAuth = mocks.findByIdForAuth; },
}));
vi.mock('../../../src/services/institutions/institution-service', async (importOriginal) => ({
  ...(await importOriginal<object>()), currentAccess: vi.fn().mockResolvedValue(null),
}));

import { requireAuth, requireAuthAllowingTermsUpdate, requireLimitedAuth } from '../../../src/middlewares/auth-middleware';
import { errorHandler } from '../../../src/middlewares/error-handler';
import { currentLegalVersions } from '../../../src/services/accounts/terms-of-use';

const userId = '00000000-0000-4000-8000-0000000000b1';
const secret = 'isolated-unit-test-secret-at-least-32-characters';
const NEW = { termsVersion: '2026-11-21.1', privacyVersion: '2026-11-13.1' };
let server: Server, base: string;

beforeAll(async () => {
  const app = express();
  app.get('/protegida', requireAuth, (_req, res) => { res.json({ ok: true }); });
  app.get('/limitada', requireLimitedAuth, (_req, res) => { res.json({ ok: true }); });
  app.get('/exclusao', requireAuthAllowingTermsUpdate, (_req, res) => { res.json({ ok: true }); });
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.mocked(currentLegalVersions).mockResolvedValue(NEW);
  mocks.findByIdForAuth.mockReset();
});

const account = (overrides: object) => mocks.findByIdForAuth.mockResolvedValue({
  id: userId, role: 'ALUNO', registrationIntent: null, deletedAt: null, emailVerifiedAt: new Date(), sessionVersion: 0, ...overrides,
});
const get = (path: string) => fetch(base + path, {
  headers: { Authorization: `Bearer ${jwt.sign({ id: userId, role: 'ALUNO', sessionVersion: 0 }, secret, { expiresIn: '1h' })}` },
});

describe('bloqueio até aceitar a nova versão dos Termos', () => {
  it('bloqueia rotas comuns com 403 LEGAL_UPDATE_REQUIRED quando o aceite está desatualizado', async () => {
    account({ termsVersion: '2026-11-13.1', privacyVersion: '2026-11-13.1' });
    const response = await get('/protegida');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: 'Os Termos de Uso foram atualizados. Aceite a nova versão para continuar.',
      code: 'LEGAL_UPDATE_REQUIRED',
    });
  });

  it('bloqueia conta sem nenhum aceite registrado', async () => {
    account({ termsVersion: null, privacyVersion: null });
    expect((await get('/protegida')).status).toBe(403);
  });

  it('libera as rotas limitadas (sessão, logout, aceite)', async () => {
    account({ termsVersion: '2026-11-13.1', privacyVersion: '2026-11-13.1' });
    expect((await get('/limitada')).status).toBe(200);
  });

  it('libera quem aceitou a versão em vigor sem consultas extras ao banco', async () => {
    account(NEW);
    expect((await get('/protegida')).status).toBe(200);
    expect(mocks.findByIdForAuth).toHaveBeenCalledTimes(1);
  });

  it('quem recusa os Termos novos ainda pode usar a exclusão de conta', async () => {
    account({ termsVersion: '2026-11-13.1', privacyVersion: '2026-11-13.1' });
    expect((await get('/exclusao')).status).toBe(200);
  });

  it('a exclusão continua exigindo e-mail confirmado', async () => {
    account({ emailVerifiedAt: null, termsVersion: '2026-11-13.1', privacyVersion: '2026-11-13.1' });
    const response = await get('/exclusao');
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe('Confirme seu e-mail para acessar este recurso.');
  });

  it('a falta de confirmação do e-mail continua tendo prioridade', async () => {
    account({ emailVerifiedAt: null, termsVersion: null, privacyVersion: null });
    const response = await get('/protegida');
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe('Confirme seu e-mail para acessar este recurso.');
  });
});
