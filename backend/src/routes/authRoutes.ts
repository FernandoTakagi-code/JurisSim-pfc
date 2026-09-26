import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/session', AuthController.session);
router.post('/google', AuthController.google);
router.put('/nome', AuthController.atualizarNome);

export default router;