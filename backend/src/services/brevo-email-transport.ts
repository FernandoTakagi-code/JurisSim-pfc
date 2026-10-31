import { performance } from 'node:perf_hooks';
import { EmailDeliveryFailure } from './email-delivery-failure';
import { BrevoSmtpClient, OFFICIAL_EMAIL, sharedBrevoSmtpClient } from './brevo-smtp';

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface TransactionalEmailTransport {
  readonly isConfigured: boolean;
  send(email: TransactionalEmail): Promise<void>;
}

export const BREVO_API_SEND_DEADLINE_MS = 8_000;
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export class BrevoApiTransport implements TransactionalEmailTransport {
  readonly isConfigured: boolean;
  private pendingSend?: Promise<void>;

  constructor(
    private readonly apiKey = process.env.BREVO_API_KEY ?? '',
    private readonly request: typeof fetch = fetch,
    private readonly deadlineMs = BREVO_API_SEND_DEADLINE_MS,
  ) {
    this.isConfigured = Boolean(apiKey.trim());
  }

  async send(email: TransactionalEmail): Promise<void> {
    if (!this.isConfigured) throw new Error('Brevo API is not configured.');
    if (this.pendingSend) throw new EmailDeliveryFailure('indeterminate', 'request_deadline');

    const startedAt = performance.now();
    const controller = new AbortController();
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineElapsed = false;
    const operation = (async () => {
      const response = await this.request(BREVO_API_URL, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify({
          sender: { name: 'JurisSim', email: OFFICIAL_EMAIL },
          to: [{ email: email.to }],
          subject: email.subject,
          textContent: email.text,
          htmlContent: email.html,
        }),
        signal: controller.signal,
      });

      if (response.status === 429) {
        throw new EmailDeliveryFailure('not_accepted', 'provider_limit');
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        throw new EmailDeliveryFailure('not_accepted', 'provider');
      }
      if (!response.ok) {
        // A server error or request timeout may happen after Brevo accepted it.
        throw new EmailDeliveryFailure('indeterminate', 'provider');
      }

      let messageId: string | undefined;
      try {
        const body = await response.json() as { messageId?: unknown };
        if (typeof body.messageId === 'string') messageId = body.messageId;
      } catch {
        // A successful status without a readable message id is not enough to
        // tell the caller the delivery was accepted with certainty.
      }
      if (!messageId) throw new EmailDeliveryFailure('indeterminate', 'provider');

      console.info(deadlineElapsed ? 'email.brevo_api.late_accepted' : 'email.brevo_api.accepted', {
        provider: 'brevo_api', elapsedMs: Math.round(performance.now() - startedAt), messageId,
      });
    })().catch((error: unknown) => {
      const failure = error instanceof EmailDeliveryFailure
        ? error
        : new EmailDeliveryFailure('indeterminate', 'unknown');
      console.warn(deadlineElapsed ? 'email.brevo_api.late_result' : 'email.brevo_api.failed', {
        provider: 'brevo_api', elapsedMs: Math.round(performance.now() - startedAt),
        outcome: failure.outcome, stage: failure.stage,
      });
      throw failure;
    });

    this.pendingSend = operation;
    void operation.finally(() => {
      if (this.pendingSend === operation) this.pendingSend = undefined;
    }).catch(() => undefined);

    const deadline = new Promise<never>((_resolve, reject) => {
      deadlineTimer = setTimeout(() => {
        deadlineElapsed = true;
        controller.abort();
        reject(new EmailDeliveryFailure('indeterminate', 'request_deadline'));
      }, this.deadlineMs);
      deadlineTimer.unref?.();
    });

    try {
      await Promise.race([operation, deadline]);
    } catch (error) {
      if (error instanceof EmailDeliveryFailure) throw error;
      throw new EmailDeliveryFailure('indeterminate', 'unknown');
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }
  }
}

class BrevoSmtpTransport implements TransactionalEmailTransport {
  constructor(private readonly smtp: BrevoSmtpClient) {}
  get isConfigured() { return this.smtp.isConfigured; }

  async send(email: TransactionalEmail): Promise<void> {
    await this.smtp.send({
      from: this.smtp.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    }, email.to);
  }
}

export function createBrevoEmailTransport(): TransactionalEmailTransport {
  const selected = (process.env.BREVO_EMAIL_TRANSPORT ?? 'api').trim().toLowerCase();
  if (selected === 'api') return getSharedBrevoApiTransport();
  if (selected === 'smtp') {
    return createBrevoSmtpTransport();
  }
  return { isConfigured: false, async send() { throw new Error('Unsupported Brevo transport.'); } };
}

export function createBrevoSmtpTransport(user?: string, key?: string): TransactionalEmailTransport {
  const useShared = user === undefined && key === undefined;
  return new BrevoSmtpTransport(useShared
    ? sharedBrevoSmtpClient
    : new BrevoSmtpClient(user, key));
}

let sharedBrevoApiTransport: BrevoApiTransport | undefined;
export function getSharedBrevoApiTransport(): BrevoApiTransport {
  return sharedBrevoApiTransport ??= new BrevoApiTransport();
}
