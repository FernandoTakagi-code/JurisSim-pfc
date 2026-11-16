import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, type AuthenticatedRequest } from '../middlewares/auth-middleware';
import { authRateLimit } from '../middlewares/auth-rate-limit';
import { QuestionEditorialService } from '../services/questions/question-editorial-service';

export function createQuestionEditorialRoutes(service = new QuestionEditorialService()) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, requireAuth, requireRoles('ADMIN'));
  const id = (req: AuthenticatedRequest) => z.uuid().parse(req.params.id);
  const evidence = z.string().trim().min(8).max(1000);
  const base = { expectedDigest: z.string().regex(/^[a-f0-9]{64}$/), evidenceRef: evidence };
  router.get('/availability', async (req: AuthenticatedRequest, res) => res.json(await service.availability(req.auth!)));
  router.get('/', async (req: AuthenticatedRequest, res) => {
    const q = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), discipline: z.string().trim().min(1).max(100).optional(), search: z.string().trim().max(150).optional() }).strict().parse(req.query);
    res.json(await service.list(req.auth!, q.page, q.discipline, q.search));
  });
  router.get('/:id', async (req: AuthenticatedRequest, res) => res.json(await service.detail(req.auth!, id(req))));
  router.use(authRateLimit(30, 60000));
  router.patch('/:id/metadata', async (req: AuthenticatedRequest, res) => {
    const body = z.object({ ...base, sourceName: z.string().trim().min(1).max(300), sourceReference: z.string().trim().min(1).max(10000), license: z.string().trim().min(1).max(2000), origin: z.enum(['IA','OAB_OFICIAL']).optional() }).strict().parse(req.body);
    res.json(await service.metadata(req.auth!, id(req), body));
  });
  router.post('/:id/reviews/:kind', async (req: AuthenticatedRequest, res) => {
    const kind = z.enum(['legal','pedagogical']).parse(req.params.kind);
    const body = z.object({ ...base, confirmed: z.literal(true) }).strict().parse(req.body);
    res.json(await service.review(req.auth!, id(req), kind, body));
  });
  router.post('/:id/release', async (req: AuthenticatedRequest, res) => {
    const body = z.object({ ...base, confirmed: z.literal(true), consentEvidence: evidence }).strict().parse(req.body);
    res.json(await service.release(req.auth!, id(req), body));
  });
  return router;
}
