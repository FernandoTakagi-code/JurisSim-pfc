export type EmailVerificationEmail = {
  to: string;
  verifyUrl: string;
  expiresInMinutes: number;
};

export interface EmailVerificationSender {
  readonly isConfigured: boolean;
  sendEmailVerification(email: EmailVerificationEmail): Promise<void>;
}

export class UnconfiguredEmailVerificationSender implements EmailVerificationSender {
  readonly isConfigured = false;

  async sendEmailVerification(_email: EmailVerificationEmail): Promise<void> {
    throw new Error('Email verification provider is not configured.');
  }
}

// Envia o e-mail de verdade usando uma conta Gmail via SMTP (Nodemailer).
// Reaproveita GMAIL_USER e GMAIL_APP_PASSWORD já configurados no .env.
export class GmailEmailVerificationSender implements EmailVerificationSender {
  readonly isConfigured: boolean;
  private transporter?: import('nodemailer').Transporter;

  constructor(
    private readonly gmailUser = process.env.GMAIL_USER,
    private readonly gmailAppPassword = process.env.GMAIL_APP_PASSWORD,
  ) {
    this.isConfigured = Boolean(this.gmailUser && this.gmailAppPassword);
  }

  private async getTransporter() {
    if (!this.transporter) {
      const nodemailer = await import('nodemailer');
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: this.gmailUser, pass: this.gmailAppPassword },
      });
    }
    return this.transporter;
  }

  async sendEmailVerification({ to, verifyUrl, expiresInMinutes }: EmailVerificationEmail): Promise<void> {
    if (!this.isConfigured) throw new Error('Gmail email verification sender is not configured.');
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: `"JurisSim" <${this.gmailUser}>`,
      to,
      subject: 'Confirme seu e-mail — JurisSim',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0b1f3a;">Confirme seu e-mail</h2>
          <p>Falta pouco para começar a usar o JurisSim. Confirme seu e-mail clicando no botão abaixo.</p>
          <p>
            <a href="${verifyUrl}" style="display: inline-block; background: #0b1f3a; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none;">
              Confirmar e-mail
            </a>
          </p>
          <p style="color: #68758a; font-size: 13px;">
            Este link expira em ${expiresInMinutes} minutos. Se você não se cadastrou no JurisSim, ignore este e-mail.
          </p>
          <p style="color: #68758a; font-size: 12px; word-break: break-all;">
            Ou copie e cole este link no navegador: ${verifyUrl}
          </p>
        </div>
      `,
    });
  }
}