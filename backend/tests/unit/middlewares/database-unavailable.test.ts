import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from "../../../src/middlewares/error-handler";

function handle(error: unknown, request: Partial<Request> = {}) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() };
  errorHandler(error, {
    method: 'GET', baseUrl: '/auth', route: { path: '/session' }, originalUrl: '/auth/session',
    ...request,
  } as Request, response as never, vi.fn());
  return response;
}

afterEach(() => vi.restoreAllMocks());

describe('database connectivity error responses', () => {
  it('returns a retryable, safe service-unavailable response for an unreachable database', () => {
    const host = 'private-pooler.example.invalid';
    const secret = 'password=never-log-this';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Prisma.PrismaClientInitializationError(
      `Can't reach database server at ${host}; ${secret}`,
      'fixture',
    );
    const response = handle(error);

    expect(console.error).toHaveBeenCalledExactlyOnceWith({
      type: 'database_unavailable', method: 'GET', route: '/auth/session',
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(host);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
    expect(response.set).toHaveBeenCalledWith('Retry-After', '5');
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      message: 'O banco de dados está temporariamente indisponível. Não foi possível validar sua sessão ou carregar os dados. Tente novamente em instantes.',
    });
  });

  it('maps the Prisma connection-pool timeout code to 503', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Prisma.PrismaClientKnownRequestError('opaque', {
      code: 'P2024', clientVersion: 'fixture', meta: { connectionString: 'must-not-log' },
    });
    const response = handle(error, { baseUrl: '/institutions', route: { path: '/:id/summary' } as never });

    expect(console.error).toHaveBeenCalledExactlyOnceWith({
      type: 'database_unavailable', method: 'GET', route: '/institutions/:id/summary', prismaCode: 'P2024',
    });
    expect(response.status).toHaveBeenCalledWith(503);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('must-not-log');
  });

  it('does not disguise unrelated errors as database outages', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = handle(new TypeError('unrelated failure'));
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor.' });
  });
});
