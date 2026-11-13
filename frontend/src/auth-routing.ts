import {profileRoute} from './profile-navigation';
export type SessionRoute = {
  registrationIntent?: 'INSTITUTION' | 'TEACHER_INVITATION';
  user: { role: 'ALUNO' | 'PROFESSOR' | 'ADMIN'; emailVerificado: boolean };
  nextStep: 'PROFESSOR' | 'DASHBOARD' | 'DIAGNOSTIC' | 'INITIAL_DIAGNOSTIC' | 'INVITATION';
  administration?: { enabled: boolean; memberships: { role: string }[] };
};

export function sessionDestination(session: SessionRoute): string {
  if (session.user.role === 'ADMIN') return '/administracao';
  if(session.user.role==='ALUNO'&&session.registrationIntent==='TEACHER_INVITATION')return '/convite-professor';
  if (session.user.role === 'ALUNO' && session.registrationIntent === 'INSTITUTION') return '/instituicoes';
  if (session.administration?.memberships.some(m => m.role === 'INSTITUTION_ADMIN')) return '/instituicoes';
  if (session.user.role !== 'ALUNO') return '/professor';
  if (session.nextStep === 'INITIAL_DIAGNOSTIC') return '/diagnostico-inicial';
  return session.nextStep === 'DASHBOARD' ? '/dashboard' : '/';
}

/** Returns the redirect before rendering a protected student page. */
export function sessionRedirectTarget(session: SessionRoute, path: string, search=''): string | null {
  if(session.user.role==='ALUNO'&&session.registrationIntent==='TEACHER_INVITATION')return path==='/convite-professor'?null:'/convite-professor';
  const profile = profileRoute(session.user.role, path, search);
  if (profile) return profile.target === path + search ? null : profile.target;
  if (session.user.role === 'ADMIN') {
    if (path === '/administracao' || path.startsWith('/administracao/')) return null;
    return '/administracao';
  }
  if (['/instituicoes', '/convite-professor'].includes(path)) return null;
  if (session.user.role === 'PROFESSOR') return path === '/professor' || path.startsWith('/professor/') ? null : '/professor';
  if(session.user.role==='ALUNO'&&session.registrationIntent==='INSTITUTION')return '/instituicoes';
  if (session.user.role !== 'ALUNO' || !session.user.emailVerificado) return null;
  if (path === '/' && session.registrationIntent === 'INSTITUTION') return '/instituicoes';
  if (session.nextStep === 'INITIAL_DIAGNOSTIC' && path !== '/diagnostico-inicial') return '/diagnostico-inicial';
  const destination = sessionDestination(session);
  if (session.nextStep !== 'INITIAL_DIAGNOSTIC' && path === '/diagnostico-inicial') return destination;
  return path === '/' && destination !== '/' ? destination : null;
}
