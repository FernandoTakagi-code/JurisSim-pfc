import { BrevoSmtpClient } from './brevo-smtp';

export type PasswordRecoveryEmail = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export interface RecoveryEmailSender {
  readonly isConfigured: boolean;
  sendPasswordRecovery(email: PasswordRecoveryEmail): Promise<void>;
}

// Intentionally has no fallback that prints or returns the recovery URL.
// A provider adapter must be selected and configured before delivery is enabled.
export class UnconfiguredRecoveryEmailSender implements RecoveryEmailSender {
  readonly isConfigured = false;

  async sendPasswordRecovery(_email: PasswordRecoveryEmail): Promise<void> {
    throw new Error('Recovery email provider is not configured.');
  }
}

// Envia o e-mail de verdade usando o relay Brevo via SMTP (Nodemailer).
// Requer BREVO_SMTP_USER e BREVO_SMTP_KEY configurados no .env.
export class BrevoRecoveryEmailSender implements RecoveryEmailSender {
  readonly isConfigured: boolean;
  private readonly smtp: BrevoSmtpClient;

  constructor(
    smtpUser = process.env.BREVO_SMTP_USER,
    smtpKey = process.env.BREVO_SMTP_KEY,
  ) {
    this.smtp = new BrevoSmtpClient(smtpUser, smtpKey);
    this.isConfigured = this.smtp.isConfigured;
  }

  async sendPasswordRecovery({ to, resetUrl, expiresInMinutes }: PasswordRecoveryEmail): Promise<void> {
    if (!this.isConfigured) throw new Error('Brevo recovery email sender is not configured.');
    const transporter = this.smtp.getTransporter();
    await transporter.sendMail({
      from: this.smtp.from,
      to,
      subject: 'Recuperação de senha — JurisSim',
      text: `Redefina sua senha no JurisSim: ${resetUrl}\nEste link expira em ${expiresInMinutes} minutos. Se você não solicitou a alteração, ignore esta mensagem.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0b1f3a;">Recuperação de senha</h2>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta JurisSim.</p>
          <p>
            <a href="${resetUrl}" style="display: inline-block; background: #0b1f3a; color: #fff; padding: 12px 20px; border-radius: 6px; text-decoration: none;">
              Redefinir minha senha
            </a>
          </p>
          <p style="color: #68758a; font-size: 13px;">
            Este link expira em ${expiresInMinutes} minutos. Se você não solicitou essa alteração, ignore este e-mail.
          </p>
          <p style="color: #68758a; font-size: 12px; word-break: break-all;">
            Ou copie e cole este link no navegador: ${resetUrl}
          </p>
        </div>
      `,
    });
  }
}
