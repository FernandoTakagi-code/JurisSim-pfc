import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import type { Server } from 'node:http';
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), auth: vi.fn(), create: vi.fn(), audit: vi.fn(), revoke: vi.fn(), google: vi.fn() }));
vi.mock('../repositories/auth-repository', () => ({ GOOGLE_PASSWORD_SENTINEL: '!GOOGLE_OAUTH_ACCOUNT!', AuthRepository: class {
  findByEmail = mocks.find; findGoogleAccountsByEmail = async (email: string) => { const user = await mocks.find(email); return user ? [user] : []; };
  findByIdForAuth = mocks.auth; createUser = mocks.create; recordLogin = mocks.audit; revokeSessions = mocks.revoke;
} }));
vi.mock('google-auth-library', () => ({ OAuth2Client: class { verifyIdToken = mocks.google; } }));
import { AuthController } from '../controllers/auth-controller';
import { AuthService } from '../services/auth-service';
import { createAuthRoutes } from './auth-routes';
import { errorHandler } from '../middlewares/error-handler';
import { authRateLimit } from '../middlewares/auth-rate-limit';
import versions from '../legal-versions.json';
let server: Server, base: string, hash: string, clock = 100;
const secret = 'auth-stage7-http-fixture-secret-over-32-characters';
const acceptance = { accepted: true, ...versions };
const body = { nome: 'Fixture', email: 'fixture@example.invalid', senha: 'Fixture-password1!', confirmacaoSenha: 'Fixture-password1!', acceptance };
const account = (role = 'ALUNO') => ({ id: 'fixture', nome: 'Fixture', email: body.email, role, senhaHash: hash, sessionVersion: 0, deletedAt: null, emailVerifiedAt: new Date() });
const call = (path: string, data?: unknown, token?: string) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data ?? {}) });
beforeAll(async () => { hash = await bcrypt.hash(body.senha, 4); });
beforeEach(async () => {
  vi.clearAllMocks(); process.env.JWT_SECRET = secret; process.env.GOOGLE_CLIENT_ID = 'isolated-client'; clock = 100;
  process.env.APP_PUBLIC_URL = 'http://localhost:5173';
  mocks.find.mockResolvedValue(null); mocks.auth.mockResolvedValue(account()); mocks.create.mockResolvedValue(account()); mocks.audit.mockResolvedValue({}); mocks.revoke.mockResolvedValue({ count: 1 });
  mocks.google.mockResolvedValue({ getPayload: () => ({ email: body.email, name: body.nome, email_verified: true, nonce: 'a'.repeat(64) }) });
  const controller = new AuthController(new AuthService(), { requestRecovery: async () => 'Resposta neutra', resetPassword: async () => ({ message: 'ok' }) } as never, { requestVerification: async () => ({ message: 'Envio simulado' }), confirm: async () => ({ message: 'ok' }) } as never);
  const app = express(); app.use(express.json()); app.use('/auth', createAuthRoutes(controller)); app.post('/rate', authRateLimit(2, 1000, () => clock), (_req, res) => res.json({ ok: true })); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
describe('stage 7 authentication contracts', () => {
  it.each([{ nome: ' ' }, { email: 'invalid' }, { role: 'ADMIN' }, { senha: 'short' }, { senha: 'é'.repeat(37) }, { confirmacaoSenha: 'different' }, { acceptance: undefined }, { acceptance: { ...acceptance, accepted: false } }])('rejects invalid registration without persistence', async override => {
    expect((await call('/auth/register', { ...body, ...override })).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('registers trimmed name/email, safe hash and allowed profile only', async () => {
    const response = await call('/auth/register', { ...body, nome: ' Fixture ', email: ' fixture@example.invalid ', sessionVersion: 100, emailVerifiedAt: new Date() });
    expect(response.status).toBe(201); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.create.mock.calls[0][0]).toBe('Fixture'); expect(mocks.create.mock.calls[0][1]).toBe(body.email);
    expect(await bcrypt.compare(body.senha, mocks.create.mock.calls[0][2])).toBe(true); expect(mocks.create.mock.calls[0][3]).toMatchObject({ accepted: true, termsVersion: acceptance.termsVersion, privacyVersion: acceptance.privacyVersion });
    expect(JSON.stringify(await response.json())).not.toContain('senhaHash');
  });
  it.each(['existing', 'concurrent'])('returns 409 for %s duplicate email', async mode => {
    if (mode === 'existing') mocks.find.mockResolvedValue(account()); else mocks.create.mockRejectedValue({ code: 'P2002' });
    expect((await call('/auth/register', body)).status).toBe(409);
  });
  it.each([['ALUNO', 'PROFESSOR'], ['PROFESSOR', 'ALUNO']])('does not ignore %s requesting %s login', async (role, perfil) => {
    mocks.find.mockResolvedValue(account(role)); expect((await call('/auth/login', { email: body.email, senha: body.senha, perfil })).status).toBe(403);
  });
  it.each(['ALUNO', 'PROFESSOR', 'ADMIN'])('honors current %s role, not a submitted privilege', async role => {
    mocks.find.mockResolvedValue(account(role)); const response = await call('/auth/login', { email: body.email, senha: body.senha, perfil: role === 'ALUNO' ? 'ALUNO' : 'PROFESSOR', role: 'ADMIN' });
    expect(response.status).toBe(200); const token = (await response.json()).token; expect((jwt.verify(token, secret) as jwt.JwtPayload).role).toBe(role);
  });
  it('does not issue JWT to a deleted account', async () => { mocks.find.mockResolvedValue({ ...account(), deletedAt: new Date() }); expect((await call('/auth/login', { email: body.email, senha: body.senha })).status).toBe(401); });
  it('rejects a correctly signed JWT with no expiration', async () => {
    const token = jwt.sign({ id: 'fixture', role: 'ALUNO', sessionVersion: 0 }, secret);
    expect((await call('/auth/logout', {}, token)).status).toBe(401); expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it.each([undefined, 'b'.repeat(64), 'not-a-nonce'])('rejects missing, mismatched and malformed Google nonce', async nonce => {
    expect([400, 401]).toContain((await call('/auth/google', { credential: 'isolated-id-token', nonce })).status); expect(mocks.find).not.toHaveBeenCalled();
  });
  it('does not create Google student through teacher selection', async () => { expect((await call('/auth/google', { credential: 'isolated-id-token', nonce: 'a'.repeat(64), perfil: 'PROFESSOR', acceptance })).status).toBe(403); });
  it('requires valid identity for logout and allows an unconfirmed account to exit', async () => {
    expect((await call('/auth/logout')).status).toBe(401);
    mocks.auth.mockResolvedValue({ ...account(), emailVerifiedAt: null });
    const token = jwt.sign({ id: 'fixture', role: 'ADMIN', sessionVersion: 0 }, secret, { expiresIn: '1h' });
    expect((await call('/auth/logout', { userId: 'victim' }, token)).status).toBe(200); expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith('fixture');
  });
  it('rejects cross-site authentication before processing credentials', async () => {
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { Origin: 'https://other.example.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: body.email, senha: body.senha }) });
    expect(response.status).toBe(403); expect(mocks.find).not.toHaveBeenCalled();
  });
  it('limits attempts independently of username and ignores forwarded-IP spoofing', async () => {
    await call('/rate'); await call('/rate');
    const response = await fetch(base + '/rate', { method: 'POST', headers: { 'X-Forwarded-For': 'different-client' } });
    expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('1'); clock += 1000; expect((await call('/rate')).status).toBe(200);
  });
  it('enforces production login quota before further credential work', async () => {
    for (let i = 0; i < 30; i++) expect((await call('/auth/login', { email: 'missing@example.invalid', senha: 'Fixture-password1!' })).status).toBe(401);
    expect((await call('/auth/login', { email: 'other@example.invalid', senha: 'Fixture-password1!' })).status).toBe(429); expect(mocks.find).toHaveBeenCalledTimes(30);
  });
  it('rejects malformed JSON without logging its body or returning it', async () => {
    const response = await fetch(base + '/auth/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"private":"unfinished' });
    expect(response.status).toBe(400); expect(await response.text()).not.toContain('private');
  });
});
