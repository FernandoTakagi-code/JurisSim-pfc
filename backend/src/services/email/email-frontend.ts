import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import { corsOriginsFromEnvironment } from '../../config/cors-policy';
import { ApiError } from '../../errors/api-error';
import { isValidAppUrl } from './app-url';

const emailOrigin = new AsyncLocalStorage<string>();
// Somente as origens CORS exatas configuradas no servidor podem selecionar um frontend de e-mail.
// Host, Referer, X-Forwarded-* e valores do body da requisição nunca são usados.
export const emailFrontendContext: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  if (!origin) return next();
  let allowed: string[];
  try { allowed = corsOriginsFromEnvironment(); } catch { return next(new ApiError(503, 'Configuração das origens indisponível.')); }
  if (!allowed.includes(origin) || !isValidAppUrl(origin)) return next(new ApiError(403, 'Origem não autorizada.'));
  return emailOrigin.run(origin, () => next());
};

export function emailFrontendUrl(configured = process.env.APP_PUBLIC_URL): string | undefined {
  if (!isValidAppUrl(configured)) return undefined;
  const fallback = new URL(configured);
  const origin = emailOrigin.getStore();
  // Preserva um caminho base configurado explicitamente na mesma origem.
  return (origin && origin !== fallback.origin ? origin : fallback.href).replace(/\/$/, '');
}
