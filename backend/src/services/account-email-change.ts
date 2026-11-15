import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from '../errors/api-error';
import { prisma } from '../lib/prisma';
import { confirmAccountIdentity } from './account-identity';
import { emailFrontendUrl } from './email-frontend';
import { isValidAppUrl } from './app-url';
import { classifyEmailDeliveryFailure } from './email-delivery-failure';
import { AccountEmailChangeSender } from './account-email-change-sender';
import { GOOGLE_PASSWORD_SENTINEL } from '../repositories/auth-repository';
import { z } from 'zod';
import { withSerializableRetry } from '../repositories/serializable-retry';
import { emailReuseBlocksEnabled } from './email-reuse-policy';

export const ACCOUNT_EMAIL_CHANGE_TTL_MINUTES = 30;
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const hashEmailChangeToken = (token: string) => createHash('sha256').update('account-email-change:').update(token).digest('hex');
const tokenPayload = (token: string): { userId: string; newEmail: string; sessionVersion: number } | null => {
  try {
    const [encoded, secret, extra] = token.split('.');
    if (extra !== undefined) return null;
    if (!encoded || !secret || !/^[A-Za-z0-9_-]{40,}$/.test(secret)) return null;
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { purpose?: string; userId?: string; newEmail?: string; sessionVersion?: number };
    if (value.purpose !== 'account-email-change' || typeof value.userId !== 'string' || typeof value.newEmail !== 'string') return null;
    if (!Number.isSafeInteger(value.sessionVersion) || !z.email().max(254).safeParse(value.newEmail).success) return null;
    return { userId: value.userId, newEmail: normalizeEmail(value.newEmail), sessionVersion: value.sessionVersion! };
  } catch { return null; }
};

export class AccountEmailChangeService {
  constructor(private readonly sender: AccountEmailChangeSender, private readonly publicAppUrl = process.env.APP_PUBLIC_URL) {}

  async request(userId: string, input: { newEmail: string; confirmationEmail: string; senhaAtual?: string }) {
    const newEmail = normalizeEmail(input.newEmail);
    if (!z.email().max(254).safeParse(newEmail).success) throw new ApiError(400, 'Informe um novo e-mail válido.');
    if (newEmail !== normalizeEmail(input.confirmationEmail)) throw new ApiError(400, 'Os e-mails não coincidem.');
    const publicUrl = emailFrontendUrl(this.publicAppUrl);
    if (!this.sender.isConfigured || !isValidAppUrl(publicUrl)) throw new ApiError(503, 'A troca de e-mail está temporariamente indisponível.');

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerifiedAt: true, senhaHash: true, sessionVersion: true, deletedAt: true } });
    if (!user || user.deletedAt) throw new ApiError(401, 'Conta indisponível.');
    if (!user.emailVerifiedAt) throw new ApiError(409, 'Confirme primeiro o e-mail atual da sua conta.');
    if (normalizeEmail(user.email) === newEmail) throw new ApiError(400, 'Informe um e-mail diferente do atual.');
    if (!user.senhaHash || user.senhaHash === GOOGLE_PASSWORD_SENTINEL) throw new ApiError(409, 'Esta conta usa somente o login Google. Para preservar esse acesso, a troca de e-mail requer vincular outro método de login, ainda indisponível.');
    await confirmAccountIdentity(user, { senhaAtual: input.senhaAtual });

    const now = new Date();
    const token = `${Buffer.from(JSON.stringify({ purpose: 'account-email-change', userId, newEmail, sessionVersion: user.sessionVersion })).toString('base64url')}.${randomBytes(32).toString('base64url')}`;
    const tokenHash = hashEmailChangeToken(token);
    const expiresAt = new Date(now.getTime() + ACCOUNT_EMAIL_CHANGE_TTL_MINUTES * 60_000);
    const created = await withSerializableRetry(() => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} AND "deletedAt" IS NULL FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true, sessionVersion: true, deletedAt: true } });
      if (!current || current.deletedAt || !current.emailVerifiedAt || current.email !== user.email || current.sessionVersion !== user.sessionVersion)
        throw new ApiError(409, 'A conta foi alterada. Entre novamente e tente de novo.');
      const matches = await tx.user.findMany({ where: { email: { equals: newEmail, mode: 'insensitive' }, deletedAt: null }, select: { id: true }, take: 1 });
      if (matches.length) throw new ApiError(409, 'Este e-mail já está em uso.');
      if (emailReuseBlocksEnabled() && await tx.emailReuseBlock.findFirst({ where: { emailNormalized: newEmail, revokedAt: null }, select: { id: true } }))
        throw new ApiError(409, 'Este e-mail não está disponível para esta conta.');
      const recent = await tx.authToken.findMany({ where: { userId, type: 'EMAIL_VERIFICATION', createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true }, take: 3 });
      if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < 60_000) throw new ApiError(429, 'Aguarde antes de solicitar outra confirmação.');
      if (recent.length >= 3 && now.getTime() - recent[2]!.createdAt.getTime() < 60 * 60_000) throw new ApiError(429, 'Limite de três confirmações por hora atingido.');
      await tx.authToken.updateMany({ where: { userId, type: 'EMAIL_VERIFICATION', usedAt: null }, data: { usedAt: now } });
      return tx.authToken.create({ data: { userId, tokenHash, type: 'EMAIL_VERIFICATION', createdAt: now, expiresAt }, select: { id: true } });
    }, { isolationLevel: 'Serializable' })).catch(error => {
      if ((error as { code?: string }).code === 'P2002') throw new ApiError(409, 'Este e-mail já está em uso.');
      throw error;
    });

    const url = `${publicUrl}/#/confirm-email-change?token=${encodeURIComponent(token)}`;
    try { await this.sender.sendConfirmation(newEmail, url, ACCOUNT_EMAIL_CHANGE_TTL_MINUTES); }
    catch (error) {
      const outcome = classifyEmailDeliveryFailure(error).outcome;
      if (outcome !== 'indeterminate') await prisma.authToken.updateMany({ where: { id: created.id, usedAt: null }, data: { usedAt: new Date() } });
      throw new ApiError(503, outcome === 'indeterminate'
        ? 'O provedor não confirmou o recebimento. Confira sua caixa de entrada e o spam antes de solicitar outro link.'
        : 'Não foi possível enviar a confirmação. Tente novamente mais tarde.');
    }
    return { message: 'Enviamos uma confirmação ao novo endereço. O e-mail da conta só muda depois que o link for confirmado.' };
  }

  async confirm(token: string) {
    const claims = tokenPayload(token);
    if (!claims) throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');
    const tokenHash = hashEmailChangeToken(token);
    const now = new Date();
    const result = await withSerializableRetry(() => prisma.$transaction(async tx => {
      const record = await tx.authToken.findFirst({ where: { tokenHash, type: 'EMAIL_VERIFICATION', usedAt: null, expiresAt: { gt: now }, userId: claims.userId, user: { deletedAt: null } }, select: { id: true, userId: true } });
      if (!record) throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${claims.userId} AND "deletedAt" IS NULL FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: claims.userId }, select: { email: true, emailVerifiedAt: true, deletedAt: true, sessionVersion: true } });
      if (!user || user.deletedAt || !user.emailVerifiedAt) throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');
      if (user.sessionVersion !== claims.sessionVersion) throw new ApiError(400, 'Link invalidado por uma alteração de segurança. Solicite uma nova troca.');
      const matches = await tx.user.findMany({ where: { email: { equals: claims.newEmail, mode: 'insensitive' }, deletedAt: null }, select: { id: true }, take: 1 });
      if (matches.length) throw new ApiError(409, 'Este e-mail não pode mais ser utilizado. Solicite uma nova troca.');
      if (emailReuseBlocksEnabled() && await tx.emailReuseBlock.findFirst({ where: { emailNormalized: claims.newEmail, revokedAt: null }, select: { id: true } }))
        throw new ApiError(409, 'Este e-mail não está disponível para esta conta.');
      const claimed = await tx.authToken.updateMany({ where: { id: record.id, userId: claims.userId, tokenHash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');
      try {
        await tx.user.update({ where: { id: claims.userId, deletedAt: null }, data: {
          email: claims.newEmail, emailVerifiedAt: now, sessionVersion: { increment: 1 },
          auditLogs: { create: { action: 'EMAIL_CONFIRMADO', occurredAt: now } },
        } });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') throw new ApiError(409, 'Este e-mail não pode mais ser utilizado. Solicite uma nova troca.');
        throw error;
      }
      await tx.authToken.updateMany({ where: { userId: claims.userId, usedAt: null }, data: { usedAt: now } });
      await tx.passwordRecoveryToken.updateMany({ where: { userId: claims.userId, consumedAt: null }, data: { consumedAt: now } });
      return { oldEmail: user.email };
    }, { isolationLevel: 'Serializable' }));
    try { await this.sender.sendChangedNotice(result.oldEmail); }
    catch { console.error('Falha ao enviar notificação de segurança da troca de e-mail.'); }
    return { message: 'E-mail alterado. Entre novamente usando o novo endereço.' };
  }
}
