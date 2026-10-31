export const DEFAULT_DEVELOPMENT_ORIGINS = ['http://localhost:5173'] as const;
export const CORS_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
export const CORS_HEADERS = ['Authorization', 'Content-Type', 'X-JurisSim-Local-Demo'] as const;

export function corsOriginsFromEnvironment(environment: NodeJS.ProcessEnv = process.env): string[] {
  const configured = environment.CORS_ORIGINS?.trim();
  if (!configured) {
    if (environment.NODE_ENV === 'production') {
      throw new Error('CORS_ORIGINS must contain the exact public frontend origins in production.');
    }
    return [...DEFAULT_DEVELOPMENT_ORIGINS];
  }

  const entries = configured.split(',').map(origin => origin.trim());
  if (entries.some(origin => !origin)) throw new Error('CORS_ORIGINS contains an empty origin.');

  const origins = entries.map(origin => {
    let parsed: URL;
    try { parsed = new URL(origin); }
    catch { throw new Error('CORS_ORIGINS must contain valid HTTP(S) origins.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin ||
      parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('CORS_ORIGINS entries must be exact origins without paths, credentials, query strings, or fragments.');
    }
    return origin;
  });

  return [...new Set(origins)];
}

export function isAllowedCorsOrigin(origin: string, allowlist = corsOriginsFromEnvironment()): boolean {
  return allowlist.includes(origin);
}

export function isValidCorsPreflight(
  requestedMethod: string | undefined,
  requestedHeaders: string | undefined,
): boolean {
  if (!requestedMethod || !CORS_METHODS.includes(requestedMethod as typeof CORS_METHODS[number])) return false;
  const allowedHeaders = new Set(CORS_HEADERS.map(header => header.toLowerCase()));
  return (requestedHeaders ?? '').split(',').map(header => header.trim().toLowerCase()).filter(Boolean)
    .every(header => allowedHeaders.has(header));
}
