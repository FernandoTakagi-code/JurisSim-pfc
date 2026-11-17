import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import bcrypt from 'bcrypt';
// The production deletion gate stays hard-disabled. This double exists only in
// this test process, after the disposable database identity is checked.
vi.mock("../../src/account-deletion-availability", () => ({ accountDeletionEnabled: () => true, studentSelfDeletionEnabled: () => true, accountDeletionUnavailableMessage: 'isolated test only' }));
import { prisma, criarUsuario, limparBanco, encerrar, tokenPara } from './helpers';
import { assertDisposableDatabase } from './disposable-database';
import { AuthController } from "../../src/controllers/auth-controller";
import { createAuthRoutes } from "../../src/routes/auth-routes";
import { errorHandler } from "../../src/middlewares/error-handler";
import { AccountEmailChangeService } from "../../src/services/accounts/account-email-change";
import { BrevoAccountEmailChangeSender, type AccountEmailChangeSender } from "../../src/services/email/account-email-change-sender";
import { PasswordRecoveryService } from "../../src/services/accounts/password-recovery-service";
import { BrevoRecoveryEmailSender, type RecoveryEmailSender } from "../../src/services/email/recovery-email-sender";
import { BrevoApiTransport, createBrevoSmtpTransport, type TransactionalEmailTransport } from "../../src/services/email/brevo-email-transport";

const password = 'Profile-test-password1!';
const newPassword = 'New-profile-password2!';
const newEmail = () => `profile-${randomUUID()}@example.invalid`;
let confirmationUrl = '', recoveryUrl = '';
const sender: AccountEmailChangeSender = { isConfigured: true,
  sendConfirmation: vi.fn(async (_to, url) => { confirmationUrl = url; }), sendChangedNotice: vi.fn(async () => {}) };
const recovery: RecoveryEmailSender = { isConfigured: true, sendPasswordRecovery: vi.fn(async email => { recoveryUrl = email.resetUrl; }) };
let server: Server, base: string;
const appUrl = 'http://127.0.0.1:5173';
const emailService = () => new AccountEmailChangeService(sender, appUrl);
const hashToken = (url: string) => new URLSearchParams(new URL(url).hash.split('?')[1]).get('token')!;
async function account() {
  const user = await criarUsuario('ALUNO');
  return prisma.user.update({ where: { id: user.id }, data: { senhaHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date() } });
}
async function call(path: string, body?: object, token?: string, method = 'POST') {
  const response = await fetch(base + '/auth' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
beforeAll(async () => {
  await assertDisposableDatabase(prisma);
  process.env.EMAIL_REUSE_BLOCKS_ENABLED = 'true';
  const controller = new AuthController(undefined, new PasswordRecoveryService(undefined, recovery, appUrl), undefined, undefined, emailService());
  const app = express(); app.use(express.json()); app.use('/auth', createAuthRoutes(controller)); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(async () => { await limparBanco(); vi.clearAllMocks(); confirmationUrl = ''; recoveryUrl = ''; });
afterAll(async () => { delete process.env.EMAIL_REUSE_BLOCKS_ENABLED; await encerrar(server); });

it('confirms email only once, preserves academic identity, invalidates tokens and revokes sessions', async () => {
  const user = await account(), token = tokenPara(user), address = newEmail();
  const history = await prisma.simulado.create({ data: { alunoId: user.id, tipo: 'DIAGNOSTICO', finalizadoEm: new Date() } });
  expect((await call('/account/email-change', { newEmail: address, confirmationEmail: address, senhaAtual: password }, token)).status).toBe(202);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(user.email);
  const confirmation = hashToken(confirmationUrl);
  const stored = await prisma.authToken.findFirstOrThrow({ where: { userId: user.id } });
  expect(stored.tokenHash === confirmation).toBe(false);
  expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(30 * 60_000);
  expect((await call('/account/email-change/confirm', { token: confirmation })).status).toBe(200);
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(updated.email).toBe(address); expect(updated.sessionVersion).toBe(user.sessionVersion + 1);
  expect((await prisma.simulado.findUniqueOrThrow({ where: { id: history.id } })).alunoId).toBe(user.id);
  expect((await call('/session', undefined, token, 'GET')).status).toBe(401);
  expect((await call('/account/email-change/confirm', { token: confirmation })).status).toBe(400);
  expect(sender.sendChangedNotice).toHaveBeenCalledWith(user.email);
});

it('rejects invalid sessions, wrong passwords, malformed/duplicate addresses and mismatched confirmation', async () => {
  const user = await account(), other = await account(), token = tokenPara(user);
  const input = { newEmail: newEmail(), confirmationEmail: '', senhaAtual: password }; input.confirmationEmail = input.newEmail;
  expect((await call('/account/email-change', input)).status).toBe(401);
  expect((await call('/account/email-change', { ...input, senhaAtual: 'wrong' }, token)).status).toBe(400);
  expect((await call('/account/email-change', { ...input, newEmail: 'invalid' }, token)).status).toBe(400);
  expect((await call('/account/email-change', { ...input, confirmationEmail: newEmail() }, token)).status).toBe(400);
  expect((await call('/account/email-change', { ...input, newEmail: other.email.toUpperCase(), confirmationEmail: other.email }, token)).status).toBe(409);
  expect(sender.sendConfirmation).not.toHaveBeenCalled();
});

it('rejects expired and superseded email links and rechecks duplicates at confirmation', async () => {
  const user = await account(), address = newEmail();
  await emailService().request(user.id, { newEmail: address, confirmationEmail: address, senhaAtual: password });
  const token = hashToken(confirmationUrl);
  await prisma.authToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect((await call('/account/email-change/confirm', { token })).status).toBe(400);
  await prisma.authToken.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
  await emailService().request(user.id, { newEmail: address, confirmationEmail: address, senhaAtual: password });
  const second = hashToken(confirmationUrl);
  const other = await account(); await prisma.user.update({ where: { id: other.id }, data: { email: address } });
  expect((await call('/account/email-change/confirm', { token: second })).status).toBe(409);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(user.email);
});

it('rejects stale email confirmation after logout and actually revokes two independent sessions', async () => {
  const user = await account(), address = newEmail(), first = tokenPara(user), second = tokenPara(user);
  await emailService().request(user.id, { newEmail: address, confirmationEmail: address, senhaAtual: password });
  expect((await call('/logout', {}, first)).status).toBe(200);
  expect((await call('/session', undefined, first, 'GET')).status).toBe(401);
  expect((await call('/session', undefined, second, 'GET')).status).toBe(401);
  expect((await call('/account/email-change/confirm', { token: hashToken(confirmationUrl) })).status).toBe(400);
});

it('resets password through mail, enforces password policy and invalidates replay and old sessions', async () => {
  const user = await account(), session = tokenPara(user);
  expect((await call('/password-recovery', { email: user.email })).status).toBe(202);
  const token = hashToken(recoveryUrl);
  expect((await call('/password-reset', { token, senha: 'weak', confirmacaoSenha: 'weak' })).status).toBe(400);
  expect((await call('/password-reset', { token, senha: newPassword, confirmacaoSenha: 'Different-value1!' })).status).toBe(400);
  expect((await call('/password-reset', { token, senha: newPassword, confirmacaoSenha: newPassword })).status).toBe(200);
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(await bcrypt.compare(newPassword, updated.senhaHash!)).toBe(true);
  expect(updated.senhaHash === newPassword).toBe(false);
  expect((await call('/session', undefined, session, 'GET')).status).toBe(401);
  expect((await call('/password-reset', { token, senha: password, confirmacaoSenha: password })).status).toBe(400);
  expect((await call('/login', { email: user.email, senha: newPassword })).status).toBe(200);
});

it('rejects expired recovery tokens and invalidates previous links on a new request', async () => {
  const user = await account(); await call('/password-recovery', { email: user.email });
  const token = hashToken(recoveryUrl);
  const where = { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex') };
  await prisma.passwordRecoveryToken.updateMany({ where, data: { expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 120_000) } });
  expect((await call('/password-reset', { token, senha: newPassword, confirmacaoSenha: newPassword })).status).toBe(400);
  await call('/password-recovery', { email: user.email });
  expect(hashToken(recoveryUrl) === token).toBe(false);
  expect((await call('/password-reset', { token, senha: newPassword, confirmacaoSenha: newPassword })).status).toBe(400);
  const previous = hashToken(recoveryUrl);
  await prisma.passwordRecoveryToken.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
  await call('/password-recovery', { email: user.email });
  expect((await prisma.passwordRecoveryToken.findUniqueOrThrow({ where: { tokenHash: createHash('sha256').update(previous).digest('hex') } })).consumedAt).not.toBeNull();
});

it('exercises safe deletion only in this isolated process and preserves the academic record', async () => {
  const user = await account(), token = tokenPara(user);
  const history = await prisma.simulado.create({ data: { alunoId: user.id, tipo: 'DIAGNOSTICO' } });
  expect((await call('/conta', { confirmation: 'wrong', senhaAtual: password }, token, 'DELETE')).status).toBe(400);
  expect((await call('/conta', { confirmation: 'EXCLUIR', senhaAtual: 'wrong' }, token, 'DELETE')).status).toBe(400);
  expect((await call('/conta', { confirmation: 'EXCLUIR', senhaAtual: password }, token, 'DELETE')).status).toBe(200);
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(updated.deletedAt).not.toBeNull(); expect(updated.email.endsWith('@jurissim.invalid')).toBe(true); expect(updated.senhaHash).toBeNull();
  expect((await prisma.simulado.findUniqueOrThrow({ where: { id: history.id } })).alunoId).toBe(user.id);
  expect((await call('/session', undefined, token, 'GET')).status).toBe(401);
});

it.skipIf(process.env.JURISSIM_PROFILE_SEND_REAL_EMAIL !== 'true')('sends two real Brevo messages only to the explicitly authorized test recipient, using a disposable account', async () => {
  await assertDisposableDatabase(prisma);
  const recipient = process.env.JURISSIM_PROFILE_TEST_RECIPIENT;
  if (!recipient?.includes('@')) throw new Error('An explicitly authorized test recipient is required.');
  // Read only mail configuration; never load the production database URL.
  const config = parse(readFileSync('.env'));
  const transport = (config.BREVO_EMAIL_TRANSPORT ?? 'api').trim() === 'smtp'
    ? createBrevoSmtpTransport(config.BREVO_SMTP_USER, config.BREVO_SMTP_KEY) : new BrevoApiTransport(config.BREVO_API_KEY);
  if (!transport.isConfigured) throw new Error('Configured Brevo transport is unavailable.');
  let accepted = 0;
  const guarded: TransactionalEmailTransport = { isConfigured: true, async send(mail) {
    if (mail.to !== recipient) throw new Error('Refusing delivery outside the authorized test recipient.');
    try { await transport.send({ ...mail, subject: '[TESTE ISOLADO] ' + mail.subject,
      text: 'Conta descartável; este link será consumido automaticamente pelo teste.\n' + mail.text }); accepted++; }
    catch { throw new Error('Brevo did not confirm acceptance; credentials and tokens omitted.'); }
  } };
  const realSender = new BrevoAccountEmailChangeSender(undefined, undefined, guarded);
  const user = await account();
  const emailChange = new AccountEmailChangeService({ isConfigured: true,
    async sendConfirmation(to, url, ttl) { confirmationUrl = url; await realSender.sendConfirmation(to, url, ttl); },
    async sendChangedNotice() { /* The old address is synthetic; never send to it. */ },
  }, appUrl);
  await emailChange.request(user.id, { newEmail: recipient, confirmationEmail: recipient, senhaAtual: password });
  await emailChange.confirm(hashToken(confirmationUrl));
  const realRecovery = new BrevoRecoveryEmailSender(undefined, undefined, guarded);
  const passwords = new PasswordRecoveryService(undefined, { isConfigured: true, async sendPasswordRecovery(mail) { recoveryUrl = mail.resetUrl; await realRecovery.sendPasswordRecovery(mail); } }, appUrl);
  await passwords.requestRecovery(recipient);
  expect(accepted).toBe(2);
  await passwords.resetPassword(hashToken(recoveryUrl), newPassword, newPassword);
  expect(await bcrypt.compare(newPassword, (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).senhaHash!)).toBe(true);
  console.log('PASS: two test messages accepted by configured Brevo transport; both links validated/consumed against the disposable database. Inbox delivery not independently verified.');
}, 60_000);
