import { ApiError } from '../errors/api-error';
import { homologationManifest } from './institution-homologation';

export type TeacherInvitationMode = 'restricted' | 'institutional' | 'production';
const unavailable = () => new ApiError(503, 'Convites docentes indisponíveis neste ambiente. Procure o responsável pela plataforma.');

/** Server configuration only. No request headers, query/body fields or account roles select a mode. */
export function teacherInvitationMode(): TeacherInvitationMode {
  const env = process.env;
  const restricted = env.INSTITUTION_HOMOLOGATION_ENABLED === 'true';
  const institutional = env.INSTITUTIONS_ENABLED === 'true';
  const configured = env.TEACHER_INVITATIONS_MODE;
  if (restricted) {
    if (!['development', 'test'].includes(env.NODE_ENV ?? '') || institutional || (configured && configured !== 'restricted') || !homologationManifest()) throw unavailable();
    return 'restricted';
  }
  if (env.NODE_ENV === 'production') {
    if (configured !== 'production' || !institutional || env.INSTITUTION_HOMOLOGATION_ENABLED !== 'false' || env.JURISSIM_RUNTIME_DATA_SOURCE?.includes('restricted') || env.LOCAL_EMAIL_CAPTURE_ENABLED === 'true' || env.LOCAL_DIAGNOSTIC_DEMO_MODE === 'true') throw unavailable();
    try {
      const url = new URL(env.APP_PUBLIC_URL ?? '');
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw unavailable();
    } catch { throw unavailable(); }
    const transport = env.BREVO_EMAIL_TRANSPORT;
    if (transport !== 'smtp' && transport !== 'api') throw unavailable();
    if (transport === 'api' ? !env.BREVO_API_KEY?.trim() : !env.BREVO_SMTP_USER?.trim() || !env.BREVO_SMTP_KEY?.trim()) throw unavailable();
    return 'production';
  }
  // Existing explicitly enabled development/test institutions are not production.
  if ((env.NODE_ENV === 'development' || env.NODE_ENV === 'test') && institutional && (!configured || configured === 'institutional')) return 'institutional';
  throw unavailable();
}

export function assertTeacherInvitationsAvailable() { teacherInvitationMode(); }
