import { Router } from 'express';
import { QuestaoController } from '../controllers/QuestaoController';
import { requireAuth, requireRoles } from '../middlewares/auth-middleware';
import express from 'express';
import { previewQuestionCsvController } from '../controllers/question-csv-preview-controller';

const router = Router();

router.get('/', requireAuth, QuestaoController.listar);
router.get('/:id', requireAuth, QuestaoController.buscarPorId);
router.post('/importacao/preview', requireAuth, requireRoles('ADMIN'), express.text({ type: 'text/csv', limit: '2mb' }), previewQuestionCsvController);
router.post('/', requireAuth, requireRoles('PROFESSOR', 'ADMIN'), QuestaoController.criar);
router.put('/:id', requireAuth, requireRoles('PROFESSOR', 'ADMIN'), QuestaoController.atualizar);
router.delete('/:id', requireAuth, requireRoles('PROFESSOR', 'ADMIN'), QuestaoController.remover);

export default router;
