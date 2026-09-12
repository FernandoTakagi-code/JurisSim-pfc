import { Router } from 'express';
import { QuestaoController } from '../controllers/QuestaoController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { roleMiddleware } from '../middlewares/roleMiddleware';

const router = Router();

router.get('/', authMiddleware, QuestaoController.listar);
router.get('/:id', authMiddleware, QuestaoController.buscarPorId);
router.post('/', authMiddleware, roleMiddleware('PROFESSOR', 'ADMIN'), QuestaoController.criar);
router.put('/:id', authMiddleware, roleMiddleware('PROFESSOR', 'ADMIN'), QuestaoController.atualizar);
router.delete('/:id', authMiddleware, roleMiddleware('PROFESSOR', 'ADMIN'), QuestaoController.remover);

export default router;