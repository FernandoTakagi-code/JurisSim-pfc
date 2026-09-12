import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authMiddleware';

export function roleMiddleware(...papeisPermitidos: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ erro: 'Não autenticado' });
    }

    if (!papeisPermitidos.includes(req.usuario.role)) {
      return res.status(403).json({ erro: 'Acesso negado para este papel' });
    }

    return next();
  };
}