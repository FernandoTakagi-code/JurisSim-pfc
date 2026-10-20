import { BrevoSmtpClient } from './brevo-smtp';

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

// Envia o e-mail de verdade usando o relay Brevo via SMTP (Nodemailer).
// Requer BREVO_SMTP_USER e BREVO_SMTP_KEY no ambiente privado do backend.
export class BrevoEmailVerificationSender implements EmailVerificationSender {
  readonly isConfigured: boolean;
  private readonly smtp: BrevoSmtpClient;

  constructor(
    smtpUser = process.env.BREVO_SMTP_USER,
    smtpKey = process.env.BREVO_SMTP_KEY,
  ) {
    this.smtp = new BrevoSmtpClient(smtpUser, smtpKey);
    this.isConfigured = this.smtp.isConfigured;
  }

  async sendEmailVerification({ to, verifyUrl, expiresInMinutes }: EmailVerificationEmail): Promise<void> {
    if (!this.isConfigured) throw new Error('Brevo email verification sender is not configured.');
    const transporter = this.smtp.getTransporter();
    await transporter.sendMail({
      from: this.smtp.from,
      to,
      subject: 'Confirme seu e-mail — JurisSim',
      text: `Confirme seu e-mail no JurisSim: ${verifyUrl}\nEste link expira em ${expiresInMinutes} minutos. Se você não se cadastrou, ignore esta mensagem.`,
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
