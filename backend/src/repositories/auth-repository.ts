import { AuditAction, AuthTokenType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { acceptanceData } from '../services/legal-acceptance';
import { ApiError } from '../errors/api-error';

export const GOOGLE_PASSWORD_SENTINEL = '!GOOGLE_OAUTH_ACCOUNT!';

export class AuthRepository {
  findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true, nome: true, email: true, senhaHash: true, role: true, sessionVersion: true,
        legalAcceptedAt: true, termsVersion: true, privacyVersion: true,
        deletedAt: true,
      },
    });
  }
  findById(id: string) { return prisma.user.findUnique({ where: { id }, select: { id: true, nome: true, email: true, role: true, emailVerifiedAt: true, deletedAt: true } }); }
  findByIdForAuth(id: string) { return prisma.user.findUnique({ where: { id }, select: { id: true, role: true, deletedAt: true, emailVerifiedAt: true, sessionVersion: true } }); }
  findByIdWithSenha(id: string) { return prisma.user.findUnique({ where: { id }, select: { id: true, senhaHash: true } }); }

  createUser(nome: string, email: string, senhaHash: string, acceptance: unknown) {
    const legal = acceptanceData(acceptance);
    return prisma.user.create({
      data: {
        nome, email, senhaHash, role: 'ALUNO', ...legal,
        auditLogs: { create: [
          legal.auditLogs.create,
          { action: 'USUARIO_CADASTRADO' as AuditAction, occurredAt: legal.legalAcceptedAt },
        ] },
      },
      select: { id: true, nome: true, email: true, role: true, sessionVersion: true },
    });
  }

  createGoogleUser(nome: string, email: string, acceptance: unknown) {
    const legal = acceptanceData(acceptance);
    return prisma.user.create({
      data: {
        nome, email, role: 'ALUNO', senhaHash: GOOGLE_PASSWORD_SENTINEL, emailVerifiedAt: new Date(), ...legal,
        auditLogs: { create: [
          legal.auditLogs.create,
          { action: 'USUARIO_CADASTRADO' as AuditAction, occurredAt: legal.legalAcceptedAt },
        ] },
      },
      select: {
        id: true, nome: true, email: true, role: true, senhaHash: true, sessionVersion: true,
        legalAcceptedAt: true, termsVersion: true, privacyVersion: true,
      },
    });
  }

  recordGoogleAcceptance(userId: string, acceptance: unknown) {
    const legal = acceptanceData(acceptance);
    return prisma.user.update({
      where: { id: userId },
      data: { ...legal, auditLogs: { create: legal.auditLogs.create } },
      select: { id: true, nome: true, email: true, role: true },
    });
  }

  updateNome(id: string, nome: string) {
    return prisma.user.update({ where: { id }, data: { nome }, select: { id: true, nome: true, email: true, role: true } });
  }
  recordLogin(action: 'LOGIN_SUCESSO' | 'LOGIN_FALHA', userId?: string) {
    return prisma.auditLog.create({ data: { action: action as AuditAction, userId } });
  }
  async hasCompletedDiagnostic(usuarioId: string) { return Boolean(await prisma.simulado.findFirst({ where: { alunoId: usuarioId, tipo: 'DIAGNOSTICO', finalizadoEm: { not: null }}, select: { id: true } })); }
  async hasCompletedInitialDiagnostic(usuarioId: string) {
    return Boolean(await prisma.diagnosticoInicial.findFirst({
      where: { alunoId: usuarioId, simulado: { is: { finalizadoEm: { not: null } } } },
      select: { id: true },
    }));
  }

  createToken(userId: string, type: AuthTokenType, tokenHash: string, expiresAt: Date) {
    if (type !== 'EMAIL_VERIFICATION') return prisma.authToken.create({ data: { userId, type, tokenHash, expiresAt } });
    return prisma.$transaction(async tx => {
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} AND "deletedAt" IS NULL AND "emailVerifiedAt" IS NULL FOR UPDATE`;
      if (!owners.length) throw new ApiError(409, 'Conta indisponível para reenvio. Atualize a sessão.');
      const now = new Date();
      const recent = await tx.authToken.findMany({ where: { userId, type, createdAt: { gt: new Date(now.getTime() - 3600000) } }, select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3 });
      const wait = Math.max(recent[0] ? 60000 - (now.getTime() - recent[0].createdAt.getTime()) : 0, recent.length >= 3 ? 3600000 - (now.getTime() - recent[2].createdAt.getTime()) : 0);
      if (wait > 0) throw new ApiError(429, 'Aguarde antes de solicitar outro e-mail de confirmação. Limite de três por hora.', Math.ceil(wait / 1000));
      await tx.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: now } });
      return tx.authToken.create({ data: { userId, type, tokenHash, expiresAt, createdAt: now } });
    });
  }
  revokeSessions(id: string) {
    return prisma.user.updateMany({ where: { id, deletedAt: null }, data: { sessionVersion: { increment: 1 } } });
  }
  markTokenUsed(id: string) {
    return prisma.authToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
  }
  consumeEmailVerification(tokenHash: string, now: Date) {
    return prisma.$transaction(async tx => {
      const token = await tx.authToken.findFirst({
        where: { tokenHash, type: 'EMAIL_VERIFICATION', usedAt: null, expiresAt: { gt: now }, user: { deletedAt: null } },
        select: { id: true, userId: true },
      });
      if (!token) return false;
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${token.userId} AND "deletedAt" IS NULL AND "emailVerifiedAt" IS NULL FOR UPDATE`;
      if (!owners.length) return false;
      const claimed = await tx.authToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      await tx.user.update({
        where: { id: token.userId, deletedAt: null },
        data: {
          emailVerifiedAt: now,
          auditLogs: { create: { action: 'EMAIL_CONFIRMADO' as AuditAction, occurredAt: now } },
        },
        select: { id: true },
      });
      return true;
    });
  }

  anonymizeUser(id: string) {
    return prisma.$transaction(async tx => {
      // Same lock order as photo replacement, so concurrent uploads cannot
      // restore personal image bytes after the account has been anonymized.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      return tx.user.update({
        where: { id },
        data: {
          nome: 'Usuário removido',
          email: `deleted-${id}@jurissim.invalid`,
          senhaHash: null,
          deletedAt: new Date(),
          profilePhotos: { deleteMany: {} },
          auditLogs: { create: { action: 'CONTA_EXCLUIDA' as AuditAction } },
        },
      });
    });
  }
}
