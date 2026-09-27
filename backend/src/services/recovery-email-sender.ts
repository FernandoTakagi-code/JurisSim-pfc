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

export class ConsoleRecoveryEmailSender implements RecoveryEmailSender {
  readonly isConfigured = true;

  async sendPasswordRecovery({ to, resetUrl, expiresInMinutes }: PasswordRecoveryEmail): Promise<void> {
    console.log('\n===== E-MAIL DE RECUPERAÇÃO DE SENHA (SIMULADO) =====');
    console.log(`Para: ${to}`);
    console.log(`Link: ${resetUrl}`);
    console.log(`Expira em: ${expiresInMinutes} minutos`);
    console.log('======================================================\n');
  }
}
// Envia o e-mail de verdade usando uma conta Gmail via SMTP (Nodemailer).
// Requer GMAIL_USER e GMAIL_APP_PASSWORD configurados no .env.
export class GmailRecoveryEmailSender implements RecoveryEmailSender {
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

  async sendPasswordRecovery({ to, resetUrl, expiresInMinutes }: PasswordRecoveryEmail): Promise<void> {
    if (!this.isConfigured) throw new Error('Gmail recovery email sender is not configured.');
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: `"JurisSim" <${this.gmailUser}>`,
      to,
      subject: 'Recuperação de senha — JurisSim',
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
