import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from './auth-middleware';
import { createInitialDiagnosticRequirementGuard } from './initial-diagnostic-required';

const request = (auth?: AuthenticatedRequest['auth'], demoHeader?: string) => ({ auth, get: (name: string) => name === 'x-jurissim-local-demo' ? demoHeader : undefined }) as unknown as AuthenticatedRequest;
function response() {
  const result: Record<string, unknown> = {};
  const res = {
    setHeader: vi.fn((name: string, value: string) => { result[name] = value; return res; }),
    status: vi.fn((code: number) => { result.status = code; return res; }),
    json: vi.fn((body: unknown) => { result.body = body; return res; }),
    result,
  };
  return res;
}

afterEach(() => vi.unstubAllEnvs());

describe('mandatory initial diagnostic feature flag', () => {
  it('can enforce the access gate independently while the assessment API remains disabled', async () => {
    const { isInitialDiagnosticRequired } = await import('../config/initial-diagnostic-feature');
    vi.stubEnv('INITIAL_DIAGNOSTIC_REQUIRED', 'true');
    vi.stubEnv('INITIAL_DIAGNOSTIC_API_ENABLED', 'false');
    expect(isInitialDiagnosticRequired()).toBe(true);
    vi.stubEnv('INITIAL_DIAGNOSTIC_REQUIRED', 'false');
    vi.stubEnv('INITIAL_DIAGNOSTIC_API_ENABLED', 'true');
    expect(isInitialDiagnosticRequired()).toBe(false);
  });
});

describe('initial diagnostic completion guard', () => {
  it('does not query completion when disabled', async () => {
    const hasCompleted = vi.fn();
    const next = vi.fn();
    await createInitialDiagnosticRequirementGuard({ isRequired: () => false, hasCompletedInitialDiagnostic: hasCompleted })(request(), response() as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(hasCompleted).not.toHaveBeenCalled();
  });

  it('returns 401 when active and authentication is missing', async () => {
    const next = vi.fn();
    await createInitialDiagnosticRequirementGuard({ isRequired: () => true, hasCompletedInitialDiagnostic: vi.fn() })(request(), response() as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it.each(['PROFESSOR', 'ADMIN'])('does not gate %s accounts or query their completion', async role => {
    const hasCompleted = vi.fn();
    const next = vi.fn();
    await createInitialDiagnosticRequirementGuard({ isRequired: () => true, hasCompletedInitialDiagnostic: hasCompleted })(request({ userId: 'staff-1', role }), response() as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(hasCompleted).not.toHaveBeenCalled();
  });

  it('blocks an ALUNO whose unique initial diagnostic remains incomplete', async () => {
    const res = response();
    const next = vi.fn();
    await createInitialDiagnosticRequirementGuard({ isRequired: () => true, hasCompletedInitialDiagnostic: vi.fn().mockResolvedValue(false) })(request({ userId: 'student-1', role: 'ALUNO' }), res as never, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.result).toMatchObject({ 'Cache-Control': 'no-store', body: { code: 'INITIAL_DIAGNOSTIC_REQUIRED' } });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows an ALUNO after completion', async () => {
    const next = vi.fn();
    await createInitialDiagnosticRequirementGuard({ isRequired: () => true, hasCompletedInitialDiagnostic: vi.fn().mockResolvedValue(true) })(request({ userId: 'student-1', role: 'ALUNO' }), response() as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows only an explicitly opted-in student when the server validated local demo mode', async () => {
    const next = vi.fn();
    await createInitialDiagnosticRequirementGuard({
      isRequired: () => true,
      hasCompletedInitialDiagnostic: vi.fn().mockResolvedValue(false),
      isLocalDemoEnabled: () => true,
    })(request({ userId: 'student-1', role: 'ALUNO' }, 'true'), response() as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('does not allow a client demo header when server mode is not validated', async () => {
    const res = response();
    const next = vi.fn();
    await createInitialDiagnosticRequirementGuard({
      isRequired: () => true,
      hasCompletedInitialDiagnostic: vi.fn().mockResolvedValue(false),
      isLocalDemoEnabled: () => false,
    })(request({ userId: 'student-1', role: 'ALUNO' }, 'true'), res as never, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed by forwarding repository failures', async () => {
    const failure = new Error('repository unavailable');
    const next = vi.fn();
    await createInitialDiagnosticRequirementGuard({ isRequired: () => true, hasCompletedInitialDiagnostic: vi.fn().mockRejectedValue(failure) })(request({ userId: 'student-1', role: 'ALUNO' }), response() as never, next);
    expect(next).toHaveBeenCalledWith(failure);
  });
});
