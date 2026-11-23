import nodemailer, { type Transporter } from 'nodemailer';
import { performance } from 'node:perf_hooks';
import { classifyEmailDeliveryFailure, EmailDeliveryFailure } from './email-delivery-failure';
export const OFFICIAL_EMAIL = 'jurissimplataforma@gmail.com';
export const SMTP_SEND_DEADLINE_MS = 15_000;

// A autenticação SMTP é separada do remetente oficial fixo das mensagens.
export class BrevoSmtpClient {
  readonly isConfigured: boolean;
  readonly from: { name: string; address: string };
  private readonly password: string;
  private readonly user: string;
  private transporter?: Transporter;
  private pendingSend?: Promise<void>;
  private readonly sendDeadlineMs: number;

  constructor(user = process.env.BREVO_SMTP_USER, smtpKey = process.env.BREVO_SMTP_KEY, sendDeadlineMs = SMTP_SEND_DEADLINE_MS) {
    this.from = { name: 'JurisSim', address: OFFICIAL_EMAIL };
    this.user = user?.trim() ?? '';
    // Chaves SMTP são opacas: nunca aplicar a remoção de espaços das senhas de app do Gmail.
    this.password = smtpKey ?? '';
    this.isConfigured = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.user) && Boolean(this.password.trim());
    this.sendDeadlineMs = sendDeadlineMs;
  }

  getTransporter(): Transporter {
    if (!this.isConfigured) throw new Error('Brevo SMTP is not configured.');
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { minVersion: 'TLSv1.2' },
      auth: { user: this.user, pass: this.password },
      // Mantém um único pool por processo para que as mensagens transacionais reutilizem
      // conexões STARTTLS. Uma única conexão é conservadora quanto aos limites do relay SMTP.
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      maxRequeues: 0,
      dnsTimeout: 3_000,
      connectionTimeout: 8_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      logger: false,
      debug: false,
    });
    return this.transporter;
  }

  async verify(): Promise<void> {
    await this.getTransporter().verify();
  }

  async send(message: Parameters<Transporter['sendMail']>[0], recipient: string): Promise<void> {
    if (this.pendingSend) {
      throw new EmailDeliveryFailure('indeterminate', 'request_deadline');
    }
    const startedAt = performance.now();
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineElapsed = false;
    let operation: Promise<void>;
    try {
      operation = this.getTransporter().sendMail(message).then((result) => {
        const accepted = Array.isArray(result.accepted) && result.accepted.some((value) =>
          String(value).toLowerCase() === recipient.toLowerCase());
        if (!accepted) throw new EmailDeliveryFailure('not_accepted', 'smtp');
        console.info(deadlineElapsed ? 'email.smtp.late_accepted' : 'email.smtp.accepted', {
          provider: 'brevo', elapsedMs: Math.round(performance.now() - startedAt),
        });
      }).catch((error: unknown) => {
        const failure = classifyEmailDeliveryFailure(error);
        console.warn(deadlineElapsed ? 'email.smtp.late_result' : 'email.smtp.failed', {
          provider: 'brevo',
          elapsedMs: Math.round(performance.now() - startedAt),
          outcome: failure.outcome,
          stage: failure.stage,
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
          reject(new EmailDeliveryFailure('indeterminate', 'request_deadline'));
        }, this.sendDeadlineMs);
        deadlineTimer.unref?.();
      });
      await Promise.race([operation, deadline]);
    } catch (error) {
      if (error instanceof EmailDeliveryFailure && error.stage === 'request_deadline') {
        console.warn('email.smtp.deadline', {
          provider: 'brevo', elapsedMs: Math.round(performance.now() - startedAt), outcome: error.outcome,
        });
        throw error;
      }
      throw classifyEmailDeliveryFailure(error);
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }
  }
}

// Os dois fluxos de autenticação compartilham o mesmo pool de conexões no processo da API.
export const sharedBrevoSmtpClient = new BrevoSmtpClient();
