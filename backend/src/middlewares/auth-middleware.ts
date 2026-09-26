import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { ApiError } from '../errors/api-error';

export interface AuthenticatedRequest extends Request {
  auth?: { userId: string; role: string };
}

export function requireAuth(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Autenticacao obrigatoria.'));
  }

  try {
    const payload = AuthService.verificarToken(token);
    request.auth = { userId: payload.id, role: payload.role };
    next();
  } catch {
    return next(new ApiError(401, 'Token invalido ou expirado.'));
  }
}

export function requireRoles(...papeisPermitidos: string[]) {
  return (request: AuthenticatedRequest, _response: Response, next: NextFunction) => {
    if (!request.auth) {
      return next(new ApiError(401, 'Autenticacao obrigatoria.'));
    }
    if (!papeisPermitidos.includes(request.auth.role)) {
      return next(new ApiError(403, 'Acesso negado para este papel.'));
    }
    next();
  };
}