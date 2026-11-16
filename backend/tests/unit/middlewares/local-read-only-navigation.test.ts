import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
const db = vi.hoisted(() => ({ administrativeEvent: { create: vi.fn() } }));
vi.mock("../../../src/lib/prisma", () => ({ prisma: db }));
import { administrationAudit } from "../../../src/middlewares/administration-audit";
import { localReadOnlyNavigation, localReadOnlyNavigationEnabled } from "../../../src/middlewares/local-read-only-navigation";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('HOST', '127.0.0.1'); vi.stubEnv('LOCAL_READ_ONLY_NAVIGATION', 'true'); vi.stubEnv('ADMINISTRATION_ENABLED', 'true'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(['production', 'test'])('cannot silently change %s behavior', mode => { vi.stubEnv('NODE_ENV', mode); expect(localReadOnlyNavigationEnabled()).toBe(false); });
it('requires explicit opt-in and a loopback listener', () => { vi.stubEnv('HOST', '0.0.0.0'); expect(localReadOnlyNavigationEnabled()).toBe(false); vi.stubEnv('HOST', '127.0.0.1'); vi.stubEnv('LOCAL_READ_ONLY_NAVIGATION', 'false'); expect(localReadOnlyNavigationEnabled()).toBe(false); });
it('allows only the existing personal training routes after explicit owner activation', () => {
  vi.stubEnv('QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED','true');
  const id='00000000-0000-4000-8000-000000000001';
  for(const [method,path] of [['POST','/question-practice'],['PUT',`/question-practice/${id}/answers/${id}`],['POST',`/question-practice/${id}/finalize`]]){
    const next=vi.fn();localReadOnlyNavigation({method,path} as never,{} as never,next);expect(next).toHaveBeenCalledOnce();
  }
  for(const path of ['/institutions/admin/users','/avaliacoes','/question-editorial/id/release','/question-practice/unknown']){
    const next=vi.fn(),res={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
    localReadOnlyNavigation({method:'POST',path} as never,res as never,next);expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(403);
  }
});
it('blocks mutations before handlers, preserves GET/auth/profile and logs denied reads locally without database writes', async () => {
  const app = express(), write = vi.fn(); vi.spyOn(console, 'info').mockImplementation(() => {});
  app.use(administrationAudit, localReadOnlyNavigation);
  app.get('/institutions/admin/summary', (_q, r) => r.json({ source: 'authorized read handler' }));
  app.post('/institutions/admin/institutions/id', (_q, r) => { write(); r.sendStatus(200); });
  app.post('/question-editorial/id/release', (_q, r) => { write(); r.sendStatus(200); });
  app.post('/question-editorial/00000000-0000-4000-8000-000000000001/release', (_q, r) => r.sendStatus(204));
  app.post('/auth/login', (_q, r) => r.sendStatus(200));
  app.put('/auth/nome', (_q, r) => r.sendStatus(200));
  app.get('/institutions/admin/denied', (_q, r) => r.sendStatus(403));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    expect((await fetch(base + '/institutions/admin/summary')).status).toBe(200);
    expect((await fetch(base + '/institutions/admin/institutions/id', { method: 'POST' })).status).toBe(403);
    expect((await fetch(base + '/INSTITUTIONS/admin/institutions/id', { method: 'POST' })).status).toBe(403);
    expect((await fetch(base + '/question-editorial/id/release', { method: 'POST' })).status).toBe(403);
    expect(write).not.toHaveBeenCalled();
    vi.stubEnv('QUESTION_EDITORIAL_WRITES_ENABLED','true');
    expect((await fetch(base + '/question-editorial/00000000-0000-4000-8000-000000000001/release', { method: 'POST' })).status).toBe(204);
    expect((await fetch(base + '/institutions/admin/institutions/id', { method: 'POST' })).status).toBe(403);
    expect(write).not.toHaveBeenCalled();
    expect((await fetch(base + '/auth/login', { method: 'POST' })).status).toBe(200);
    expect((await fetch(base + '/auth/nome', { method: 'PUT' })).status).toBe(200);
    expect((await fetch(base + '/institutions/admin/denied')).status).toBe(403);
    expect(db.administrativeEvent.create).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(expect.objectContaining({ type: 'local_read_only_audit', event: 'ACCESS_DENIED', status: 403 }));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
