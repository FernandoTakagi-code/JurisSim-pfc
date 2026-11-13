import { describe, expect, it } from 'vitest';
import { sessionDestination, sessionRedirectTarget } from '../../frontend/src/auth-routing';

const student = (nextStep: 'DASHBOARD' | 'DIAGNOSTIC' | 'INITIAL_DIAGNOSTIC', emailVerificado = true) => ({
  user: { role: 'ALUNO' as const, emailVerificado }, nextStep,
});

describe('frontend session routing decisions', () => {
  it('routes a pending invited identity only to its invitation, never to a student or teacher dashboard',()=>{
    const session={user:{role:'ALUNO' as const,emailVerificado:true},registrationIntent:'TEACHER_INVITATION' as const,nextStep:'INVITATION' as const};
    expect(sessionDestination(session)).toBe('/convite-professor');
    for(const path of ['/dashboard','/professor','/perfil','/instituicoes'])expect(sessionRedirectTarget(session,path)).toBe('/convite-professor');
    expect(sessionRedirectTarget(session,'/convite-professor')).toBeNull();
  });
  it('directs global and institutional administrators to exclusive management pages', () => {
    expect(sessionDestination({ user: { role: 'ADMIN', emailVerificado: true }, nextStep: 'PROFESSOR' })).toBe('/administracao');
    expect(sessionDestination({ ...student('INITIAL_DIAGNOSTIC'), administration: { enabled: true, memberships: [{ role: 'INSTITUTION_ADMIN' }] } })).toBe('/instituicoes');
    expect(sessionRedirectTarget(student('INITIAL_DIAGNOSTIC'), '/instituicoes')).toBeNull();
    expect(sessionRedirectTarget(student('INITIAL_DIAGNOSTIC'), '/convite-professor')).toBeNull();
  });
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

  it('preserva aluno pendente e professor, mas mantém ADMIN no contexto administrativo', () => {
    expect(sessionRedirectTarget(student('INITIAL_DIAGNOSTIC', false), '/dashboard')).toBeNull();
    expect(sessionRedirectTarget({ user: { role: 'PROFESSOR', emailVerificado: true }, nextStep: 'PROFESSOR' }, '/dashboard')).toBe('/professor');
    expect(sessionRedirectTarget({ user: { role: 'ADMIN', emailVerificado: true }, nextStep: 'PROFESSOR' }, '/dashboard')).toBe('/administracao');
  });

  it('allows a pending legacy diagnostic to stay on its existing route', () => {
    expect(sessionRedirectTarget(student('DIAGNOSTIC'), '/dashboard')).toBeNull();
  });
});
