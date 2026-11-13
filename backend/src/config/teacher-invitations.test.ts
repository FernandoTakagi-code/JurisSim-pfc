import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ manifest: true }));
vi.mock('./institution-homologation', () => ({ homologationManifest: () => state.manifest ? {} : null }));
import { teacherInvitationMode } from './teacher-invitations';
beforeEach(() => {
  state.manifest = true;
  for (const [key,value] of Object.entries({ NODE_ENV:'production', TEACHER_INVITATIONS_MODE:'production', INSTITUTIONS_ENABLED:'true', INSTITUTION_HOMOLOGATION_ENABLED:'false', APP_PUBLIC_URL:'https://jurissim.example.invalid', BREVO_EMAIL_TRANSPORT:'smtp', BREVO_SMTP_USER:'smtp@example.invalid', BREVO_SMTP_KEY:'isolated-test-key', JURISSIM_RUNTIME_DATA_SOURCE:'', LOCAL_EMAIL_CAPTURE_ENABLED:'false', LOCAL_DIAGNOSTIC_DEMO_MODE:'false' })) vi.stubEnv(key,value);
});
afterEach(() => vi.unstubAllEnvs());
it('production requires explicit server mode and is independent of a private development manifest', () => {
  expect(teacherInvitationMode()).toBe('production');
  state.manifest=false;expect(teacherInvitationMode()).toBe('production');
});
it.each([
  ['TEACHER_INVITATIONS_MODE',''],['TEACHER_INVITATIONS_MODE','restricted'],['INSTITUTIONS_ENABLED','false'],
  ['INSTITUTION_HOMOLOGATION_ENABLED','true'],['INSTITUTION_HOMOLOGATION_ENABLED',''],['APP_PUBLIC_URL','http://localhost:5173'],['APP_PUBLIC_URL','https://name:secret@example.invalid'],
  ['BREVO_EMAIL_TRANSPORT',''],['BREVO_SMTP_KEY',''],['JURISSIM_RUNTIME_DATA_SOURCE','original-supabase-restricted'],['LOCAL_EMAIL_CAPTURE_ENABLED','true'],['LOCAL_DIAGNOSTIC_DEMO_MODE','true'],
])('fails closed for inconsistent production setting %s', (key,value) => { vi.stubEnv(key,value);expect(teacherInvitationMode).toThrow('Convites docentes indisponíveis'); });
it('restricted development retains the validated private policy and cannot select production', () => {
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('TEACHER_INVITATIONS_MODE','restricted');vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','true');
  expect(teacherInvitationMode()).toBe('restricted');state.manifest=false;expect(teacherInvitationMode).toThrow();
});
it('a globally enabled institution cannot override a restricted deployment', () => {
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('TEACHER_INVITATIONS_MODE','restricted');vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','true');expect(teacherInvitationMode).toThrow();
});
it('missing environment never falls back to production', () => { vi.stubEnv('NODE_ENV','');expect(teacherInvitationMode).toThrow(); });
it('explicit institutional test mode remains isolated from production', () => { vi.stubEnv('NODE_ENV','test');vi.stubEnv('TEACHER_INVITATIONS_MODE','institutional');expect(teacherInvitationMode()).toBe('institutional'); });
