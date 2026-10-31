import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => ({
  userFind: vi.fn(), userUpdate: vi.fn(), userUpdateMany: vi.fn(),
  auditCreate: vi.fn(), auditFind: vi.fn(), diagnosticFind: vi.fn(), transaction: vi.fn(),
  tokenCreate: vi.fn(), tokenFind: vi.fn(), tokenClaim: vi.fn(),
  recoveryFind: vi.fn(), recoveryCount: vi.fn(), recoveryCreate: vi.fn(), recoveryClaim: vi.fn(),
  sendMail: vi.fn(), googleVerify: vi.fn(),
  questionList: vi.fn(), questionGet: vi.fn(), questionCreate: vi.fn(), questionUpdate: vi.fn(), questionDelete: vi.fn(),
  diagnosticStart: vi.fn(), diagnosticQuestions: vi.fn(), diagnosticAnswer: vi.fn(), diagnosticFinalize: vi.fn(), diagnosticResult: vi.fn(), diagnosticTrail: vi.fn(),
  trailGenerate: vi.fn(), trailQuestions: vi.fn(), trailAnswer: vi.fn(), trailFinalize: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.userFind, update: mocks.userUpdate, updateMany: mocks.userUpdateMany },
  auditLog: { create: mocks.auditCreate, findMany: mocks.auditFind },
  simulado: { findFirst: mocks.diagnosticFind },
  authToken: { create: mocks.tokenCreate, updateMany: mocks.tokenClaim },
  passwordRecoveryToken: { findUnique: mocks.recoveryFind, updateMany: mocks.recoveryClaim },
  $transaction: mocks.transaction,
} }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: mocks.sendMail }) } }));
vi.mock('google-auth-library', () => ({ OAuth2Client: class { verifyIdToken = mocks.googleVerify; } }));
vi.mock('../services/QuestaoService', () => ({ QuestaoService: class {
  static listar = mocks.questionList;
  static buscarPorId = mocks.questionGet;
  static criar = mocks.questionCreate;
  static atualizar = mocks.questionUpdate;
  static remover = mocks.questionDelete;
} }));
vi.mock('../services/diagnostic-service', () => ({ DiagnosticService: class {
  start = mocks.diagnosticStart; getQuestions = mocks.diagnosticQuestions;
  answer = mocks.diagnosticAnswer; finalize = mocks.diagnosticFinalize;
  getResult = mocks.diagnosticResult; getTrail = mocks.diagnosticTrail;
} }));
vi.mock('../services/trail-service', () => ({ TrailService: class {
  generate = mocks.trailGenerate; getQuestions = mocks.trailQuestions;
  answer = mocks.trailAnswer; finalize = mocks.trailFinalize;
} }));

const roles = ['ALUNO', 'PROFESSOR', 'ADMIN'] as const;
type Role = typeof roles[number];
const userId = '00000000-0000-4000-8000-000000000001';
const resourceId = '00000000-0000-4000-8000-000000000002';
const secret = 'stage-two-local-test-key-with-at-least-32-characters';
const confirmation = 'v'.repeat(64);
type Account = { id: string; nome: string; email: string; role: Role; sessionVersion: number; emailVerifiedAt: Date | null; deletedAt: Date | null; senhaHash: string };
let account: Account | null;
let passwordHash: string;
let server: Server | undefined;
let base: string;
let claimed: boolean;
const question = {
  enunciado: 'Questão de teste de autorização', disciplina: 'Civil', assunto: 'Contratos', nivel: 'BASICO',
  fundamentacaoJuridica: 'Fixture', publica: true,
  alternativas: [{ texto: 'A', correta: true }, { texto: 'B', correta: false }],
};
const protectedEndpoints: [string, string][] = [
  ['GET', '/questoes'], ['GET', `/questoes/${resourceId}`],
  ['POST', '/questoes'], ['PUT', `/questoes/${resourceId}`], ['DELETE', `/questoes/${resourceId}`],
  ['POST', '/diagnostics'], ['GET', `/diagnostics/${resourceId}/questions`],
  ['PUT', `/diagnostics/${resourceId}/answers/${resourceId}`], ['POST', `/diagnostics/${resourceId}/finalize`],
  ['GET', `/diagnostics/${resourceId}/result`], ['GET', `/diagnostics/${resourceId}/trail`],
  ['POST', `/trilhas/${resourceId}/gerar`], ['GET', `/trilhas/attempts/${resourceId}/questions`],
  ['PUT', `/trilhas/attempts/${resourceId}/answers/${resourceId}`], ['POST', `/trilhas/attempts/${resourceId}/finalize`],
  ['GET', '/audit-logs'], ['PUT', '/auth/nome'], ['DELETE', '/auth/conta'],
];
const resourceCalls = () => [mocks.questionList, mocks.questionGet, mocks.questionCreate, mocks.questionUpdate, mocks.questionDelete,
  mocks.diagnosticStart, mocks.diagnosticQuestions, mocks.diagnosticAnswer, mocks.diagnosticFinalize, mocks.diagnosticResult, mocks.diagnosticTrail,
  mocks.trailGenerate, mocks.trailQuestions, mocks.trailAnswer, mocks.trailFinalize, mocks.auditFind, mocks.userUpdate];
function token(role: Role = 'ALUNO') { return jwt.sign({ id: userId, role }, secret, { expiresIn: '1h' }); }
function call(method: string, route: string, bearer?: string, body?: unknown) {
  return fetch(`${base}${route}`, { method, headers: {
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json',
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function callFromOrigin(method: string, route: string, origin: string, headers: Record<string, string> = {}, body?: unknown) {
  return fetch(`${base}${route}`, { method, headers: { Origin: origin, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

beforeAll(async () => {
  // Isolate credentials even when this suite is run from a configured shell.
  vi.stubEnv('JWT_SECRET', secret);
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@127.0.0.1:1/test');
  vi.stubEnv('DIRECT_URL', 'postgresql://test:test@127.0.0.1:1/test');
  vi.stubEnv('APP_PUBLIC_URL', 'http://localhost:5173');
  vi.stubEnv('CORS_ORIGINS', 'http://localhost:5173,https://staging.jurissim.test');
  // This suite mocks nodemailer; select SMTP explicitly so the mock is used
  // even when Vitest's global safety defaults select the unconfigured API.
  vi.stubEnv('BREVO_EMAIL_TRANSPORT', 'smtp');
  vi.stubEnv('BREVO_SMTP_USER', 'fixture@smtp-brevo.com');
  vi.stubEnv('BREVO_SMTP_KEY', 'local-fixture-only');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'local-fixture-google-client');
  passwordHash = await bcrypt.hash('fixture-password', 4);
  const listen = vi.spyOn(express.application, 'listen').mockImplementation(function (this: express.Express) {
    server = createServer(this);
    server.listen(0, '127.0.0.1');
    return server;
  });
  try { await import('../server'); } finally { listen.mockRestore(); }
  if (!server) throw new Error('Test server did not start');
  if (!server.listening) await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.resetAllMocks();
  claimed = false;
  account = { id: userId, nome: 'Fixture', email: 'user@example.invalid', role: 'ALUNO', sessionVersion: 0, emailVerifiedAt: null, deletedAt: null, senhaHash: passwordHash };
  mocks.userFind.mockImplementation(async ({ where }) => account && (where.id === account.id || where.email === account.email) ? { ...account } : null);
  mocks.userUpdate.mockImplementation(async () => { account!.emailVerifiedAt = new Date(); return { id: userId }; });
  mocks.userUpdateMany.mockImplementation(async ({ data }) => { account!.senhaHash = data.senhaHash; account!.sessionVersion += data.sessionVersion.increment; return { count: 1 }; });
  mocks.auditCreate.mockResolvedValue({});
  mocks.auditFind.mockResolvedValue([]);
  mocks.diagnosticFind.mockResolvedValue(null);
  mocks.tokenCreate.mockResolvedValue({ id: 'fixture-token-row' });
  mocks.tokenFind.mockImplementation(async ({ where }) => !claimed && account && !account.deletedAt &&
    where.tokenHash === createHash('sha256').update(confirmation).digest('hex') ? { id: 'fixture-token-row', userId } : null);
  mocks.tokenClaim.mockImplementation(async () => { if (claimed) return { count: 0 }; claimed = true; return { count: 1 }; });
  mocks.recoveryCount.mockResolvedValue(0);
  mocks.recoveryCreate.mockResolvedValue({ id: 'fixture-recovery-row' });
  mocks.recoveryClaim.mockResolvedValue({ count: 1 });
  mocks.recoveryFind.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async work => work({
    $queryRaw: async () => account && !account.deletedAt ? [{ id: userId }] : [],
    user: { findUnique: mocks.userFind, update: mocks.userUpdate, updateMany: mocks.userUpdateMany },
    authToken: { findFirst: mocks.tokenFind, updateMany: mocks.tokenClaim, findMany: async () => [], create: mocks.tokenCreate },
    passwordRecoveryToken: { count: mocks.recoveryCount, create: mocks.recoveryCreate, updateMany: mocks.recoveryClaim, findUnique: mocks.recoveryFind, findFirst: async () => null },
    auditLog: { create: mocks.auditCreate },
  }));
  mocks.sendMail.mockImplementation(async message => ({ accepted: [message.to], rejected: [] }));
  mocks.questionList.mockResolvedValue([]);
  mocks.questionCreate.mockResolvedValue({ id: resourceId });
});

describe('CORS do servidor e autenticação independente de Origin', () => {
  it.each(['http://localhost:5173', 'https://staging.jurissim.test'])('reflete apenas a origem autorizada %s', async origin => {
    const response = await callFromOrigin('GET', '/health', origin);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('vary')).toContain('Origin');
  });

  it('não libera CORS para origem desconhecida e mantém a proteção das rotas protegidas', async () => {
    const health = await callFromOrigin('GET', '/health', 'https://attacker.example');
    expect(health.status).toBe(200);
    expect(health.headers.get('access-control-allow-origin')).toBeNull();

    const protectedRoute = await callFromOrigin('GET', '/questoes', 'https://attacker.example');
    expect(protectedRoute.status).toBe(401);
    expect(protectedRoute.headers.get('access-control-allow-origin')).toBeNull();

    const authRoute = await callFromOrigin('POST', '/auth/login', 'https://attacker.example', { 'Content-Type': 'application/json' }, {});
    expect(authRoute.status).toBe(403);
  });

  it('responde ao preflight permitido com os métodos e cabeçalhos necessários ao frontend', async () => {
    const response = await callFromOrigin('OPTIONS', '/questoes', 'http://localhost:5173', {
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'authorization,content-type',
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(response.headers.get('access-control-allow-methods')?.toUpperCase()).toContain('PUT');
    const allowedHeaders = response.headers.get('access-control-allow-headers')?.toLowerCase() ?? '';
    expect(allowedHeaders).toContain('authorization');
    expect(allowedHeaders).toContain('content-type');
  });

  it.each([
    { method: 'TRACE', headers: 'authorization' },
    { method: 'PUT', headers: 'x-unapproved-header' },
    { method: 'PUT', headers: 'authorization', origin: 'https://attacker.example' },
  ])('recusa preflight inválido %#', async ({ method, headers, origin = 'http://localhost:5173' }) => {
    const response = await callFromOrigin('OPTIONS', '/questoes', origin, {
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': headers,
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('mantém clientes sem Origin e o login local funcionando sem enfraquecer autenticação', async () => {
    const loginWithoutOrigin = await call('POST', '/auth/login', undefined, { email: account!.email, senha: 'fixture-password' });
    expect(loginWithoutOrigin.status).toBe(200);
    expect(loginWithoutOrigin.headers.get('access-control-allow-origin')).toBeNull();

    const loginFromLocal = await callFromOrigin('POST', '/auth/login', 'http://localhost:5173',
      { 'Content-Type': 'application/json' }, { email: account!.email, senha: 'fixture-password' });
    expect(loginFromLocal.status).toBe(200);
    expect(loginFromLocal.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const protectedWithoutOrigin = await call('GET', '/questoes');
    expect(protectedWithoutOrigin.status).toBe(401);

    const optionsWithoutOrigin = await callFromOrigin('OPTIONS', '/questoes', '', {
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'authorization,content-type',
    });
    expect(optionsWithoutOrigin.status).not.toBe(403);
    expect(optionsWithoutOrigin.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('confirmação obrigatória em todas as operações protegidas', () => {
  it.each(roles)('nega as 18 operações para %s pendente, mesmo com JWT de ADMIN', async role => {
    account!.role = role;
    const bearer = token('ADMIN');
    for (const [method, route] of protectedEndpoints) {
      const response = await call(method, route, bearer, method === 'GET' ? undefined : {});
      expect(response.status, `${method} ${route}`).toBe(403);
      expect(await response.json()).toEqual({ message: 'Confirme seu e-mail para acessar este recurso.' });
    }
    for (const operation of resourceCalls()) expect(operation).not.toHaveBeenCalled();
    expect(mocks.diagnosticFind).not.toHaveBeenCalled();
    expect(mocks.userFind).toHaveBeenCalledWith({ where: { id: userId }, select: { id: true, role: true, deletedAt: true, emailVerifiedAt: true, sessionVersion: true } });
  });

  it.each(['inexistente', 'excluída'])('recusa conta %s em recursos, sessão limitada e reenvio', async state => {
    if (state === 'inexistente') account = null;
    else { account!.deletedAt = new Date(); account!.emailVerifiedAt = new Date(); }
    for (const [method, route] of [...protectedEndpoints, ['GET', '/auth/session'], ['POST', '/auth/email-verification']]) {
      expect((await call(method, route, token('ADMIN'), method === 'GET' ? undefined : {})).status).toBe(401);
    }
    for (const operation of resourceCalls()) expect(operation).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('não libera acesso quando a consulta da conta falha', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mocks.userFind.mockRejectedValue(new Error('Fixture database unavailable'));
      for (const [method, route] of [['GET', '/questoes'], ['GET', '/auth/session'], ['POST', '/auth/email-verification']]) {
        expect((await call(method, route, token('ADMIN'))).status).toBe(500);
      }
      expect(mocks.questionList).not.toHaveBeenCalled();
      expect(mocks.sendMail).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});

describe('permissões seguem o perfil atual, independentemente do JWT', () => {
  it.each(roles.flatMap(current => roles.map(issued => ({ current, issued }))))('banco=$current, JWT=$issued', async ({ current, issued }) => {
    account!.role = current;
    account!.emailVerifiedAt = new Date();
    const bearer = token(issued);
    expect((await call('GET', '/questoes', bearer)).status).toBe(200);
    expect(mocks.questionList).toHaveBeenCalledWith(expect.anything(), current, userId, false);
    expect((await call('POST', '/questoes', bearer, question)).status).toBe(current === 'ALUNO' ? 403 : 201);
    expect((await call('GET', '/audit-logs', bearer)).status).toBe(current === 'ADMIN' ? 200 : 403);
    const session = await call('GET', '/auth/session', bearer);
    expect(session.status).toBe(200);
    expect((await session.json()).user.role).toBe(current);
    if (current === 'ALUNO') expect(mocks.questionCreate).not.toHaveBeenCalled();
    if (current !== 'ADMIN') expect(mocks.auditFind).not.toHaveBeenCalled();
  });

  it('reconsulta confirmação e perfil a cada requisição com o mesmo token', async () => {
    const bearer = token('ADMIN');
    account!.emailVerifiedAt = new Date();
    account!.role = 'ADMIN';
    expect((await call('GET', '/audit-logs', bearer)).status).toBe(200);
    account!.role = 'PROFESSOR';
    expect((await call('GET', '/audit-logs', bearer)).status).toBe(403);
    expect((await call('POST', '/questoes', bearer, question)).status).toBe(201);
    account!.role = 'ALUNO';
    expect((await call('POST', '/questoes', bearer, question)).status).toBe(403);
    account!.emailVerifiedAt = null;
    expect((await call('GET', '/questoes', bearer)).status).toBe(403);
    expect(mocks.userFind).toHaveBeenCalledTimes(5);
  });
});

describe('exceções limitadas e continuidade dos fluxos', () => {
  it.each(roles)('mantém sessão limitada e reenvio para %s pendente', async role => {
    account!.role = role;
    const bearer = token('ADMIN');
    const response = await call('GET', '/auth/session', bearer);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id: userId, nome: account!.nome, email: account!.email, role, emailVerificado: false },
      nextStep: role === 'ALUNO' ? 'DIAGNOSTIC' : 'PROFESSOR',
    });
    if (role === 'ALUNO') {
      expect(mocks.diagnosticFind).toHaveBeenCalledWith({
        where: { alunoId: userId, tipo: 'DIAGNOSTICO', finalizadoEm: { not: null } }, select: { id: true },
      });
    } else expect(mocks.diagnosticFind).not.toHaveBeenCalled();
    expect((await call('POST', '/auth/email-verification', bearer)).status).toBe(202);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail.mock.calls[0][0].to === account!.email).toBe(true);
    expect(account!.emailVerifiedAt).toBeNull();
  });

  it.each([['GET', '/auth/session'], ['POST', '/auth/email-verification']])('%s %s exige JWT válido', async (method, route) => {
    for (const bearer of [undefined, 'invalid', jwt.sign({ id: userId, role: 'ADMIN' }, secret, { expiresIn: -1 })]) {
      expect((await call(method, route, bearer)).status).toBe(401);
    }
    expect(mocks.userFind).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it.each(roles)('confirma %s pelo link e libera o mesmo JWT somente após confirmação', async role => {
    account!.role = role;
    const bearer = token(role);
    expect((await call('GET', '/questoes', bearer)).status).toBe(403);
    expect((await call('POST', '/auth/email-verification/confirm', undefined, { token: confirmation })).status).toBe(200);
    expect((await call('GET', '/questoes', bearer)).status).toBe(200);
    expect((await call('GET', '/auth/session', bearer)).status).toBe(200);
    expect((await call('POST', '/auth/email-verification/confirm', undefined, { token: confirmation })).status).toBe(400);
  });

  it('mantém login pendente e recuperação com transporte simulado sem confirmar a conta', async () => {
    const login = await call('POST', '/auth/login', undefined, { email: account!.email, senha: 'fixture-password' });
    expect(login.status).toBe(200);
    const bearer = (await login.json()).token;
    expect((await call('GET', '/auth/session', bearer)).status).toBe(200);
    expect((await call('GET', '/questoes', bearer)).status).toBe(403);
    const recovery = await call('POST', '/auth/password-recovery', undefined, { email: account!.email });
    expect(recovery.status).toBe(202);
    const missing = await call('POST', '/auth/password-recovery', undefined, { email: 'missing@example.invalid' });
    expect(await missing.json()).toEqual(await recovery.json());
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    mocks.recoveryFind.mockResolvedValue({ id: 'fixture-recovery-row', userId, consumedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { senhaHash: passwordHash } });
    const reset = await call('POST', '/auth/password-reset', undefined, { token: 'r'.repeat(43), senha: 'Fixture-new-password1!', confirmacaoSenha: 'Fixture-new-password1!' });
    expect(reset.status).toBe(200);
    expect(account!.emailVerifiedAt).toBeNull();
    expect((await call('GET', '/questoes', bearer)).status).toBe(401);
  });

  it.each(['/auth/register', '/auth/login', '/auth/google', '/auth/password-recovery', '/auth/password-reset', '/auth/email-verification/confirm'])('%s continua público com validação própria', async route => {
    expect((await call('POST', route, undefined, {})).status).toBe(400);
    expect(mocks.userFind).not.toHaveBeenCalled();
  });

  it.each([
    { role: 'ALUNO' as Role, completed: true, nextStep: 'DASHBOARD', verified: false },
    { role: 'ALUNO' as Role, completed: false, nextStep: 'DIAGNOSTIC' },
    { role: 'ALUNO' as Role, completed: true, nextStep: 'DASHBOARD' },
    { role: 'PROFESSOR' as Role, completed: false, nextStep: 'PROFESSOR' },
    { role: 'ADMIN' as Role, completed: false, nextStep: 'PROFESSOR' },
  ])('preserva redirecionamento: $role/$nextStep', async ({ role, completed, nextStep, verified = true }) => {
    account!.role = role;
    account!.emailVerifiedAt = verified ? new Date() : null;
    mocks.diagnosticFind.mockResolvedValue(completed ? { id: resourceId } : null);
    const response = await call('GET', '/auth/session', token('ALUNO'));
    expect(response.status).toBe(200);
    expect((await response.json()).nextStep).toBe(nextStep);
    if (role !== 'ALUNO') expect(mocks.diagnosticFind).not.toHaveBeenCalled();
  });
});

describe('revogação de sessões após redefinir senha', () => {
  function recoveryLink() {
    const row = { id: 'reset-row', userId, consumedAt: null as Date | null, expiresAt: new Date(Date.now() + 60_000) };
    mocks.recoveryFind.mockImplementation(async () => ({ ...row, user: { senhaHash: account!.senhaHash } }));
    mocks.recoveryClaim.mockImplementation(async () => {
      if (row.consumedAt) return { count: 0 };
      row.consumedAt = new Date();
      return { count: 1 };
    });
    return { token: 'r'.repeat(43), senha: 'Fixture-new-password1!', confirmacaoSenha: 'Fixture-new-password1!' };
  }

  it.each(['joao', 'Ab1!', 'abcdef1!', 'Abcdefg!', 'Abcdefg1', 'Abcdefg1 '])('recusa senha fraca %# sem efeitos e permite usar o mesmo token depois', async senha => {
    account!.emailVerifiedAt = new Date();
    const before = { ...account! };
    const bearer = token();
    const body = recoveryLink();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await call('POST', '/auth/password-reset', undefined, { ...body, senha, confirmacaoSenha: senha });
      expect(response.status).toBe(400);
      expect((await response.json()).message).toMatch(/^A senha deve/);
      expect(account).toEqual(before);
      expect(mocks.recoveryFind).not.toHaveBeenCalled();
      expect(mocks.recoveryClaim).not.toHaveBeenCalled();
      expect(mocks.userUpdateMany).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect((await call('GET', '/auth/session', bearer)).status).toBe(200);
      expect((await call('POST', '/auth/password-reset', undefined, body)).status).toBe(200);
      expect(account!.sessionVersion).toBe(1);
      expect((await call('POST', '/auth/password-reset', undefined, body)).status).toBe(400);
    } finally { log.mockRestore(); }
  });

  it('recusa confirmação divergente sem consumir o token', async () => {
    const body = recoveryLink();
    expect((await call('POST', '/auth/password-reset', undefined, { ...body, confirmacaoSenha: 'Other-valid1!' })).status).toBe(400);
    expect(mocks.recoveryFind).not.toHaveBeenCalled();
    expect(mocks.recoveryClaim).not.toHaveBeenCalled();
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
    expect((await call('POST', '/auth/password-reset', undefined, body)).status).toBe(200);
  });

  it.each(roles)('revoga JWTs novos e legados de %s, inclusive sessão limitada e reenvio', async role => {
    account!.role = role;
    account!.emailVerifiedAt = new Date();
    const legacy = token(role);
    const login = await call('POST', '/auth/login', undefined, { email: account!.email, senha: 'fixture-password' });
    expect(login.status).toBe(200);
    const issued = (await login.json()).token;
    expect((jwt.verify(issued, secret) as jwt.JwtPayload).sessionVersion === 0).toBe(true);
    expect((await call('GET', '/questoes', legacy)).status).toBe(200);
    const resetBody = recoveryLink();
    expect((await call('POST', '/auth/password-reset', undefined, resetBody)).status).toBe(200);
    expect(account!.sessionVersion).toBe(1);
    expect(account!.role).toBe(role);
    expect(account!.emailVerifiedAt).not.toBeNull();
    for (const bearer of [legacy, issued]) {
      for (const [method, route] of [...protectedEndpoints, ['GET', '/auth/session'], ['POST', '/auth/email-verification']]) {
        expect((await call(method, route, bearer, method === 'GET' ? undefined : {})).status).toBe(401);
      }
    }
    expect((await call('POST', '/auth/password-reset', undefined, resetBody)).status).toBe(400);
    expect(account!.sessionVersion).toBe(1);
    expect((await call('POST', '/auth/login', undefined, { email: account!.email, senha: 'fixture-password' })).status).toBe(401);
    const fresh = await call('POST', '/auth/login', undefined, { email: account!.email, senha: resetBody.senha });
    expect(fresh.status).toBe(200);
    const freshToken = (await fresh.json()).token;
    const payload = jwt.verify(freshToken, secret) as jwt.JwtPayload;
    expect(payload.sessionVersion === 1 && payload.exp! - payload.iat! === 8 * 60 * 60).toBe(true);
    expect((await call('GET', '/questoes', freshToken)).status).toBe(200);
    expect((await call('GET', '/audit-logs', freshToken)).status).toBe(role === 'ADMIN' ? 200 : 403);
    expect((await call('POST', '/questoes', freshToken, question)).status).toBe(role === 'ALUNO' ? 403 : 201);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('preserva sessões válidas de outro usuário', async () => {
    account!.emailVerifiedAt = new Date();
    const findPrimary = mocks.userFind.getMockImplementation()!;
    const other = { ...account!, id: resourceId, email: 'other@example.invalid', role: 'PROFESSOR', sessionVersion: 4 };
    mocks.userFind.mockImplementation(async args => args.where.id === other.id ? { ...other } : findPrimary(args));
    const otherToken = jwt.sign({ id: other.id, role: 'ALUNO', sessionVersion: 4 }, secret, { expiresIn: '1h' });
    expect((await call('POST', '/auth/password-reset', undefined, recoveryLink())).status).toBe(200);
    expect((await call('GET', '/questoes', token())).status).toBe(401);
    expect((await call('GET', '/questoes', otherToken)).status).toBe(200);
    expect((await call('GET', '/audit-logs', otherToken)).status).toBe(403);
    expect(other.sessionVersion).toBe(4);
  });

  it('novo JWT de conta pendente continua restrito após a troca de senha', async () => {
    const body = recoveryLink();
    expect((await call('POST', '/auth/password-reset', undefined, body)).status).toBe(200);
    const fresh = await call('POST', '/auth/login', undefined, { email: account!.email, senha: body.senha });
    expect(fresh.status).toBe(200);
    const bearer = (await fresh.json()).token;
    const session = await call('GET', '/auth/session', bearer);
    expect(session.status).toBe(200);
    expect((await session.json()).user.emailVerificado).toBe(false);
    expect((await call('GET', '/questoes', bearer)).status).toBe(403);
    expect((await call('POST', '/auth/email-verification/confirm', undefined, { token: confirmation })).status).toBe(200);
    expect((await call('GET', '/questoes', bearer)).status).toBe(200);
    expect((await call('GET', '/questoes', token())).status).toBe(401);
  });

  it.each([-1, 0.5, '1', null, {}, 2147483648])('recusa versão de sessão malformada: %j', async sessionVersion => {
    const bearer = jwt.sign({ id: userId, role: 'ADMIN', sessionVersion }, secret, { expiresIn: '1h' });
    expect((await call('GET', '/auth/session', bearer)).status).toBe(401);
    expect(mocks.userFind).not.toHaveBeenCalled();
  });

  it('recusa JWT expirado mesmo com a versão atual e não aceita versões futuras', async () => {
    account!.sessionVersion = 3;
    account!.emailVerifiedAt = new Date();
    for (const [version, expiry] of [[3, -1], [4, 3600], [2, 3600]]) {
      const bearer = jwt.sign({ id: userId, role: 'ADMIN', sessionVersion: version }, secret, { expiresIn: expiry });
      expect((await call('GET', '/questoes', bearer)).status).toBe(401);
    }
    expect(mocks.questionList).not.toHaveBeenCalled();
  });
});
