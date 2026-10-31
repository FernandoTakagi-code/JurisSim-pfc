import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, type AuthenticatedRequest } from '../middlewares/auth-middleware';
import { StudyGoalService } from '../services/study-goal-service';
import { ClassReportService } from '../services/class-report-service';

const goalService = new StudyGoalService(), reportService = new ClassReportService();
const id = (request: AuthenticatedRequest, key = 'id') => z.string().uuid().parse(request.params[key]);
const date = z.iso.date().refine(value => value >= '2000-01-01' && value <= '2100-12-31', 'Informe uma data entre 2000 e 2100.');
const goalInput = z.object({ date, targetQuestions: z.number().int().min(1).max(1000) }).strict();
const goalEdit = goalInput.partial().refine(value => Object.keys(value).length > 0, 'Informe ao menos um campo.');
const page = z.coerce.number().int().min(1).max(1000).default(1);
export const goalRoutes = Router(), reportRoutes = Router();
for (const router of [goalRoutes, reportRoutes]) router.use(requireAuth, (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
goalRoutes.use(requireRoles('ALUNO'));
reportRoutes.use(requireRoles('PROFESSOR', 'ADMIN'));
goalRoutes.get('/', async (request: AuthenticatedRequest, response) => {
  const query = z.object({ page, status: z.enum(['pending', 'completed']).optional() }).strict().parse(request.query);
  response.json(await goalService.list(request.auth!.userId, query.page, query.status));
});
goalRoutes.get('/dashboard', async (request: AuthenticatedRequest, response) => {
  z.object({}).strict().parse(request.query);
  response.json(await goalService.dashboard(request.auth!.userId));
});
goalRoutes.post('/', async (request: AuthenticatedRequest, response) => { response.status(201).json(await goalService.create(request.auth!.userId, goalInput.parse(request.body))); });
goalRoutes.patch('/:id', async (request: AuthenticatedRequest, response) => { response.json(await goalService.update(request.auth!.userId, id(request), goalEdit.parse(request.body))); });
goalRoutes.post('/:id/complete', async (request: AuthenticatedRequest, response) => {
  z.object({}).strict().parse(request.body ?? {});
  response.json(await goalService.complete(request.auth!.userId, id(request)));
});
reportRoutes.get('/classes', async (request: AuthenticatedRequest, response) => {
  const query = z.object({ page }).strict().parse(request.query);
  response.json(await reportService.classes(request.auth!, query.page));
});
reportRoutes.get('/classes/:id', async (request: AuthenticatedRequest, response) => {
  const query = z.object({ page, examPage: page }).strict().parse(request.query);
  response.json(await reportService.report(request.auth!, id(request), query.page, query.examPage));
});
reportRoutes.get('/classes/:id/students/:studentId', async (request: AuthenticatedRequest, response) => {
  const query = z.object({ page }).strict().parse(request.query);
  response.json(await reportService.individual(request.auth!, id(request), id(request, 'studentId'), query.page));
});
