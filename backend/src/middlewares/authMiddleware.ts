import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';

export interface AuthenticatedRequest extends Request {
  usuario?: { id: string; role: string };
  auth?: { userId: string; role: string };
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  console.log('DEBUG middleware chamado para:', req.method, req.originalUrl);

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  const [tipo, token] = authHeader.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Formato de token inválido' });
  }

  try {
    const payload = AuthService.verificarToken(token);
    req.usuario = payload;
    req.auth = { userId: payload.id, role: payload.role };
    return next();
  } catch (error) {
    console.log('DEBUG erro ao verificar token:', error);
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}