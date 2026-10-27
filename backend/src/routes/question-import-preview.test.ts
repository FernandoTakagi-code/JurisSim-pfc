import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, questao: { findMany: vi.fn(), create: vi.fn() } }));
vi.mock('../config/prisma', () => ({ prisma: db }));
vi.mock('../lib/prisma', () => ({ prisma: db }));

const secret = 'segredo-exclusivo-de-testes-do-importador-csv-mais-que-32';
const accounts = [
  { id: '00000000-0000-4000-8000-000000000001', role: 'ADMIN' },
  { id: '00000000-0000-4000-8000-000000000002', role: 'PROFESSOR' },
  { id: '00000000-0000-4000-8000-000000000003', role: 'ALUNO' },
];
const headers = ['enunciado', 'disciplina', 'assunto', 'nivel', 'fundamentacao_juridica', 'alternativa_a', 'alternativa_b', 'alternativa_c', 'alternativa_d', 'alternativa_e', 'gabarito', 'publica', 'fonte_nome', 'fonte_referencia', 'licenca_ou_autorizacao'];
const row = ['"Pergunta original e suficientemente longa"', 'Direito Civil', 'Contratos', 'BASICO', 'Explicação original', 'Opção A', 'Opção B', '', '', '', 'A', 'true', 'JurisSim', 'Referência didática', 'Autorização declarada para demonstração'].join(',');
let server: Server;
let base: string;

function authorization(role: string) {
  const account = accounts.find(item => item.role === role)!;
  return `Bearer ${jwt.sign({ id: account.id, role: 'ADMIN' }, secret, { expiresIn: '1h' })}`;
}

beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  const { default: routes } = await import('./questaoRoutes');
  const { errorHandler } = await import('../middlewares/error-handler');
  const app = express();
  app.use('/questoes', routes);
  app.use(errorHandler);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/questoes/importacao/preview`;
});
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockImplementation(async ({ where }) => {
    const user = accounts.find(account => account.id === where.id);
    return user ? { ...user, deletedAt: null, emailVerifiedAt: new Date(), sessionVersion: 0 } : null;
  });
});

describe('POST /questoes/importacao/preview', () => {
  it('permite ADMIN e não consulta nem grava questões', async () => {
    const response = await fetch(base, { method: 'POST', headers: { Authorization: authorization('ADMIN'), 'Content-Type': 'text/csv' }, body: `${headers.join(',')}\n${row}` });
    expect(response.status).toBe(200);
    expect((await response.json()).totals).toEqual({ total: 1, valid: 1, invalid: 0, duplicated: 0 });
    expect(db.questao.findMany).not.toHaveBeenCalled();
    expect(db.questao.create).not.toHaveBeenCalled();
  });

  it.each(['ALUNO', 'PROFESSOR'] as const)('nega acesso de %s apesar do role declarado no token', async role => {
    const response = await fetch(base, { method: 'POST', headers: { Authorization: authorization(role), 'Content-Type': 'text/csv' }, body: `${headers.join(',')}\n${row}` });
    expect(response.status).toBe(403);
    expect(db.questao.findMany).not.toHaveBeenCalled();
  });

  it('exige autenticação e rejeita tipo de conteúdo diferente de CSV', async () => {
    const missing = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: `${headers.join(',')}\n${row}` });
    expect(missing.status).toBe(401);
    const contentType = await fetch(base, { method: 'POST', headers: { Authorization: authorization('ADMIN'), 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: row }) });
    expect(contentType.status).toBe(422);
    expect(db.questao.create).not.toHaveBeenCalled();
  });
});
