import { prisma } from '../config/prisma';
import { Nivel } from '@prisma/client';

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
  static async criar(dados: DadosQuestao) {
    const { alternativas, ...questaoDados } = dados;

    return prisma.questao.create({
      data: {
        ...questaoDados,
        alternativas: {
          create: alternativas,
        },
      },
      include: { alternativas: true },
    });
  }

  static async listar(filtros: {
    disciplina?: string;
    assunto?: string;
    nivel?: Nivel;
    turmaId?: string;
  }) {
    return prisma.questao.findMany({
      where: {
        disciplina: filtros.disciplina,
        assunto: filtros.assunto,
        nivel: filtros.nivel,
        OR: [
          { publica: true },
          { turmaId: filtros.turmaId },
        ],
      },
      include: { alternativas: true },
    });
  }

  static async buscarPorId(id: string) {
    return prisma.questao.findUnique({
      where: { id },
      include: { alternativas: true },
    });
  }

  static async atualizar(id: string, dados: Partial<DadosQuestao>) {
    const { alternativas, ...questaoDados } = dados;
    return prisma.questao.update({
      where: { id },
      data: questaoDados,
      include: { alternativas: true },
    });
  }

  static async remover(id: string) {
    return prisma.questao.delete({ where: { id } });
  }
}