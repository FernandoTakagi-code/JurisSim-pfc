import { Router } from 'express';
import { DiagnosticController } from '../controllers/diagnostic-controller';
import { requireAuth } from '../middlewares/auth-middleware';

const controller = new DiagnosticController();
export const diagnosticRoutes = Router();

diagnosticRoutes.use(requireAuth);

diagnosticRoutes.post('/', controller.start);
diagnosticRoutes.get('/:attemptId/questions', controller.getQuestions);
diagnosticRoutes.put('/:attemptId/answers/:questionId', controller.answer);
diagnosticRoutes.post('/:attemptId/finalize', controller.finalize);
diagnosticRoutes.get('/:attemptId/result', controller.getResult);
diagnosticRoutes.get('/:attemptId/trail', controller.getTrail);
