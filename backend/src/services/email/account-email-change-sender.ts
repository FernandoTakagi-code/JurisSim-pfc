import { createBrevoEmailTransport, createBrevoSmtpTransport, type TransactionalEmailTransport } from './brevo-email-transport';
import { escapeMail } from './email-html';

export interface AccountEmailChangeSender {
  readonly isConfigured: boolean;
  sendConfirmation(to: string, confirmationUrl: string, expiresInMinutes: number): Promise<void>;
  sendChangedNotice(to: string): Promise<void>;
}

export class BrevoAccountEmailChangeSender implements AccountEmailChangeSender {
  readonly isConfigured: boolean;
  private readonly transport: TransactionalEmailTransport;
  constructor(smtpUser?: string, smtpKey?: string, transport?: TransactionalEmailTransport) {
    this.transport = transport ?? (smtpUser !== undefined || smtpKey !== undefined
      ? createBrevoSmtpTransport(smtpUser, smtpKey) : createBrevoEmailTransport());
    this.isConfigured = this.transport.isConfigured;
  }

  async sendConfirmation(to: string, confirmationUrl: string, expiresInMinutes: number) {
    if (!this.isConfigured) throw new Error('Brevo email-change sender is not configured.');
    await this.transport.send({
      to, subject: 'Confirme a troca de e-mail — JurisSim',
      text: `Confirme a troca do e-mail da sua conta JurisSim: ${confirmationUrl}\nEste link expira em ${expiresInMinutes} minutos. Se você não solicitou a alteração, ignore esta mensagem.`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2 style="color:#0b1f3a">Confirme seu novo e-mail</h2><p>Foi solicitada a troca do e-mail da sua conta JurisSim. Confirme o novo endereço clicando abaixo.</p><p><a href="${escapeMail(confirmationUrl)}" style="display:inline-block;background:#0b1f3a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Confirmar novo e-mail</a></p><p style="color:#68758a;font-size:13px">O link expira em ${expiresInMinutes} minutos. Se você não solicitou a alteração, ignore esta mensagem.</p><p style="color:#68758a;font-size:12px;word-break:break-all">${escapeMail(confirmationUrl)}</p></div>`,
    });
  }

  async sendChangedNotice(to: string) {
    if (!this.isConfigured) throw new Error('Brevo email-change sender is not configured.');
    await this.transport.send({
      to, subject: 'E-mail da conta JurisSim alterado',
      text: 'O e-mail da sua conta JurisSim foi alterado. Se você não fez esta alteração, procure imediatamente o suporte do JurisSim.',
      html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2 style="color:#0b1f3a">E-mail da conta alterado</h2><p>O e-mail da sua conta JurisSim foi alterado. Se você não fez esta alteração, procure imediatamente o suporte do JurisSim.</p></div>',
    });
  }
}
