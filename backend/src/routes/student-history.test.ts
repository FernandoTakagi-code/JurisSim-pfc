import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';

const mocks = vi.hoisted(() => ({ user: vi.fn(), overview: vi.fn(), history: vi.fn() }));
vi.mock('../repositories/auth-repository', () => ({ AuthRepository: class { findByIdForAuth = mocks.user; } }));
vi.mock('../repositories/student-history-repository', () => ({ StudentHistoryRepository: class { overview = mocks.overview; history = mocks.history; } }));
import { studentHistoryRoutes } from './student-history-routes';
import { errorHandler } from '../middlewares/error-handler';

const id = '00000000-0000-4000-8000-000000000041';
const secret = 'student-history-http-unit-test-secret-over-32-characters';
let server: Server; let base: string; let token: string;
const get = (path: string, bearer: string | null = token) => fetch(base + path, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  token = jwt.sign({ id, role: 'ADMIN', sessionVersion: 0 }, secret, { expiresIn: '1h' });
  const app = express(); app.use('/students/me', studentHistoryRoutes); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id, role: 'ALUNO', emailVerifiedAt: new Date(), deletedAt: null, sessionVersion: 0 });
  mocks.overview.mockResolvedValue({ latestDiagnosticId: null, evolution: [], recentActivities: [], totals: { completedActivities: 0 } });
  mocks.history.mockResolvedValue([]);
});

describe('student history HTTP authorization and pagination', () => {
  it('uses current student identity rather than JWT role; returns private empty overview', async () => {
    const response = await get('/students/me/overview');
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).latestDiagnosticId).toBeNull(); expect(mocks.overview).toHaveBeenCalledWith(id);
  });
  it.each(['/overview', '/activities', '/diagnostics'])('requires authentication on %s', async endpoint => {
    expect((await get('/students/me' + endpoint, null)).status).toBe(401);
    expect(mocks.overview).not.toHaveBeenCalled(); expect(mocks.history).not.toHaveBeenCalled();
  });
  it.each(['PROFESSOR', 'ADMIN'])('rejects current database role %s', async role => {
    mocks.user.mockResolvedValue({ id, role, emailVerifiedAt: new Date(), sessionVersion: 0 });
    expect((await get('/students/me/activities')).status).toBe(403); expect(mocks.history).not.toHaveBeenCalled();
  });
  it.each([
    { id, role: 'ALUNO', emailVerifiedAt: null, sessionVersion: 0 },
    { id, role: 'ALUNO', emailVerifiedAt: new Date(), deletedAt: new Date(), sessionVersion: 0 },
    { id, role: 'ALUNO', emailVerifiedAt: new Date(), sessionVersion: 1 },
    null,
  ])('rejects pending, deleted, revoked or absent account', async user => {
    mocks.user.mockResolvedValue(user);
    expect((await get('/students/me/overview')).status).toBe(user && !user.emailVerifiedAt ? 403 : 401);
    expect(mocks.overview).not.toHaveBeenCalled();
  });
  it.each(['?limit=0', '?limit=51', '?limit=1.5', '?limit=word', '?studentId=other', '?alunoId=other', '?cursor=broken', '?cursor=***', '?cursor=' + 'a'.repeat(251)])('rejects invalid/tampered query %s', async query => {
    expect((await get('/students/me/activities' + query)).status).toBe(422); expect(mocks.history).not.toHaveBeenCalled();
  });
  it('limits page size and encodes a stable cursor without exposing the extra row', async () => {
    const first = { id, startedAt: new Date('2026-10-17T12:00:00.123Z') };
    mocks.history.mockResolvedValue([first, { id: 'next-row' }]);
    const response = await get('/students/me/activities?limit=1'); const page = await response.json();
    expect(page.items).toHaveLength(1); expect(response.headers.get('cache-control')).toBe('no-store');
    const cursor = JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString());
    expect(cursor).toEqual({ id, startedAt: first.startedAt.toISOString() });
    await get('/students/me/diagnostics?limit=1&cursor=' + page.nextCursor);
    expect(mocks.history).toHaveBeenLastCalledWith(id, 1, cursor, true);
  });
  it('reports errors instead of manufacturing empty success', async () => {
    mocks.overview.mockRejectedValue(new Error('fixture failure'));
    expect((await get('/students/me/overview')).status).toBe(500);
  });
});
