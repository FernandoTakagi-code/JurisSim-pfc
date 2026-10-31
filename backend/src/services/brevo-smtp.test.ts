import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrevoSmtpClient } from './brevo-smtp';
import { EmailDeliveryFailure } from './email-delivery-failure';
import { BrevoEmailVerificationSender } from './email-verification-sender';
import { BrevoRecoveryEmailSender } from './recovery-email-sender';

const mocks = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn(), verify: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, verify: mocks.verify });
  mocks.sendMail.mockResolvedValue({ accepted: ['recipient@example.com'], rejected: [] });
  mocks.verify.mockResolvedValue(true);
});

afterEach(() => vi.unstubAllEnvs());

describe('Brevo SMTP compartilhado (transporte simulado)', () => {
  it('exige STARTTLS e valida a conexão sem enviar mensagens', async () => {
    const smtp = new BrevoSmtpClient(' fixture@smtp-brevo.com ', 'opaque fixture key');
    await smtp.verify();
    await smtp.verify();
    expect(mocks.createTransport).toHaveBeenCalledOnce();
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp-relay.brevo.com', port: 587, secure: false, requireTLS: true,
      tls: { minVersion: 'TLSv1.2' },
      auth: { user: 'fixture@smtp-brevo.com', pass: 'opaque fixture key' },
      pool: true, maxConnections: 1, maxMessages: 100, maxRequeues: 0,
      dnsTimeout: 3_000, connectionTimeout: 8_000, greetingTimeout: 5_000, socketTimeout: 10_000,
      logger: false, debug: false,
    }));
    expect(mocks.verify).toHaveBeenCalledTimes(2);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it.each([['', ''], ['fixture@smtp-brevo.com', ' '], ['invalid', 'test-password'], ['fixture\r\n@smtp-brevo.com', 'test-password']])('recusa configuração incompleta ou login inválido sem conectar', async (user, password) => {
    const smtp = new BrevoSmtpClient(user, password);
    expect(smtp.isConfigured).toBe(false);
    await expect(smtp.verify()).rejects.toThrow('not configured');
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it('envia confirmação e recuperação pelo mesmo remetente, em texto e HTML', async () => {
    const verification = new BrevoEmailVerificationSender('fixture@smtp-brevo.com', 'test-password');
    const recovery = new BrevoRecoveryEmailSender('fixture@smtp-brevo.com', 'test-password');
    await verification.sendEmailVerification({ to: 'recipient@example.com', verifyUrl: 'https://app.example/#/verificar-email', expiresInMinutes: 30 });
    await recovery.sendPasswordRecovery({ to: 'recipient@example.com', resetUrl: 'https://app.example/#/reset-password', expiresInMinutes: 15 });
    expect(mocks.sendMail).toHaveBeenCalledTimes(2);
    for (const [index, [message]] of mocks.sendMail.mock.calls.entries()) {
      expect(message.from).toEqual({ name: 'JurisSim', address: 'jurissimplataforma@gmail.com' });
      expect(message.to).toBe('recipient@example.com');
      expect(message.text).toContain('https://app.example/#/');
      expect(message.html).toContain('https://app.example/#/');
      expect(message.text).toContain(`Este link expira em ${[30, 15][index]} minutos`);
      expect(message.html).toContain(`Este link expira em ${[30, 15][index]} minutos`);
    }
  });

  it('carrega apenas as variáveis Brevo, sem fallback para credenciais Gmail', () => {
    vi.stubEnv('GMAIL_USER', 'jurissimplataforma@gmail.com');
    vi.stubEnv('GMAIL_APP_PASSWORD', 'obsolete-fixture');
    vi.stubEnv('BREVO_SMTP_USER', '');
    vi.stubEnv('BREVO_SMTP_KEY', '');
    expect(new BrevoSmtpClient().isConfigured).toBe(false);
    expect(new BrevoEmailVerificationSender().isConfigured).toBe(false);
    expect(new BrevoRecoveryEmailSender().isConfigured).toBe(false);
    expect(mocks.createTransport).not.toHaveBeenCalled();

    vi.stubEnv('BREVO_SMTP_USER', 'fixture@smtp-brevo.com');
    vi.stubEnv('BREVO_SMTP_KEY', 'local-fixture-only');
    new BrevoSmtpClient().getTransporter();
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      auth: { user: 'fixture@smtp-brevo.com', pass: 'local-fixture-only' },
    }));
  });

  it('impede envio de ambos os fluxos sem configuração', async () => {
    const verification = new BrevoEmailVerificationSender('', '');
    const recovery = new BrevoRecoveryEmailSender('', '');
    await expect(verification.sendEmailVerification({ to: 'recipient@example.com', verifyUrl: 'https://app.example/', expiresInMinutes: 30 })).rejects.toThrow('not configured');
    await expect(recovery.sendPasswordRecovery({ to: 'recipient@example.com', resetUrl: 'https://app.example/', expiresInMinutes: 15 })).rejects.toThrow('not configured');
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('rejects when SMTP does not accept the recipient', async () => {
    mocks.sendMail.mockResolvedValueOnce({ accepted: [], rejected: ['recipient@example.com'] });
    const sender = new BrevoEmailVerificationSender('fixture@smtp-brevo.com', 'test-password');
    await expect(sender.sendEmailVerification({ to: 'recipient@example.com', verifyUrl: 'https://app.example/verify', expiresInMinutes: 30 }))
      .rejects.toMatchObject({ outcome: 'not_accepted', stage: 'smtp' });
  });

  it('records only a sanitized timeout category and never retries an ambiguous send', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const timeout = Object.assign(new Error('password=secret recipient=private@example.com'), { code: 'ETIMEDOUT' });
    mocks.sendMail.mockRejectedValueOnce(timeout);
    const sender = new BrevoRecoveryEmailSender('fixture@smtp-brevo.com', 'test-password');
    await expect(sender.sendPasswordRecovery({ to: 'private@example.com', resetUrl: 'https://app.example/reset?token=secret', expiresInMinutes: 15 }))
      .rejects.toMatchObject({ outcome: 'indeterminate', stage: 'unknown' });
    expect(mocks.sendMail).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith('email.smtp.failed', expect.objectContaining({ outcome: 'indeterminate', stage: 'unknown' }));
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private@example.com');
    warning.mockRestore();
  });

  it.each([
    [{ timeoutType: 'CONNECT_TIMEOUT' }, 'not_accepted', 'connect'],
    [{ timeoutType: 'GREETING_TIMEOUT' }, 'not_accepted', 'greeting'],
    [{ timeoutType: 'UPGRADE_TIMEOUT' }, 'not_accepted', 'starttls'],
    [{ timeoutType: 'SOCKET_TIMEOUT', command: 'DATA' }, 'indeterminate', 'smtp'],
  ])('classifies SMTP timeout phase without exposing provider details', async (metadata, outcome, stage) => {
    mocks.sendMail.mockRejectedValueOnce(Object.assign(new Error('private details'), metadata));
    const smtp = new BrevoSmtpClient('fixture@smtp-brevo.com', 'test-password');
    await expect(smtp.send({ to: 'recipient@example.com' }, 'recipient@example.com'))
      .rejects.toMatchObject({ outcome, stage });
  });

  it('returns promptly at the request deadline and blocks a duplicate while SMTP result is unknown', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    let resolveSend!: (value: { accepted: string[]; rejected: string[] }) => void;
    mocks.sendMail.mockReturnValueOnce(new Promise(resolve => { resolveSend = resolve; }));
    const smtp = new BrevoSmtpClient('fixture@smtp-brevo.com', 'test-password', 10);
    await expect(smtp.send({ to: 'recipient@example.com' }, 'recipient@example.com'))
      .rejects.toMatchObject({ outcome: 'indeterminate', stage: 'request_deadline' });
    await expect(smtp.send({ to: 'recipient@example.com' }, 'recipient@example.com'))
      .rejects.toBeInstanceOf(EmailDeliveryFailure);
    expect(mocks.sendMail).toHaveBeenCalledOnce();
    resolveSend({ accepted: ['recipient@example.com'], rejected: [] });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(info).toHaveBeenCalledWith('email.smtp.late_accepted', expect.objectContaining({ provider: 'brevo' }));
    warning.mockRestore();
    info.mockRestore();
  });
});
