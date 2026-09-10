import { Router } from 'express';
import { DiagnosticController } from '../controllers/diagnostic-controller';

const controller = new DiagnosticController();
export const diagnosticRoutes = Router();

diagnosticRoutes.post('/', controller.start);
diagnosticRoutes.get('/:attemptId/questions', controller.getQuestions);
diagnosticRoutes.put('/:attemptId/answers/:questionId', controller.answer);
diagnosticRoutes.post('/:attemptId/finalize', controller.finalize);
diagnosticRoutes.get('/:attemptId/result', controller.getResult);
diagnosticRoutes.get('/:attemptId/trail', controller.getTrail);
