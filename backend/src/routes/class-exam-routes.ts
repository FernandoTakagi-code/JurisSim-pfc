import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, requireAcademicStaff, type AuthenticatedRequest } from '../middlewares/auth-middleware';
import { ClassExamService } from '../services/class-exam-service';
import { institutionsEnabled, institutionalTeacherManagementEnabled } from '../config/institution-feature';
import { ApiError } from '../errors/api-error';
import {denyGlobalAcademicAccess} from '../middlewares/academic-access';

const service = new ClassExamService();
const id = (request: AuthenticatedRequest, key = 'id') => z.string().uuid().parse(request.params[key]);
const page = (request: AuthenticatedRequest) => z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }).strict().parse(request.query).page;
const examSchema = z.object({ titulo: z.string().trim().min(2).max(150), descricao: z.string().trim().max(3000).default(''),
  duracaoSegundos: z.number().int().min(60).max(86400).nullable().default(null),
  turmaIds: z.array(z.string().uuid()).min(1).max(30), questaoIds: z.array(z.string().uuid()).min(1).max(80),
  responsibleTeacherId: z.string().uuid().optional(),
  expectedQuestions:z.number().int().min(1).max(80).optional(),
}).strict().refine(value => new Set(value.turmaIds).size === value.turmaIds.length && new Set(value.questaoIds).size === value.questaoIds.length, 'Não repita turmas ou questões.');

export const classRoutes = Router(), examRoutes = Router();
for (const router of [classRoutes, examRoutes]) router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); }, requireAuth, denyGlobalAcademicAccess);
const staff = requireAcademicStaff, student = requireRoles('ALUNO');
classRoutes.get('/requests', student, async (request: AuthenticatedRequest, response) => { response.json(await service.joinRequests(request.auth!, undefined, page(request))); });
classRoutes.put('/:id/teachers/:teacherId',staff,async(req:AuthenticatedRequest,res)=>{
  if(!institutionsEnabled()&&!institutionalTeacherManagementEnabled())throw new ApiError(503,'Gestão institucional não ativada.');
  const {assigned}=z.object({assigned:z.boolean()}).strict().parse(req.body);
  res.json(await service.assignTeacher(req.auth!,id(req),id(req,'teacherId'),assigned));
});
classRoutes.post('/:id/students',staff,async(req:AuthenticatedRequest,res)=>{
  const {email}=z.object({email:z.string().trim().email().max(254)}).strict().parse(req.body);
  res.json(await service.addStudent(req.auth!,id(req),email));
});
classRoutes.get('/:id/requests', staff, async (request: AuthenticatedRequest, response) => { response.json(await service.joinRequests(request.auth!, id(request), page(request))); });
classRoutes.patch('/:id/requests/:requestId', staff, async (request: AuthenticatedRequest, response) => {
  const { approve } = z.object({ approve: z.boolean() }).strict().parse(request.body);
  response.json(await service.decideJoin(request.auth!, id(request), id(request, 'requestId'), approve));
});
classRoutes.delete('/:id/students/:studentId', staff, async (request: AuthenticatedRequest, response) => { response.json(await service.removeStudent(request.auth!, id(request), id(request, 'studentId'))); });
classRoutes.delete('/:id/invite', staff, async (request: AuthenticatedRequest, response) => { response.json(await service.disableInvite(request.auth!, id(request))); });
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
classRoutes.get('/:id/student-search', staff, async (request: AuthenticatedRequest,response)=>{
  const query=z.object({q:z.string().trim().min(3).max(100),page:z.coerce.number().int().min(1).max(1000).default(1)}).strict().parse(request.query);
  response.json(await service.searchStudents(request.auth!,id(request),query.q,query.page));
});
classRoutes.delete('/:id',staff,async(request:AuthenticatedRequest,response)=>{
  const {confirmationName}=z.object({confirmationName:z.string().min(2).max(150)}).strict().parse(request.body);
  response.json(await service.deleteClass(request.auth!,id(request),confirmationName));
});
classRoutes.get('/:id/students', staff, async (request: AuthenticatedRequest, response) => { response.json(await service.students(request.auth!, id(request), page(request))); });
classRoutes.get('/:id', student, async (request: AuthenticatedRequest, response) => { response.json(await service.studentClassDetails(request.auth!, id(request), page(request))); });
classRoutes.patch('/:id', staff, async (request: AuthenticatedRequest, response) => {
  const data = z.object({ nome: z.string().trim().min(2).max(150).optional(), archived: z.literal(true).optional() }).strict().refine(data => Object.keys(data).length > 0).parse(request.body);
  response.json(await service.updateClass(request.auth!, id(request), data));
});
classRoutes.post('/:id/invite', staff, async (request: AuthenticatedRequest, response) => { response.json(await service.rotateInvite(request.auth!, id(request))); });
examRoutes.get('/eligible-questions/:questionId',staff,async(request:AuthenticatedRequest,response)=>{
  const query=z.object({turmaIds:z.string().transform(value=>value.split(',')).pipe(z.array(z.string().uuid()).min(1).max(30))}).strict().parse(request.query);
  response.json(await service.eligibleQuestionPreview(request.auth!,query.turmaIds,id(request,'questionId')));
});
examRoutes.get('/eligible-questions',staff,async(request:AuthenticatedRequest,response)=>{
  const query=z.object({turmaIds:z.string().transform(value=>value.split(',')).pipe(z.array(z.string().uuid()).min(1).max(30)),page:z.coerce.number().int().min(1).max(10000).default(1),q:z.string().trim().max(160).optional(),disciplina:z.string().trim().max(100).optional(),assunto:z.string().trim().max(150).optional(),nivel:z.enum(['BASICO','INTERMEDIARIO','AVANCADO']).optional(),pageSize:z.coerce.number().refine(n=>[10,20,50].includes(n)).optional()}).strict().parse(request.query);
  const {turmaIds,page:current,...filters}=query;
  response.json(Object.keys(filters).length
    ? await service.eligibleQuestions(request.auth!,turmaIds,current,filters)
    : await service.eligibleQuestions(request.auth!,turmaIds,current));
});
examRoutes.get('/', async (request: AuthenticatedRequest, response) => {const query=z.object({page:z.coerce.number().int().min(1).max(1000).default(1),turmaId:z.string().uuid().optional(),archived:z.enum(['true','false']).optional(),search:z.string().trim().max(150).optional(),status:z.enum(['ALL','DRAFT','PUBLISHED','CLOSED','ARCHIVED']).optional()}).strict().parse(request.query);response.json(await service.listExams(request.auth!,query.page,query.turmaId,query.archived==='true',{search:query.search,status:query.status})); });
examRoutes.get('/:id/details',staff,async(request:AuthenticatedRequest,response)=>response.json(await service.examDetails(request.auth!,id(request),page(request))));
examRoutes.post('/:id/close',staff,async(request:AuthenticatedRequest,response)=>response.json(await service.manageExam(request.auth!,id(request),'close')));
examRoutes.post('/:id/archive',staff,async(request:AuthenticatedRequest,response)=>response.json(await service.manageExam(request.auth!,id(request),'archive')));
examRoutes.delete('/:id',staff,async(request:AuthenticatedRequest,response)=>response.json(await service.manageExam(request.auth!,id(request),'delete')));
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
