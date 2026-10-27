import { describe, expect, it } from 'vitest';
import { sessionDestination, sessionRedirectTarget } from '../../frontend/src/auth-routing';

const student = (nextStep: 'DASHBOARD' | 'DIAGNOSTIC' | 'INITIAL_DIAGNOSTIC', emailVerificado = true) => ({
  user: { role: 'ALUNO' as const, emailVerificado }, nextStep,
});

describe('frontend session routing decisions', () => {
  it('sends a returning student with a completed required diagnostic straight to dashboard', () => {
    const session = student('DASHBOARD');
    expect(sessionDestination(session)).toBe('/dashboard');
    expect(sessionRedirectTarget(session, '/')).toBe('/dashboard');
  });

  it('keeps the existing old-diagnostic entry route when the new requirement is disabled', () => {
    const session = student('DIAGNOSTIC');
    expect(sessionDestination(session)).toBe('/');
    expect(sessionRedirectTarget(session, '/')).toBeNull();
  });

  it('routes a student with pending mandatory initial diagnostic before protected content renders', () => {
    const session = student('INITIAL_DIAGNOSTIC');
    expect(sessionDestination(session)).toBe('/diagnostico-inicial');
    expect(sessionRedirectTarget(session, '/dashboard')).toBe('/diagnostico-inicial');
    expect(sessionRedirectTarget(session, '/diagnostico-inicial')).toBeNull();
  });

  it('does not redirect on unverified or staff sessions', () => {
    expect(sessionRedirectTarget(student('INITIAL_DIAGNOSTIC', false), '/dashboard')).toBeNull();
    expect(sessionRedirectTarget({ user: { role: 'PROFESSOR', emailVerificado: true }, nextStep: 'PROFESSOR' }, '/dashboard')).toBeNull();
    expect(sessionRedirectTarget({ user: { role: 'ADMIN', emailVerificado: true }, nextStep: 'PROFESSOR' }, '/dashboard')).toBeNull();
  });

  it('allows a pending legacy diagnostic to stay on its existing route', () => {
    expect(sessionRedirectTarget(student('DIAGNOSTIC'), '/dashboard')).toBeNull();
  });
});