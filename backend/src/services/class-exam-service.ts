import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';
import { analyzeDiagnostic } from './adaptive-engine';

type Actor = { userId: string; role: string };
export type ExamInput = { titulo: string; descricao: string; duracaoSegundos: number | null; turmaIds: string[]; questaoIds: string[] };
const classSelect = { id: true, nome: true, createdAt: true, archivedAt: true,
  _count: { select: { alunos: { where: { deletedAt: null } } } } } satisfies Prisma.TurmaSelect;
const examSelect = { id: true, titulo: true, descricao: true, duracaoSegundos: true, createdAt: true, publishedAt: true,
  autorId: true, turmas: { select: { id: true, nome: true, archivedAt: true } },
  questoes: { orderBy: { posicao: 'asc' }, select: { questaoId: true, posicao: true } },
  _count: { select: { tentativas: true } } } satisfies Prisma.AvaliacaoSelect;
const attemptInclude = { avaliacao: { select: { id: true, titulo: true, turmas: { select: { id: true } } } },
  questoes: { orderBy: { posicao: 'asc' }, include: { questao: { include: { alternativas: true } }, resposta: true } },
  desempenhosDiagnostico: true } satisfies Prisma.SimuladoInclude;
type Attempt = Prisma.SimuladoGetPayload<{ include: typeof attemptInclude }>;
const inviteHash = (code: string) => 'sha256:' + createHash('sha256').update(code).digest('hex');
const pageOf = <T>(items: T[], page: number) => ({ items: items.slice(0, 50), page, hasMore: items.length > 50 });

async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2034') {
        if (retry < 2) continue;
        throw new ApiError(409, 'Os dados foram alterados durante a operação. Tente novamente.');
      }
      throw cause;
    }
  }
}
async function lock(tx: Prisma.TransactionClient, table: 'Turma' | 'Avaliacao' | 'Simulado', id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM ${Prisma.raw('"' + table + '"')} WHERE id = ${id} FOR UPDATE`);
}
function staff(actor: Actor) {
  if (!['PROFESSOR', 'ADMIN'].includes(actor.role)) throw new ApiError(403, 'Acesso exclusivo de professores.');
}
const managedClass = (actor: Actor): Prisma.TurmaWhereInput => actor.role === 'ADMIN' ? {} : { professores: { some: { id: actor.userId } } };
const managedExam = (actor: Actor): Prisma.AvaliacaoWhereInput => actor.role === 'ADMIN' ? {} : { autorId: actor.userId };

export class ClassExamService {
  listClasses(actor: Actor, page: number) {
    return prisma.turma.findMany({ where: actor.role === 'ALUNO' ? { alunos: { some: { id: actor.userId } } } : managedClass(actor),
      select: classSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, skip: (page - 1) * 50 }).then(items => pageOf(items, page));
  }

  async createClass(actor: Actor, nome: string) {
    staff(actor); const code = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 86400_000);
    const turma = await prisma.turma.create({ data: { nome, codigoConvite: inviteHash(code), conviteExpiraEm: expiresAt,
      professores: { connect: { id: actor.userId } } }, select: classSelect });
    return { turma, inviteCode: code, expiresAt };
  }

  async updateClass(actor: Actor, id: string, data: { nome?: string; archived?: boolean }) {
    staff(actor);
    return transaction(async tx => {
      await lock(tx, 'Turma', id);
      const turma = await tx.turma.findFirst({ where: { id, ...managedClass(actor) } });
      if (!turma) throw new ApiError(404, 'Turma indisponível para esta conta.');
      if (turma.archivedAt) throw new ApiError(409, 'A turma está arquivada e permanece somente para consulta.');
      return tx.turma.update({ where: { id }, data: { nome: data.nome, ...(data.archived ? { archivedAt: new Date(), conviteExpiraEm: new Date(0) } : {}) }, select: classSelect });
    });
  }

  async rotateInvite(actor: Actor, id: string) {
    staff(actor);
    return transaction(async tx => {
      await lock(tx, 'Turma', id);
      const turma = await tx.turma.findFirst({ where: { id, archivedAt: null, ...managedClass(actor) } });
      if (!turma) throw new ApiError(404, 'Turma ativa indisponível para esta conta.');
      const code = randomBytes(24).toString('base64url'), expiresAt = new Date(Date.now() + 7 * 86400_000);
      await tx.turma.update({ where: { id }, data: { codigoConvite: inviteHash(code), conviteExpiraEm: expiresAt } });
      return { inviteCode: code, expiresAt };
    });
  }

  async join(actor: Actor, code: string) {
    if (actor.role !== 'ALUNO') throw new ApiError(403, 'Somente alunos podem ingressar em turmas.');
    return transaction(async tx => {
      const [found] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "Turma" WHERE "codigoConvite" = ${inviteHash(code)} FOR UPDATE`);
      if (!found) throw new ApiError(404, 'Convite inválido, expirado ou turma indisponível.');
      const turma = await tx.turma.findFirst({ where: { id: found.id, archivedAt: null, conviteExpiraEm: { gt: new Date() } },
        select: { id: true, alunos: { where: { id: actor.userId }, select: { id: true } } } });
      if (!turma) throw new ApiError(404, 'Convite inválido, expirado ou turma indisponível.');
      if (turma.alunos.length) return { joined: false, message: 'Você já está matriculado nesta turma.' };
      await tx.turma.update({ where: { id: turma.id }, data: { alunos: { connect: { id: actor.userId } } } });
      return { joined: true, message: 'Matrícula realizada.' };
    });
  }

  async students(actor: Actor, id: string | undefined, page: number) {
    staff(actor);
    if (id && !await prisma.turma.findFirst({ where: { id, ...managedClass(actor) }, select: { id: true } })) throw new ApiError(404, 'Turma indisponível para esta conta.');
    const items = await prisma.user.findMany({ where: { role: 'ALUNO', deletedAt: null,
      turmasComoAluno: { some: { ...(id ? { id } : {}), ...managedClass(actor) } } },
      select: { id: true, nome: true, email: true }, orderBy: [{ nome: 'asc' }, { id: 'asc' }], take: 51, skip: (page - 1) * 50 });
    return pageOf(items, page);
  }

  async listExams(actor: Actor, page: number) {
    const items = await prisma.avaliacao.findMany({ where: actor.role === 'ALUNO'
      ? { publishedAt: { not: null }, turmas: { some: { archivedAt: null, alunos: { some: { id: actor.userId } } } } }
      : managedExam(actor), select: actor.role === 'ALUNO'
        ? { id: true, titulo: true, descricao: true, duracaoSegundos: true, publishedAt: true, _count: { select: { questoes: true } },
            tentativas: { where: { alunoId: actor.userId }, select: { id: true, finalizadoEm: true } } }
        : examSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, skip: (page - 1) * 50 });
    return pageOf(items, page);
  }

  async saveExam(actor: Actor, data: ExamInput, id?: string) {
    staff(actor);
    return transaction(async tx => {
      if (id) {
        await lock(tx, 'Avaliacao', id);
        const exam = await tx.avaliacao.findFirst({ where: { id, ...managedExam(actor) }, select: { publishedAt: true, _count: { select: { tentativas: true } } } });
        if (!exam) throw new ApiError(404, 'Simulado indisponível para esta conta.');
        if (exam.publishedAt || exam._count.tentativas) throw new ApiError(409, 'Simulados publicados ou iniciados não podem ser alterados.');
      }
      await this.validateSelection(tx, actor, data);
      const fields = { titulo: data.titulo, descricao: data.descricao, duracaoSegundos: data.duracaoSegundos,
        turmas: { set: data.turmaIds.map(id => ({ id })) },
        questoes: { deleteMany: {}, create: data.questaoIds.map((questaoId, i) => ({ questaoId, posicao: i + 1 })) } };
      if (id) return tx.avaliacao.update({ where: { id }, data: fields, select: examSelect });
      return tx.avaliacao.create({ data: { titulo: data.titulo, descricao: data.descricao, duracaoSegundos: data.duracaoSegundos, autorId: actor.userId,
        turmas: { connect: data.turmaIds.map(id => ({ id })) }, questoes: { create: data.questaoIds.map((questaoId, i) => ({ questaoId, posicao: i + 1 })) } }, select: examSelect });
    });
  }

  async publish(actor: Actor, id: string) {
    staff(actor);
    return transaction(async tx => {
      await lock(tx, 'Avaliacao', id);
      const exam = await tx.avaliacao.findFirst({ where: { id, ...managedExam(actor) }, select: examSelect });
      if (!exam) throw new ApiError(404, 'Simulado indisponível para esta conta.');
      if (exam.publishedAt) throw new ApiError(409, 'Este simulado já foi publicado.');
      await this.validateSelection(tx, actor, { titulo: exam.titulo, descricao: exam.descricao, duracaoSegundos: exam.duracaoSegundos,
        turmaIds: exam.turmas.map(t => t.id), questaoIds: exam.questoes.map(q => q.questaoId) });
      return tx.avaliacao.update({ where: { id }, data: { publishedAt: new Date() }, select: examSelect });
    });
  }

  private async validateSelection(tx: Prisma.TransactionClient, actor: Actor, data: ExamInput) {
    const ids = [...data.turmaIds].sort();
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Turma" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
    const classes = await tx.turma.count({ where: { id: { in: ids }, archivedAt: null, ...managedClass(actor) } });
    if (classes !== ids.length) throw new ApiError(403, 'Selecione somente turmas ativas sob sua gestão.');
    // Lock question rows as well so edits and publication cannot race.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Questao" WHERE id IN (${Prisma.join([...data.questaoIds].sort())}) ORDER BY id FOR UPDATE`);
    const questions = await tx.questao.findMany({ where: { id: { in: data.questaoIds } }, include: { alternativas: true } });
    if (questions.length !== data.questaoIds.length || questions.some(q => {
      const readable = actor.role === 'ADMIN' || q.publica || q.autorId === actor.userId || (q.turmaId && ids.includes(q.turmaId));
      const shareable = q.publica || !q.turmaId || ids.every(id => id === q.turmaId);
      return !readable || !shareable || q.alternativas.length < 2 || q.alternativas.filter(a => a.correta).length !== 1;
    })) throw new ApiError(403, 'Há questões indisponíveis ou privadas incompatíveis com as turmas selecionadas.');
  }

  async start(actor: Actor, examId: string) {
    return transaction(async tx => {
      await lock(tx, 'Avaliacao', examId);
      const exam = await tx.avaliacao.findFirst({ where: { id: examId, publishedAt: { not: null } }, include: { questoes: { orderBy: { posicao: 'asc' } }, turmas: { select: { id: true } } } });
      if (!exam || !await tx.turma.findFirst({ where: { id: { in: exam.turmas.map(t => t.id) }, archivedAt: null, alunos: { some: { id: actor.userId } } } })) throw new ApiError(404, 'Simulado publicado indisponível para esta conta.');
      const existing = await tx.simulado.findUnique({ where: { avaliacaoId_alunoId: { avaliacaoId: examId, alunoId: actor.userId } }, select: { id: true } });
      if (existing) return existing;
      return tx.simulado.create({ data: { tipo: 'AVALIACAO', alunoId: actor.userId, avaliacaoId: examId, tempoLimiteSegundos: exam.duracaoSegundos,
        questoes: { create: exam.questoes.map(q => ({ questaoId: q.questaoId, posicao: q.posicao })) } }, select: { id: true } });
    });
  }

  private async ownedAttempt(tx: Prisma.TransactionClient, actor: Actor, id: string) {
    if (actor.role !== 'ALUNO') throw new ApiError(403, 'Recurso exclusivo do aluno da tentativa.');
    const attempt = await tx.simulado.findFirst({ where: { id, alunoId: actor.userId, tipo: 'AVALIACAO',
      avaliacao: { turmas: { some: { alunos: { some: { id: actor.userId } } } } } }, include: attemptInclude });
    if (!attempt) throw new ApiError(404, 'Tentativa indisponível para esta conta.');
    return attempt;
  }
  private deadline(attempt: Attempt) { return attempt.tempoLimiteSegundos === null ? null : new Date(attempt.iniciadoEm.getTime() + attempt.tempoLimiteSegundos * 1000); }
  private result(attempt: Attempt) {
    const result = analyzeDiagnostic(attempt.questoes.map(q => ({ discipline: q.questao.disciplina, topic: q.questao.assunto, difficulty: q.questao.nivel, isCorrect: q.resposta?.correta ?? false })));
    const answered = attempt.questoes.filter(q => q.resposta).length;
    return { id: attempt.id, finalizedAt: attempt.finalizadoEm, overallPercentage: result.overallPercentage, level: result.level,
      correctAnswers: result.correctAnswers, totalQuestions: result.totalQuestions, answeredQuestions: answered,
      incorrectAnswers: answered - result.correctAnswers, unansweredQuestions: result.totalQuestions - answered,
      performances: result.performances.map(p => ({ tipo: p.metricType, disciplina: p.discipline, percentual: p.percentage })),
      recommendation: 'Resultado calculado a partir das respostas registradas neste simulado.', trail: null };
  }
  async attempt(actor: Actor, id: string) {
    const attempt = await this.ownedAttempt(prisma, actor, id);
    const deadline = this.deadline(attempt);
    return { id: attempt.id, titulo: attempt.avaliacao!.titulo, startedAt: attempt.iniciadoEm, deadline,
      serverTime: new Date(), status: attempt.finalizadoEm ? 'COMPLETED' : deadline && deadline.getTime() <= Date.now() ? 'EXPIRED' : 'IN_PROGRESS',
      questions: attempt.questoes.map(q => ({ id: q.questaoId, statement: q.questao.enunciado, discipline: q.questao.disciplina,
        alternatives: q.questao.alternativas.map(a => ({ id: a.id, text: a.texto })), selectedOptionId: q.resposta?.alternativaEscolhidaId ?? null })),
      result: attempt.finalizadoEm ? this.result(attempt) : null };
  }

  async answer(actor: Actor, id: string, questionId: string, selectedOptionId: string) {
    return transaction(async tx => {
      await lock(tx, 'Simulado', id);
      const attempt = await this.ownedAttempt(tx, actor, id), deadline = this.deadline(attempt);
      if (attempt.finalizadoEm || (deadline && deadline.getTime() <= Date.now())) throw new ApiError(409, 'Tentativa concluída ou tempo encerrado.');
      const question = attempt.questoes.find(q => q.questaoId === questionId);
      const option = question?.questao.alternativas.find(a => a.id === selectedOptionId);
      if (!question || !option) throw new ApiError(422, 'Questão ou alternativa não pertence a esta tentativa.');
      await tx.resposta.upsert({ where: { questaoSimuladoId: question.id },
        create: { simuladoId: id, questaoId: questionId, questaoSimuladoId: question.id, alternativaEscolhidaId: option.id, correta: option.correta },
        update: { alternativaEscolhidaId: option.id, correta: option.correta, respondidoEm: new Date() } });
      return { message: 'Resposta registrada.' };
    });
  }

  async finalize(actor: Actor, id: string) {
    return transaction(async tx => {
      await lock(tx, 'Simulado', id);
      const attempt = await this.ownedAttempt(tx, actor, id);
      if (attempt.finalizadoEm) return this.result(attempt);
      const finalizedAt = new Date();
      const analysis = analyzeDiagnostic(attempt.questoes.map(q => ({ discipline: q.questao.disciplina,
        topic: q.questao.assunto, difficulty: q.questao.nivel, isCorrect: q.resposta?.correta ?? false })));
      const updated = await tx.simulado.update({ where: { id }, data: { finalizadoEm: finalizedAt,
        desempenhosDiagnostico: { create: analysis.performances.map(p => ({ tipo: p.metricType, disciplina: p.discipline,
          assunto: p.topic, nivel: p.difficulty, acertos: p.correctAnswers, totalQuestoes: p.totalQuestions, percentual: p.percentage })) },
      }, include: attemptInclude });
      return this.result(updated);
    });
  }
}
