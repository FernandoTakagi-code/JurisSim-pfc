import express, { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, type AuthenticatedRequest } from '../middlewares/auth-middleware';
import { ApiError } from '../errors/api-error';
import { AVATAR_IDS, MAX_PHOTO_BYTES, ProfilePhotoService } from '../services/profile-photo-service';

const service = new ProfilePhotoService();
export const profilePhotoRoutes = Router();
profilePhotoRoutes.use(requireAuth, requireRoles('ALUNO', 'PROFESSOR', 'ADMIN'));
profilePhotoRoutes.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); next(); });
const avatar = z.object({ avatarId: z.enum(AVATAR_IDS) }).strict();
const noQuery = z.object({}).strict();
profilePhotoRoutes.use((req, _res, next) => { noQuery.parse(req.query); next(); });
profilePhotoRoutes.get('/', async (req: AuthenticatedRequest, res) => { res.json(await service.get(req.auth!.userId)); });
profilePhotoRoutes.put('/avatar', async (req: AuthenticatedRequest, res) => { res.json(await service.avatar(req.auth!.userId, avatar.parse(req.body).avatarId)); });
// Raw binary upload avoids multipart filenames, temporary files and base64
// request amplification. Authenticate BEFORE buffering/decompressing anything.
profilePhotoRoutes.put('/image', (req, res, next) => {
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'].includes(req.get('content-type')?.split(';')[0].trim() ?? '')) return next(new ApiError(415, 'Envie uma imagem JPEG, PNG ou WebP como arquivo binário.'));
  if (req.get('content-encoding') && req.get('content-encoding') !== 'identity') return next(new ApiError(415, 'Imagens comprimidas no transporte não são aceitas.'));
  express.raw({ type: () => true, limit: MAX_PHOTO_BYTES, inflate: false })(req, res, error => {
    if (error) return next(new ApiError((error as { status?: number }).status === 413 ? 413 : 400, 'Não foi possível receber a imagem. Limite de 5 MB.'));
    next();
  });
}, async (req: AuthenticatedRequest, res) => {
  if (!Buffer.isBuffer(req.body)) throw new ApiError(415, 'Envie o arquivo de imagem como conteúdo binário.');
  res.json(await service.upload(req.auth!.userId, req.body));
});
profilePhotoRoutes.delete('/', async (req: AuthenticatedRequest, res) => {
  noQuery.parse(req.body ?? {}); res.json(await service.remove(req.auth!.userId));
});
