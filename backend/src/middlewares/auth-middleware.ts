import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth-service';
import { ApiError } from '../errors/api-error';

export interface AuthenticatedRequest extends Request { auth?: { userId: string; role: string } }
const service = new AuthService();

export function requireAuth(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) return next(new ApiError(401, 'Autenticacao obrigatoria.'));
  const payload = service.verifyToken(token);
  if (!payload.sub || !payload.role) return next(new ApiError(401, 'Token invalido ou expirado.'));
  request.auth = { userId: payload.sub, role: payload.role };
  next();
}
