import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
const mocks = vi.hoisted(() => ({ user: vi.fn(), goals: vi.fn(), create: vi.fn(), update: vi.fn(), complete: vi.fn(), classes: vi.fn(), report: vi.fn(), individual: vi.fn() }));
vi.mock('../repositories/auth-repository', () => ({ AuthRepository: class { findByIdForAuth = mocks.user; } }));
vi.mock('../services/study-goal-service', () => ({ StudyGoalService: class { list = mocks.goals; create = mocks.create; update = mocks.update; complete = mocks.complete; } }));
vi.mock('../services/class-report-service', () => ({ ClassReportService: class { classes = mocks.classes; report = mocks.report; individual = mocks.individual; } }));
import { goalRoutes, reportRoutes } from './goals-reports-routes';
import { errorHandler } from '../middlewares/error-handler';
const id = '00000000-0000-4000-8000-000000000081', otherId = '00000000-0000-4000-8000-000000000082';
const secret = 'goal-report-http-only-test-key-over-32-characters';
let server: Server, base: string, token: string;
const request = (method: string, path: string, body?: unknown, bearer: string | null = token) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const dbUser = (role = 'ALUNO') => ({ id, role, sessionVersion: 0, emailVerifiedAt: new Date(), deletedAt: null });
beforeAll(async () => {
  process.env.JWT_SECRET = secret; token = jwt.sign({ id, role: 'ADMIN', sessionVersion: 0 }, secret, { expiresIn: '1h' });
  const app = express(); app.use(express.json()); app.use('/goals', goalRoutes); app.use('/reports', reportRoutes); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue(dbUser()); for (const [name, mock] of Object.entries(mocks)) if (name !== 'user') mock.mockResolvedValue({ items: [], page: 1, hasMore: false }); });

describe('goals/report HTTP validation and authorization', () => {
  it.each([['GET', '/goals'], ['POST', '/goals'], ['PATCH', `/goals/${id}`], ['POST', `/goals/${id}/complete`], ['GET', '/reports/classes'], ['GET', `/reports/classes/${id}`], ['GET', `/reports/classes/${id}/students/${otherId}`]])('requires authentication: %s %s', async (method, path) => {
    expect((await request(method, path, undefined, null)).status).toBe(401); expect(mocks.user).not.toHaveBeenCalled();
  });
  it.each(['ALUNO', 'PROFESSOR', 'ADMIN'])('requires email confirmation for %s', async role => {
    mocks.user.mockResolvedValue({ ...dbUser(role), emailVerifiedAt: null });
    expect((await request('GET', role === 'ALUNO' ? '/goals' : '/reports/classes')).status).toBe(403);
  });
  it.each(['PROFESSOR', 'ADMIN'])('does not allow %s to manage goals', async role => {
    mocks.user.mockResolvedValue(dbUser(role));
    expect((await request('POST', '/goals', { date: '2026-10-17', targetQuestions: 10 })).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(['/reports/classes', `/reports/classes/${id}`, `/reports/classes/${id}/students/${otherId}`])('does not allow a student to read %s', async route => {
    expect((await request('GET', route)).status).toBe(403); expect(mocks.report).not.toHaveBeenCalled();
  });
  it.each([
    { date: '2026-02-30', targetQuestions: 10 }, { date: '2026-10-17T00:00:00Z', targetQuestions: 10 },
    { date: '1999-12-31', targetQuestions: 10 }, { date: '2101-01-01', targetQuestions: 10 },
    { date: '2026-10-17', targetQuestions: 0 }, { date: '2026-10-17', targetQuestions: 1001 },
    { date: '2026-10-17', targetQuestions: 1.5 }, { date: '2026-10-17', targetQuestions: '10' },
    { date: '2026-10-17', targetQuestions: 10, alunoId: otherId },
    { date: '2026-10-17', targetQuestions: 10, questoesResolvidas: 100 },
    { date: '2026-10-17', targetQuestions: 10, completed: true },
  ])('rejects invalid dates, quantities and forged progress', async input => {
    expect((await request('POST', '/goals', input)).status).toBe(422); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('uses current student ID rather than forged JWT permissions and stores only allowed fields', async () => {
    const input = { date: '2026-10-17', targetQuestions: 10 }, response = await request('POST', '/goals', input);
    expect(response.status).toBe(201); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.create).toHaveBeenCalledWith(id, input);
  });
  it.each([{}, { cumprida: true }, { resolvedQuestions: 99 }])('rejects empty or forged goal edits', async input => {
    expect((await request('PATCH', `/goals/${id}`, input)).status).toBe(422); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('completion delegates real verification and does not accept a submitted counter', async () => {
    expect((await request('POST', `/goals/${id}/complete`, { resolvedQuestions: 100 })).status).toBe(422);
    expect((await request('POST', `/goals/${id}/complete`, {})).status).toBe(200); expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(id, id);
  });
  it.each(['?page=0', '?page=1001', '?page=abc', '?status=invalid', '?alunoId=other'])('rejects invalid/tampered goal pagination %s', async query => {
    expect((await request('GET', '/goals' + query)).status).toBe(422); expect(mocks.goals).not.toHaveBeenCalled();
  });
  it.each(['?page=0', '?examPage=1001', '?studentId=other', '?classId=other'])('rejects invalid/tampered report query %s', async query => {
    mocks.user.mockResolvedValue(dbUser('PROFESSOR'));
    expect((await request('GET', `/reports/classes/${id}` + query)).status).toBe(422); expect(mocks.report).not.toHaveBeenCalled();
  });
  it('passes the authoritative teacher identity for class and individual permission checks', async () => {
    mocks.user.mockResolvedValue(dbUser('PROFESSOR'));
    const response = await request('GET', `/reports/classes/${id}?page=2&examPage=3`);
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(mocks.report).toHaveBeenCalledWith({ userId: id, role: 'PROFESSOR' }, id, 2, 3);
    await request('GET', `/reports/classes/${id}/students/${otherId}?page=2`);
    expect(mocks.individual).toHaveBeenCalledWith({ userId: id, role: 'PROFESSOR' }, id, otherId, 2);
  });
  it.each([{ ...dbUser(), sessionVersion: 1 }, { ...dbUser(), deletedAt: new Date() }, null])('rejects revoked, deleted or missing accounts', async user => {
    mocks.user.mockResolvedValue(user); expect((await request('GET', '/goals')).status).toBe(401); expect(mocks.goals).not.toHaveBeenCalled();
  });
});
