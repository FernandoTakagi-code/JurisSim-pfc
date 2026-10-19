import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, type AuthenticatedRequest } from '../middlewares/auth-middleware';
import { StudentHistoryRepository } from '../repositories/student-history-repository';

const cursorSchema = z.object({ startedAt: z.iso.datetime(), id: z.string().uuid() }).strict();
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(250).regex(/^[A-Za-z0-9_-]+$/).optional().transform((value, ctx) => {
    if (!value) return undefined;
    try { return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))); }
    catch { ctx.addIssue({ code: 'custom', message: 'Cursor inválido.' }); return z.NEVER; }
  }),
}).strict();

export const studentHistoryRoutes = Router();
const repository = new StudentHistoryRepository();
studentHistoryRoutes.use(requireAuth, requireRoles('ALUNO'));
studentHistoryRoutes.get('/overview', async (request: AuthenticatedRequest, response) => {
  z.object({}).strict().parse(request.query);
  response.setHeader('Cache-Control', 'no-store');
  response.json(await repository.overview(request.auth!.userId));
});
for (const path of ['/activities', '/diagnostics']) {
  studentHistoryRoutes.get(path, async (request: AuthenticatedRequest, response) => {
    const { limit, cursor } = querySchema.parse(request.query);
    const records = await repository.history(request.auth!.userId, limit, cursor, path === '/diagnostics');
    const items = records.slice(0, limit);
    const last = items[items.length - 1];
    const nextCursor = records.length > limit && last ? Buffer.from(JSON.stringify({
      startedAt: last.startedAt.toISOString(), id: last.id,
    })).toString('base64url') : null;
    response.setHeader('Cache-Control', 'no-store');
    response.json({ items, nextCursor });
  });
}
