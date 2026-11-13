import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, type AuthenticatedRequest } from '../middlewares/auth-middleware';
import { IndividualExamService } from '../services/individual-exam-service';
import { PrismaIndividualExamRepository } from '../repositories/prisma-individual-exam-repository';
import { isIndividualExamEnabled } from '../config/individual-exam-feature';

export function createIndividualExamRoutes(options: { service?: IndividualExamService; isEnabled?: () => boolean } = {}) {
  const router = Router();
  const service = options.service ?? new IndividualExamService(new PrismaIndividualExamRepository());
  const id = (req: AuthenticatedRequest) => z.uuid().parse(req.params.id);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(options.isEnabled ?? isIndividualExamEnabled)()) { res.status(503).json({ code: 'INDIVIDUAL_EXAM_DISABLED', message: 'Os simulados individuais estão em preparação.' }); return; }
    next();
  });
  router.use(requireAuth, requireRoles('ALUNO'));
  router.get('/availability', async (req: AuthenticatedRequest, res) => { res.json(await service.availability(req.auth!.userId)); });
  router.post('/', async (req: AuthenticatedRequest, res) => {
    z.object({}).strict().parse(req.body);
    const result = await service.start(req.auth!.userId);
    res.status(result.resumed ? 200 : 201).json(result);
  });
  router.get('/:id', async (req: AuthenticatedRequest, res) => { res.json({ attempt: await service.get(req.auth!.userId, id(req)) }); });
  router.put('/:id/answers/:questionId', async (req: AuthenticatedRequest, res) => {
    const { alternativeId } = z.object({ alternativeId: z.uuid() }).strict().parse(req.body);
    res.json(await service.answer(req.auth!.userId, id(req), z.uuid().parse(req.params.questionId), alternativeId));
  });
  router.post('/:id/finalize', async (req: AuthenticatedRequest, res) => { res.json({ result: await service.finalize(req.auth!.userId, id(req)) }); });
  router.get('/:id/result', async (req: AuthenticatedRequest, res) => { res.json({ result: await service.getResult(req.auth!.userId, id(req)) }); });
  return router;
}
