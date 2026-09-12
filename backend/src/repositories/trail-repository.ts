import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { TrailFilter } from '../types/diagnostic';

const trailAttemptDetails = {
  questoes: { orderBy: { posicao: 'asc' }, include: { questao: { include: { alternativas: true } }, resposta: true } },
} satisfies Prisma.SimuladoInclude;

export class TrailRepository {
  async findTrilha(trilhaId: string) {
    return prisma.trilhaAdaptativa.findUnique({
      where: { id: trilhaId },
      include: { simulado: { select: { alunoId: true } } },
    });
  }

  async findQuestionsForTrail(filters: TrailFilter[], quantity: number) {
    const collected: { id: string }[] = [];

    for (const filter of filters) {
      if (collected.length >= quantity) break;
      const found = await prisma.questao.findMany({
        take: quantity - collected.length,
        where: {
          publica: true,
          disciplina: filter.disciplina,
          ...(filter.assunto ? { assunto: filter.assunto } : {}),
          ...(filter.nivel ? { nivel: filter.nivel } : {}),
          id: { notIn: collected.map((question) => question.id) },
        },
        orderBy: { createdAt: 'asc' },
      });
      collected.push(...found);
    }
    return collected;
  }

  async createTrailAttempt(alunoId: string, trilhaId: string, questionIds: string[]) {
    return prisma.$transaction(async (tx) => {
      const simulado = await tx.simulado.create({
        data: {
          tipo: 'PERSONALIZADO',
          alunoId,
          questoes: { create: questionIds.map((questaoId, index) => ({ questaoId, posicao: index + 1 })) },
        },
        include: trailAttemptDetails,
      });
      await tx.trilhaAdaptativa.update({ where: { id: trilhaId }, data: { simuladoGeradoId: simulado.id } });
      return simulado;
    });
  }

  async findAttempt(attemptId: string) {
    return prisma.simulado.findFirst({ where: { id: attemptId, tipo: 'PERSONALIZADO' }, include: trailAttemptDetails });
  }

  async saveAnswer(simuladoId: string, questaoId: string, questaoSimuladoId: string, alternativaEscolhidaId: string, correta: boolean) {
    return prisma.resposta.create({ data: { simuladoId, questaoId, questaoSimuladoId, alternativaEscolhidaId, correta } });
  }

  async finalize(attemptId: string) {
    const marked = await prisma.simulado.updateMany({
      where: { id: attemptId, tipo: 'PERSONALIZADO', finalizadoEm: null },
      data: { finalizadoEm: new Date() },
    });
    return marked.count > 0;
  }
}