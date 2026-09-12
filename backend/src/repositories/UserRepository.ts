import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';

export class UserRepository {
  static async criar(dados: {
    nome: string;
    email: string;
    senhaHash: string;
    role: Role;
  }) {
    return prisma.user.create({ data: dados });
  }

  static async buscarPorEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  static async buscarPorId(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }
}