import { prisma } from '../config/prisma';
import { AuditAction, Nivel, Prisma } from '@prisma/client';
import { ApiError } from '../errors/api-error';

interface DadosQuestao {
  enunciado: string;
  disciplina: string;
  assunto: string;
  nivel: Nivel;
  fundamentacaoJuridica: string;
  publica: boolean;
  autorId: string;
  turmaId?: string;
  alternativas: { texto: string; correta: boolean }[];
}

export class QuestaoRepository {
  static async criar(dados: DadosQuestao, actorId: string) {
    const { alternativas, ...questaoDados } = dados;

    return prisma.$transaction(async (tx) => {
      const questao = await tx.questao.create({
        data: { ...questaoDados, alternativas: { create: alternativas } },
        include: { alternativas: true },
      });
      await tx.auditLog.create({ data: { userId: actorId, action: 'QUESTAO_CRIADA' as AuditAction, resourceId: questao.id } });
      return questao;
    });
  }

  static async listar(filtros: {
    disciplina?: string;
    assunto?: string;
    nivel?: Nivel;
    turmaId?: string;
    autorId?: string;
    somenteDoAutor?: boolean;
  }) {
    const visibilidade: Prisma.QuestaoWhereInput = filtros.somenteDoAutor && filtros.autorId
      ? { autorId: filtros.autorId }
      : {
          OR: [
            { publica: true },
            ...(filtros.turmaId ? [{ turmaId: filtros.turmaId }] : []),
            ...(filtros.autorId ? [{ autorId: filtros.autorId }] : []),
          ],
        };
    return prisma.questao.findMany({
      where: {
        disciplina: filtros.disciplina,
        assunto: filtros.assunto,
        nivel: filtros.nivel,
        ...visibilidade,
      },
      include: { alternativas: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async buscarPorId(id: string) {
    return prisma.questao.findUnique({
      where: { id },
      include: { alternativas: true },
    });
  }

  static async atualizar(id: string, dados: Partial<Omit<DadosQuestao, 'autorId'>>, actorId: string) {
    const { alternativas, ...questaoDados } = dados;
    try {
      return await prisma.$transaction(async (tx) => {
        await this.verificarSemUso(tx, id);
        const questao = await tx.questao.update({
          where: { id },
          data: {
            ...questaoDados,
            ...(alternativas ? { alternativas: { deleteMany: {}, create: alternativas } } : {}),
          },
          include: { alternativas: true },
        });
        await tx.auditLog.create({ data: { userId: actorId, action: 'QUESTAO_ATUALIZADA' as AuditAction, resourceId: id } });
        return questao;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { this.tratarErroDeEscrita(error); }
  }

  static async remover(id: string, actorId: string) {
    try {
      return await prisma.$transaction(async (tx) => {
        await this.verificarSemUso(tx, id);
        await tx.alternativa.deleteMany({ where: { questaoId: id } });
        const questao = await tx.questao.delete({ where: { id } });
        await tx.auditLog.create({ data: { userId: actorId, action: 'QUESTAO_EXCLUIDA' as AuditAction, resourceId: id } });
        return questao;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { this.tratarErroDeEscrita(error); }
  }

  private static async verificarSemUso(tx: Prisma.TransactionClient, id: string) {
    const questao = await tx.questao.findUnique({
      where: { id }, select: { _count: { select: { respostas: true, diagnosticos: true } } },
    });
    if (!questao) throw new ApiError(404, 'Questão não encontrada');
    if (questao._count.respostas || questao._count.diagnosticos) {
      throw new ApiError(409, 'Questão já utilizada em simulado ou resposta; edição e exclusão não são permitidas.');
    }
  }

  private static tratarErroDeEscrita(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003' || error.code === 'P2034') {
        throw new ApiError(409, 'A questão possui vínculos ou foi alterada durante a operação. Atualize os dados e tente novamente.');
      }
      if (error.code === 'P2025') throw new ApiError(404, 'Questão não encontrada');
    }
    throw error;
  }
}
