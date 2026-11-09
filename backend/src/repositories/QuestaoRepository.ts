import { prisma } from '../config/prisma';
import { AuditAction, Nivel, Prisma } from '@prisma/client';
import { ApiError } from '../errors/api-error';
import { fingerprintQuestionContent } from '../services/question-fingerprint';
import { institutionsEnabled } from '../config/institution-feature';
const institutionalVisibility = (): Prisma.TurmaWhereInput => institutionsEnabled()
  ? { OR: [{ institutionalClass: null }, { institutionalClass: { institution: { status: 'ACTIVE' } } }] } : {};

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
  }, actorId: string, actorRole: string, somenteMinhas = false,institutionId?:string) {
    if(institutionId)await this.institutionReader(actorId,actorRole,institutionId);
    if (filtros.turmaId) {
      if(institutionId){
        if(!await prisma.turma.findFirst({where:{id:filtros.turmaId,institutionalClass:{institutionId,institution:{status:'ACTIVE'}}},select:{id:true}}))throw new ApiError(403,'Turma fora da instituição autorizada.');
      }else await this.verificarTurma(prisma, filtros.turmaId, actorId, actorRole);
    }
    return prisma.questao.findMany({
      where: {
        disciplina: filtros.disciplina,
        assunto: filtros.assunto,
        nivel: filtros.nivel,
        turmaId: filtros.turmaId,
        AND: [this.visibilidade(actorId, actorRole,institutionId), ...(somenteMinhas ? [{ autorId: actorId }] : [])],
      },
      select: questaoReadSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  static async buscarPorId(id: string, actorId: string, actorRole: string,institutionId?:string) {
    if(institutionId)await this.institutionReader(actorId,actorRole,institutionId);
    return prisma.questao.findFirst({
      where: { id, AND: [this.visibilidade(actorId, actorRole,institutionId)] },
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
          where: { id, autorId: actorId },
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
        const questao = await tx.questao.delete({ where: { id, autorId: actorId } });
        await tx.auditLog.create({ data: { userId: actorId, action: 'QUESTAO_EXCLUIDA' as AuditAction, resourceId: id } });
        return questao;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { this.tratarErroDeEscrita(error); }
  }

  private static exigirEscrita(role: string) {
    if (role !== 'PROFESSOR') throw new ApiError(403, 'Acesso negado para este papel.');
  }

  private static async institutionReader(actorId:string,actorRole:string,institutionId:string){
    if(actorRole==='ADMIN'||!await prisma.institutionalMembership.findFirst({where:{userId:actorId,institutionId,role:'INSTITUTION_ADMIN',active:true,institution:{status:'ACTIVE'}},select:{id:true}}))throw new ApiError(403,'Leitura institucional não autorizada.');
  }
  private static visibilidade(actorId: string, actorRole: string,institutionId?:string): Prisma.QuestaoWhereInput {
    if (actorRole === 'ADMIN') throw new ApiError(403,'Administração global não possui acesso pedagógico.');
    if(institutionId)return {OR:[{publica:true},{turma:{institutionalClass:{institutionId,institution:{status:'ACTIVE'}}}}]};
    return { OR: [
      { publica: true },
      ...(actorRole === 'PROFESSOR' ? [{ autorId: actorId, turmaId:null }] : []),
      { turma: actorRole === 'ALUNO' ? { alunos: { some: { id: actorId } }, ...institutionalVisibility() } : { professores: { some: { id: actorId } }, ...institutionalVisibility() } },
    ] };
  }

  private static async verificarTurma(tx: Prisma.TransactionClient, id: string, actorId: string, actorRole: string) {
    if(actorRole==='ADMIN')throw new ApiError(403,'Administração global não possui acesso pedagógico.');
    const turma = await tx.turma.findFirst({ where: {
      id,
      ...institutionalVisibility(),
      ...(actorRole === 'ALUNO'
        ? { alunos: { some: { id: actorId } } } : { professores: { some: { id: actorId } } }),
    }, select: { id: true } });
    if (!turma) throw new ApiError(403, 'Turma indisponível para esta conta.');
  }

  private static async verificarSemUso(tx: Prisma.TransactionClient, id: string, actorId: string, actorRole: string) {
    this.exigirEscrita(actorRole);
    const questao = await tx.questao.findUnique({
      where: { id }, select: { autorId: true, turmaId:true, _count: { select: { respostas: true, diagnosticos: true, avaliacoes: true } } },
    });
    if (!questao) throw new ApiError(404, 'Questão não encontrada');
    if (questao.autorId !== actorId) throw new ApiError(403, 'Você não pode alterar esta questão.');
    if(questao.turmaId)await this.verificarTurma(tx,questao.turmaId,actorId,actorRole);
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
