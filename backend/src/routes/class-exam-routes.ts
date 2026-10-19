import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, type AuthenticatedRequest } from '../middlewares/auth-middleware';
import { ClassExamService } from '../services/class-exam-service';

const service = new ClassExamService();
const id = (request: AuthenticatedRequest, key = 'id') => z.string().uuid().parse(request.params[key]);
const page = (request: AuthenticatedRequest) => z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }).strict().parse(request.query).page;
const examSchema = z.object({ titulo: z.string().trim().min(2).max(150), descricao: z.string().trim().max(3000).default(''),
  duracaoSegundos: z.number().int().min(60).max(86400).nullable().default(null),
  turmaIds: z.array(z.string().uuid()).min(1).max(30), questaoIds: z.array(z.string().uuid()).min(1).max(80),
}).strict().refine(value => new Set(value.turmaIds).size === value.turmaIds.length && new Set(value.questaoIds).size === value.questaoIds.length, 'Não repita turmas ou questões.');

export const classRoutes = Router(), examRoutes = Router();
for (const router of [classRoutes, examRoutes]) router.use(requireAuth, (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
const staff = requireRoles('PROFESSOR', 'ADMIN'), student = requireRoles('ALUNO');
classRoutes.get('/', async (request: AuthenticatedRequest, response) => { response.json(await service.listClasses(request.auth!, page(request))); });
classRoutes.post('/', staff, async (request: AuthenticatedRequest, response) => {
  const { nome } = z.object({ nome: z.string().trim().min(2).max(150) }).strict().parse(request.body);
  response.status(201).json(await service.createClass(request.auth!, nome));
});
classRoutes.post('/join', student, async (request: AuthenticatedRequest, response) => {
  const { code } = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9_-]{32}$/) }).strict().parse(request.body);
  response.json(await service.join(request.auth!, code));
});
classRoutes.get('/students', staff, async (request: AuthenticatedRequest, response) => { response.json(await service.students(request.auth!, undefined, page(request))); });
classRoutes.get('/:id/students', staff, async (request: AuthenticatedRequest, response) => { response.json(await service.students(request.auth!, id(request), page(request))); });
classRoutes.patch('/:id', staff, async (request: AuthenticatedRequest, response) => {
  const data = z.object({ nome: z.string().trim().min(2).max(150).optional(), archived: z.literal(true).optional() }).strict().refine(data => Object.keys(data).length > 0).parse(request.body);
  response.json(await service.updateClass(request.auth!, id(request), data));
});
classRoutes.post('/:id/invite', staff, async (request: AuthenticatedRequest, response) => { response.json(await service.rotateInvite(request.auth!, id(request))); });
examRoutes.get('/', async (request: AuthenticatedRequest, response) => { response.json(await service.listExams(request.auth!, page(request))); });
examRoutes.post('/', staff, async (request: AuthenticatedRequest, response) => { response.status(201).json(await service.saveExam(request.auth!, examSchema.parse(request.body))); });
examRoutes.put('/:id', staff, async (request: AuthenticatedRequest, response) => { response.json(await service.saveExam(request.auth!, examSchema.parse(request.body), id(request))); });
examRoutes.post('/:id/publish', staff, async (request: AuthenticatedRequest, response) => { response.json(await service.publish(request.auth!, id(request))); });
examRoutes.post('/:id/attempts', student, async (request: AuthenticatedRequest, response) => { response.json(await service.start(request.auth!, id(request))); });
examRoutes.get('/attempts/:id', student, async (request: AuthenticatedRequest, response) => { response.json(await service.attempt(request.auth!, id(request))); });
examRoutes.put('/attempts/:id/answers/:questionId', student, async (request: AuthenticatedRequest, response) => {
  const { selectedOptionId } = z.object({ selectedOptionId: z.string().uuid() }).strict().parse(request.body);
  response.json(await service.answer(request.auth!, id(request), id(request, 'questionId'), selectedOptionId));
});
examRoutes.post('/attempts/:id/finalize', student, async (request: AuthenticatedRequest, response) => { response.json(await service.finalize(request.auth!, id(request))); });
