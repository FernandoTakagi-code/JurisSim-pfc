import { prisma } from '../lib/prisma';

export class AuthRepository {
  findByEmail(email: string) { return prisma.user.findUnique({ where: { email } }); }
  findById(id: string) { return prisma.user.findUnique({ where: { id } }); }

  createStudent(nome: string, email: string, senhaHash: string) {
    return prisma.user.create({ data: { nome, email, senhaHash, role: 'ALUNO' }, select: { id: true, nome: true, email: true } });
  }

  async hasCompletedDiagnostic(usuarioId: string) {
    return Boolean(await prisma.simulado.findFirst({ where: { alunoId: usuarioId, tipo: 'DIAGNOSTICO', finalizadoEm: { not: null } }, select: { id: true } }));
  }
}
