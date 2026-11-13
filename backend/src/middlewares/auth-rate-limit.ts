import type { RequestHandler } from 'express';
import { createHash } from 'node:crypto';

// Bounded per-process IP protection. No forwarded header is trusted here.
// Cross-instance account quotas are enforced separately in PostgreSQL.
export function authRateLimit(limit: number, windowMs: number, clock = Date.now, options: { account?: boolean; failuresOnly?: boolean } = {}): RequestHandler {
  const buckets = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
    const now = clock(), key = options.account
      ? createHash('sha256').update(email || 'invalid-email').digest('hex')
      : req.ip ?? req.socket.remoteAddress ?? 'unknown';
    for (const [ip, bucket] of buckets) if (bucket.until <= now) buckets.delete(ip);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 10000) { res.set('Retry-After', '60').status(429).json({ message: 'Muitas solicitações. Aguarde e tente novamente.' }); return; }
      bucket = { count: 0, until: now + windowMs }; buckets.set(key, bucket);
    }
    if (bucket.count >= limit) { res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - now) / 1000)))).status(429).json({ message: 'Muitas solicitações. Aguarde e tente novamente.' }); return; }
    bucket.count++;
    const reserved = bucket;
    if (options.failuresOnly) res.once('finish', () => {
      if (res.statusCode < 400) reserved.count = Math.max(0, reserved.count - 1);
    });
    next();
  };
}
