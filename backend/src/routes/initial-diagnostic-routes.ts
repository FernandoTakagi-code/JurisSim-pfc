import { Router } from 'express';
import { InitialDiagnosticController } from '../controllers/initial-diagnostic-controller';
import { requireAuth, requireRoles } from '../middlewares/auth-middleware';
import { PrismaInitialDiagnosticRepository } from '../repositories/prisma-initial-diagnostic-repository';
import { PrismaInitialDiagnosticResolutionRepository } from '../repositories/prisma-initial-diagnostic-resolution-repository';
import { InitialDiagnosticService } from '../services/initial-diagnostic-service';
import { InitialDiagnosticResolutionService } from '../services/initial-diagnostic-resolution-service';

const FEATURE_FLAG = 'INITIAL_DIAGNOSTIC_API_ENABLED';

export function isInitialDiagnosticApiEnabled(): boolean {
  return process.env[FEATURE_FLAG]?.trim().toLowerCase() === 'true';
}

export interface InitialDiagnosticRoutesOptions {
  isEnabled?: () => boolean;
  service?: Pick<InitialDiagnosticService, 'getOrCreate'>;
  resolutionService?: Pick<InitialDiagnosticResolutionService, 'getQuestions' | 'getAnswers' | 'saveAnswer' | 'finalize' | 'getResult'>;
}

export function createInitialDiagnosticRoutes(options: InitialDiagnosticRoutesOptions = {}) {
  const router = Router();
  const service = options.service ?? new InitialDiagnosticService(new PrismaInitialDiagnosticRepository());
  const resolutionService = options.resolutionService ?? new InitialDiagnosticResolutionService(new PrismaInitialDiagnosticResolutionRepository());
  const controller = new InitialDiagnosticController(service, resolutionService);
  const enabled = options.isEnabled ?? isInitialDiagnosticApiEnabled;

  // Gate before auth: the existing auth middleware reads the user from the
  // database. While disabled this endpoint must not perform any DB access.
  router.use((_request, response, next) => {
    if (!enabled()) {
      response.setHeader('Cache-Control', 'no-store');
      response.status(503).json({ code: 'INITIAL_DIAGNOSTIC_DISABLED' });
      return;
    }
    next();
  });

  router.use(requireAuth, requireRoles('ALUNO'));
  router.post('/', controller.startOrRecover);
  router.get('/:attemptId/questions', controller.getQuestions);
  router.get('/:attemptId/answers', controller.getAnswers);
  router.put('/:attemptId/answers/:questionId', controller.saveAnswer);
  router.post('/:attemptId/finalize', controller.finalize);
  router.get('/:attemptId/result', controller.getResult);
  return router;
}

export const initialDiagnosticRoutes = createInitialDiagnosticRoutes();
