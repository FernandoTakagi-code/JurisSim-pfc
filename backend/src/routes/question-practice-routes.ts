import { Router } from 'express';
import { requireAuth, requireRoles } from '../middlewares/auth-middleware';
import { PrismaQuestionPracticeRepository } from '../repositories/prisma-question-practice-repository';
import { QuestionPracticeController } from '../controllers/question-practice-controller';
import { QuestionPracticeService } from '../services/question-practice-service';
import { isQuestionPracticeApiEnabled } from '../config/question-practice-feature';

export const QUESTION_PRACTICE_FLAG = 'QUESTION_PRACTICE_API_ENABLED';
export const isQuestionPracticeEnabled = isQuestionPracticeApiEnabled;

export function createQuestionPracticeRoutes(options: {
  isEnabled?: () => boolean;
  controller?: QuestionPracticeController;
} = {}) {
  const router = Router();
  const controller = options.controller ?? new QuestionPracticeController(new QuestionPracticeService(new PrismaQuestionPracticeRepository()));
  router.use((_request, response, next) => {
    if (!(options.isEnabled ?? isQuestionPracticeEnabled)()) {
      response.setHeader('Cache-Control', 'no-store');
      response.status(503).json({ code: 'QUESTION_PRACTICE_DISABLED', message: 'A prática individual estará disponível após a validação do acervo e da persistência.' });
      return;
    }
    next();
  });
  router.use(requireAuth, requireRoles('ALUNO'));
  router.post('/', controller.start);
  router.get('/:attemptId', controller.get);
  router.put('/:attemptId/answers/:questionId', controller.answer);
  router.post('/:attemptId/finalize', controller.finalize);
  router.get('/:attemptId/result', controller.result);
  return router;
}

export const questionPracticeRoutes = createQuestionPracticeRoutes();
