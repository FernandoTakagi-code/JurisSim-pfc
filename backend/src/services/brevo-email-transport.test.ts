import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrevoApiTransport, BREVO_API_SEND_DEADLINE_MS } from './brevo-email-transport';
import { BrevoEmailVerificationSender } from './email-verification-sender';
import { BrevoRecoveryEmailSender } from './recovery-email-sender';

const message = {
  to: 'recipient@example.test',
  subject: 'Confirme seu e-mail',
  text: 'link reservado',
  html: '<p>link reservado</p>',
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('transporte HTTPS da API transacional Brevo (fetch simulado)', () => {
  it('envia os campos atuais via HTTPS, autentica por header e registra apenas id e duração', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ messageId: '<provider-id>' }), { status: 201 }));
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const transport = new BrevoApiTransport('api-key-test-secret', request);

    await transport.send(message);

    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('api-key')).toBe('api-key-test-secret');
    expect(JSON.parse(String(init?.body))).toEqual({
      sender: { name: 'JurisSim', email: 'jurissimplataforma@gmail.com' },
      to: [{ email: message.to }], subject: message.subject,
      textContent: message.text, htmlContent: message.html,
    });
    expect(log).toHaveBeenCalledWith('email.brevo_api.accepted', expect.objectContaining({ messageId: '<provider-id>' }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('api-key-test-secret');
    expect(JSON.stringify(log.mock.calls)).not.toContain(message.to);
  });

  it.each([
    [400, 'not_accepted', 'provider'],
    [401, 'not_accepted', 'provider'],
    [429, 'not_accepted', 'provider_limit'],
    [500, 'indeterminate', 'provider'],
    [408, 'indeterminate', 'provider'],
  ] as const)('classifies HTTP %i without retry or SMTP fallback', async (status, outcome, stage) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('sensitive provider body', { status }));
    const transport = new BrevoApiTransport('api-key-test-secret', request);
    await expect(transport.send(message)).rejects.toMatchObject({ outcome, stage });
    expect(request).toHaveBeenCalledOnce();
  });

  it('treats a network failure as indeterminate and does not retry', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('private network detail'));
    const transport = new BrevoApiTransport('api-key-test-secret', request);
    await expect(transport.send(message)).rejects.toMatchObject({ outcome: 'indeterminate', stage: 'unknown' });
    expect(request).toHaveBeenCalledOnce();
  });

  it('aborts at the short deadline and blocks a duplicate while the original result is unresolved', async () => {
    let complete!: (response: Response) => void;
    const request = vi.fn<typeof fetch>().mockReturnValue(new Promise<Response>(resolve => { complete = resolve; }));
    const transport = new BrevoApiTransport('api-key-test-secret', request, 10);
    const sending = transport.send(message);
    await expect(sending).rejects.toMatchObject({ outcome: 'indeterminate', stage: 'request_deadline' });
    await expect(transport.send(message)).rejects.toMatchObject({ outcome: 'indeterminate' });
    expect(request).toHaveBeenCalledOnce();
    const init = request.mock.calls[0][1];
    expect(init?.signal?.aborted).toBe(true);
    complete(new Response(JSON.stringify({ messageId: 'late-message-id' }), { status: 201 }));
    await new Promise<void>(resolve => setImmediate(resolve));
  });

  it('requires an API key and uses a bounded default deadline', () => {
    expect(new BrevoApiTransport('').isConfigured).toBe(false);
    expect(BREVO_API_SEND_DEADLINE_MS).toBe(8_000);
  });

  it('does not fall back to available SMTP credentials when API is selected but unconfigured', () => {
    vi.stubEnv('BREVO_EMAIL_TRANSPORT', 'api');
    vi.stubEnv('BREVO_API_KEY', '');
    vi.stubEnv('BREVO_SMTP_USER', 'fixture@smtp-brevo.com');
    vi.stubEnv('BREVO_SMTP_KEY', 'smtp-fixture-only');
    expect(new BrevoEmailVerificationSender().isConfigured).toBe(false);
    expect(new BrevoRecoveryEmailSender().isConfigured).toBe(false);
  });
});
