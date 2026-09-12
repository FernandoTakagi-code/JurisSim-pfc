import { prisma } from '../lib/prisma';
import type { Level } from '../types/diagnostic';

export class StudentRepository {
  async updateLevel(studentId: string, level: Level) {
    return prisma.user.update({ where: { id: studentId }, data: { nivelAtual: level } });
  }
}