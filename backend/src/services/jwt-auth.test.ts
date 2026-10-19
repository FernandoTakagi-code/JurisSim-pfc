import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';

const mocks = vi.hoisted(() => ({
  findByEmail: vi.fn(), findById: vi.fn(), findByIdForAuth: vi.fn(), recordLogin: vi.fn(), hasCompletedDiagnostic: vi.fn(), start: vi.fn(), createQuestion: vi.fn(),
}));
vi.mock('../repositories/auth-repository', async importOriginal => ({
  ...await importOriginal<typeof import('../repositories/auth-repository')>(),
  AuthRepository: class {
  findByEmail = mocks.findByEmail;
  findById = mocks.findById;
  findByIdForAuth = mocks.findByIdForAuth;
  recordLogin = mocks.recordLogin;
  hasCompletedDiagnostic = mocks.hasCompletedDiagnostic;
} }));
// Keep the real diagnostic router/controller; isolate database/business operations.
vi.mock('./diagnostic-service', () => ({ DiagnosticService: class { start = mocks.start; } }));
vi.mock('./QuestaoService', () => ({ QuestaoService: class { static criar = mocks.createQuestion; } }));

const secret = 'chave-exclusiva-de-testes-jwt-com-mais-de-32-caracteres';
const userId = '00000000-0000-4000-8000-000000000001';
const accounts = [
  { id: userId, email: 'aluno@example.com', role: 'ALUNO' },
  { id: '00000000-0000-4000-8000-000000000002', email: 'professor@example.com', role: 'PROFESSOR' },
  { id: '00000000-0000-4000-8000-000000000003', email: 'admin@example.com', role: 'ADMIN' },
];
let server: Server;
let base: string;

beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
  process.env.DIRECT_URL ||= process.env.DATABASE_URL;
  const senhaHash = await bcrypt.hash('senha-de-teste', 4);
  mocks.findByEmail.mockImplementation(async (email: string) => ({
    ...accounts.find(account => account.email === email), nome: 'Teste', sessionVersion: 0, senhaHash,
  }));
  mocks.findById.mockResolvedValue({ id: userId, nome: 'Teste', email: 'aluno@example.com', role: 'ALUNO', emailVerifiedAt: new Date() });
  mocks.findByIdForAuth.mockImplementation(async (id: string) => accounts.some(account => account.id === id)
    ? { ...accounts.find(account => account.id === id), deletedAt: null, emailVerifiedAt: new Date(), sessionVersion: 0 }
    : null);
  mocks.hasCompletedDiagnostic.mockResolvedValue(false);
  mocks.start.mockResolvedValue({ id: 'diagnostic-test', questoes: [{}], iniciadoEm: new Date() });
  const { authRoutes } = await import('../routes/auth-routes');
  const { diagnosticRoutes } = await import('../routes/diagnostic-routes');
  const { default: questionRoutes } = await import('../routes/questaoRoutes');
  const { requireAuth, requireRoles } = await import('../middlewares/auth-middleware');
  const { errorHandler } = await import('../middlewares/error-handler');
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/diagnostics', diagnosticRoutes);
  app.use('/questoes', questionRoutes);
  app.get('/identity', requireAuth, (req: AuthenticatedRequest, res) => res.json(req.auth));
  app.get('/staff', requireAuth, requireRoles('PROFESSOR', 'ADMIN'), (_req, res) => res.json({ allowed: true }));
  app.use(errorHandler);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

async function login(email = 'aluno@example.com') {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: 'senha-de-teste' }),
  });
  expect(response.status).toBe(200);
  return (await response.json()).token as string;
}

describe('JWT do login e consumidores', () => {
  it('login emite id/role válidos aceitos pelo middleware e sessão oficiais', async () => {
    const token = await login();
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    // Boolean assertions avoid printing a JWT if this test regresses.
    expect(payload.id === userId && payload.role === 'ALUNO').toBe(true);
    expect(payload.sub === undefined && typeof payload.exp === 'number').toBe(true);
    const headers = { Authorization: `Bearer ${token}` };
    const modern = await fetch(`${base}/identity`, { headers });
    expect(modern.status).toBe(200);
    expect(await modern.json()).toEqual({ userId, role: 'ALUNO' });
    for (const session of ['/auth/session']) {
      const response = await fetch(`${base}${session}`, { headers });
      expect(response.status).toBe(200);
      expect((await response.json()).nextStep).toBe('DIAGNOSTIC');
    }
    expect(mocks.findById).toHaveBeenCalledWith(userId);
  });

  it('token do login oficial chega ao controller do diagnóstico com o usuário correto', async () => {
    const token = await login();
    mocks.start.mockClear();
    const response = await fetch(`${base}/diagnostics`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionCount: 20 }),
    });
    expect(response.status).toBe(201);
    expect(mocks.start).toHaveBeenCalledWith(userId, 20);
    expect((await response.json()).id).toBe('diagnostic-test');
  });

  it.each([['aluno@example.com', 403], ['professor@example.com', 200], ['admin@example.com', 200]])('preserva autorização de %s', async (email, status) => {
    const token = await login(email as string);
    const response = await fetch(`${base}/staff`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(status);
  });

  it('recusa senha incorreta no login oficial', async () => {
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'aluno@example.com', senha: 'incorreta' }) });
    expect(response.status).toBe(401);
  });

  it.each([['aluno@example.com', 403], ['professor@example.com', 201], ['admin@example.com', 201]])('rotas existentes de questões preservam papel e identidade de %s', async (email, status) => {
    mocks.createQuestion.mockReset().mockResolvedValue({ id: 'question-test' });
    const token = await login(email as string);
    const response = await fetch(`${base}/questoes`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enunciado: 'Questão de teste', disciplina: 'Civil', assunto: 'Contratos', nivel: 'BASICO', fundamentacaoJuridica: 'Teste', publica: true, autorId: 'forjado', alternativas: [{ texto: 'A', correta: true }, { texto: 'B', correta: false }] }),
    });
    expect(response.status).toBe(status);
    if (status === 403) expect(mocks.createQuestion).not.toHaveBeenCalled();
    else {
      const actorId = accounts.find(account => account.email === email)!.id;
      expect(mocks.createQuestion).toHaveBeenCalledWith(expect.objectContaining({ autorId: actorId }), actorId, accounts.find(account => account.email === email)!.role);
    }
  });

  it('sessão mantém próximo passo DASHBOARD após diagnóstico concluído', async () => {
    mocks.hasCompletedDiagnostic.mockResolvedValueOnce(true);
    const token = await login();
    const response = await fetch(`${base}/auth/session`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect((await response.json()).nextStep).toBe('DASHBOARD');
  });
});

const invalidTokens: [string, () => string | undefined][] = [
  ['ausente', () => undefined],
  ['malformado', () => 'invalido'],
  ['assinatura incorreta', () => jwt.sign({ id: userId, role: 'ALUNO' }, 'outra-chave-de-testes')],
  ['expirado', () => jwt.sign({ id: userId, role: 'ALUNO' }, secret, { expiresIn: -1 })],
  ['ainda não válido', () => jwt.sign({ id: userId, role: 'ALUNO' }, secret, { notBefore: '1h' })],
  ['algoritmo não permitido', () => jwt.sign({ id: userId, role: 'ALUNO' }, secret, { algorithm: 'HS384' })],
  ['sem id', () => jwt.sign({ role: 'ALUNO' }, secret)],
  ['somente sub', () => jwt.sign({ sub: userId, role: 'ALUNO' }, secret)],
  ['id vazio', () => jwt.sign({ id: '   ', role: 'ALUNO' }, secret)],
  ['id numérico', () => jwt.sign({ id: 42, role: 'ALUNO' }, secret)],
  ['sem role', () => jwt.sign({ id: userId }, secret)],
  ['role inválida', () => jwt.sign({ id: userId, role: 'ROOT' }, secret)],
];

describe('validação da conta nas rotas protegidas', () => {
  it.each([
    { label: 'inexistente', account: null },
    { label: 'excluída', account: { id: userId, role: 'ALUNO', deletedAt: new Date() } },
  ])('recusa JWT válido de conta $label antes de acessar dados protegidos', async ({ account }) => {
    const token = await login();
    mocks.findByIdForAuth.mockClear();
    mocks.findById.mockClear();
    mocks.start.mockClear();
    mocks.createQuestion.mockClear();
    for (const endpoint of ['/auth/session', '/diagnostics', '/questoes']) {
      mocks.findByIdForAuth.mockResolvedValueOnce(account);
      const response = await fetch(`${base}${endpoint}`, {
        method: endpoint === '/auth/session' ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(401);
    }
    expect(mocks.findByIdForAuth).toHaveBeenCalledTimes(3);
    expect(mocks.findByIdForAuth).toHaveBeenCalledWith(userId);
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.createQuestion).not.toHaveBeenCalled();
  });
});

describe('rejeição de JWT inválido sem acessar a rota protegida', () => {
  it.each(invalidTokens)('%s retorna 401 nas sessões e diagnóstico', async (_label, generate) => {
    const token = generate();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    mocks.start.mockClear();
    mocks.findById.mockClear();
    mocks.findByIdForAuth.mockClear();
    for (const endpoint of ['/auth/session', '/diagnostics']) {
      const response = await fetch(`${base}${endpoint}`, { method: endpoint === '/diagnostics' ? 'POST' : 'GET', headers });
      expect(response.status).toBe(401);
    }
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.findByIdForAuth).not.toHaveBeenCalled();
  });
});
