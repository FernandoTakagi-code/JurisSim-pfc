import { AuditAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { acceptanceData } from '../services/legal-acceptance';

// The current database migration requires senhaHash. This sentinel is never a
// usable password hash and is checked before bcrypt.compare in AuthService.
export const GOOGLE_PASSWORD_SENTINEL = '!GOOGLE_OAUTH_ACCOUNT!';

export class AuthRepository {
  findByEmail(email: string) { return prisma.user.findUnique({ where: { email }, select: { id: true, nome: true, email: true, senhaHash: true, role: true, legalAcceptedAt: true, termsVersion: true, privacyVersion: true } }); }
  findById(id: string) { return prisma.user.findUnique({ where: { id }, select: { id: true, nome: true, email: true, role: true } }); }
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
  recordLogin(action: 'LOGIN_SUCESSO' | 'LOGIN_FALHA', userId?: string) {
    // Explicit fields only: never pass login inputs, headers or tokens to the log.
    return prisma.auditLog.create({ data: { action: action as AuditAction, userId } });
  }
  async hasCompletedDiagnostic(usuarioId: string) { return Boolean(await prisma.simulado.findFirst({ where: { alunoId: usuarioId, tipo: 'DIAGNOSTICO', finalizadoEm: { not: null } }, select: { id: true } })); }
    
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
      select: { id: true, nome: true, email: true, role: true },
    });
  }
  recordGoogleAcceptance(userId: string, acceptance: unknown) {
    const legal = acceptanceData(acceptance);
    return prisma.user.update({
      where: { id: userId },
      data: { ...legal, auditLogs: { create: legal.auditLogs.create } },
    });
  }
  updateNome(id: string, nome: string) {
    return prisma.user.update({
      where: { id },
      data: { nome },
      select: { id: true, nome: true, email: true, role: true },
    });
  }
}
