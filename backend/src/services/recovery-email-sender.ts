import { createBrevoEmailTransport, createBrevoSmtpTransport, type TransactionalEmailTransport } from './brevo-email-transport';

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

// A API v3 HTTPS é o transporte padrão. SMTP permanece disponível por seleção explícita.
export class BrevoRecoveryEmailSender implements RecoveryEmailSender {
  readonly isConfigured: boolean;
  private readonly transport: TransactionalEmailTransport;

  constructor(
    smtpUser?: string,
    smtpKey?: string,
  ) {
    this.transport = smtpUser !== undefined || smtpKey !== undefined
      ? createBrevoSmtpTransport(smtpUser, smtpKey)
      : createBrevoEmailTransport();
    this.isConfigured = this.transport.isConfigured;
  }

  async sendPasswordRecovery({ to, resetUrl, expiresInMinutes }: PasswordRecoveryEmail): Promise<void> {
    if (!this.isConfigured) throw new Error('Brevo recovery email sender is not configured.');
    await this.transport.send({
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
