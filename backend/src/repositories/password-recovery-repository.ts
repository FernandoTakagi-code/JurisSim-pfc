import type { AuditAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { GOOGLE_PASSWORD_SENTINEL } from './auth-repository';

export class PasswordRecoveryRepository {
  findAccount(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, senhaHash: true, deletedAt: true },
    });
  }

  createToken(userId: string, tokenHash: string, now: Date, expiresAt: Date) {
    return prisma.$transaction(async tx => {
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!owners.length) return null;
      const since = new Date(now.getTime() - 60 * 60 * 1000);
      const recentRequests = await tx.passwordRecoveryToken.count({
        where: { userId, createdAt: { gte: since } },
      });
      if (recentRequests >= 3) return null;
      const latest = await tx.passwordRecoveryToken.findFirst({ where: { userId, createdAt: { gt: new Date(now.getTime() - 60000) } }, select: { id: true } });
      if (latest) return null;

      await tx.passwordRecoveryToken.updateMany({
        where: { userId, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      const token = await tx.passwordRecoveryToken.create({
        data: { userId, tokenHash, createdAt: now, expiresAt },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { userId, action: 'RECUPERACAO_SENHA_SOLICITADA' as AuditAction, occurredAt: now },
      });
      return token.id;
    });
  }

  invalidateToken(id: string, now: Date) {
    return prisma.passwordRecoveryToken.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: now },
    });
  }

  async isTokenUsable(tokenHash: string, now: Date) {
    const token = await prisma.passwordRecoveryToken.findUnique({
      where: { tokenHash },
      select: { expiresAt: true, consumedAt: true, user: { select: { senhaHash: true, deletedAt: true } } },
    });
    return Boolean(
      token && !token.consumedAt && token.expiresAt > now &&
      !token.user.deletedAt && token.user.senhaHash && token.user.senhaHash !== GOOGLE_PASSWORD_SENTINEL,
    );
  }

  consumeAndReset(tokenHash: string, senhaHash: string, now: Date) {
    return prisma.$transaction(async tx => {
      const token = await tx.passwordRecoveryToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, consumedAt: true },
      });
      if (!token || token.consumedAt || token.expiresAt <= now) return false;
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${token.userId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!owners.length) return false;

      const account = await tx.user.findUnique({
        where: { id: token.userId },
        select: { id: true, senhaHash: true },
      });
      if (!account?.senhaHash || account.senhaHash === GOOGLE_PASSWORD_SENTINEL) return false;

      const claimed = await tx.passwordRecoveryToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) return false;

      const updated = await tx.user.updateMany({
        where: { id: account.id, senhaHash: account.senhaHash, deletedAt: null },
        // One transaction commits password, session revocation, token consumption
        // and audit together. Concurrent password changes retain the hash guard.
        data: { senhaHash, sessionVersion: { increment: 1 } },
      });
      if (updated.count !== 1) throw new Error('Password recovery account changed during reset.');
      await tx.passwordRecoveryToken.updateMany({
        where: { userId: account.id, consumedAt: null }, data: { consumedAt: now },
      });

      await tx.auditLog.create({
        data: { userId: account.id, action: 'SENHA_REDEFINIDA' as AuditAction, occurredAt: now },
      });
      return true;
    });
  }
}
