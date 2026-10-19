import nodemailer, { type Transporter } from 'nodemailer';
export const OFFICIAL_EMAIL = 'jurissimplataforma@gmail.com';

// Both email flows use the same Gmail account and transport settings.
export class GmailSmtpClient {
  readonly isConfigured: boolean;
  readonly from: { name: string; address: string };
  private readonly password: string;
  private transporter?: Transporter;

  constructor(user = process.env.GMAIL_USER, appPassword = process.env.GMAIL_APP_PASSWORD) {
    this.from = { name: 'JurisSim', address: user?.trim() ?? '' };
    this.password = appPassword?.replace(/\s/g, '') ?? '';
    this.isConfigured = this.from.address === OFFICIAL_EMAIL && Boolean(this.password);
  }

  getTransporter(): Transporter {
    if (!this.isConfigured) throw new Error('Gmail SMTP is not configured.');
    return this.transporter ??= nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { minVersion: 'TLSv1.2' },
      auth: { user: this.from.address, pass: this.password },
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
