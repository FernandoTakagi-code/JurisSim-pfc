import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import versions from '../../../src/legal-versions.json';

const mocks = vi.hoisted(() => ({
  findByIdForAuth: vi.fn(), currentTermsOfUse: vi.fn(), publishTermsOfUse: vi.fn(), termsOfUseOverview: vi.fn(), termsOfUseVersion: vi.fn(),
}));
vi.mock('../../../src/repositories/auth-repository', () => ({ AuthRepository: class { findByIdForAuth = mocks.findByIdForAuth; } }));
vi.mock('../../../src/services/institutions/institution-service', async (importOriginal) => ({
  ...(await importOriginal<object>()), currentAccess: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../src/services/accounts/terms-of-use', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  currentLegalVersions: vi.fn(async () => ({ termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion })),
  currentTermsOfUse: mocks.currentTermsOfUse,
  publishTermsOfUse: mocks.publishTermsOfUse,
  termsOfUseOverview: mocks.termsOfUseOverview,
  termsOfUseVersion: mocks.termsOfUseVersion,
}));

import { legalRoutes } from '../../../src/routes/legal-routes';
import { errorHandler } from '../../../src/middlewares/error-handler';
import { ApiError } from '../../../src/errors/api-error';

const secret = 'isolated-unit-test-secret-at-least-32-characters';
const userId = '00000000-0000-4000-8000-0000000000c1';
const terms = { version: '2026-11-13.1', publishedAt: '2026-11-13T03:00:00.000Z', sections: [{ title: '1. Atual', body: 'Texto' }] };
let server: Server, base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/legal', legalRoutes);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/legal`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentTermsOfUse.mockResolvedValue({ ...terms, publishedAt: new Date(terms.publishedAt) });
});

const as = (role: string | null): Record<string, string> => {
  if (role) mocks.findByIdForAuth.mockResolvedValue({ id: userId, role, registrationIntent: null, deletedAt: null, emailVerifiedAt: new Date(), sessionVersion: 0, termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion });
  return role ? { Authorization: `Bearer ${jwt.sign({ id: userId, role, sessionVersion: 0 }, secret, { expiresIn: '1h' })}` } : {};
};
const call = (path: string, role: string | null, method = 'GET', body?: unknown) => fetch(base + path, {
  method, headers: { 'Content-Type': 'application/json', ...as(role) }, ...(body ? { body: JSON.stringify(body) } : {}),
});

describe('rotas dos Termos de Uso', () => {
  it('GET /legal/current é público e traz os Termos em vigor e a versão do Aviso de Privacidade', async () => {
    const response = await call('/current', null);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ terms, privacyVersion: versions.privacyVersion });
  });

  it('rotas do admin exigem autenticação', async () => {
    expect((await call('/admin/terms-of-use', null)).status).toBe(401);
    expect((await call('/admin/terms-of-use', null, 'POST', { sections: [] })).status).toBe(401);
  });

  it.each(['ALUNO', 'PROFESSOR'])('rotas do admin recusam %s', async (role) => {
    expect((await call('/admin/terms-of-use', role)).status).toBe(403);
    expect((await call('/admin/terms-of-use', role, 'POST', { sections: terms.sections })).status).toBe(403);
    expect(mocks.publishTermsOfUse).not.toHaveBeenCalled();
  });

  it('ADMIN consulta a visão dos Termos', async () => {
    mocks.termsOfUseOverview.mockResolvedValue({ current: terms, history: [], acceptedCount: 1, activeAccounts: 2 });
    const response = await call('/admin/terms-of-use', 'ADMIN');
    expect(response.status).toBe(200);
    expect((await response.json()).acceptedCount).toBe(1);
  });

  it('ADMIN publica uma nova versão em seu próprio nome', async () => {
    mocks.publishTermsOfUse.mockResolvedValue({ version: '2026-11-21.1' });
    const sections = [{ title: '1. Novo', body: 'Texto novo' }];
    const response = await call('/admin/terms-of-use', 'ADMIN', 'POST', { sections });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ version: '2026-11-21.1' });
    expect(mocks.publishTermsOfUse).toHaveBeenCalledWith(userId, sections);
  });

  it('erros de validação da publicação chegam ao cliente', async () => {
    mocks.publishTermsOfUse.mockRejectedValue(new ApiError(400, 'Revise as seções.'));
    const response = await call('/admin/terms-of-use', 'ADMIN', 'POST', { sections: [] });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('Revise as seções.');
  });

  it('ADMIN consulta uma versão antiga em modo leitura', async () => {
    mocks.termsOfUseVersion.mockResolvedValue(terms);
    const response = await call('/admin/terms-of-use/2026-11-13.1', 'ADMIN');
    expect(response.status).toBe(200);
    expect(mocks.termsOfUseVersion).toHaveBeenCalledWith('2026-11-13.1');
  });

  it('recusa identificador de versão fora do formato', async () => {
    expect((await call('/admin/terms-of-use/abc', 'ADMIN')).status).toBe(404);
    expect(mocks.termsOfUseVersion).not.toHaveBeenCalled();
  });
});
