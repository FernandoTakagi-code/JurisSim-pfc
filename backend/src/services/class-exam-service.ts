import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';
import { analyzeDiagnostic } from './adaptive-engine';
import { institutionsEnabled } from '../config/institution-feature';
import { administrativeEvent, institutionalTransaction, type InstitutionActor } from './institution-service';

type Actor = InstitutionActor;
export type ExamInput = { titulo: string; descricao: string; duracaoSegundos: number | null; turmaIds: string[]; questaoIds: string[] };
const classSelect = { id: true, nome: true, createdAt: true, archivedAt: true,
  professores:{select:{id:true,nome:true}},
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
  if (actor.role === 'ADMIN' || !(actor.role === 'PROFESSOR' || (actor.institutionAdmin && actor.institutionId))) throw new ApiError(403, 'Acesso exclusivo de professores.');
}
const managedClass = (actor: Actor): Prisma.TurmaWhereInput => actor.institutionAdmin && actor.institutionId ? {institutionalClass:{institutionId:actor.institutionId}} : { professores: { some: { id: actor.userId } }, ...(actor.allowedClassIds ? { AND: [{ id: { in: actor.allowedClassIds } }] } : {}) };
const managedExam = (actor: Actor): Prisma.AvaliacaoWhereInput => ({
  ...(actor.institutionAdmin?{}:{autorId:actor.userId}),
  turmas:{every:managedClass(actor),some:managedClass(actor)},
});
const activeInstitutionClass = (): Prisma.TurmaWhereInput => institutionsEnabled() ? { OR: [{ institutionalClass: null }, { institutionalClass: { institution: { status: 'ACTIVE' } } }] } : {};
async function classAdministrativeEvent(tx: Prisma.TransactionClient, event: string, actor: Actor, classId: string) {
  if (!institutionsEnabled()) return;
  const link = await tx.institutionalClass.findUnique({ where: { classId }, select: { institutionId: true } });
  await administrativeEvent(tx, event, actor.userId, link?.institutionId ?? actor.institutionId, classId);
}

export class ClassExamService {
  async assignTeacher(actor:Actor,classId:string,userId:string,assigned:boolean){
    if(actor.role==='ADMIN'||!actor.institutionAdmin||!actor.institutionId)throw new ApiError(403,'Designação exclusiva da administração institucional.');
    return institutionalTransaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${actor.institutionId} FOR UPDATE`;
      const admin=await tx.institutionalMembership.findFirst({where:{institutionId:actor.institutionId,userId:actor.userId,role:'INSTITUTION_ADMIN',active:true,institution:{status:'ACTIVE'}}});
      const turma=await tx.turma.findFirst({where:{id:classId,...managedClass(actor)}});
      if(!admin||!turma)throw new ApiError(403,'Turma ou vínculo institucional não autorizado.');
      if(assigned&&!await tx.institutionalMembership.findFirst({where:{institutionId:actor.institutionId,userId,role:'TEACHER',active:true,user:{deletedAt:null,emailVerifiedAt:{not:null}}}}))throw new ApiError(403,'Professor sem vínculo ativo nesta instituição.');
      await tx.turma.update({where:{id:classId},data:{professores:assigned?{connect:{id:userId}}:{disconnect:{id:userId}}},select:{id:true}});
      await administrativeEvent(tx,assigned?'CLASS_TEACHER_ASSIGNED':'CLASS_TEACHER_REMOVED',actor.userId,actor.institutionId,classId);
      return {message:'Designação atualizada. Histórico e propriedade institucional preservados.'};
    });
  }
  async addStudent(actor:Actor,classId:string,email:string){
    staff(actor);
    return institutionalTransaction(async tx=>{
      await lock(tx,'Turma',classId);
      const turma=await tx.turma.findFirst({where:{id:classId,archivedAt:null,...managedClass(actor)}});
      if(!turma)throw new ApiError(404,'Turma ativa indisponível.');
      const student=await tx.user.findFirst({where:{email:{equals:email,mode:'insensitive'},role:'ALUNO',deletedAt:null,emailVerifiedAt:{not:null}},select:{id:true}});
      if(!student)throw new ApiError(404,'Aluno confirmado indisponível. Solicite seu cadastro e confirmação pelo fluxo normal.');
      const control=await tx.accountControl.findUnique({where:{userId:student.id}});
      if(control?.suspended)throw new ApiError(409,'Conta indisponível para matrícula.');
      await tx.turma.update({where:{id:classId},data:{alunos:{connect:{id:student.id}}},select:{id:true}});
      await tx.classJoinRequest.upsert({where:{classId_studentId:{classId,studentId:student.id}},create:{classId,studentId:student.id,status:'APPROVED',decidedAt:new Date()},update:{status:'APPROVED',decidedAt:new Date()}});
      await classAdministrativeEvent(tx,'STUDENT_ADDED',actor,classId);
      return {message:'Aluno vinculado. A conta pessoal e seu histórico foram preservados.'};
    });
  }
  listClasses(actor: Actor, page: number) {
    if(actor.role!=='ALUNO'||actor.institutionAdmin)staff(actor);
    return prisma.turma.findMany({ where: actor.role === 'ALUNO' && !actor.institutionAdmin ? { alunos: { some: { id: actor.userId } }, ...activeInstitutionClass() } : managedClass(actor),
      select: classSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, skip: (page - 1) * 50 }).then(items => pageOf(items, page));
  }

  async createClass(actor: Actor, nome: string) {
    staff(actor); const code = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 86400_000);
    if (institutionsEnabled()) return institutionalTransaction(async tx => {
      if (!actor.institutionId) throw new ApiError(409, 'Selecione uma instituição com vínculo de professor ativo.');
      const membership = await tx.institutionalMembership.findFirst({ where: { institutionId: actor.institutionId, userId: actor.userId, role: actor.institutionAdmin ? 'INSTITUTION_ADMIN' : 'TEACHER', active: true, institution: { status: 'ACTIVE' } } });
      if (!membership) throw new ApiError(403, 'Vínculo institucional não autorizado.');
      const turma = await tx.turma.create({ data: { nome, codigoConvite: inviteHash(code), conviteExpiraEm: expiresAt, ...(actor.institutionAdmin ? {} : {professores: { connect: { id: actor.userId } }}) }, select: classSelect });
      await tx.institutionalClass.create({ data: { classId: turma.id, institutionId: actor.institutionId } });
      await administrativeEvent(tx, 'CLASS_CREATED', actor.userId, actor.institutionId, turma.id);
      return { turma, inviteCode: code, expiresAt };
    });
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
      const result = await tx.turma.update({ where: { id }, data: { nome: data.nome, ...(data.archived ? { archivedAt: new Date(), conviteExpiraEm: new Date(0) } : {}) }, select: classSelect });
      await classAdministrativeEvent(tx, data.archived ? 'CLASS_ARCHIVED' : 'CLASS_UPDATED', actor, id);
      return result;
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
      await classAdministrativeEvent(tx, 'CLASS_CODE_ROTATED', actor, id);
      return { inviteCode: code, expiresAt };
    });
  }

  async join(actor: Actor, code: string) {
    if (actor.role !== 'ALUNO'||actor.institutionAdmin) throw new ApiError(403, 'Somente alunos no contexto pessoal podem solicitar matrícula. Professores são designados pela instituição.');
    return transaction(async tx => {
      const [found] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "Turma" WHERE "codigoConvite" = ${inviteHash(code)} FOR UPDATE`);
      if (!found) throw new ApiError(404, 'Convite inválido, expirado ou turma indisponível.');
      const turma = await tx.turma.findFirst({ where: { id: found.id, archivedAt: null, conviteExpiraEm: { gt: new Date() } },
        select: { id: true, alunos: { where: { id: actor.userId }, select: { id: true } } } });
      if (!turma) throw new ApiError(404, 'Convite inválido, expirado ou turma indisponível.');
      if (turma.alunos.length) return { joined: false, message: 'Você já está matriculado nesta turma.' };
      if (institutionsEnabled()) {
        const link = await tx.institutionalClass.findUnique({ where: { classId: turma.id }, include: { institution: { select: { status: true } } } });
        if (link && link.institution.status !== 'ACTIVE') throw new ApiError(404, 'Turma indisponível.');
        const existing = await tx.classJoinRequest.findUnique({ where: { classId_studentId: { classId: turma.id, studentId: actor.userId } } });
        if (existing?.status === 'PENDING') return { joined: false, message: 'Sua solicitação aguarda aprovação do professor.' };
        await tx.classJoinRequest.upsert({ where: { classId_studentId: { classId: turma.id, studentId: actor.userId } },
          create: { classId: turma.id, studentId: actor.userId }, update: { status: 'PENDING', createdAt: new Date(), decidedAt: null } });
        await administrativeEvent(tx, 'STUDENT_JOIN_REQUESTED', actor.userId, link?.institutionId, turma.id);
        const teachers = await tx.turma.findUnique({ where: { id: turma.id }, select: { professores: { select: { id: true } } } });
        if (teachers?.professores.length) await tx.administrativeNotification.createMany({ data: teachers.professores.map(p => ({ userId: p.id, message: `Nova solicitação de entrada na turma ${turma.id}.` })) });
        return { joined: false, message: 'Solicitação enviada. O acesso será liberado após aprovação do professor.' };
      }
      await tx.turma.update({ where: { id: turma.id }, data: { alunos: { connect: { id: actor.userId } } } });
      return { joined: true, message: 'Matrícula realizada.' };
    });
  }

  async joinRequests(actor: Actor, classId: string | undefined, page: number) {
    if (!institutionsEnabled()) throw new ApiError(503, 'Gestão institucional não ativada.');
    if (actor.role !== 'ALUNO' || actor.institutionAdmin) {
      staff(actor);
      if (!classId || !await prisma.turma.findFirst({ where: { id: classId, ...managedClass(actor) }, select: { id: true } })) throw new ApiError(404, 'Turma indisponível.');
    }
    const items = await prisma.classJoinRequest.findMany({ where: actor.role === 'ALUNO' && !actor.institutionAdmin ? { studentId: actor.userId } : { classId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, skip: (page - 1) * 50 });
    const students = actor.role === 'ALUNO' && !actor.institutionAdmin ? [] : await prisma.user.findMany({ where: { id: { in: items.map(i => i.studentId) }, deletedAt: null }, select: { id: true, nome: true } });
    const classes = await prisma.turma.findMany({ where: { id: { in: items.map(i => i.classId) } }, select: { id: true, nome: true } });
    return pageOf(items.map(i => ({ ...i, studentName: students.find(s => s.id === i.studentId)?.nome, className: classes.find(c => c.id === i.classId)?.nome })), page);
  }

  async decideJoin(actor: Actor, classId: string, requestId: string, approve: boolean) {
    staff(actor);
    return institutionalTransaction(async tx => {
      await lock(tx, 'Turma', classId);
      if (!await tx.turma.findFirst({ where: { id: classId, archivedAt: null, ...managedClass(actor) }, select: { id: true } })) throw new ApiError(404, 'Turma indisponível.');
      const request = await tx.classJoinRequest.findFirst({ where: { id: requestId, classId, status: 'PENDING' } });
      if (!request) throw new ApiError(409, 'Solicitação já decidida ou indisponível.');
      const student = await tx.user.findFirst({ where: { id: request.studentId, role: 'ALUNO', deletedAt: null, emailVerifiedAt: { not: null } }, select: { id: true } });
      if (approve && !student) throw new ApiError(409, 'Conta do aluno indisponível ou e-mail não confirmado.');
      await tx.classJoinRequest.update({ where: { id: requestId }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedAt: new Date() } });
      if (approve) await tx.turma.update({ where: { id: classId }, data: { alunos: { connect: { id: request.studentId } } }, select: { id: true } });
      await tx.administrativeNotification.create({ data: { userId: request.studentId, message: `Solicitação para a turma ${classId}: ${approve ? 'aprovada' : 'recusada'}.` } });
      await classAdministrativeEvent(tx, approve ? 'STUDENT_JOIN_APPROVED' : 'STUDENT_JOIN_REJECTED', actor, classId);
      return { message: approve ? 'Aluno aprovado.' : 'Solicitação recusada.' };
    });
  }

  async removeStudent(actor: Actor, classId: string, studentId: string) {
    staff(actor);
    return institutionalTransaction(async tx => {
      await lock(tx, 'Turma', classId);
      if (!await tx.turma.findFirst({ where: { id: classId, ...managedClass(actor), alunos: { some: { id: studentId } } }, select: { id: true } })) throw new ApiError(404, 'Aluno ou turma indisponível.');
      await tx.turma.update({ where: { id: classId }, data: { alunos: { disconnect: { id: studentId } } }, select: { id: true } });
      await tx.classJoinRequest.updateMany({ where: { classId, studentId }, data: { status: 'REMOVED', decidedAt: new Date() } });
      await classAdministrativeEvent(tx, 'STUDENT_REMOVED', actor, classId);
      return { message: 'Aluno removido. Histórico individual preservado.' };
    });
  }

  async disableInvite(actor: Actor, id: string) {
    staff(actor);
    return transaction(async tx => {
      await lock(tx, 'Turma', id);
      if (!await tx.turma.findFirst({ where: { id, ...managedClass(actor) }, select: { id: true } })) throw new ApiError(404, 'Turma indisponível.');
      await tx.turma.update({ where: { id }, data: { conviteExpiraEm: new Date(0) }, select: { id: true } });
      await classAdministrativeEvent(tx, 'CLASS_CODE_DISABLED', actor, id);
      return { message: 'Código desativado.' };
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
    if(actor.role!=='ALUNO'||actor.institutionAdmin)staff(actor);
    const personalStudent=actor.role==='ALUNO'&&!actor.institutionAdmin;
    const items = await prisma.avaliacao.findMany({ where: personalStudent
      ? { publishedAt: { not: null }, turmas: { some: { archivedAt: null, alunos: { some: { id: actor.userId } }, ...activeInstitutionClass() } } }
      : managedExam(actor), select: personalStudent
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
      const readable = q.publica || (!q.turmaId && q.autorId === actor.userId) || (q.turmaId && ids.includes(q.turmaId));
      const shareable = q.publica || !q.turmaId || ids.every(id => id === q.turmaId);
      return !readable || !shareable || q.alternativas.length < 2 || q.alternativas.filter(a => a.correta).length !== 1;
    })) throw new ApiError(403, 'Há questões indisponíveis ou privadas incompatíveis com as turmas selecionadas.');
  }

  async start(actor: Actor, examId: string) {
    if(actor.role!=='ALUNO'||actor.institutionAdmin)throw new ApiError(403,'Tentativas pertencem ao contexto pessoal do aluno.');
    return transaction(async tx => {
      await lock(tx, 'Avaliacao', examId);
      const exam = await tx.avaliacao.findFirst({ where: { id: examId, publishedAt: { not: null } }, include: { questoes: { orderBy: { posicao: 'asc' } }, turmas: { select: { id: true } } } });
      if (!exam || !await tx.turma.findFirst({ where: { id: { in: exam.turmas.map(t => t.id) }, archivedAt: null, alunos: { some: { id: actor.userId } }, ...activeInstitutionClass() } })) throw new ApiError(404, 'Simulado publicado indisponível para esta conta.');
      const existing = await tx.simulado.findUnique({ where: { avaliacaoId_alunoId: { avaliacaoId: examId, alunoId: actor.userId } }, select: { id: true } });
      if (existing) return existing;
      return tx.simulado.create({ data: { tipo: 'AVALIACAO', alunoId: actor.userId, avaliacaoId: examId, tempoLimiteSegundos: exam.duracaoSegundos,
        questoes: { create: exam.questoes.map(q => ({ questaoId: q.questaoId, posicao: q.posicao })) } }, select: { id: true } });
    });
  }

  private async ownedAttempt(tx: Prisma.TransactionClient, actor: Actor, id: string) {
    if (actor.role !== 'ALUNO'||actor.institutionAdmin) throw new ApiError(403, 'Recurso exclusivo do aluno da tentativa.');
    const attempt = await tx.simulado.findFirst({ where: { id, alunoId: actor.userId, tipo: 'AVALIACAO',
      avaliacao: { turmas: { some: { alunos: { some: { id: actor.userId } }, ...activeInstitutionClass() } } } }, include: attemptInclude });
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
