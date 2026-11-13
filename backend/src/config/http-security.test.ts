import express from 'express';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { configureHttpSecurity, proxyHops } from './http-security';
import { authRateLimit } from '../middlewares/auth-rate-limit';

let server: Server | undefined;
afterEach(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; });
async function fixture(hops: string) {
  const app = express(); configureHttpSecurity(app, { TRUST_PROXY_HOPS: hops }); app.use(express.json());
  app.post('/login', authRateLimit(2, 1000, Date.now, { account: true, failuresOnly: true }), (req, res) => res.status(req.body.valid ? 200 : 400).json({ ip: req.ip }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  return (email: string, valid = false, forwarded = '198.51.100.1') => fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwarded }, body: JSON.stringify({ email, valid }),
  });
}
describe('HTTP security boundaries', () => {
  it('trusts only a bounded, explicit proxy chain with conservative local default', () => {
    expect(proxyHops({})).toBe(0); expect(proxyHops({ RENDER: 'true' })).toBe(1);
    expect(proxyHops({ RENDER: 'true', TRUST_PROXY_HOPS: '0' })).toBe(0);
    for (const value of ['true', '-1', '6', '1.5', '']) expect(() => proxyHops({ TRUST_PROXY_HOPS: value })).toThrow();
  });
  it('ignores spoofed forwarded addresses without a trusted proxy', async () => {
    const request = await fixture('0'); const result = await request('student@example.invalid');
    expect((await result.json()).ip).toBe('127.0.0.1');
    expect(result.headers.get('x-powered-by')).toBeNull();
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.headers.get('x-content-type-options')).toBe('nosniff');
    expect(result.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
  it('uses the nearest configured hop, never an arbitrary client-supplied first address', async () => {
    const request = await fixture('1');
    const result = await request('student@example.invalid', false, '203.0.113.66, 198.51.100.2');
    expect((await result.json()).ip).toBe('198.51.100.2');
  });
  it('successful logins do not consume account failure quota; failure quota follows account across IPs', async () => {
    const request = await fixture('1');
    for (let i = 0; i < 4; i++) expect((await request('student@example.invalid', true)).status).toBe(200);
    expect((await request('student@example.invalid')).status).toBe(400);
    expect((await request(' STUDENT@example.invalid ', false, '198.51.100.2')).status).toBe(400);
    const blocked = await request('student@example.invalid', false, '198.51.100.3');
    expect(blocked.status).toBe(429); expect(blocked.headers.get('retry-after')).toBe('1');
    expect((await request('different@example.invalid', true)).status).toBe(200);
  });
});
