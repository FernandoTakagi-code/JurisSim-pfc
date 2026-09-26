import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth-service';
import { ApiError } from '../errors/api-error';

export interface AuthenticatedRequest extends Request { auth?: { userId: string; role: string } }
const service = new AuthService();

export function requireAuth(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) return next(new ApiError(401, 'Autenticacao obrigatoria.'));
  const payload = service.verifyToken(token);
  request.auth = { userId: payload.id, role: payload.role };
  next();
}

export function requireRoles(...roles: string[]) {
  return (request: AuthenticatedRequest, _response: Response, next: NextFunction) => {
    if (!request.auth) return next(new ApiError(401, 'Autenticação obrigatória.'));
    if (!roles.includes(request.auth.role)) return next(new ApiError(403, 'Acesso negado para este papel.'));
    next();
  };
}
