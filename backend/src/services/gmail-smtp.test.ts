import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GmailSmtpClient } from './gmail-smtp';
import { GmailEmailVerificationSender } from './email-verification-sender';
import { GmailRecoveryEmailSender } from './recovery-email-sender';

const mocks = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn(), verify: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, verify: mocks.verify });
  mocks.sendMail.mockResolvedValue({});
  mocks.verify.mockResolvedValue(true);
});

describe('Gmail SMTP compartilhado', () => {
  it('exige STARTTLS e valida a conexão sem enviar mensagens', async () => {
    const smtp = new GmailSmtpClient(' jurissimplataforma@gmail.com ', 'aaaa bbbb cccc dddd');
    await smtp.verify();
    await smtp.verify();
    expect(mocks.createTransport).toHaveBeenCalledOnce();
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.gmail.com', port: 587, secure: false, requireTLS: true,
      tls: { minVersion: 'TLSv1.2' },
      auth: { user: 'jurissimplataforma@gmail.com', pass: 'aaaabbbbccccdddd' },
      logger: false, debug: false,
    }));
    expect(mocks.verify).toHaveBeenCalledTimes(2);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it.each([['', ''], ['jurissimplataforma@gmail.com', ' '], ['invalid', 'test-password'], ['pessoa@gmail.com', 'test-password']])('recusa configuração incompleta ou remetente alheio sem conectar', async (user, password) => {
    const smtp = new GmailSmtpClient(user, password);
    expect(smtp.isConfigured).toBe(false);
    await expect(smtp.verify()).rejects.toThrow('not configured');
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it('envia confirmação e recuperação pelo mesmo remetente, em texto e HTML', async () => {
    const verification = new GmailEmailVerificationSender('jurissimplataforma@gmail.com', 'test-password');
    const recovery = new GmailRecoveryEmailSender('jurissimplataforma@gmail.com', 'test-password');
    await verification.sendEmailVerification({ to: 'recipient@example.com', verifyUrl: 'https://app.example/#/verificar-email', expiresInMinutes: 60 });
    await recovery.sendPasswordRecovery({ to: 'recipient@example.com', resetUrl: 'https://app.example/#/reset-password', expiresInMinutes: 30 });
    expect(mocks.sendMail).toHaveBeenCalledTimes(2);
    for (const [message] of mocks.sendMail.mock.calls) {
      expect(message.from).toEqual({ name: 'JurisSim', address: 'jurissimplataforma@gmail.com' });
      expect(message.to).toBe('recipient@example.com');
      expect(message.text).toContain('https://app.example/#/');
      expect(message.html).toContain('https://app.example/#/');
    }
  });
});
