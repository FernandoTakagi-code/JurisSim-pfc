export type EmailDeliveryOutcome = 'not_accepted' | 'indeterminate';
export type EmailDeliveryStage =
  | 'dns'
  | 'connect'
  | 'greeting'
  | 'starttls'
  | 'authentication'
  | 'smtp'
  | 'request_deadline'
  | 'provider'
  | 'provider_limit'
  | 'unknown';

export class EmailDeliveryFailure extends Error {
  constructor(
    readonly outcome: EmailDeliveryOutcome,
    readonly stage: EmailDeliveryStage,
  ) {
    super('Transactional email delivery could not be confirmed.');
    this.name = 'EmailDeliveryFailure';
  }
}

export function isIndeterminateEmailDelivery(error: unknown): error is EmailDeliveryFailure {
  return error instanceof EmailDeliveryFailure && error.outcome === 'indeterminate';
}

export function classifyEmailDeliveryFailure(error: unknown): EmailDeliveryFailure {
  if (error instanceof EmailDeliveryFailure) return error;

  const value = error as { code?: unknown; command?: unknown; timeoutType?: unknown } | null;
  const code = String(value?.code ?? '').toUpperCase();
  const command = String(value?.command ?? '').toUpperCase();
  const timeoutType = String(value?.timeoutType ?? '').toUpperCase();

  if (timeoutType === 'CONNECT_TIMEOUT') return new EmailDeliveryFailure('not_accepted', 'connect');
  if (timeoutType === 'GREETING_TIMEOUT') return new EmailDeliveryFailure('not_accepted', 'greeting');
  if (timeoutType === 'UPGRADE_TIMEOUT') return new EmailDeliveryFailure('not_accepted', 'starttls');
  if (timeoutType === 'SOCKET_TIMEOUT') return new EmailDeliveryFailure('indeterminate', 'smtp');
  if (code === 'EAUTH') return new EmailDeliveryFailure('not_accepted', 'authentication');
  if (code === 'EDNS') return new EmailDeliveryFailure('not_accepted', 'dns');
  if (code === 'EENVELOPE') return new EmailDeliveryFailure('not_accepted', 'smtp');
  if (['DATA', 'DATAEND', 'BDAT'].includes(command)) return new EmailDeliveryFailure('indeterminate', 'smtp');
  if (['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'ESOCKET', 'ETLS'].includes(code)) {
    return new EmailDeliveryFailure('not_accepted', 'connect');
  }
  // Once sendMail has been called, unknown failures cannot prove that the relay
  // did not accept the DATA command. Avoid retrying or invalidating its link.
  return new EmailDeliveryFailure('indeterminate', 'unknown');
}
