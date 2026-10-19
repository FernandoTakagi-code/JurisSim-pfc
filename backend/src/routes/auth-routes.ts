import { Router } from 'express';
import { AuthController } from '../controllers/auth-controller';
import { requireAuth, requireLimitedAuth } from '../middlewares/auth-middleware';
import { authRateLimit } from '../middlewares/auth-rate-limit';
import { ApiError } from '../errors/api-error';

export function createAuthRoutes(controller = new AuthController()) {
  const authRoutes = Router();
  authRoutes.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  authRoutes.use((req, _res, next) => {
    const origin = req.get('origin'), publicUrl = process.env.APP_PUBLIC_URL;
    if (origin && (publicUrl || process.env.NODE_ENV === 'production')) {
      try { if (origin !== new URL(publicUrl ?? '').origin) return next(new ApiError(403, 'Origem não autorizada.')); }
      catch { return next(new ApiError(503, 'Autenticação temporariamente indisponível.')); }
    }
    next();
  });
  authRoutes.post('/register', authRateLimit(15, 3600000), controller.register);
  authRoutes.post('/login', authRateLimit(30, 900000), controller.login);
  authRoutes.post('/google', authRateLimit(60, 900000), controller.google);
  authRoutes.post('/password-recovery', authRateLimit(30, 3600000), controller.solicitarRecuperacaoSenha);
  authRoutes.post('/password-reset', authRateLimit(30, 900000), controller.redefinirSenha);
  authRoutes.post('/logout', requireLimitedAuth, controller.logout);
  authRoutes.get('/session', requireLimitedAuth, controller.session);
  authRoutes.put('/nome', requireAuth, controller.atualizarNome);
  authRoutes.delete('/conta', requireAuth, controller.excluirConta);
  authRoutes.post('/email-verification', requireLimitedAuth, authRateLimit(30, 3600000), controller.solicitarConfirmacaoEmail);
  authRoutes.post('/email-verification/confirm', authRateLimit(60, 900000), controller.confirmarEmail);
  return authRoutes;
}
export const authRoutes = createAuthRoutes();
