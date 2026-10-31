import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';

const mocks = vi.hoisted(() => ({
  authUser: vi.fn(), getOrCreate: vi.fn(), getQuestions: vi.fn(), getAnswers: vi.fn(),
  saveAnswer: vi.fn(), finalize: vi.fn(), getResult: vi.fn(),
}));
vi.mock('../repositories/auth-repository', () => ({
  AuthRepository: class { findByIdForAuth = mocks.authUser; },
}));

import { createInitialDiagnosticRoutes, isInitialDiagnosticApiEnabled } from './initial-diagnostic-routes';
import { errorHandler } from '../middlewares/error-handler';

const secret = 'initial-diagnostic-route-test-secret-over-32-chars';
const studentId = 'student-authenticated-123';
const otherStudentId = 'student-forged-456';
const attemptId = '00000000-0000-4000-8000-000000000089';
const questionId = '00000000-0000-4000-8000-000000000090';
let server: Server;
let base: string;
let studentToken: string;
let teacherToken: string;

function bearer(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post(token?: string, body: unknown = {}) {
  return fetch(`${base}/initial-diagnostic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(token) },
    body: JSON.stringify(body),
  });
}

async function request(method: string, path: string, token?: string, body?: unknown) {
  return fetch(`${base}/initial-diagnostic${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...bearer(token) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  process.env.JWT_SECRET = secret;
  studentToken = jwt.sign({ id: studentId, role: 'ALUNO', sessionVersion: 0 }, secret, { expiresIn: '1h' });
  teacherToken = jwt.sign({ id: 'teacher-123', role: 'PROFESSOR', sessionVersion: 0 }, secret, { expiresIn: '1h' });
  const app = express();
  app.use(express.json());
  app.use('/initial-diagnostic', createInitialDiagnosticRoutes({
    isEnabled: () => process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED === 'true',
    service: { getOrCreate: mocks.getOrCreate },
    resolutionService: {
      getQuestions: mocks.getQuestions,
      getAnswers: mocks.getAnswers,
      saveAnswer: mocks.saveAnswer,
      finalize: mocks.finalize,
      getResult: mocks.getResult,
    },
  }));
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  delete process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED;
  await new Promise<void>(resolve => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED;
  mocks.authUser.mockImplementation(async (id: string) => ({
    id,
    role: id === 'teacher-123' ? 'PROFESSOR' : 'ALUNO',
    emailVerifiedAt: new Date(),
    deletedAt: null,
    sessionVersion: 0,
  }));
  mocks.getOrCreate.mockResolvedValue({
    status: 'IN_PROGRESS',
    created: false,
    attempt: { id: attemptId, state: 'IN_PROGRESS', orderedQuestionIds: ['internal-question-id'] },
  });
  mocks.getQuestions.mockResolvedValue([{ id: questionId, position: 1, alternatives: [{ id: 'option-id', letter: 'A', text: 'Texto sem gabarito.' }] }]);
  mocks.getAnswers.mockResolvedValue({ attemptId, answered: 0, total: 30, answers: [] });
  mocks.saveAnswer.mockResolvedValue({ questionId, selectedOptionId: 'option-id', respondedAt: new Date() });
  mocks.finalize.mockResolvedValue({ id: attemptId, totalQuestions: 30 });
  mocks.getResult.mockResolvedValue({ id: attemptId, overallPercentage: 75 });
});

describe('initial diagnostic API feature gate and ownership', () => {
  it('enables only for the explicit true feature flag value', () => {
    delete process.env.INITIAL_DIAGNOSTIC_API_ENABLED;
    expect(isInitialDiagnosticApiEnabled()).toBe(false);
    process.env.INITIAL_DIAGNOSTIC_API_ENABLED = '1';
    expect(isInitialDiagnosticApiEnabled()).toBe(false);
    process.env.INITIAL_DIAGNOSTIC_API_ENABLED = 'true';
    expect(isInitialDiagnosticApiEnabled()).toBe(true);
    delete process.env.INITIAL_DIAGNOSTIC_API_ENABLED;
  });

  it('is disabled by default and returns before auth or diagnostic database access', async () => {
    const response = await post(studentToken);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'INITIAL_DIAGNOSTIC_DISABLED' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.authUser).not.toHaveBeenCalled();
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', `/${attemptId}/questions`],
    ['GET', `/${attemptId}/answers`],
    ['PUT', `/${attemptId}/answers/${questionId}`],
    ['POST', `/${attemptId}/finalize`],
    ['GET', `/${attemptId}/result`],
  ])('keeps every resolution endpoint behind the disabled feature flag (%s %s)', async (method, path) => {
    const response = await request(method, path, studentToken, method === 'PUT' ? { selectedOptionId: questionId } : undefined);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'INITIAL_DIAGNOSTIC_DISABLED' });
    expect(mocks.authUser).not.toHaveBeenCalled();
    expect(mocks.getQuestions).not.toHaveBeenCalled();
    expect(mocks.getAnswers).not.toHaveBeenCalled();
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.getResult).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', `/${attemptId}/questions`],
    ['GET', `/${attemptId}/answers`],
    ['PUT', `/${attemptId}/answers/${questionId}`],
    ['POST', `/${attemptId}/finalize`],
    ['GET', `/${attemptId}/result`],
  ])('requires authentication for each resolution operation (%s %s)', async (method, path) => {
    process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED = 'true';
    expect((await request(method, path, undefined, method === 'PUT' ? { selectedOptionId: questionId } : undefined)).status).toBe(401);
    expect(mocks.getQuestions).not.toHaveBeenCalled();
    expect(mocks.getAnswers).not.toHaveBeenCalled();
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.getResult).not.toHaveBeenCalled();
  });

  it('uses the authenticated identity for an owned-attempt question request', async () => {
    process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED = 'true';
    const response = await request('GET', `/${attemptId}/questions?alunoId=${otherStudentId}`, studentToken);
    expect(response.status).toBe(200);
    expect(mocks.getQuestions).toHaveBeenCalledExactlyOnceWith(studentId, attemptId);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('correct');
  });

  it('returns only answer persistence confirmation before finalization', async () => {
    process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED = 'true';
    const response = await request('PUT', `/${attemptId}/answers/${questionId}`, studentToken, { selectedOptionId: questionId });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ questionId, selectedOptionId: 'option-id' });
    expect(JSON.stringify(body)).not.toMatch(/correct|explanation|gabarito/i);
    expect(mocks.saveAnswer).toHaveBeenCalledExactlyOnceWith(studentId, attemptId, questionId, questionId);
  });

  it('requires authentication when enabled', async () => {
    process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED = 'true';
    expect((await post()).status).toBe(401);
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it('rejects an authenticated non-student when enabled', async () => {
    process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED = 'true';
    expect((await post(teacherToken)).status).toBe(403);
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it('recovers the authenticated student attempt and ignores forged alunoId', async () => {
    process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED = 'true';
    const response = await post(studentToken, { alunoId: otherStudentId });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attemptId, status: 'IN_PROGRESS', created: false });
    expect(mocks.getOrCreate).toHaveBeenCalledExactlyOnceWith(studentId);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns a completed initial attempt without creating another one', async () => {
    process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED = 'true';
    mocks.getOrCreate.mockResolvedValue({
      status: 'COMPLETED', created: false,
      attempt: { id: attemptId, state: 'COMPLETED', orderedQuestionIds: ['internal-question-id'] },
    });
    const response = await post(studentToken);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attemptId, status: 'COMPLETED', created: false });
    expect(mocks.getOrCreate).toHaveBeenCalledExactlyOnceWith(studentId);
  });

  it('returns only the new attempt identity when creation succeeds', async () => {
    process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED = 'true';
    mocks.getOrCreate.mockResolvedValue({
      status: 'IN_PROGRESS', created: true,
      attempt: { id: attemptId, state: 'IN_PROGRESS', orderedQuestionIds: ['internal-question-id'] },
    });
    const response = await post(studentToken);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ attemptId, status: 'IN_PROGRESS', created: true });
  });

  it('returns controlled inventory shortages without creating an attempt', async () => {
    process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED = 'true';
    const shortages = [{ discipline: 'Direito Civil', level: 'AVANCADO', origin: 'OAB_OFICIAL', required: 2, available: 1 }];
    mocks.getOrCreate.mockResolvedValue({ status: 'INSUFFICIENT', shortages });
    const response = await post(studentToken);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'INITIAL_DIAGNOSTIC_INSUFFICIENT_QUESTION_BANK', shortages });
  });

  it('does not expose persistence errors', async () => {
    process.env.TEST_INITIAL_DIAGNOSTIC_ENABLED = 'true';
    mocks.getOrCreate.mockRejectedValue(new Error('private database detail'));
    const response = await post(studentToken);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'INITIAL_DIAGNOSTIC_FAILED' });
  });
});
