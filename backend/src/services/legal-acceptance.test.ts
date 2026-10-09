import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { acceptanceData } from './legal-acceptance';
import versions from '../legal-versions.json';
import { AuthService } from './auth-service';
import { errorHandler } from '../middlewares/error-handler';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const db = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), auditCreate: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { user: db, auditLog: { create: db.auditCreate }, simulado: { findFirst: vi.fn().mockResolvedValue(null) } } }));

const acceptance = { accepted: true, termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion };

describe('aceite e auditoria', () => {
  it.each([undefined, false, {}, { ...acceptance, accepted: false }, { ...acceptance, accepted: 'true' }, { ...acceptance, termsVersion: 'antiga' }, { ...acceptance, privacyVersion: 'antiga' }])('rejeita aceite ausente ou inválido: %j', async (input) => {
    const repository = { findByEmail: vi.fn(), createUser: vi.fn() };
    await expect(new AuthService(repository as never).register('Ana', 'ana@example.com', 'senha-segura', 'ALUNO', input)).rejects.toThrow();
    expect(repository.createUser).not.toHaveBeenCalled();
    expect(repository.findByEmail).not.toHaveBeenCalled();
  });

  it('gera somente os campos permitidos e a mesma data para aceite e auditoria', () => {
    const data = acceptanceData({ ...acceptance, senha: 'secreto', senhaHash: 'hash', token: 'jwt', email: 'extra' });
    expect(data.legalAcceptedAt).toBeInstanceOf(Date);
    expect(data.auditLogs.create).toEqual({ action: 'ACEITE_TERMOS_E_PRIVACIDADE', occurredAt: data.legalAcceptedAt, termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion });
    expect(JSON.stringify(data)).not.toMatch(/secreto|senha|hash|token|jwt|email/);
  });

  it('cria conta e evento de auditoria em uma escrita aninhada no repositório oficial', async () => {
    const { AuthRepository } = await import('../repositories/auth-repository');
    db.create.mockReset().mockResolvedValue({ id: 'user-1' });
    await new AuthRepository().createUser('Ana', 'ana@example.com', 'hash', 'ALUNO', acceptance);
    expect(db.create).toHaveBeenCalledTimes(1);
    for (const [args] of db.create.mock.calls) {
      expect(args.data.legalAcceptedAt).toBeInstanceOf(Date);
      expect(args.data.termsVersion).toBe(versions.termsVersion);
      expect(args.data.privacyVersion).toBe(versions.privacyVersion);
      expect(args.data.auditLogs.create.map((event: { action: string }) => event.action)).toEqual(['ACEITE_TERMOS_E_PRIVACIDADE', 'USUARIO_CADASTRADO']);
      expect(JSON.stringify(args.data.auditLogs)).not.toMatch(/senha|hash|token|email/);
    }
  });

  it('não revela credenciais de exceções do banco nos logs', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler(new Error('senhaHash=segredo token=segredo'), {} as never, response as never, vi.fn());
    expect(log).toHaveBeenCalledWith('Erro interno do servidor.');
    log.mockRestore();
  });
});

describe('cadastro HTTP no roteador oficial', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
    process.env.DIRECT_URL ||= process.env.DATABASE_URL;
    process.env.JWT_SECRET = 'chave-apenas-de-testes-com-mais-de-32-caracteres';
    const { authRoutes } = await import('../routes/auth-routes');
    const app = express();
    app.use(express.json());
    app.use('/auth', authRoutes);
    app.use(errorHandler);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => { if (server) await new Promise<void>((resolve) => server.close(() => resolve())); });

  it('bloqueia requisições sem aceite e registra aceite válido em /auth', async () => {
    db.findUnique.mockReset().mockResolvedValue(null);
    db.create.mockReset().mockImplementation(async ({ data }) => ({ ...data, id: 'user-http' }));
    // Preserve the minimum password length and case-sensitive email of the active API.
    const body = { nome: 'Ana', email: 'Ana@example.com', senha: '123456', confirmacaoSenha: '123456', role: 'ALUNO' };
    for (const input of [undefined, { ...acceptance, accepted: false }, { ...acceptance, privacyVersion: 'antiga' }]) {
      const response = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, acceptance: input }) });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    }
    expect(db.create).not.toHaveBeenCalled();
    const response = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, acceptance }) });
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(JSON.stringify(result)).not.toMatch(/senhaHash|123456/);
    expect(result.usuario).toEqual({ id: 'user-http', nome: body.nome, email: body.email, role: body.role });
    const payload = jwt.verify(result.token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    expect(payload.id === 'user-http' && payload.role === 'ALUNO' && payload.sub === undefined).toBe(true);
    expect(db.create).toHaveBeenCalledTimes(1);
    expect(db.create.mock.calls[0][0].data.auditLogs.create.map((event: { action: string }) => event.action)).toEqual(['ACEITE_TERMOS_E_PRIVACIDADE', 'USUARIO_CADASTRADO']);
    const saved = db.create.mock.calls[0][0].data;
    expect(await bcrypt.compare(body.senha, saved.senhaHash)).toBe(true);
    expect(bcrypt.getRounds(saved.senhaHash)).toBe(10);
    db.findUnique.mockResolvedValue({ ...saved, id: 'user-http' });
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: body.email, senha: body.senha }) });
    expect(login.status).toBe(200);
    const session = await fetch(`${base}/auth/session`, { headers: { Authorization: `Bearer ${(await login.json()).token}` } });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { nome: body.nome, email: body.email, role: 'ALUNO' }, nextStep: 'DIAGNOSTIC' });
  });

  it('não permite criar ADMIN pelo cadastro público', async () => {
    db.create.mockClear();
    const response = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Admin', email: 'admin@example.com', senha: 'senha-segura', role: 'ADMIN', acceptance }) });
    expect(response.status).toBe(400);
    expect(db.create).not.toHaveBeenCalled();
  });
});
