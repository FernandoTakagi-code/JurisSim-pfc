import { Router } from 'express';
import { AuthController } from '../controllers/auth-controller';
import { requireAuth } from '../middlewares/auth-middleware';

const controller = new AuthController();
export const authRoutes = Router();
authRoutes.post('/register', controller.register);
authRoutes.post('/login', controller.login);
authRoutes.post('/google', controller.google);
authRoutes.post('/password-recovery', controller.solicitarRecuperacaoSenha);
authRoutes.post('/password-reset', controller.redefinirSenha);
authRoutes.get('/session', requireAuth, controller.session);
authRoutes.put('/nome', requireAuth, controller.atualizarNome);
authRoutes.delete('/conta', requireAuth, controller.excluirConta);
authRoutes.post('/email-verification', requireAuth, controller.solicitarConfirmacaoEmail);
authRoutes.post('/email-verification/confirm', controller.confirmarEmail);