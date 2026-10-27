import type { Request } from 'express';
import { Prisma } from '@prisma/client';

type Diagnostic = { tipo: string; codigo?: string };

// Fixed values only: never forward arbitrary error properties to the logger.
const allowedCodes = new Set([
  'P1000', 'P1001', 'P1002', 'P1008', 'P1010', 'P1011', 'P1013', 'P1017',
  'P2002', 'P2003', 'P2004', 'P2007', 'P2009', 'P2010', 'P2011', 'P2014',
  'P2018', 'P2021', 'P2022', 'P2023', 'P2024', 'P2025', 'P2026', 'P2027',
  'P2028', 'P2034', 'P2035', 'P2036', 'P2037',
]);
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function withCode(tipo: string, code: unknown): Diagnostic {
  return typeof code === 'string' && allowedCodes.has(code) ? { tipo, codigo: code } : { tipo };
}

function classify(error: unknown): Diagnostic {
  try {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return withCode('PrismaClientKnownRequestError', error.code);
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return withCode('PrismaClientInitializationError', error.errorCode);
    }
    if (error instanceof Prisma.PrismaClientValidationError) return { tipo: 'PrismaClientValidationError' };
    if (error instanceof Prisma.PrismaClientUnknownRequestError) return { tipo: 'PrismaClientUnknownRequestError' };
    if (error instanceof Prisma.PrismaClientRustPanicError) return { tipo: 'PrismaClientRustPanicError' };
    if (error instanceof TypeError) return { tipo: 'TypeError' };
    if (error instanceof RangeError) return { tipo: 'RangeError' };
    if (error instanceof ReferenceError) return { tipo: 'ReferenceError' };
    if (error instanceof SyntaxError) return { tipo: 'SyntaxError' };
    if (error instanceof Error) return { tipo: 'Error' };
  } catch {
    // A malformed exception must not break the handler or expose its contents.
  }
  return { tipo: 'ErroNaoClassificado' };
}

export type LocalDashboardErrorDiagnostic = {
  method: 'GET';
  path: '/students/me/overview' | '/diagnostics/:attemptId/result';
  errorClass: string;
  prismaCode?: string;
};

// Narrow, explicit opt-in for reproducing the two dashboard reads. Express
// route templates are used so attempt IDs and query strings never enter logs.
export function localDashboardErrorDiagnostic(error: unknown, request: Request): LocalDashboardErrorDiagnostic | undefined {
  if (process.env.NODE_ENV !== 'development' || process.env.LOCAL_DASHBOARD_ERROR_DIAGNOSTICS !== '1') return;
  if (!loopback.has(request.socket?.localAddress ?? '') || !loopback.has(request.socket?.remoteAddress ?? '')) return;

  let path: LocalDashboardErrorDiagnostic['path'] | undefined;
  if (request.method === 'GET' && request.baseUrl === '/students/me' && request.route?.path === '/overview') {
    path = '/students/me/overview';
  } else if (request.method === 'GET' && request.baseUrl === '/diagnostics' && request.route?.path === '/:attemptId/result') {
    path = '/diagnostics/:attemptId/result';
  }
  if (!path) return;

  const classified = classify(error);
  const errorClass = classified.tipo;
  return {
    method: 'GET',
    path,
    errorClass,
    ...(classified.codigo ? { prismaCode: classified.codigo } : {}),
  };
}

// Temporary opt-in. Nothing here connects to Prisma or reads private .env files.
export function passwordResetDiagnostic(error: unknown, request: Request): Diagnostic | undefined {
  if (process.env.NODE_ENV !== 'development' || process.env.PASSWORD_RESET_DIAGNOSTICS !== '1') return;
  if (request.method !== 'POST' || request.path !== '/auth/password-reset') return;
  if (!loopback.has(request.socket?.localAddress ?? '') || !loopback.has(request.socket?.remoteAddress ?? '')) return;
  return classify(error);
}
