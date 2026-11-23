import { Router } from 'express';
import { InitialDiagnosticController } from '../controllers/initial-diagnostic-controller';
import { requireAuth, requireRoles } from '../middlewares/auth-middleware';
import { PrismaInitialDiagnosticRepository } from '../repositories/prisma-initial-diagnostic-repository';
import { PrismaInitialDiagnosticResolutionRepository } from '../repositories/prisma-initial-diagnostic-resolution-repository';
import { InitialDiagnosticService } from '../services/diagnostics/initial-diagnostic-service';
import { InitialDiagnosticResolutionService } from '../services/diagnostics/initial-diagnostic-resolution-service';
import { parseInitialDiagnosticCompositionMode } from '../services/diagnostics/initial-diagnostic-composition';
import { initialDiagnosticPilotBatchId } from '../config/initial-diagnostic-pilot';

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
  const pilotBatchId = options.service ? undefined : initialDiagnosticPilotBatchId();
  const service = options.service ?? new InitialDiagnosticService(new PrismaInitialDiagnosticRepository(undefined, pilotBatchId), Math.random,
    parseInitialDiagnosticCompositionMode(process.env.INITIAL_DIAGNOSTIC_COMPOSITION_MODE), pilotBatchId);
  const resolutionService = options.resolutionService ?? new InitialDiagnosticResolutionService(new PrismaInitialDiagnosticResolutionRepository());
  const controller = new InitialDiagnosticController(service, resolutionService);
  const enabled = options.isEnabled ?? isInitialDiagnosticApiEnabled;

  // Os resultados históricos continuam legíveis quando a criação/resolução está suspensa.
  // A posse e a conclusão ainda são verificadas pelo serviço de resolução.
  router.get('/:attemptId/result', requireAuth, requireRoles('ALUNO'), controller.getResult);

  // Bloqueio antes da autenticação: o middleware de autenticação existente lê o usuário
  // do banco. Enquanto desativado, este endpoint não deve fazer nenhum acesso ao banco.
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
  return router;
}

export const initialDiagnosticRoutes = createInitialDiagnosticRoutes();
