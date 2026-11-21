import type { NextFunction, Response } from 'express';
import { ApiError } from '../errors/api-error';
import type { AuthenticatedRequest } from './auth-middleware';
import { AuthRepository } from '../repositories/auth-repository';
import { isInitialDiagnosticRequired } from '../config/initial-diagnostic-feature';
import { localEmailVerificationCapture } from '../services/email/local-email-capture';

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
    // Um proprietário institucional individual mantém ALUNO como seu papel pessoal.
    // Somente operações confiáveis da equipe na instituição selecionada ignoram este
    // pré-requisito de estudo do aluno; o estudo pessoal continua exigindo o diagnóstico.
    if(request.auth.institutionAdmin && request.auth.institutionId && /^\/(turmas|reports|avaliacoes|questoes)(\/|\?|$)/.test(request.originalUrl)) return next();
    // Solicitantes institucionais nunca fazem o diagnóstico do aluno; a foto de perfil
    // é dado da conta, não conteúdo de estudo, então não deve ser bloqueada para eles.
    if (request.auth.institutionalAccount && /^\/profile\/photo(\/|\?|$)/.test(request.originalUrl)) return next();

    try {
      if (await hasCompletedInitialDiagnostic(request.auth.userId)) return next();
      if (request.get?.('x-jurissim-local-demo') === 'true' && isLocalDemoEnabled()) return next();
      response.setHeader('Cache-Control', 'no-store');
      response.status(403).json({
        code: 'INITIAL_DIAGNOSTIC_REQUIRED',
        message: 'Conclua o Diagnostico Inicial para acessar esta funcionalidade.',
      });
    } catch (error) {
      // Uma falha no banco nunca deve virar permissão para pular o bloqueio.
      next(error);
    }
  };
}

const repository = new AuthRepository();

export const requireInitialDiagnosticCompletion = createInitialDiagnosticRequirementGuard({
  isRequired: isInitialDiagnosticRequired,
  hasCompletedInitialDiagnostic: studentId => repository.hasCompletedInitialDiagnostic(studentId),
});
