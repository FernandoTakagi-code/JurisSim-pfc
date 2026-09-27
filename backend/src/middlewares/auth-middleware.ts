import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth-service';
import { AuthRepository } from '../repositories/auth-repository';
import { ApiError } from '../errors/api-error';

const service = new AuthService();
const repository = new AuthRepository();

export interface AuthenticatedRequest extends Request {
  auth?: { userId: string; role: string };
}

export async function requireAuth(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Autenticacao obrigatoria.'));
  }
  try {
    const payload = service.verifyToken(token);
    const user = await repository.findByIdForAuth(payload.id);
    if (!user || user.deletedAt) {
      return next(new ApiError(401, 'Sessão inválida.'));
    }
    request.auth = { userId: payload.id, role: payload.role };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRoles(...roles: string[]) {
  return (request: AuthenticatedRequest, _response: Response, next: NextFunction) => {
    if (!request.auth) return next(new ApiError(401, 'Autenticação obrigatória.'));
    if (!roles.includes(request.auth.role)) return next(new ApiError(403, 'Acesso negado para este papel.'));
    next();
  };
}