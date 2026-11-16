import type { ErrorRequestHandler, Request } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../errors/api-error';
import { localDashboardErrorDiagnostic, passwordResetDiagnostic } from './password-reset-diagnostics';

const databaseUnavailableCodes = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const databaseConnectionFailure = /can't reach database server|connection (?:timed out|refused)|connect(?:ion)? timed out|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i;

function databaseUnavailableCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError && databaseUnavailableCodes.has(error.code)) return error.code;
  if (error instanceof Prisma.PrismaClientInitializationError) {
    if (error.errorCode && databaseUnavailableCodes.has(error.errorCode)) return error.errorCode;
    if (databaseConnectionFailure.test(error.message)) return error.errorCode;
  }
  return undefined;
}

function routeTemplate(request: Request) {
  const route = request.route?.path;
  if (typeof route !== 'string') return 'unmatched';
  const requestPath = (request.originalUrl ?? '').split('?')[0];
  if (request.method === 'GET' && route === '/session' && requestPath === '/auth/session') return '/auth/session';
  if (request.method === 'GET' && route === '/:id/summary' && requestPath.startsWith('/institutions/')) return '/institutions/:id/summary';
  return `${request.baseUrl || ''}${route}`;
}

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const databaseCode = databaseUnavailableCode(error);
  if (databaseCode !== undefined || (error instanceof Prisma.PrismaClientInitializationError && databaseConnectionFailure.test(error.message))) {
    console.error({
      type: 'database_unavailable',
      method: request.method,
      route: routeTemplate(request),
      ...(databaseCode ? { prismaCode: databaseCode } : {}),
    });
    response.set('Retry-After', '5');
    response.status(503).json({ message: 'O banco de dados está temporariamente indisponível. Não foi possível validar sua sessão ou carregar os dados. Tente novamente em instantes.' });
    return;
  }
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      const diagnostic = localDashboardErrorDiagnostic(error, request);
      if (diagnostic) console.error(diagnostic);
    }
    if (error.retryAfter) response.set('Retry-After', String(error.retryAfter));
    response.status(error.statusCode).json({ message: error.message, ...(error.code ? { code: error.code } : {}) });
    return;
  }
  if (error instanceof ZodError) {
    response.status(422).json({ message: 'Dados invalidos.', issues: error.issues });
    return;
  }
  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
    response.status(error.type === 'entity.too.large' ? 413 : 400).json({ message: 'Corpo da solicitação inválido ou muito grande.' });
    return;
  }

  const diagnostic = localDashboardErrorDiagnostic(error, request) ?? passwordResetDiagnostic(error, request);
  console.error(diagnostic ?? 'Erro interno do servidor.');
  response.status(500).json({ message: 'Erro interno do servidor.' });
};
