import { prisma } from '../config/prisma';
import { AuditAction, Nivel, Prisma } from '@prisma/client';
import { ApiError } from '../errors/api-error';
import { fingerprintQuestionContent } from '../services/question-fingerprint';

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

const questaoReadSelect = {
  id: true,
  enunciado: true,
  disciplina: true,
  assunto: true,
  nivel: true,
  fundamentacaoJuridica: true,
  publica: true,
  createdAt: true,
  turmaId: true,
  autorId: true,
  alternativas: { select: { id: true, texto: true, correta: true, questaoId: true } },
} satisfies Prisma.QuestaoSelect;

export class QuestaoRepository {
  static async criar(dados: DadosQuestao, actorId: string, actorRole: string) {
    const { alternativas, ...questaoDados } = dados;
    try {
      return await prisma.$transaction(async (tx) => {
        this.exigirEscrita(actorRole);
        if (dados.turmaId) await this.verificarTurma(tx, dados.turmaId, actorId, actorRole);
        const fingerprint = fingerprintQuestionContent({
          enunciado: dados.enunciado,
          disciplina: dados.disciplina,
          assunto: dados.assunto,
          nivel: dados.nivel,
          alternativas,
        });
        const questao = await tx.questao.create({
          data: { ...questaoDados, fingerprint, alternativas: { create: alternativas } },
          include: { alternativas: true },
        });
        await tx.auditLog.create({ data: { userId: actorId, action: 'QUESTAO_CRIADA' as AuditAction, resourceId: questao.id } });
        return questao;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { this.tratarErroDeEscrita(error); }
  }

  static async listar(filtros: {
    disciplina?: string;
    assunto?: string;
    nivel?: Nivel;
    turmaId?: string;
  }, actorId: string, actorRole: string, somenteMinhas = false) {
    if (filtros.turmaId) await this.verificarTurma(prisma, filtros.turmaId, actorId, actorRole);
    return prisma.questao.findMany({
      where: {
        disciplina: filtros.disciplina,
        assunto: filtros.assunto,
        nivel: filtros.nivel,
        turmaId: filtros.turmaId,
        AND: [this.visibilidade(actorId, actorRole), ...(somenteMinhas ? [{ autorId: actorId }] : [])],
      },
      select: questaoReadSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  static async buscarPorId(id: string, actorId: string, actorRole: string) {
    return prisma.questao.findFirst({
      where: { id, AND: [this.visibilidade(actorId, actorRole)] },
      select: questaoReadSelect,
    });
  }

  static async atualizar(id: string, dados: Partial<Omit<DadosQuestao, 'autorId'>>, actorId: string, actorRole: string) {
    const { alternativas, ...questaoDados } = dados;
    try {
      return await prisma.$transaction(async (tx) => {
        await this.verificarSemUso(tx, id, actorId, actorRole);
        if (dados.turmaId) await this.verificarTurma(tx, dados.turmaId, actorId, actorRole);
        const current = await tx.questao.findUnique({ where: { id }, include: { alternativas: true } });
        if (!current) throw new ApiError(404, 'Questão não encontrada');
        const fingerprint = fingerprintQuestionContent({
          enunciado: dados.enunciado ?? current.enunciado,
          disciplina: dados.disciplina ?? current.disciplina,
          assunto: dados.assunto ?? current.assunto,
          nivel: dados.nivel ?? current.nivel,
          alternativas: alternativas ?? current.alternativas,
        });
        const questao = await tx.questao.update({
          where: { id, ...(actorRole === 'ADMIN' ? {} : { autorId: actorId }) },
          data: {
            ...questaoDados,
            fingerprint,
            ...(alternativas ? { alternativas: { deleteMany: {}, create: alternativas } } : {}),
          },
          include: { alternativas: true },
        });
        await tx.auditLog.create({ data: { userId: actorId, action: 'QUESTAO_ATUALIZADA' as AuditAction, resourceId: id } });
        return questao;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { this.tratarErroDeEscrita(error); }
  }

  static async remover(id: string, actorId: string, actorRole: string) {
    try {
      return await prisma.$transaction(async (tx) => {
        await this.verificarSemUso(tx, id, actorId, actorRole);
        await tx.alternativa.deleteMany({ where: { questaoId: id } });
        const questao = await tx.questao.delete({ where: { id, ...(actorRole === 'ADMIN' ? {} : { autorId: actorId }) } });
        await tx.auditLog.create({ data: { userId: actorId, action: 'QUESTAO_EXCLUIDA' as AuditAction, resourceId: id } });
        return questao;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { this.tratarErroDeEscrita(error); }
  }

  private static exigirEscrita(role: string) {
    if (role !== 'PROFESSOR' && role !== 'ADMIN') throw new ApiError(403, 'Acesso negado para este papel.');
  }

  private static visibilidade(actorId: string, actorRole: string): Prisma.QuestaoWhereInput {
    if (actorRole === 'ADMIN') return {};
    return { OR: [
      { publica: true },
      ...(actorRole === 'PROFESSOR' ? [{ autorId: actorId }] : []),
      { turma: actorRole === 'ALUNO' ? { alunos: { some: { id: actorId } } } : { professores: { some: { id: actorId } } } },
    ] };
  }

  private static async verificarTurma(tx: Prisma.TransactionClient, id: string, actorId: string, actorRole: string) {
    const turma = await tx.turma.findFirst({ where: {
      id,
      ...(actorRole === 'ADMIN' ? {} : actorRole === 'ALUNO'
        ? { alunos: { some: { id: actorId } } } : { professores: { some: { id: actorId } } }),
    }, select: { id: true } });
    if (!turma) throw new ApiError(403, 'Turma indisponível para esta conta.');
  }

  private static async verificarSemUso(tx: Prisma.TransactionClient, id: string, actorId: string, actorRole: string) {
    this.exigirEscrita(actorRole);
    const questao = await tx.questao.findUnique({
      where: { id }, select: { autorId: true, _count: { select: { respostas: true, diagnosticos: true, avaliacoes: true } } },
    });
    if (!questao) throw new ApiError(404, 'Questão não encontrada');
    if (actorRole !== 'ADMIN' && questao.autorId !== actorId) throw new ApiError(403, 'Você não pode alterar esta questão.');
    if (questao._count.respostas || questao._count.diagnosticos || questao._count.avaliacoes) {
      throw new ApiError(409, 'Questão já utilizada em simulado ou resposta; edição e exclusão não são permitidas.');
    }
  }

  private static tratarErroDeEscrita(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ApiError(409, 'Já existe uma questão com este conteúdo.');
      if (error.code === 'P2003' || error.code === 'P2034') {
        throw new ApiError(409, 'A questão possui vínculos ou foi alterada durante a operação. Atualize os dados e tente novamente.');
      }
      if (error.code === 'P2025') throw new ApiError(404, 'Questão não encontrada');
    }
    throw error;
  }
}
