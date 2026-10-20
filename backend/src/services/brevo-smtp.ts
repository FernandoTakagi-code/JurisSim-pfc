import nodemailer, { type Transporter } from 'nodemailer';
export const OFFICIAL_EMAIL = 'jurissimplataforma@gmail.com';

// SMTP authentication is separate from the fixed, official message sender.
export class BrevoSmtpClient {
  readonly isConfigured: boolean;
  readonly from: { name: string; address: string };
  private readonly password: string;
  private readonly user: string;
  private transporter?: Transporter;

  constructor(user = process.env.BREVO_SMTP_USER, smtpKey = process.env.BREVO_SMTP_KEY) {
    this.from = { name: 'JurisSim', address: OFFICIAL_EMAIL };
    this.user = user?.trim() ?? '';
    // SMTP keys are opaque: never apply Gmail app-password whitespace removal.
    this.password = smtpKey ?? '';
    this.isConfigured = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.user) && Boolean(this.password.trim());
  }

  getTransporter(): Transporter {
    if (!this.isConfigured) throw new Error('Brevo SMTP is not configured.');
    return this.transporter ??= nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { minVersion: 'TLSv1.2' },
      auth: { user: this.user, pass: this.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      logger: false,
      debug: false,
    });
  }

  async verify(): Promise<void> {
    await this.getTransporter().verify();
  }
}
