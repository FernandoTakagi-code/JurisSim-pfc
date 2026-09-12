import { Router } from 'express';
import { TrailController } from '../controllers/trail-controller';
import { requireAuth } from '../middlewares/auth-middleware';

const controller = new TrailController();
export const trailRoutes = Router();

trailRoutes.use(requireAuth);

trailRoutes.post('/:trilhaId/gerar', controller.generate);
trailRoutes.get('/attempts/:attemptId/questions', controller.getQuestions);
trailRoutes.put('/attempts/:attemptId/answers/:questionId', controller.answer);
trailRoutes.post('/attempts/:attemptId/finalize', controller.finalize);