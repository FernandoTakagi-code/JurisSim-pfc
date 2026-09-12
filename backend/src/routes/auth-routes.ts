import { Router } from 'express';
import { AuthController } from '../controllers/auth-controller';
import { requireAuth } from '../middlewares/auth-middleware';

const controller = new AuthController();
export const authRoutes = Router();
authRoutes.post('/register', controller.register);
authRoutes.post('/login', controller.login);
authRoutes.get('/session', requireAuth, controller.session);
