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
  return authenticate(request, next, false);
}

// Explicit exception for session inspection and confirmation resend only.
export async function requireLimitedAuth(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  return authenticate(request, next, true);
}

async function authenticate(request: AuthenticatedRequest, next: NextFunction, allowUnverified: boolean) {
  const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Autenticacao obrigatoria.'));
  }
  try {
    const payload = service.verifyToken(token);
    const user = await repository.findByIdForAuth(payload.id);
    if (!user || user.deletedAt || payload.sessionVersion !== user.sessionVersion) {
      return next(new ApiError(401, 'Sessão inválida.'));
    }
    if (!allowUnverified && !user.emailVerifiedAt) {
      return next(new ApiError(403, 'Confirme seu e-mail para acessar este recurso.'));
    }
    request.auth = { userId: user.id, role: user.role };
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
