import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';

const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: {
  auditLog: db,
  user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, role: 'ADMIN', deletedAt: null }) },
} }));

const secret = 'chave-exclusiva-de-testes-audit-com-mais-de-32-caracteres';
const userId = '00000000-0000-4000-8000-000000000001';
let server: Server;
let base: string;

beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  const { auditRoutes } = await import('./audit-routes');
  const { errorHandler } = await import('../middlewares/error-handler');
  const app = express();
  app.use('/audit-logs', auditRoutes);
  app.use(errorHandler);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/audit-logs`;
});
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => { db.findMany.mockReset().mockResolvedValue([]); });

function headers(role?: string): Record<string, string> {
  return role ? { Authorization: `Bearer ${jwt.sign({ id: userId, role }, secret, { expiresIn: '1h' })}` } : {};
}

describe('GET /audit-logs', () => {
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
