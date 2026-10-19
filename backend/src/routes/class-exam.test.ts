import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
const mocks = vi.hoisted(() => ({ user: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), invite: vi.fn(), join: vi.fn(), students: vi.fn(), exams: vi.fn(), save: vi.fn(), publish: vi.fn(), start: vi.fn(), attempt: vi.fn(), answer: vi.fn(), finalize: vi.fn() }));
vi.mock('../repositories/auth-repository', () => ({ AuthRepository: class { findByIdForAuth = mocks.user; } }));
vi.mock('../services/class-exam-service', () => ({ ClassExamService: class {
  listClasses = mocks.list; createClass = mocks.create; updateClass = mocks.update; rotateInvite = mocks.invite;
  join = mocks.join; students = mocks.students; listExams = mocks.exams; saveExam = mocks.save; publish = mocks.publish;
  start = mocks.start; attempt = mocks.attempt; answer = mocks.answer; finalize = mocks.finalize;
} }));
import { classRoutes, examRoutes } from './class-exam-routes';
import { errorHandler } from '../middlewares/error-handler';

const id = '00000000-0000-4000-8000-000000000071';
const secret = 'class-exam-http-test-only-key-over-32-characters';
const input = { titulo: 'Teste de contrato', descricao: '', duracaoSegundos: 3600, turmaIds: [id], questaoIds: [id] };
let server: Server, base: string, token: string;
const request = (method: string, path: string, body?: unknown, bearer: string | null = token) => fetch(base + path, { method,
  headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeAll(async () => {
  process.env.JWT_SECRET = secret; token = jwt.sign({ id, role: 'ADMIN', sessionVersion: 0 }, secret, { expiresIn: '1h' });
  const app = express(); app.use(express.json()); app.use('/turmas', classRoutes); app.use('/avaliacoes', examRoutes); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ id, role: 'PROFESSOR', sessionVersion: 0, emailVerifiedAt: new Date(), deletedAt: null });
  for (const [name, mock] of Object.entries(mocks)) if (name !== 'user') mock.mockResolvedValue({ items: [], page: 1, hasMore: false });
});

describe('class and teacher-exam HTTP guards', () => {
  it.each([
    ['GET', '/turmas'], ['POST', '/turmas'], ['PATCH', `/turmas/${id}`], ['POST', '/turmas/join'],
    ['POST', `/turmas/${id}/invite`], ['GET', '/turmas/students'], ['GET', `/turmas/${id}/students`],
    ['GET', '/avaliacoes'], ['POST', '/avaliacoes'], ['PUT', `/avaliacoes/${id}`], ['POST', `/avaliacoes/${id}/publish`],
    ['POST', `/avaliacoes/${id}/attempts`], ['GET', `/avaliacoes/attempts/${id}`], ['PUT', `/avaliacoes/attempts/${id}/answers/${id}`], ['POST', `/avaliacoes/attempts/${id}/finalize`],
  ])('requires authenticated session: %s %s', async (method, path) => {
    expect((await request(method, path, undefined, null)).status).toBe(401); expect(mocks.user).not.toHaveBeenCalled();
  });
  it.each(['PROFESSOR', 'ADMIN'])('rejects unverified account %s', async role => {
    mocks.user.mockResolvedValue({ id, role, sessionVersion: 0, emailVerifiedAt: null });
    expect((await request('GET', '/turmas')).status).toBe(403); expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each([
    ['POST', '/turmas', { nome: 'Unauthorized' }], ['PATCH', `/turmas/${id}`, { nome: 'Unauthorized' }],
    ['POST', `/turmas/${id}/invite`, {}], ['GET', `/turmas/${id}/students`, undefined], ['GET', '/turmas/students', undefined],
    ['POST', '/avaliacoes', input], ['PUT', `/avaliacoes/${id}`, input], ['POST', `/avaliacoes/${id}/publish`, {}],
  ])('student cannot manage classes/exams: %s %s', async (method, path, body) => {
    mocks.user.mockResolvedValue({ id, role: 'ALUNO', sessionVersion: 0, emailVerifiedAt: new Date() });
    expect((await request(method as string, path as string, body)).status).toBe(403);
  });
  it.each([
    ['POST', '/turmas/join'], ['POST', `/avaliacoes/${id}/attempts`], ['GET', `/avaliacoes/attempts/${id}`],
    ['PUT', `/avaliacoes/attempts/${id}/answers/${id}`], ['POST', `/avaliacoes/attempts/${id}/finalize`],
  ])('teacher cannot impersonate a student: %s %s', async (method, path) => {
    expect((await request(method, path)).status).toBe(403);
  });
  it.each([
    { ...input, questaoIds: [] }, { ...input, questaoIds: [id, id] }, { ...input, turmaIds: [id, id] },
    { ...input, duracaoSegundos: 0 }, { ...input, duracaoSegundos: 86401 }, { ...input, autorId: 'forged' },
    { ...input, titulo: '' }, { ...input, turmaIds: [] },
  ])('rejects invalid/forged exam input', async body => {
    expect((await request('POST', '/avaliacoes', body)).status).toBe(422); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('passes validated actor and fields to the ownership service; responses are not cached', async () => {
    const response = await request('POST', '/avaliacoes', input);
    expect(response.status).toBe(201); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.save).toHaveBeenCalledWith({ userId: id, role: 'PROFESSOR' }, input);
  });
  it.each(['?page=0', '?page=1001', '?page=abc', '?alunoId=other'])('rejects unbounded/tampered pagination %s', async query => {
    expect((await request('GET', '/turmas' + query)).status).toBe(422); expect(mocks.list).not.toHaveBeenCalled();
  });
  it('uses current profile and rejects a revoked JWT', async () => {
    mocks.user.mockResolvedValue({ id, role: 'ALUNO', emailVerifiedAt: new Date(), sessionVersion: 1 });
    expect((await request('GET', '/avaliacoes')).status).toBe(401); expect(mocks.exams).not.toHaveBeenCalled();
  });
});
