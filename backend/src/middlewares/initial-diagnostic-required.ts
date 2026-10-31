import type { NextFunction, Response } from 'express';
import { ApiError } from '../errors/api-error';
import type { AuthenticatedRequest } from './auth-middleware';
import { AuthRepository } from '../repositories/auth-repository';
import { isInitialDiagnosticRequired } from '../config/initial-diagnostic-feature';
import { localEmailVerificationCapture } from '../services/local-email-capture';

type RequirementGuardDependencies = {
  isRequired: () => boolean;
  hasCompletedInitialDiagnostic: (studentId: string) => Promise<boolean>;
  isLocalDemoEnabled?: () => boolean;
};

export function createInitialDiagnosticRequirementGuard({
  isRequired,
  hasCompletedInitialDiagnostic,
  isLocalDemoEnabled = () => localEmailVerificationCapture.isLocalDiagnosticDemoEnabled,
}: RequirementGuardDependencies) {
  return async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    if (!isRequired()) return next();
    if (!request.auth) return next(new ApiError(401, 'Autenticacao obrigatoria.'));
    if (request.auth.role !== 'ALUNO') return next();

    try {
      if (await hasCompletedInitialDiagnostic(request.auth.userId)) return next();
      if (request.get?.('x-jurissim-local-demo') === 'true' && isLocalDemoEnabled()) return next();
      response.setHeader('Cache-Control', 'no-store');
      response.status(403).json({
        code: 'INITIAL_DIAGNOSTIC_REQUIRED',
        message: 'Conclua o Diagnostico Inicial para acessar esta funcionalidade.',
      });
    } catch (error) {
      // A database failure must never turn into permission to skip the gate.
      next(error);
    }
  };
}

const repository = new AuthRepository();

export const requireInitialDiagnosticCompletion = createInitialDiagnosticRequirementGuard({
  isRequired: isInitialDiagnosticRequired,
  hasCompletedInitialDiagnostic: studentId => repository.hasCompletedInitialDiagnostic(studentId),
});
