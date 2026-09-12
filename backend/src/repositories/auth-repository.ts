import { prisma } from '../lib/prisma';

export class AuthRepository {
  findByEmail(email: string) { return prisma.user.findUnique({ where: { email }, select: { id: true, nome: true, email: true, senhaHash: true, role: true } }); }
  findById(id: string) { return prisma.user.findUnique({ where: { id }, select: { id: true, nome: true, email: true, role: true } }); }
  createUser(nome: string, email: string, senhaHash: string, role: 'ALUNO' | 'PROFESSOR') { return prisma.user.create({ data: { nome, email, senhaHash, role }, select: { id: true, nome: true, email: true, role: true } }); }
  async hasCompletedDiagnostic(usuarioId: string) { return Boolean(await prisma.simulado.findFirst({ where: { alunoId: usuarioId, tipo: 'DIAGNOSTICO', finalizadoEm: { not: null } }, select: { id: true } })); }
}
