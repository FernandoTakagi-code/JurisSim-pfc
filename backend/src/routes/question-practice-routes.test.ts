import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';

const authMock = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock('../repositories/auth-repository', () => ({ AuthRepository: class { findByIdForAuth = authMock.user; } }));

import { createQuestionPracticeRoutes } from './question-practice-routes';
import type { QuestionPracticeController } from '../controllers/question-practice-controller';
import { errorHandler } from '../middlewares/error-handler';

const secret = 'question-practice-route-test-secret-over-32-chars';
const studentId = 'practice-student-1';
const attemptId = '00000000-0000-4000-8000-000000000101';
let server: Server; let base: string; let studentToken: string; let teacherToken: string;

const controller = {
  start: vi.fn((_req: Request, res: Response) => res.status(201).json({ attempt: { id: attemptId } })),
  get: vi.fn((_req: Request, res: Response) => res.json({ attempt: { id: attemptId } })),
  answer: vi.fn((_req: Request, res: Response) => res.json({ saved: true })),
  finalize: vi.fn((_req: Request, res: Response) => res.json({ result: { total: 5 } })),
  result: vi.fn((_req: Request, res: Response) => res.json({ result: { total: 5 } })),
};

async function request(method: string, path = '/', token?: string, body?: unknown) {
  return fetch(`${base}/question-practice${path}`, {
    method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  studentToken = jwt.sign({ id: studentId, role: 'ALUNO', sessionVersion: 0 }, secret, { expiresIn: '1h' });
  teacherToken = jwt.sign({ id: 'practice-teacher-1', role: 'PROFESSOR', sessionVersion: 0 }, secret, { expiresIn: '1h' });
  const app = express(); app.use(express.json());
  app.use('/question-practice', createQuestionPracticeRoutes({ isEnabled: () => process.env.TEST_QUESTION_PRACTICE_ENABLED === 'true', controller: controller as unknown as QuestionPracticeController }));
  app.use(errorHandler); server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { delete process.env.TEST_QUESTION_PRACTICE_ENABLED; await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks(); delete process.env.TEST_QUESTION_PRACTICE_ENABLED;
  authMock.user.mockImplementation(async (id: string) => ({ id, role: id.includes('teacher') ? 'PROFESSOR' : 'ALUNO', emailVerifiedAt: new Date(), deletedAt: null, sessionVersion: 0 }));
});

describe('question practice routes', () => {
  it('returns disabled before authenticating or accessing the application', async () => {
    const response = await request('POST', '/', studentToken, { discipline: 'Direito Civil', quantity: 5 });
    expect(response.status).toBe(503); expect((await response.json()).code).toBe('QUESTION_PRACTICE_DISABLED');
    expect(authMock.user).not.toHaveBeenCalled(); expect(controller.start).not.toHaveBeenCalled();
  });
  it('requires authentication when enabled', async () => {
    process.env.TEST_QUESTION_PRACTICE_ENABLED = 'true';
    expect((await request('POST', '/', undefined, { discipline: 'Direito Civil', quantity: 5 })).status).toBe(401);
  });
  it('rejects professors and allows only authenticated students', async () => {
    process.env.TEST_QUESTION_PRACTICE_ENABLED = 'true';
    expect((await request('POST', '/', teacherToken, { discipline: 'Direito Civil', quantity: 5 })).status).toBe(403);
    expect(controller.start).not.toHaveBeenCalled();
    expect((await request('POST', '/', studentToken, { discipline: 'Direito Civil', quantity: 5 })).status).toBe(201);
    expect(controller.start).toHaveBeenCalledOnce();
  });
});
