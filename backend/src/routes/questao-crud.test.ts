import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  questao: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  turma: { findFirst: vi.fn() },
  alternativa: { deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../config/prisma', () => ({ prisma: db }));
vi.mock('../lib/prisma', () => ({ prisma: db }));

// Exercise actual routes, controllers, services and repository without a database.
// The persistence double enforces the relevant FK and transactional behavior.
type Question = Record<string, any> & { id: string; alternativas: any[]; _count: { respostas: number; diagnosticos: number } };
let records: Map<string, Question>;
let classes: Map<string, { id: string; alunos: { id: string }[]; professores: { id: string }[] }>;
let sequence = 0;
let server: Server;
let base: string;
const secret = 'chave-exclusiva-de-testes-do-crud-de-questoes';
const professorId = '00000000-0000-4000-8000-000000000001';
const accountIds: Record<string, string> = {
  PROFESSOR: professorId,
  ALUNO: '00000000-0000-4000-8000-000000000002',
  ADMIN: '00000000-0000-4000-8000-000000000003',
  OUTRO_PROFESSOR: '00000000-0000-4000-8000-000000000004',
  OUTRO_ALUNO: '00000000-0000-4000-8000-000000000005',
};
const accountRoles: Record<string, string> = { PROFESSOR: 'PROFESSOR', ALUNO: 'ALUNO', ADMIN: 'ADMIN', OUTRO_PROFESSOR: 'PROFESSOR', OUTRO_ALUNO: 'ALUNO' };
const body = {
  enunciado: 'Enunciado original da questão', disciplina: 'Civil', assunto: 'Contratos',
  nivel: 'BASICO', fundamentacaoJuridica: 'Fundamentação de teste', publica: true,
  alternativas: [{ texto: 'Alternativa A', correta: true }, { texto: 'Alternativa B', correta: false }],
};
const clone = <T,>(value: T): T => structuredClone(value);
const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('Erro simulado', { code, clientVersion: '6.19.3' });
const alternatives = (values: any[], questaoId: string) => values.map(value => ({ ...value, id: `alt-${++sequence}`, questaoId }));
const publicRecord = (q: Question) => { const { _count, ...data } = clone(q); return data; };
// Evaluate Prisma's boolean and relation filters against independent fixture data.
function matches(row: any, where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(part => matches(row, part));
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (key === 'some') return Array.isArray(row) && row.some(item => matches(item, value));
    if (value !== null && typeof value === 'object') return row?.[key] != null && matches(row[key], value);
    return row?.[key] === value;
  });
}
const visibleRecords = (where: any) => [...records.values()].filter(q => matches({ ...q, turma: classes.get(q.turmaId) ?? null }, where));

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
  classes = new Map([
    ['turma-a', { id: 'turma-a', professores: [{ id: professorId }], alunos: [{ id: accountIds.ALUNO }] }],
    ['turma-b', { id: 'turma-b', professores: [{ id: accountIds.OUTRO_PROFESSOR }], alunos: [{ id: accountIds.OUTRO_ALUNO }] }],
  ]);
  db.turma.findFirst.mockImplementation(async ({ where }) => [...classes.values()].find(turma => matches(turma, where)) ?? null);
  db.user.findUnique.mockImplementation(async ({ where }) => {
    const key = Object.keys(accountIds).find(key => accountIds[key] === where.id);
    const role = key ? accountRoles[key] : undefined;
    return role ? { id: where.id, role, deletedAt: null, emailVerifiedAt: new Date(), sessionVersion: 0 } : null;
  });
  db.questao.create.mockImplementation(async ({ data }) => {
    const id = `question-${++sequence}`;
    const q = { ...data, id, alternativas: alternatives(data.alternativas.create, id), _count: { respostas: 0, diagnosticos: 0 } };
    records.set(id, q);
    return publicRecord(q);
  });
  db.auditLog.create.mockImplementation(async ({ data }) => ({ ...data, id: `audit-${++sequence}`, occurredAt: new Date() }));
  db.questao.findUnique.mockImplementation(async ({ where, select }) => {
    const q = records.get(where.id);
    return q ? select ? { autorId: q.autorId, _count: clone(q._count) } : publicRecord(q) : null;
  });
  db.questao.findFirst.mockImplementation(async ({ where }) => {
    const q = visibleRecords(where)[0];
    return q ? publicRecord(q) : null;
  });
  db.questao.findMany.mockImplementation(async ({ where }) => visibleRecords(where).map(publicRecord));
  db.questao.update.mockImplementation(async ({ where, data }) => {
    const q = records.get(where.id);
    if (!q || !matches(q, where)) throw prismaError('P2025');
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
    if (!q || !matches(q, where)) throw prismaError('P2025');
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
  if (role) headers.Authorization = `Bearer ${jwt.sign({ id: accountIds[role], role: accountRoles[role] }, secret, { expiresIn: '1h' })}`;
  return fetch(`${base}${path}`, { method, headers, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
}
async function create() {
  const response = await call('POST', '', { ...body, autorId: 'forjado' });
  expect(response.status).toBe(201);
  return response.json();
}

describe('CRUD completo de questões por HTTP', () => {
  it('calcula fingerprint no cadastro manual e traduz colisão única sem salvar a questão', async () => {
    const saved = await create();
    expect(saved.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect([...records.values()][0].fingerprint).toBe(saved.fingerprint);

    db.$transaction.mockRejectedValueOnce(prismaError('P2002'));
    const response = await call('POST', '', body);
    expect(response.status).toBe(409);
    expect((await response.json()).message).toMatch(/conteúdo/i);
    expect(records.size).toBe(1);
  });

  it('recalcula fingerprint após edição e rejeita colisão sem alterar a questão', async () => {
    const question = await create();
    const originalFingerprint = question.fingerprint;
    const edited = await call('PUT', `/${question.id}`, { assunto: 'Responsabilidade civil' });
    expect(edited.status).toBe(200);
    const updated = await edited.json();
    expect(updated.fingerprint).not.toBe(originalFingerprint);

    db.questao.update.mockRejectedValueOnce(prismaError('P2002'));
    const conflict = await call('PUT', `/${question.id}`, { assunto: 'Conteúdo já existente' });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).message).toMatch(/conteúdo/i);
    expect(records.get(question.id)?.assunto).toBe('Responsabilidade civil');
  });

  it.each(['PROFESSOR', 'ADMIN'])('%s cria, visualiza, edita alternativas e exclui questão não utilizada', async role => {
    const created = await call('POST', '', { ...body, autorId: 'forjado' }, role);
    expect(created.status).toBe(201);
    const q = await created.json();
    expect(q.autorId).toBe(accountIds[role]);
    const list = await call('GET', '', undefined, role);
    expect(list.status).toBe(200);
    expect((await list.json())[0].id).toBe(q.id);
    const listQuery = db.questao.findMany.mock.calls[0][0];
    expect(listQuery).toHaveProperty('select.alternativas.select', {
      id: true, texto: true, correta: true, questaoId: true,
    });
    for (const field of [
      'fonteNome', 'fonteReferencia', 'licencaOuAutorizacao', 'loteImportacaoId', 'fingerprint', 'origem',
      'revisaoJuridicaEm', 'revisorJuridicoId', 'revisaoPedagogicaEm', 'revisorPedagogicoId',
      'liberadaAcervoEm', 'liberadaAcervoPorId', 'situacaoDireitos', 'direitosVerificadosEm',
      'direitosVerificadosPorId', 'oabExame', 'oabEdicao', 'oabTipoProva', 'oabNumeroQuestao',
      'fonteOficialUrl', 'situacaoQuestaoOficial',
    ]) {
      expect(listQuery.select).not.toHaveProperty(field);
    }
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
      { action: 'QUESTAO_CRIADA', userId: accountIds[role], resourceId: q.id },
      { action: 'QUESTAO_ATUALIZADA', userId: accountIds[role], resourceId: q.id },
      { action: 'QUESTAO_EXCLUIDA', userId: accountIds[role], resourceId: q.id },
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

describe('autoria, privacidade e isolamento entre turmas', () => {
  async function questionFor(role: string, overrides: Record<string, unknown> = {}) {
    const response = await call('POST', '', { ...body, ...overrides }, role);
    expect(response.status).toBe(201);
    return response.json();
  }

  it.each([true, false])('professor não altera questão alheia, pública=%s, mesmo pertencendo à turma', async publica => {
    const q = await questionFor('PROFESSOR', { publica, turmaId: 'turma-a' });
    classes.get('turma-a')!.professores.push({ id: accountIds.OUTRO_PROFESSOR });
    for (const method of ['PUT', 'DELETE']) {
      const response = await call(method, `/${q.id}`, method === 'PUT' ? { assunto: 'Invasão' } : undefined, 'OUTRO_PROFESSOR');
      expect(response.status).toBe(403);
    }
    expect(publicRecord(records.get(q.id)!)).toEqual(q);
    expect(db.questao.update).not.toHaveBeenCalled();
    expect(db.alternativa.deleteMany).not.toHaveBeenCalled();
    expect(db.questao.delete).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('ADMIN administra questão alheia sem alterar autoria', async () => {
    const q = await questionFor('PROFESSOR', { publica: false });
    expect((await call('PUT', `/${q.id}`, { assunto: 'Revisão administrativa' }, 'ADMIN')).status).toBe(200);
    expect(records.get(q.id)!.autorId).toBe(professorId);
    expect((await call('DELETE', `/${q.id}`, undefined, 'ADMIN')).status).toBe(204);
  });

  it.each(['ALUNO', 'OUTRO_ALUNO', 'OUTRO_PROFESSOR'])('%s não encontra questão privada sem turma por ID ou listagem', async role => {
    const q = await questionFor('PROFESSOR', { publica: false });
    expect((await call('GET', `/${q.id}`, undefined, role)).status).toBe(404);
    expect(await (await call('GET', '', undefined, role)).json()).toEqual([]);
    for (const allowed of ['PROFESSOR', 'ADMIN']) expect((await call('GET', `/${q.id}`, undefined, allowed)).status).toBe(200);
  });

  it('aluno vê somente suas turmas e questões públicas, sem gabarito', async () => {
    const own = await questionFor('PROFESSOR', { publica: false, turmaId: 'turma-a' });
    const foreign = await questionFor('OUTRO_PROFESSOR', { publica: false, turmaId: 'turma-b' });
    const global = await questionFor('OUTRO_PROFESSOR');
    const response = await call('GET', '', undefined, 'ALUNO');
    const values = await response.json();
    expect(values.map((q: any) => q.id).sort()).toEqual([own.id, global.id].sort());
    expect(JSON.stringify(values)).not.toContain('correta');
    expect((await call('GET', `/${own.id}`, undefined, 'ALUNO')).status).toBe(200);
    expect((await call('GET', `/${foreign.id}`, undefined, 'ALUNO')).status).toBe(404);
    expect((await call('GET', '?turmaId=turma-b', undefined, 'ALUNO')).status).toBe(403);
    expect((await call('GET', '?turmaId=turma-a', undefined, 'OUTRO_ALUNO')).status).toBe(403);
  });

  it('filtro por turma é restritivo e exige vínculo de aluno/professor; ADMIN pode consultar', async () => {
    const own = await questionFor('PROFESSOR', { publica: false, turmaId: 'turma-a' });
    await questionFor('PROFESSOR');
    await questionFor('OUTRO_PROFESSOR', { turmaId: 'turma-b' });
    for (const role of ['ALUNO', 'PROFESSOR', 'ADMIN']) {
      const response = await call('GET', '?turmaId=turma-a', undefined, role);
      expect(response.status).toBe(200);
      expect((await response.json()).map((q: any) => q.id)).toEqual([own.id]);
    }
    expect((await call('GET', '?turmaId=turma-a', undefined, 'OUTRO_PROFESSOR')).status).toBe(403);
    classes.get('turma-a')!.alunos = [];
    expect((await call('GET', `/${own.id}`, undefined, 'ALUNO')).status).toBe(404);
    expect((await call('GET', '?turmaId=turma-a', undefined, 'ALUNO')).status).toBe(403);
  });

  it('professor vinculado lê questão privada de colega, mas não pode editá-la', async () => {
    const q = await questionFor('PROFESSOR', { publica: false, turmaId: 'turma-a' });
    classes.get('turma-a')!.professores.push({ id: accountIds.OUTRO_PROFESSOR });
    expect((await call('GET', `/${q.id}`, undefined, 'OUTRO_PROFESSOR')).status).toBe(200);
    expect((await call('PUT', `/${q.id}`, { assunto: 'Outro' }, 'OUTRO_PROFESSOR')).status).toBe(403);
  });

  it('não permite criar ou mover questão para turma de outro professor', async () => {
    expect((await call('POST', '', { ...body, turmaId: 'turma-b' })).status).toBe(403);
    expect(records.size).toBe(0);
    const q = await create();
    expect((await call('PUT', `/${q.id}`, { turmaId: 'turma-b' })).status).toBe(403);
    expect(publicRecord(records.get(q.id)!)).toEqual(q);
    expect((await call('PUT', `/${q.id}`, { turmaId: 'turma-a' })).status).toBe(200);
    expect((await call('PUT', `/${q.id}`, { turmaId: 'turma-b' }, 'ADMIN')).status).toBe(200);
  });

  it('minhas não amplia visibilidade e parâmetros de turma malformados são rejeitados', async () => {
    const own = await questionFor('PROFESSOR', { publica: false });
    await questionFor('OUTRO_PROFESSOR');
    expect((await (await call('GET', '?minhas=true')).json()).map((q: any) => q.id)).toEqual([own.id]);
    expect(await (await call('GET', '?minhas=true', undefined, 'ALUNO')).json()).toEqual([]);
    for (const query of ['?turmaId=', '?turmaId=turma-a&turmaId=turma-b', '?nivel=INVALIDO']) {
      expect((await call('GET', query)).status).toBe(422);
    }
  });

  it('perfil rebaixado não reutiliza vínculo de professor para acessar turma privada', async () => {
    const q = await questionFor('PROFESSOR', { publica: false, turmaId: 'turma-a' });
    classes.get('turma-a')!.professores.push({ id: accountIds.OUTRO_PROFESSOR });
    const originalLookup = db.user.findUnique.getMockImplementation()!;
    db.user.findUnique.mockImplementation(async args => {
      const user = await originalLookup(args);
      return user?.id === accountIds.OUTRO_PROFESSOR ? { ...user, role: 'ALUNO' } : user;
    });
    expect((await call('GET', `/${q.id}`, undefined, 'OUTRO_PROFESSOR')).status).toBe(404);
    expect((await call('GET', '?turmaId=turma-a', undefined, 'OUTRO_PROFESSOR')).status).toBe(403);
    expect((await call('PUT', `/${q.id}`, { assunto: 'Invasão' }, 'OUTRO_PROFESSOR')).status).toBe(403);
  });
});
