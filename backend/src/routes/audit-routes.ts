import { Router } from 'express';
import { AuditAction } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRoles } from '../middlewares/auth-middleware';

const filtersSchema = z.object({
  action: z.enum(AuditAction).optional(),
  userId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict().refine(({ from, to }) => !from || !to || Date.parse(from) <= Date.parse(to), {
  message: 'O início do período deve ser anterior ou igual ao fim.', path: ['from'],
});

export const auditRoutes = Router();
auditRoutes.get('/', requireAuth, requireRoles('ADMIN'), async (request, response) => {
  const { action, userId, from, to, limit } = filtersSchema.parse(request.query);
  const logs = await prisma.auditLog.findMany({
    where: {
      action, userId,
      occurredAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { id: true, userId: true, action: true, occurredAt: true, resourceId: true, termsVersion: true, privacyVersion: true },
  });
  response.json(logs);
});
