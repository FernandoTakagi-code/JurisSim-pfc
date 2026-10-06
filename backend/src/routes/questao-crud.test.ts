import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';

const db = vi.hoisted(() => ({
  questao: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  alternativa: { deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../config/prisma', () => ({ prisma: db }));
vi.mock('../lib/prisma', () => ({ prisma: {
  user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, role: 'PROFESSOR', deletedAt: null }) },
} }));

// Exercise actual routes, controllers, services and repository without a database.
// The persistence double enforces the relevant FK and transactional behavior.
type Question = Record<string, any> & { id: string; alternativas: any[]; _count: { respostas: number; diagnosticos: number } };
let records: Map<string, Question>;
let sequence = 0;
let server: Server;
let base: string;
const secret = 'chave-exclusiva-de-testes-do-crud-de-questoes';
const professorId = '00000000-0000-4000-8000-000000000001';
const body = {
  enunciado: 'Enunciado original da questão', disciplina: 'Civil', assunto: 'Contratos',
  nivel: 'BASICO', fundamentacaoJuridica: 'Fundamentação de teste', publica: true,
  alternativas: [{ texto: 'Alternativa A', correta: true }, { texto: 'Alternativa B', correta: false }],
};
const clone = <T,>(value: T): T => structuredClone(value);
const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('Erro simulado', { code, clientVersion: '6.19.3' });
const alternatives = (values: any[], questaoId: string) => values.map(value => ({ ...value, id: `alt-${++sequence}`, questaoId }));
const publicRecord = (q: Question) => { const { _count, ...data } = clone(q); return data; };

beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  const { default: routes } = await import('./questaoRoutes');
  const { errorHandler } = await import('../middlewares/error-handler');
  const app = express();
  app.use(express.json());
  app.use('/questoes', routes);
  app.use(errorHandler);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/questoes`;
});
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

beforeEach(() => {
  vi.resetAllMocks();
  sequence = 0;
  records = new Map();
  db.questao.create.mockImplementation(async ({ data }) => {
    const id = `question-${++sequence}`;
    const q = { ...data, id, alternativas: alternatives(data.alternativas.create, id), _count: { respostas: 0, diagnosticos: 0 } };
    records.set(id, q);
    return publicRecord(q);
  });
  db.auditLog.create.mockImplementation(async ({ data }) => ({ ...data, id: `audit-${++sequence}`, occurredAt: new Date() }));
  db.questao.findUnique.mockImplementation(async ({ where, select }) => {
    const q = records.get(where.id);
    return q ? select ? { _count: clone(q._count) } : publicRecord(q) : null;
  });
  db.questao.findMany.mockImplementation(async () => [...records.values()].map(publicRecord));
  db.questao.update.mockImplementation(async ({ where, data }) => {
    const q = records.get(where.id);
    if (!q) throw prismaError('P2025');
    const { alternativas, ...fields } = data;
    Object.assign(q, fields);
    if (alternativas) {
      if (alternativas.deleteMany) q.alternativas = [];
      q.alternativas.push(...alternatives(alternativas.create, q.id));
    }
    return publicRecord(q);
  });
  db.alternativa.deleteMany.mockImplementation(async ({ where }) => {
    const q = records.get(where.questaoId)!;
    const count = q.alternativas.length;
    q.alternativas = [];
    return { count };
  });
  db.questao.delete.mockImplementation(async ({ where }) => {
    const q = records.get(where.id);
    if (!q) throw prismaError('P2025');
    if (q.alternativas.length || q._count.respostas || q._count.diagnosticos) throw prismaError('P2003');
    records.delete(q.id);
    return publicRecord(q);
  });
  db.$transaction.mockImplementation(async callback => {
    const snapshot = clone(records);
    try { return await callback(db); } catch (error) { records = snapshot; throw error; }
  });
});

function call(method: string, path = '', data?: unknown, role: string | null = 'PROFESSOR') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (role) headers.Authorization = `Bearer ${jwt.sign({ id: professorId, role }, secret, { expiresIn: '1h' })}`;
  return fetch(`${base}${path}`, { method, headers, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
}
async function create() {
  const response = await call('POST', '', { ...body, autorId: 'forjado' });
  expect(response.status).toBe(201);
  return response.json();
}

describe('CRUD completo de questões por HTTP', () => {
  it.each(['PROFESSOR', 'ADMIN'])('%s cria, visualiza, edita alternativas e exclui questão não utilizada', async role => {
    const created = await call('POST', '', { ...body, autorId: 'forjado' }, role);
    expect(created.status).toBe(201);
    const q = await created.json();
    expect(q.autorId).toBe(professorId);
    const list = await call('GET', '', undefined, role);
    expect(list.status).toBe(200);
    expect((await list.json())[0].id).toBe(q.id);
    const detail = await call('GET', `/${q.id}`, undefined, role);
    expect(detail.status).toBe(200);
    expect((await detail.json()).alternativas[0].correta).toBe(true);
    const edits = { enunciado: 'Enunciado corrigido da questão', alternativas: [
      { texto: 'Nova A', correta: false }, { texto: 'Nova B', correta: true }, { texto: 'Nova C', correta: false },
    ] };
    const edited = await call('PUT', `/${q.id}`, edits, role);
    expect(edited.status).toBe(200);
    const saved = await (await call('GET', `/${q.id}`, undefined, role)).json();
    expect(saved.enunciado).toBe(edits.enunciado);
    expect(saved.alternativas.map(({ texto, correta }: any) => ({ texto, correta }))).toEqual(edits.alternativas);
    expect(saved.alternativas.every((a: any) => !q.alternativas.some((old: any) => old.id === a.id))).toBe(true);
    const removed = await call('DELETE', `/${q.id}`, undefined, role);
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe('');
    expect((await call('GET', `/${q.id}`)).status).toBe(404);
    expect(records.size).toBe(0);
    expect(db.auditLog.create.mock.calls.map(([{ data }]) => ({ action: data.action, userId: data.userId, resourceId: data.resourceId }))).toEqual([
      { action: 'QUESTAO_CRIADA', userId: professorId, resourceId: q.id },
      { action: 'QUESTAO_ATUALIZADA', userId: professorId, resourceId: q.id },
      { action: 'QUESTAO_EXCLUIDA', userId: professorId, resourceId: q.id },
    ]);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('edição parcial de metadados mantém alternativas e seus IDs', async () => {
    const q = await create();
    const response = await call('PUT', `/${q.id}`, { assunto: 'Novo assunto' });
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.assunto).toBe('Novo assunto');
    expect(saved.alternativas).toEqual(q.alternativas);
  });

  it('ALUNO visualiza sem gabarito e não cria, edita ou exclui', async () => {
    const q = await create();
    for (const path of ['', `/${q.id}`]) {
      const response = await call('GET', path, undefined, 'ALUNO');
      expect(response.status).toBe(200);
      expect(JSON.stringify(await response.json())).not.toContain('correta');
    }
    for (const method of ['POST', 'PUT', 'DELETE']) {
      expect((await call(method, method === 'POST' ? '' : `/${q.id}`, body, 'ALUNO')).status).toBe(403);
    }
    expect(publicRecord(records.get(q.id)!)).toEqual(q);
  });

  it.each(['POST', 'GET', 'PUT', 'DELETE'])('%s sem autenticação retorna 401', async method => {
    expect((await call(method, method === 'POST' ? '' : '/id', undefined, null)).status).toBe(401);
  });

  it.each([
    {}, { autorId: 'outro-professor' }, { id: 'outro-id' }, { respostas: { deleteMany: {} } },
    { enunciado: 'curto' }, { nivel: 'INVALIDO' }, { alternativas: [] },
    { alternativas: [{ texto: 'A', correta: true }] },
    { alternativas: [{ texto: '', correta: true }, { texto: 'B', correta: false }] },
    { alternativas: [{ texto: 'A', correta: false }, { texto: 'B', correta: false }] },
    { alternativas: [{ texto: 'A', correta: true }, { texto: 'B', correta: true }] },
  ])('edição inválida não modifica questão: %j', async edits => {
    const q = await create();
    expect((await call('PUT', `/${q.id}`, edits)).status).toBe(400);
    expect(publicRecord(records.get(q.id)!)).toEqual(q);
    expect(db.questao.update).not.toHaveBeenCalled();
  });

  it.each([[], [{ texto: 'A', correta: true }], [{ texto: 'A', correta: false }, { texto: 'B', correta: false }], [{ texto: 'A', correta: true }, { texto: 'B', correta: true }]])('criação valida quantidade e gabarito: %j', async (...values) => {
    // it.each spreads array rows; collect the alternatives back into one array.
    expect((await call('POST', '', { ...body, alternativas: values })).status).toBe(400);
    expect(records.size).toBe(0);
  });

  it.each(['diagnosticos', 'respostas'])('questão vinculada a %s retorna 409 sem destruir histórico', async relation => {
    const q = await create();
    records.get(q.id)!._count[relation as 'diagnosticos' | 'respostas'] = 1;
    for (const method of ['PUT', 'DELETE']) {
      const response = await call(method, `/${q.id}`, method === 'PUT' ? { ...body, alternativas: [...body.alternativas].reverse() } : undefined);
      expect(response.status).toBe(409);
      expect((await response.json()).message).toContain('já utilizada');
    }
    expect(publicRecord(records.get(q.id)!)).toEqual(q);
    expect(db.alternativa.deleteMany).not.toHaveBeenCalled();
    expect(db.questao.delete).not.toHaveBeenCalled();
    expect(db.questao.update).not.toHaveBeenCalled();
  });

  it.each(['P2003', 'P2034'])('exclusão reverte remoção das alternativas se o banco rejeitar (%s)', async code => {
    const q = await create();
    db.questao.delete.mockRejectedValueOnce(prismaError(code));
    expect((await call('DELETE', `/${q.id}`)).status).toBe(409);
    expect(db.alternativa.deleteMany).toHaveBeenCalled();
    expect(publicRecord(records.get(q.id)!)).toEqual(q);
  });

  it.each(['GET', 'PUT', 'DELETE'])('%s inexistente retorna 404', async method => {
    expect((await call(method, '/inexistente', method === 'PUT' ? { assunto: 'Assunto' } : undefined)).status).toBe(404);
  });
});
