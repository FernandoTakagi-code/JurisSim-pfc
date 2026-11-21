import {profileRoute} from './profile-navigation';
export type SessionRoute = {
  registrationIntent?: 'INSTITUTION' | 'TEACHER_INVITATION';
  user: { role: 'ALUNO' | 'PROFESSOR' | 'ADMIN'; emailVerificado: boolean };
  nextStep: 'PROFESSOR' | 'DASHBOARD' | 'DIAGNOSTIC' | 'INITIAL_DIAGNOSTIC' | 'INVITATION';
  administration?: { enabled: boolean; memberships: { role: string }[] };
};

const hasInstitutionManager = (session: SessionRoute) =>
  session.administration?.memberships.some(m => m.role === 'INSTITUTION_ADMIN') === true;

export function sessionDestination(session: SessionRoute, personalContextSelected = false): string {
  if (session.user.role === 'ADMIN') return '/administracao';
  if (session.user.role === 'PROFESSOR') return '/professor';
  if(session.user.role==='ALUNO'&&session.registrationIntent==='TEACHER_INVITATION')return '/convite-professor';
  if (session.user.role === 'ALUNO' && session.registrationIntent === 'INSTITUTION' && !(personalContextSelected && hasInstitutionManager(session))) return '/instituicoes';
  if (session.user.role === 'ALUNO' && hasInstitutionManager(session) && !personalContextSelected) return '/instituicoes';
  if (session.nextStep === 'INITIAL_DIAGNOSTIC') return '/diagnostico-inicial';
  return session.nextStep === 'DASHBOARD' ? '/dashboard' : '/';
}

/** Retorna o redirecionamento antes de renderizar uma página protegida do aluno. */
export function sessionRedirectTarget(session: SessionRoute, path: string, search='', personalContextSelected = false): string | null {
  if(session.user.role==='ALUNO'&&session.registrationIntent==='TEACHER_INVITATION')return path==='/convite-professor'?null:'/convite-professor';
  const profile = profileRoute(session.user.role, path, search);
  if (profile) return profile.target === path + search ? null : profile.target;
  if (session.user.role === 'ADMIN') {
    if (path === '/administracao' || path.startsWith('/administracao/')) return null;
    return '/administracao';
  }
  if (path === '/convite-professor') return null;
  if (session.user.role === 'PROFESSOR') return path === '/professor' || path.startsWith('/professor/') ? null : '/professor';
  if (path === '/instituicoes') return null;
  if (session.user.role === 'ALUNO' && session.registrationIntent === 'INSTITUTION' && !(personalContextSelected && hasInstitutionManager(session))) return '/instituicoes';
  if (session.user.role === 'ALUNO' && hasInstitutionManager(session) && !personalContextSelected) return '/instituicoes';
  if (session.user.role !== 'ALUNO' || !session.user.emailVerificado) return null;
  if (session.nextStep === 'INITIAL_DIAGNOSTIC' && path !== '/diagnostico-inicial') return '/diagnostico-inicial';
  const destination = sessionDestination(session, personalContextSelected);
  if (session.nextStep !== 'INITIAL_DIAGNOSTIC' && path === '/diagnostico-inicial') return destination;
  return path === '/' && destination !== '/' ? destination : null;
}
