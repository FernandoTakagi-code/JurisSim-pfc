import { classifyEmailDeliveryFailure } from './email-delivery-failure';
type Flow = 'email_verification' | 'password_recovery' | 'teacher_invitation' | 'teacher_onboarding';
export function emailAccepted(flow: Flow, recordId: string) {
  console.info('email.transactional.accepted', { flow, recordId });
}
export function emailFailed(flow: Flow, recordId: string, error: unknown) {
  const failure = classifyEmailDeliveryFailure(error);
  console.warn('email.transactional.failed', { flow, recordId, outcome: failure.outcome, stage: failure.stage });
}
