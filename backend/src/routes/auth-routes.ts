import { Router } from 'express';
import { AuthController } from '../controllers/auth-controller';
import { requireAuth } from '../middlewares/auth-middleware';

const controller = new AuthController();
export const authRoutes = Router();
authRoutes.post('/register', controller.register);
authRoutes.post('/login', controller.login);
authRoutes.post('/google', controller.google);
authRoutes.get('/session', requireAuth, controller.session);
authRoutes.put('/nome', requireAuth, controller.atualizarNome);