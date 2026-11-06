import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';

const db = vi.hoisted(() => ({ findMany: vi.fn(), userFindUnique: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { auditLog: { findMany: db.findMany }, user: { findUnique: db.userFindUnique } } }));

const secret = 'chave-exclusiva-de-testes-audit-com-mais-de-32-caracteres';
const userId = '00000000-0000-4000-8000-000000000001';
const accounts = [
  { id: userId, role: 'ADMIN' },
  { id: '00000000-0000-4000-8000-000000000002', role: 'PROFESSOR' },
  { id: '00000000-0000-4000-8000-000000000003', role: 'ALUNO' },
];
let server: Server;
let base: string;

beforeAll(async () => {
  vi.stubEnv('INSTITUTIONS_ENABLED', 'false');
  process.env.JWT_SECRET = secret;
  const { auditRoutes } = await import('./audit-routes');
  const { errorHandler } = await import('../middlewares/error-handler');
  const app = express();
  app.use('/audit-logs', auditRoutes);
  app.use(errorHandler);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/audit-logs`;
});
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); vi.unstubAllEnvs(); });
beforeEach(() => {
  db.findMany.mockReset().mockResolvedValue([]);
  db.userFindUnique.mockReset().mockImplementation(async ({ where }) => accounts.some(account => account.id === where.id)
    ? { ...accounts.find(account => account.id === where.id), deletedAt: null, emailVerifiedAt: new Date(), sessionVersion: 0 }
    : null);
});

function headers(role?: string): Record<string, string> {
  return role ? { Authorization: `Bearer ${jwt.sign({ id: accounts.find(account => account.role === role)!.id, role }, secret, { expiresIn: '1h' })}` } : {};
}

describe('GET /audit-logs', () => {
  it('permanece independente da flag e retorna somente o contrato de auditoria da plataforma', async () => {
    const response = await fetch(`${base}?action=LOGIN_FALHA&userId=${userId}&limit=25`, { headers: headers('ADMIN') });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({action: 'LOGIN_FALHA', userId}), take: 25,
      select: {id:true,userId:true,action:true,occurredAt:true,resourceId:true,termsVersion:true,privacyVersion:true},
    }));
    expect((await fetch(`${base}?page=2`, { headers: headers('ADMIN') })).status).toBe(422);
    expect((await fetch(`${base}?severity=ERROR`, { headers: headers('ADMIN') })).status).toBe(422);
  });
  it('permite somente ADMIN', async () => {
    expect((await fetch(base, { headers: headers('ADMIN') })).status).toBe(200);
    expect((await fetch(base, { headers: headers('PROFESSOR') })).status).toBe(403);
    expect((await fetch(base, { headers: headers('ALUNO') })).status).toBe(403);
    expect((await fetch(base)).status).toBe(401);
    expect(db.findMany).toHaveBeenCalledTimes(1);
  });

  it('limita a consulta a 100 e ordena pelos registros mais recentes', async () => {
    const response = await fetch(`${base}?limit=500`, { headers: headers('ADMIN') });
    expect(response.status).toBe(422);
    await fetch(`${base}?limit=100`, { headers: headers('ADMIN') });
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] }));
  });
});
