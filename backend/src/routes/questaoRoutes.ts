import { Router } from 'express';
import { QuestaoController } from '../controllers/QuestaoController';
import { requireAuth, requireRoles } from '../middlewares/auth-middleware';
import {denyGlobalAcademicAccess} from '../middlewares/academic-access';
import {ApiError} from '../errors/api-error';

const router = Router();

router.get('/', requireAuth, denyGlobalAcademicAccess, QuestaoController.listar);
router.get('/:id', requireAuth, denyGlobalAcademicAccess, QuestaoController.buscarPorId);
router.post('/importacao/preview', requireAuth, denyGlobalAcademicAccess, (_req,_res,next)=>next(new ApiError(403,'Importação pedagógica global descontinuada neste perfil.')));
router.post('/', requireAuth, denyGlobalAcademicAccess, requireRoles('PROFESSOR'), QuestaoController.criar);
router.put('/:id', requireAuth, denyGlobalAcademicAccess, requireRoles('PROFESSOR'), QuestaoController.atualizar);
router.delete('/:id', requireAuth, denyGlobalAcademicAccess, requireRoles('PROFESSOR'), QuestaoController.remover);

export default router;
