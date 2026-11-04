import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth-service';
import { AuthRepository } from '../repositories/auth-repository';
import { ApiError } from '../errors/api-error';
import { currentAccess } from '../services/institution-service';
import { prisma } from '../lib/prisma';

const service = new AuthService();
const repository = new AuthRepository();

export interface AuthenticatedRequest extends Request {
  auth?: { userId: string; role: string; institutionId?: string; allowedClassIds?: string[] };
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
    const access = await currentAccess(user.id, user.role);
    request.auth = { userId: user.id, role: access?.effectiveRole ?? user.role };
    if (access && (request.auth.role === 'PROFESSOR' || (request.auth.role === 'ADMIN' && access.memberships.some(m => m.role === 'TEACHER')))) {
      const requested = request.header('x-institution-id');
      const memberships = access.memberships.filter(m => m.role === 'TEACHER');
      const selected = requested ? memberships.find(m => m.institutionId === requested) : memberships.length === 1 ? memberships[0] : undefined;
      // Session and invitation routes remain accessible before a context is selected.
      if (requested && !selected) return next(new ApiError(403, 'Vínculo institucional não autorizado.'));
      if (!selected && request.auth.role === 'PROFESSOR' && /^\/(turmas|avaliacoes|reports|questoes)(\/|\?|$)/.test(request.originalUrl)) return next(new ApiError(409, 'Selecione uma instituição de trabalho.'));
      request.auth.institutionId = selected?.institutionId;
      request.auth.allowedClassIds = selected ? (await prisma.institutionalClass.findMany({ where: { institutionId: selected.institutionId }, select: { classId: true } })).map(c => c.classId) : [];
    }
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
