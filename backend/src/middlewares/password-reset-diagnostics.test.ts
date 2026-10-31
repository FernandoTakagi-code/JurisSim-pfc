import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from './error-handler';
import { ApiError } from '../errors/api-error';

// Fixtures only. No client, database, SMTP transport or HTTP server is started.
const privateFixture = 'private-fixture-never-log';
const localRequest = () => ({
  method: 'POST', path: '/auth/password-reset',
  socket: { localAddress: '127.0.0.1', remoteAddress: '127.0.0.1' },
  body: { senha: privateFixture, token: privateFixture },
  headers: { authorization: privateFixture, cookie: privateFixture },
  originalUrl: '/auth/password-reset?private=' + privateFixture,
  query: { private: privateFixture },
}) as unknown as Request;

function handle(error: unknown, request = localRequest()) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() };
  errorHandler(error, request, response as never, vi.fn());
  return response;
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('PASSWORD_RESET_DIAGNOSTICS', '1');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('diagnóstico temporário de redefinição', () => {
  it.each([
    ['development', undefined], ['development', ''], ['development', '0'],
    ['development', 'true'], ['production', '1'], ['test', '1'], [undefined, '1'],
  ])('mantém somente log genérico sem opt-in exato e ambiente development', (environment, flag) => {
    vi.stubEnv('NODE_ENV', environment);
    vi.stubEnv('PASSWORD_RESET_DIAGNOSTICS', flag);
    const response = handle(new TypeError(privateFixture));
    expect(console.error).toHaveBeenCalledExactlyOnceWith('Erro interno do servidor.');
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor.' });
  });

  it.each([
    { method: 'GET' }, { path: '/auth/login' }, { path: '/auth/password-recovery' },
    { socket: { localAddress: '127.0.0.1', remoteAddress: '192.0.2.20' } },
    { socket: { localAddress: '192.0.2.20', remoteAddress: '127.0.0.1' } },
    { socket: undefined },
  ])('recusa diagnóstico fora da operação local permitida', override => {
    handle(new TypeError(privateFixture), { ...localRequest(), ...override } as unknown as Request);
    expect(console.error).toHaveBeenCalledExactlyOnceWith('Erro interno do servidor.');
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('aceita loopback sem registrar o endereço', address => {
    const request = localRequest();
    Object.assign(request.socket, { localAddress: address, remoteAddress: address });
    handle(new TypeError(privateFixture), request);
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: 'TypeError' });
  });

  it('registra apenas classe e código permitido do Prisma, preservando HTTP 500 genérico', () => {
    const error = new Prisma.PrismaClientKnownRequestError(privateFixture, {
      code: 'P2022', clientVersion: privateFixture,
      meta: { connection: privateFixture, email: privateFixture, token: privateFixture },
    });
    error.stack = privateFixture;
    Object.assign(error, { name: privateFixture, cause: privateFixture });
    const response = handle(error);
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: 'PrismaClientKnownRequestError', codigo: 'P2022' });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(privateFixture);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor.' });
  });

  it('reconhece errorCode de inicialização sem expor detalhes da conexão', () => {
    handle(new Prisma.PrismaClientInitializationError(privateFixture, privateFixture, 'P1001'));
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: 'PrismaClientInitializationError', codigo: 'P1001' });
  });

  it('omite código que não pertença à lista permitida', () => {
    handle(new Prisma.PrismaClientKnownRequestError(privateFixture, { code: privateFixture, clientVersion: privateFixture }));
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: 'PrismaClientKnownRequestError' });
  });

  it.each([
    [new Prisma.PrismaClientValidationError(privateFixture, { clientVersion: privateFixture }), 'PrismaClientValidationError'],
    [new Prisma.PrismaClientUnknownRequestError(privateFixture, { clientVersion: privateFixture }), 'PrismaClientUnknownRequestError'],
    [new Prisma.PrismaClientRustPanicError(privateFixture, privateFixture), 'PrismaClientRustPanicError'],
    [new Error(privateFixture), 'Error'], [new RangeError(privateFixture), 'RangeError'],
    [new ReferenceError(privateFixture), 'ReferenceError'], [new SyntaxError(privateFixture), 'SyntaxError'],
    [privateFixture, 'ErroNaoClassificado'],
    [{ name: 'PrismaClientKnownRequestError', code: 'P2022', message: privateFixture }, 'ErroNaoClassificado'],
  ])('não serializa conteúdo arbitrário de exceções', (error, category) => {
    handle(error);
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: category });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(privateFixture);
  });

  it('não acessa campos descritivos da exceção', () => {
    const error = new Error();
    const forbidden = vi.fn(() => { throw new Error('Forbidden diagnostic field.'); });
    for (const key of ['name', 'message', 'stack', 'meta', 'cause', 'code']) {
      Object.defineProperty(error, key, { configurable: true, get: forbidden });
    }
    handle(error);
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: 'Error' });
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('trata código malformado sem quebrar a resposta HTTP', () => {
    const error = new Prisma.PrismaClientKnownRequestError(privateFixture, { code: 'P2022', clientVersion: privateFixture });
    Object.defineProperty(error, 'code', { get() { throw new Error(privateFixture); } });
    const response = handle(error);
    expect(console.error).toHaveBeenCalledExactlyOnceWith({ tipo: 'ErroNaoClassificado' });
    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('mantém token inválido como HTTP 400 sem diagnóstico de falha inesperada', () => {
    const response = handle(new ApiError(400, 'Link inválido, expirado ou já utilizado.'));
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ message: 'Link inválido, expirado ou já utilizado.' });
    expect(console.error).not.toHaveBeenCalled();
  });
});
