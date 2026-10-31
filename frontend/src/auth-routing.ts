export type SessionRoute = {
  user: { role: 'ALUNO' | 'PROFESSOR' | 'ADMIN'; emailVerificado: boolean };
  nextStep: 'PROFESSOR' | 'DASHBOARD' | 'DIAGNOSTIC' | 'INITIAL_DIAGNOSTIC';
};

export function sessionDestination(session: SessionRoute): string {
  if (session.user.role !== 'ALUNO') return '/professor';
  if (session.nextStep === 'INITIAL_DIAGNOSTIC') return '/diagnostico-inicial';
  return session.nextStep === 'DASHBOARD' ? '/dashboard' : '/';
}

/** Returns the redirect before rendering a protected student page. */
export function sessionRedirectTarget(session: SessionRoute, path: string): string | null {
  if (session.user.role !== 'ALUNO' || !session.user.emailVerificado) return null;
  if (session.nextStep === 'INITIAL_DIAGNOSTIC' && path !== '/diagnostico-inicial') return '/diagnostico-inicial';
  const destination = sessionDestination(session);
  if (session.nextStep !== 'INITIAL_DIAGNOSTIC' && path === '/diagnostico-inicial') return destination;
  return path === '/' && destination !== '/' ? destination : null;
}
