import { AuditAction, AuthTokenType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { acceptanceData } from '../services/legal-acceptance';

export const GOOGLE_PASSWORD_SENTINEL = '!GOOGLE_OAUTH_ACCOUNT!';

export class AuthRepository {
  findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true, nome: true, email: true, senhaHash: true, role: true,
        legalAcceptedAt: true, termsVersion: true, privacyVersion: true,
      },
    });
  }
  findById(id: string) { return prisma.user.findUnique({ where: { id }, select: { id: true, nome: true, email: true, role: true } }); }
  findByIdForAuth(id: string) { return prisma.user.findUnique({ where: { id }, select: { id: true, role: true, deletedAt: true } }); }
  findByIdWithSenha(id: string) { return prisma.user.findUnique({ where: { id }, select: { id: true, senhaHash: true } }); }

  createUser(nome: string, email: string, senhaHash: string, role: 'ALUNO' | 'PROFESSOR', acceptance: unknown) {
    const legal = acceptanceData(acceptance);
    return prisma.user.create({
      data: {
        nome, email, senhaHash, role, ...legal,
        auditLogs: { create: [
          legal.auditLogs.create,
          { action: 'USUARIO_CADASTRADO' as AuditAction, occurredAt: legal.legalAcceptedAt },
        ] },
      },
      select: { id: true, nome: true, email: true, role: true },
    });
  }

  createGoogleUser(nome: string, email: string, acceptance: unknown) {
    const legal = acceptanceData(acceptance);
    return prisma.user.create({
      data: {
        nome, email, role: 'ALUNO', senhaHash: GOOGLE_PASSWORD_SENTINEL, ...legal,
        auditLogs: { create: [
          legal.auditLogs.create,
          { action: 'USUARIO_CADASTRADO' as AuditAction, occurredAt: legal.legalAcceptedAt },
        ] },
      },
      select: {
        id: true, nome: true, email: true, role: true, senhaHash: true,
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

  createToken(userId: string, type: AuthTokenType, tokenHash: string, expiresAt: Date) {
    return prisma.authToken.create({ data: { userId, type, tokenHash, expiresAt } });
  }
  findValidToken(tokenHash: string, type: AuthTokenType) {
    return prisma.authToken.findFirst({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
    });
  }
  markTokenUsed(id: string) {
    return prisma.authToken.update({ where: { id }, data: { usedAt: new Date() } });
  }
  markEmailVerified(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
        auditLogs: { create: { action: 'EMAIL_CONFIRMADO' as AuditAction } },
      },
      select: { id: true, nome: true, email: true, role: true },
    });
  }

  anonymizeUser(id: string) {
    return prisma.user.update({
      where: { id },
      data: {
        nome: 'Usuário removido',
        email: `deleted-${id}@jurissim.invalid`,
        senhaHash: null,
        deletedAt: new Date(),
        auditLogs: { create: { action: 'CONTA_EXCLUIDA' as AuditAction } },
      },
    });
  }
}