import type { Express } from 'express';

export function proxyHops(values: NodeJS.ProcessEnv = process.env): number {
  const value = values.TRUST_PROXY_HOPS ?? (values.RENDER === 'true' ? '1' : '0');
  if (!/^[0-5]$/.test(value)) throw new Error('TRUST_PROXY_HOPS deve ser um inteiro entre 0 e 5.');
  return Number(value);
}

export function configureHttpSecurity(app: Express, values: NodeJS.ProcessEnv = process.env) {
  app.disable('x-powered-by');
  app.set('trust proxy', proxyHops(values));
  app.use((_request, response, next) => {
    response.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    });
    next();
  });
}
