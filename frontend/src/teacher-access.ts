import type { Session } from './auth-session';

export function teacherAccess(session: Session, selected: string | null) {
  const memberships = session.administration?.memberships.filter(m => m.role === 'TEACHER') ?? [];
  const institutionId = memberships.some(m => m.institutionId === selected) ? selected! : memberships.length === 1 ? memberships[0].institutionId : null;
  const pendingLink = session.administration?.needsInstitutionLink === true || (session.administration?.enabled === true && !memberships.length);
  return {
    memberships, institutionId, pendingLink,
    needsSelection: memberships.length > 1 && !institutionId,
    canLoadAcademicData: session.user.role === 'PROFESSOR' && session.user.emailVerificado && !pendingLink && (memberships.length < 2 || !!institutionId),
  };
}
