import { AuditAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { acceptanceData } from '../services/legal-acceptance';

export class AuthRepository {
  findByEmail(email: string) { return prisma.user.findUnique({ where: { email }, select: { id: true, nome: true, email: true, senhaHash: true, role: true } }); }
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
}
