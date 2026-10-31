import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from './error-handler';
import { ApiError } from '../errors/api-error';

const secret = 'fixture-secret-must-never-be-logged';
const attemptId = '6c1c02b2-8e62-46a5-8f0b-0ddfe486c7d1';

function requestFor(baseUrl: string, routePath: string, path: string, overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET', baseUrl, route: { path: routePath }, path,
    originalUrl: `${path}?email=${secret}`,
    query: { email: secret }, body: { token: secret },
    headers: { authorization: `Bearer ${secret}`, cookie: secret },
    socket: { localAddress: '127.0.0.1', remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as Request;
}

function handle(error: unknown, request: Request) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() };
  errorHandler(error, request, response as never, vi.fn());
  return response;
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('LOCAL_DASHBOARD_ERROR_DIAGNOSTICS', '1');
  vi.stubEnv('PASSWORD_RESET_DIAGNOSTICS', '0');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('temporary local dashboard error diagnostics', () => {
  it('identifies the overview route and error class without logging request or error data', () => {
    const request = requestFor('/students/me', '/overview', '/students/me/overview');
    const response = handle(new TypeError(`password=${secret} token=${secret}`), request);

    expect(console.error).toHaveBeenCalledExactlyOnceWith({
      method: 'GET', path: '/students/me/overview', errorClass: 'TypeError',
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor.' });
  });

  it('logs the Express route template for the legacy diagnostic result, not its attempt ID', () => {
    const request = requestFor('/diagnostics', '/:attemptId/result', `/diagnostics/${attemptId}/result`);
    const error = new Prisma.PrismaClientKnownRequestError(`database=${secret}`, {
      code: 'P2022', clientVersion: 'fixture', meta: { connection: secret, query: secret },
    });
    const response = handle(error, request);
    const output = JSON.stringify(vi.mocked(console.error).mock.calls);

    expect(console.error).toHaveBeenCalledExactlyOnceWith({
      method: 'GET', path: '/diagnostics/:attemptId/result',
      errorClass: 'PrismaClientKnownRequestError', prismaCode: 'P2022',
    });
    expect(output).not.toContain(attemptId);
    expect(output).not.toContain(secret);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor.' });
  });

  it.each([
    ['unset', undefined, 'development', '127.0.0.1'],
    ['zero', '0', 'development', '127.0.0.1'],
    ['production', '1', 'production', '127.0.0.1'],
    ['non-loopback', '1', 'development', '192.0.2.10'],
  ])('keeps detailed logging disabled for %s', (_label, flag, nodeEnv, remoteAddress) => {
    vi.stubEnv('LOCAL_DASHBOARD_ERROR_DIAGNOSTICS', flag);
    vi.stubEnv('NODE_ENV', nodeEnv);
    const request = requestFor('/students/me', '/overview', '/students/me/overview', {
      socket: { localAddress: '127.0.0.1', remoteAddress },
    });

    handle(new Error(secret), request);

    expect(console.error).toHaveBeenCalledExactlyOnceWith('Erro interno do servidor.');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  });

  it('omits Prisma codes that are outside the fixed allowlist', () => {
    const error = new Prisma.PrismaClientKnownRequestError(secret, {
      code: secret, clientVersion: 'fixture',
    });
    handle(error, requestFor('/students/me', '/overview', '/students/me/overview'));

    expect(console.error).toHaveBeenCalledExactlyOnceWith({
      method: 'GET', path: '/students/me/overview', errorClass: 'PrismaClientKnownRequestError',
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  });

  it('logs only safe metadata for an ApiError 500 and preserves its existing response', () => {
    const response = handle(new ApiError(500, 'Erro interno do servidor.'),
      requestFor('/students/me', '/overview', '/students/me/overview'));

    expect(console.error).toHaveBeenCalledExactlyOnceWith({
      method: 'GET', path: '/students/me/overview', errorClass: 'Error',
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor.' });
  });

  it('does not emit dashboard diagnostics for any other route', () => {
    handle(new Error(secret), requestFor('/reports', '/classes', '/reports/classes'));
    expect(console.error).toHaveBeenCalledExactlyOnceWith('Erro interno do servidor.');
  });
});
