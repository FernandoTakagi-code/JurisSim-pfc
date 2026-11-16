import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../errors/api-error';
import { analyzeDiagnostic } from '../diagnostics/adaptive-engine';
import { institutionsEnabled, institutionalExamManagementEnabled } from '../../config/institution-feature';
import { administrativeEvent, institutionalTransaction, fixtureProvenance, type InstitutionActor } from '../institutions/institution-service';
import { homologationClassBoundary, assertRestrictedInstitution, assertRestrictedParticipant, restrictedInstitutionId, restrictedOperationsEnabled, homologationManifest } from '../../config/institution-homologation';

import { classLifecycleReady, classActivitiesReady, examSettingsReady, visibleClasses } from './class-lifecycle';
import {activityQuestionSelectable,activityPilotQuestion,activityDescription} from './class-activity-eligibility';
type Actor = InstitutionActor;
export type ExamInput = { titulo: string; descricao: string; duracaoSegundos: number | null; turmaIds: string[]; questaoIds: string[]; expectedQuestions?:number; responsibleTeacherId?:string };
const classSelect = { id: true, nome: true, createdAt: true, archivedAt: true,
  professores:{select:{id:true,nome:true}},
  _count: { select: { alunos: { where: { deletedAt: null } } } } } satisfies Prisma.TurmaSelect;
const examSelect = { id: true, titulo: true, descricao: true, duracaoSegundos: true, createdAt: true, publishedAt: true,
  autorId: true, turmas: { select: { id: true, nome: true, archivedAt: true } },
  questoes: { orderBy: { posicao: 'asc' }, select: { questaoId: true, posicao: true } },
  _count: { select: { tentativas: true, questoes: true } } } satisfies Prisma.AvaliacaoSelect;
const attemptInclude = { avaliacao: { select: { id: true, titulo: true, turmas: { select: { id: true } } } },
  questoes: { orderBy: { posicao: 'asc' }, include: { questao: { include: { alternativas: true } }, resposta: true } },
  desempenhosDiagnostico: true } satisfies Prisma.SimuladoInclude;
type Attempt = Prisma.SimuladoGetPayload<{ include: typeof attemptInclude }>;
const inviteHash = (code: string) => 'sha256:' + createHash('sha256').update(code).digest('hex');
const pageOf = <T>(items: T[], page: number) => ({ items: items.slice(0, 50), page, hasMore: items.length > 50 });
// Assessment selection uses the existing bank, never grants bank-management rights.
const eligibleForExam = (q:{publica:boolean;autorId?:string|null;turmaId?:string|null;alternativas:{correta:boolean}[]},actor:Actor,ids:string[]) => {
  const readable=q.publica||(!q.turmaId&&q.autorId===actor.userId)||!!(q.turmaId&&ids.includes(q.turmaId));
  const shareable=q.publica||!q.turmaId||ids.every(id=>id===q.turmaId);
  return readable&&shareable&&q.alternativas.length>=2&&q.alternativas.filter(a=>a.correta).length===1;
};

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
export function staff(actor: Actor) {
  homologationClassBoundary(); // Refuse stale scope before any legacy fallback.
  if(restrictedInstitutionId()) {
    if(!restrictedOperationsEnabled()) throw new ApiError(403,'Vínculo institucional ativo obrigatório.');
    assertRestrictedInstitution(actor.institutionId ?? '');
  }
  if (actor.role === 'ADMIN' || !(actor.role === 'PROFESSOR' || (actor.institutionAdmin && actor.institutionId))) throw new ApiError(403, 'Acesso exclusivo de professores.');
}
function examStaff(actor: Actor) {
  staff(actor);
  if (actor.institutionAdmin && !institutionalExamManagementEnabled())
    throw new ApiError(503, 'A gestão institucional de simulados está desativada neste ambiente.');
}
export const managedClass = async (actor: Actor,history=false): Promise<Prisma.TurmaWhereInput> => {
  const base: Prisma.TurmaWhereInput = actor.institutionAdmin && actor.institutionId ? {institutionalClass:{institutionId:actor.institutionId}} : { professores: { some: { id: actor.userId } }, ...(actor.allowedClassIds ? { AND: [{ id: { in: actor.allowedClassIds } }] } : {}) };
  const boundary=homologationClassBoundary();
  const visible=history?{}:await visibleClasses();
  if (!Object.keys(visible).length) return boundary?{AND:[base,boundary]}:base;
  return { AND: [base, ...(boundary ? [boundary] : []), visible] };
};
const managedExam = async (actor: Actor,history=false): Promise<Prisma.AvaliacaoWhereInput> => ({
  ...(actor.institutionAdmin?{}:{autorId:actor.userId}),
  turmas:{every:await managedClass(actor,history),some:await managedClass(actor,history)},
});
const activeInstitutionClass = (): Prisma.TurmaWhereInput => homologationClassBoundary() ?? (institutionsEnabled() ? { OR: [{ institutionalClass: null }, { institutionalClass: { institution: { status: 'ACTIVE' } } }] } : {});
// Legacy enrollments may have no request record. A pending/refused/removed
// request never grants access, even if an inconsistent relation still exists.
export const enrolledClass = async (studentId: string): Promise<Prisma.TurmaWhereInput> => ({ alunos: { some: { id: studentId } },
  AND: [await visibleClasses(), activeInstitutionClass(), { OR: [
    { joinRequests: { none: { studentId } } }, { joinRequests: { some: { studentId, status: 'APPROVED' } } },
  ] }],
});
async function classAdministrativeEvent(tx: Prisma.TransactionClient, event: string, actor: Actor, classId: string) {
  if (!institutionsEnabled()) return;
  const link = await tx.institutionalClass.findUnique({ where: { classId }, select: { institutionId: true } });
  await administrativeEvent(tx, event, actor.userId, link?.institutionId ?? actor.institutionId, classId);
}

export class ClassExamService {
  async examDetails(actor:Actor,id:string,page=1,activity=false){
    examStaff(actor);
    return prisma.$transaction(async tx=>{
      const exam=await tx.avaliacao.findFirst({where:{id,...await managedExam(actor,true)},include:{turmas:{select:{id:true,nome:true}},questoes:{orderBy:{posicao:'asc'},include:{questao:{include:{alternativas:{orderBy:{letra:'asc'}}}}}}}});
      if(!exam)throw new ApiError(404,'Avaliação indisponível para esta conta.');
      const metadata=await classActivitiesReady()?await tx.classActivity.findUnique({where:{evaluationId:id}}):null;
      if(Boolean(metadata)!==activity)throw new ApiError(404,'Avaliação indisponível neste fluxo.');
      const [stats]=await tx.$queryRaw<{participants:number;attempts:number;completed:number;meanPercentage:number|null}[]>`WITH scores AS (
        SELECT s.id,s."alunoId",s."finalizadoEm",count(q.id) AS total,count(r.id) FILTER(WHERE r.correta) AS correct
        FROM "Simulado" s LEFT JOIN "QuestaoSimulado" q ON q."simuladoId"=s.id LEFT JOIN "Resposta" r ON r."questaoSimuladoId"=q.id
        WHERE s."avaliacaoId"=${id} AND s.tipo='AVALIACAO' GROUP BY s.id)
        SELECT count(DISTINCT "alunoId")::int AS participants,count(*)::int AS attempts,count(*) FILTER(WHERE "finalizadoEm" IS NOT NULL)::int AS completed,
        round(avg(CASE WHEN "finalizadoEm" IS NOT NULL AND total>0 THEN 100.0*correct/total END),2)::float AS "meanPercentage" FROM scores`;
      const attempts=await tx.simulado.findMany({where:{avaliacaoId:id,tipo:'AVALIACAO'},orderBy:[{iniciadoEm:'desc'},{id:'desc'}],skip:(page-1)*20,take:21,select:{id:true,aluno:{select:{id:true,nome:true}},iniciadoEm:true,finalizadoEm:true,questoes:{select:{questao:{select:{disciplina:true,assunto:true,nivel:true}},resposta:{select:{correta:true}}}}}});
      return {id:exam.id,titulo:exam.titulo,descricao:exam.descricao,publishedAt:exam.publishedAt,turmas:exam.turmas,maxPoints:metadata?.maxPoints??null,questionCount:exam.questoes.length,statistics:stats,questions:exam.questoes.map(q=>({id:q.questaoId,enunciado:q.questao.enunciado,disciplina:q.questao.disciplina,assunto:q.questao.assunto,nivel:q.questao.nivel,alternativas:q.questao.alternativas.map(a=>({letra:a.letra,texto:a.texto,correta:a.correta}))})),results:{items:attempts.slice(0,20).map(a=>{
        const total=a.questoes.length,correct=a.questoes.filter(q=>q.resposta?.correta).length,answered=a.questoes.filter(q=>q.resposta).length,percentage=a.finalizadoEm&&total?Math.round(10000*correct/total)/100:null;
        return {id:a.id,studentId:a.aluno.id,studentName:a.aluno.nome,startedAt:a.iniciadoEm,finalizedAt:a.finalizadoEm,status:a.finalizadoEm?'COMPLETED':'IN_PROGRESS',correctAnswers:correct,incorrectAnswers:answered-correct,unansweredQuestions:total-answered,totalQuestions:total,percentage,points:metadata&&percentage!==null?Math.round(percentage*metadata.maxPoints)/100:null};
      }),page,hasMore:attempts.length>20}};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }

  async manageExam(actor:Actor,id:string,operation:'close'|'archive'|'delete'){
    examStaff(actor);
    return transaction(async tx=>{
      await lock(tx,'Avaliacao',id);
      const exam=await tx.avaliacao.findFirst({where:{id,...await managedExam(actor)},select:examSelect});
      if(!exam)throw new ApiError(404,'Simulado indisponível para esta conta.');
      if(await classActivitiesReady()&&await tx.classActivity.findUnique({where:{evaluationId:id}}))throw new ApiError(404,'Utilize o gerenciamento de atividades.');
      if(operation==='delete'){
        if(exam.publishedAt||exam._count.tentativas)throw new ApiError(409,'Somente rascunhos sem tentativas podem ser excluídos.');
        if(await examSettingsReady())await tx.classExamSettings.deleteMany({where:{evaluationId:id}});
        await tx.avaliacaoQuestao.deleteMany({where:{avaliacaoId:id}});
        await tx.avaliacao.update({where:{id},data:{turmas:{set:[]}},select:{id:true}});
        await tx.avaliacao.delete({where:{id}});
      }else{
        if(!await examSettingsReady())throw new ApiError(503,'O encerramento aguarda atualização segura do banco.');
        if(!exam.publishedAt)throw new ApiError(409,'Rascunhos devem ser editados ou excluídos.');
        await tx.classExamSettings.upsert({where:{evaluationId:id},create:{evaluationId:id,expectedQuestions:exam.questoes.length,closedAt:new Date(),...(operation==='archive'?{archivedAt:new Date()}:{})},update:{closedAt:new Date(),...(operation==='archive'?{archivedAt:new Date()}:{})}});
      }
      await administrativeEvent(tx,operation==='delete'?'EXAM_DRAFT_DELETED':operation==='archive'?'EXAM_ARCHIVED':'EXAM_CLOSED',actor.userId,actor.institutionId,id);
      return {message:operation==='delete'?'Rascunho excluído. Questões e históricos preservados.':'Novos inícios encerrados. Tentativas e resultados preservados.'};
    });
  }
  async eligibleQuestions(actor:Actor,classIds:string[],page=1,filters:{q?:string;disciplina?:string;assunto?:string;nivel?:'BASICO'|'INTERMEDIARIO'|'AVANCADO';pageSize?:number}={}){
    examStaff(actor);
    const ids=[...new Set(classIds)];
    if(!ids.length||ids.length>30||!Number.isInteger(page)||page<1||page>10000)throw new ApiError(422,'Selecione ao menos uma turma ativa para consultar as questões elegíveis.');
    return prisma.$transaction(async tx=>{
    const authorized=await tx.turma.count({where:{id:{in:ids},archivedAt:null,...await managedClass(actor),...(actor.institutionId?{institutionalClass:{institutionId:actor.institutionId,institution:{status:'ACTIVE'}}}:{})}});
    if(authorized!==ids.length)throw new ApiError(403,'Você não tem autorização para consultar questões das turmas selecionadas.');
    const size=filters.pageSize??50;
    const rows=await tx.questao.findMany({
      where:{AND:[...(filters.q?[{OR:[{enunciado:{contains:filters.q,mode:'insensitive' as const}},{assunto:{contains:filters.q,mode:'insensitive' as const}}]}]:[])],disciplina:filters.disciplina?{contains:filters.disciplina,mode:'insensitive'}:undefined,assunto:filters.assunto?{contains:filters.assunto,mode:'insensitive'}:undefined,nivel:filters.nivel,OR:[{publica:true},{turmaId:null,autorId:actor.userId},...(ids.length===1?[{turmaId:ids[0]}]:[])]},
      select:{id:true,enunciado:true,disciplina:true,assunto:true,nivel:true,publica:true,turmaId:true,autorId:true,alternativas:{select:{correta:true}}},
      orderBy:[{createdAt:'desc'},{id:'desc'}],take:size+1,skip:(page-1)*size,
    });
    return {items:rows.slice(0,size).filter(q=>eligibleForExam(q,actor,ids)).map(q=>({id:q.id,enunciado:q.enunciado,disciplina:q.disciplina,assunto:q.assunto,nivel:q.nivel,publica:q.publica})),page,hasMore:rows.length>size};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }
  async eligibleQuestionPreview(actor: Actor, classIds: string[], questionId: string) {
    examStaff(actor);
    const ids = [...new Set(classIds)];
    if (!ids.length || ids.length > 30) throw new ApiError(422, 'Selecione as turmas do simulado.');
    return prisma.$transaction(async tx => {
      const authorized = await tx.turma.count({where:{id:{in:ids},archivedAt:null,...await managedClass(actor),...(actor.institutionId?{institutionalClass:{institutionId:actor.institutionId,institution:{status:'ACTIVE'}}}:{})}});
      if (authorized !== ids.length) throw new ApiError(403, 'Turmas não autorizadas para esta consulta.');
      const question = await tx.questao.findFirst({where:{id:questionId,OR:[{publica:true},{turmaId:null,autorId:actor.userId},...(ids.length===1?[{turmaId:ids[0]}]:[])]},select:{id:true,enunciado:true,publica:true,autorId:true,turmaId:true,alternativas:{orderBy:{id:'asc'},select:{id:true,texto:true,correta:true}}}});
      if (!question || !eligibleForExam(question, actor, ids)) throw new ApiError(404, 'Questão não elegível para as turmas selecionadas.');
      return {id:question.id,enunciado:question.enunciado,alternativas:question.alternativas};
    }, {isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }
  async assignTeacher(actor:Actor,classId:string,userId:string,assigned:boolean){
    assertRestrictedInstitution(actor.institutionId ?? '');
    assertRestrictedParticipant(userId);
    if(actor.role==='ADMIN'||!actor.institutionAdmin||!actor.institutionId)throw new ApiError(403,'Designação exclusiva da administração institucional.');
    return institutionalTransaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${actor.institutionId} FOR UPDATE`;
      const admin=await tx.institutionalMembership.findFirst({where:{institutionId:actor.institutionId,userId:actor.userId,role:'INSTITUTION_ADMIN',active:true,institution:{status:'ACTIVE'}}});
      const turma=await tx.turma.findFirst({where:{id:classId,...await managedClass(actor)}});
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
      const turma=await tx.turma.findFirst({where:{id:classId,archivedAt:null,...await managedClass(actor)}});
      if(!turma)throw new ApiError(404,'Turma ativa indisponível.');
      const student=await tx.user.findFirst({where:{email:{equals:email,mode:'insensitive'},role:'ALUNO',deletedAt:null,emailVerifiedAt:{not:null}},select:{id:true}});
      if(!student)throw new ApiError(404,'Aluno confirmado indisponível. Solicite seu cadastro e confirmação pelo fluxo normal.');
      if (await tx.turma.count({where:{id:classId,alunos:{some:{id:student.id}}}})) throw new ApiError(409,'Este aluno já está matriculado nesta turma.');
      assertRestrictedParticipant(student.id);
      const control=await tx.accountControl.findUnique({where:{userId:student.id}});
      if(control?.suspended)throw new ApiError(409,'Conta indisponível para matrícula.');
      await tx.turma.update({where:{id:classId},data:{alunos:{connect:{id:student.id}}},select:{id:true}});
      await tx.classJoinRequest.upsert({where:{classId_studentId:{classId,studentId:student.id}},create:{classId,studentId:student.id,status:'APPROVED',decidedAt:new Date()},update:{status:'APPROVED',decidedAt:new Date()}});
      await classAdministrativeEvent(tx,'STUDENT_ADDED',actor,classId);
      return {message:'Aluno vinculado. A conta pessoal e seu histórico foram preservados.'};
    });
  }
  async listClasses(actor: Actor, page: number) {
    if(actor.role!=='ALUNO'||actor.institutionAdmin)staff(actor);
    const items = await prisma.turma.findMany({ where: actor.role === 'ALUNO' && !actor.institutionAdmin ? await enrolledClass(actor.userId) : await managedClass(actor),
      select: classSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, skip: (page - 1) * 50 });
    if (actor.role !== 'PROFESSOR' || actor.institutionAdmin) return pageOf(items,page);
    const ready = await classLifecycleReady();
    const owners = ready ? await prisma.classLifecycle.findMany({where:{classId:{in:items.map(c=>c.id)}},select:{classId:true,createdById:true}}) : [];
    const proven = ready ? await prisma.administrativeEvent.findMany({where:{event:'CLASS_CREATED',actorId:actor.userId,resourceId:{in:items.map(c=>c.id)}},select:{resourceId:true}}) : [];
    return pageOf(items.map(c=>({...c,deletionAvailable:ready,canDelete:ready&&(owners.find(o=>o.classId===c.id)?.createdById===actor.userId || (!owners.find(o=>o.classId===c.id)?.createdById&&proven.some(e=>e.resourceId===c.id)))})),page);
  }

  async searchStudents(actor: Actor, classId: string, query: string, page: number) {
    staff(actor);
    if (!await prisma.turma.findFirst({where:{id:classId,archivedAt:null,...await managedClass(actor)},select:{id:true}})) throw new ApiError(404,'Turma ativa indisponível.');
    if (query.trim().length < 3) throw new ApiError(422,'Digite ao menos três caracteres para pesquisar.');
    const rows = await prisma.user.findMany({where:{role:'ALUNO',deletedAt:null,emailVerifiedAt:{not:null},OR:[{nome:{contains:query.trim(),mode:'insensitive'}},{email:{contains:query.trim(),mode:'insensitive'}}],...(restrictedInstitutionId()?{id:{in:homologationManifest()?.participantIds ?? []}}:{})},select:{id:true,nome:true,email:true,turmasComoAluno:{where:{id:classId},select:{id:true}}},orderBy:[{nome:'asc'},{id:'asc'}],take:21,skip:(page-1)*20});
    return {items:rows.slice(0,20).map(s=>({id:s.id,nome:s.nome,email:s.email,enrolled:s.turmasComoAluno.length>0})),page,hasMore:rows.length>20};
  }

  async deleteClass(actor: Actor, id: string, confirmationName: string) {
    staff(actor);
    if (actor.role !== 'PROFESSOR' || actor.institutionAdmin) throw new ApiError(403,'Exclusão exclusiva do professor criador no contexto docente.');
    if (!await classLifecycleReady()) throw new ApiError(503,'A exclusão aguarda a migração segura de ciclo de vida das turmas.');
    return transaction(async tx=>{
      await lock(tx,'Turma',id);
      const turma = await tx.turma.findFirst({where:{id,...await managedClass(actor)},include:{lifecycle:true,_count:{select:{alunos:true,professores:true,questoes:true,avaliacoes:true,joinRequests:true,invitationAssignments:true}},institutionalClass:{select:{classId:true}}}});
      if (!turma) throw new ApiError(404,'Turma indisponível para esta conta.');
      const provenance = !turma.lifecycle?.createdById && await tx.administrativeEvent.findFirst({where:{event:'CLASS_CREATED',resourceId:id,actorId:actor.userId},select:{id:true}});
      if (turma.lifecycle?.createdById !== actor.userId && !provenance) throw new ApiError(403,'Não foi possível comprovar que você criou esta turma. Os registros foram preservados.');
      if (confirmationName !== turma.nome) throw new ApiError(422,'Digite exatamente o nome da turma para confirmar a exclusão.');
      const dependency = turma._count.alunos || turma._count.questoes || turma._count.avaliacoes || turma._count.joinRequests || turma._count.invitationAssignments || turma._count.professores>1 || turma.institutionalClass;
      if (dependency) {
        await tx.classLifecycle.upsert({where:{classId:id},create:{classId:id,createdById:actor.userId,deletedAt:new Date(),deletedById:actor.userId},update:{deletedAt:new Date(),deletedById:actor.userId}});
        await tx.turma.update({where:{id},data:{conviteExpiraEm:new Date(0)},select:{id:true}});
      } else {
        await tx.classLifecycle.deleteMany({where:{classId:id}});
        await tx.turma.update({where:{id},data:{professores:{set:[]}},select:{id:true}});
        await tx.turma.delete({where:{id}});
      }
      await administrativeEvent(tx,dependency?'CLASS_SOFT_DELETED':'CLASS_DELETED',actor.userId,actor.institutionId,id);
      return {mode:dependency?'SOFT':'HARD',message:dependency?'Turma excluída da gestão ativa. Matrículas, questões e histórico acadêmico foram preservados.':'Turma vazia excluída com segurança. Nenhuma conta ou histórico acadêmico foi removido.'};
    });
  }

  async studentClassDetails(actor: Actor, id: string, page = 1) {
    if (actor.role !== 'ALUNO' || actor.institutionAdmin) throw new ApiError(403, 'Consulta exclusiva do aluno matriculado.');
    const turma = await prisma.turma.findFirst({
      where: { id, ...await enrolledClass(actor.userId) },
      select: {
        id: true, nome: true, createdAt: true, archivedAt: true,
        professores: { select: { id: true, nome: true }, orderBy: [{ nome: 'asc' }, { id: 'asc' }] },
        joinRequests: { where: { studentId: actor.userId }, select: { status: true, createdAt: true, decidedAt: true } },
        avaliacoes: {
          where: { publishedAt: { not: null }, ...(await classActivitiesReady()?{activity:null}:{}) }, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: 51, skip: (page - 1) * 50,
          select: {
            id: true, titulo: true, descricao: true, duracaoSegundos: true, createdAt: true, publishedAt: true,
            _count: { select: { questoes: true } },
            tentativas: {
              where: { alunoId: actor.userId, tipo: 'AVALIACAO' },
              select: {
                id: true, iniciadoEm: true, finalizadoEm: true, tempoLimiteSegundos: true,
                questoes: { select: { questao: { select: { disciplina: true, assunto: true, nivel: true } }, resposta: { select: { correta: true } } } },
              },
            },
          },
        },
      },
    });
    if (!turma) throw new ApiError(404, 'Turma indisponível para esta conta.');
    return {
      id: turma.id, nome: turma.nome, createdAt: turma.createdAt, archivedAt: turma.archivedAt,
      enrollment: { status: turma.joinRequests[0]?.status ?? 'MATRICULADO', since: turma.joinRequests[0]?.createdAt ?? null, decidedAt: turma.joinRequests[0]?.decidedAt ?? null },
      professors: turma.professores,
      page, hasMore: turma.avaliacoes.length > 50,
      exams: turma.avaliacoes.slice(0, 50).map(exam => ({
        id: exam.id, titulo: exam.titulo, descricao: exam.descricao, duracaoSegundos: exam.duracaoSegundos,
        createdAt: exam.createdAt, publishedAt: exam.publishedAt, questionCount: exam._count.questoes,
        attempt: exam.tentativas[0] ? (() => {
          const attempt = exam.tentativas[0];
          const deadline = attempt.tempoLimiteSegundos === null ? null : new Date(attempt.iniciadoEm.getTime() + attempt.tempoLimiteSegundos * 1000);
          const analysis = attempt.finalizadoEm && attempt.questoes.length ? analyzeDiagnostic(attempt.questoes.map(item => ({ discipline: item.questao.disciplina, topic: item.questao.assunto,
            difficulty: item.questao.nivel, isCorrect: item.resposta?.correta ?? false }))) : { overallPercentage: 0, correctAnswers: 0, totalQuestions: 0 };
          const answered = attempt.questoes.filter(item => item.resposta).length;
          return {
            id: attempt.id, startedAt: attempt.iniciadoEm, finalizedAt: attempt.finalizadoEm,
            status: attempt.finalizadoEm ? 'COMPLETED' : deadline && deadline.getTime() <= Date.now() ? 'EXPIRED' : 'IN_PROGRESS',
            result: attempt.finalizadoEm ? { overallPercentage: analysis.overallPercentage, correctAnswers: analysis.correctAnswers,
              totalQuestions: analysis.totalQuestions, incorrectAnswers: answered - analysis.correctAnswers,
              unansweredQuestions: analysis.totalQuestions - answered } : null,
          };
        })() : null,
      })),
    };
  }

  async createClass(actor: Actor, nome: string) {
    staff(actor); const code = randomBytes(24).toString('base64url');
    const lifecycle = await classLifecycleReady();
    const expiresAt = new Date(Date.now() + 7 * 86400_000);
    if (institutionsEnabled()) return institutionalTransaction(async tx => {
      if (!actor.institutionId) throw new ApiError(409, 'Selecione uma instituição com vínculo de professor ativo.');
      const membership = await tx.institutionalMembership.findFirst({ where: { institutionId: actor.institutionId, userId: actor.userId, role: actor.institutionAdmin ? 'INSTITUTION_ADMIN' : 'TEACHER', active: true, institution: { status: 'ACTIVE' } } });
      if (!membership) throw new ApiError(403, 'Vínculo institucional não autorizado.');
      const turma = await tx.turma.create({ data: { nome, codigoConvite: inviteHash(code), conviteExpiraEm: expiresAt, ...(lifecycle ? {lifecycle:{create:{createdById:actor.userId}}} : {}), ...(actor.institutionAdmin ? {} : {professores: { connect: { id: actor.userId } }}) }, select: classSelect });
      await tx.institutionalClass.create({ data: { classId: turma.id, institutionId: actor.institutionId } });
      await administrativeEvent(tx, 'CLASS_CREATED', actor.userId, actor.institutionId, turma.id);
      return { turma, inviteCode: code, expiresAt };
    });
    return transaction(async tx=>{
    const turma = await tx.turma.create({ data: { nome, codigoConvite: inviteHash(code), conviteExpiraEm: expiresAt, ...(lifecycle ? {lifecycle:{create:{createdById:actor.userId}}} : {}),
      professores: { connect: { id: actor.userId } } }, select: classSelect });
    await administrativeEvent(tx,'CLASS_CREATED',actor.userId,undefined,turma.id);
    return { turma, inviteCode: code, expiresAt };
    });
  }

  async updateClass(actor: Actor, id: string, data: { nome?: string; archived?: boolean }) {
    staff(actor);
    return transaction(async tx => {
      await lock(tx, 'Turma', id);
      const turma = await tx.turma.findFirst({ where: { id, ...await managedClass(actor) } });
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
      const turma = await tx.turma.findFirst({ where: { id, archivedAt: null, ...await managedClass(actor) } });
      if (!turma) throw new ApiError(404, 'Turma ativa indisponível para esta conta.');
      const code = randomBytes(24).toString('base64url'), expiresAt = new Date(Date.now() + 7 * 86400_000);
      await tx.turma.update({ where: { id }, data: { codigoConvite: inviteHash(code), conviteExpiraEm: expiresAt } });
      await classAdministrativeEvent(tx, 'CLASS_CODE_ROTATED', actor, id);
      return { inviteCode: code, expiresAt };
    });
  }

  async join(actor: Actor, code: string) {
    homologationClassBoundary(); // Revalidate any request scope before legacy fallback.
    if (actor.role !== 'ALUNO'||actor.institutionAdmin) throw new ApiError(403, 'Somente alunos no contexto pessoal podem solicitar matrícula. Professores são designados pela instituição.');
    return transaction(async tx => {
      if(restrictedInstitutionId() && !await fixtureProvenance(tx,homologationManifest()!)) throw new ApiError(403,'Fixture sem provisionamento autorizado.');
      const [found] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "Turma" WHERE "codigoConvite" = ${inviteHash(code)} FOR UPDATE`);
      if (!found) throw new ApiError(404, 'Convite inválido, expirado ou turma indisponível.');
      if(homologationManifest()) {
        const link=await tx.institutionalClass.findUnique({where:{classId:found.id},select:{institutionId:true}});
        if(link?.institutionId===homologationManifest()!.institutionId && !restrictedInstitutionId()) throw new ApiError(403,'Turma fora do escopo autorizado.');
        if(restrictedInstitutionId() && (!link || link.institutionId!==restrictedInstitutionId())) throw new ApiError(403,'Turma fora do escopo autorizado.');
      }
      const turma = await tx.turma.findFirst({ where: { id: found.id, ...await visibleClasses(), archivedAt: null, conviteExpiraEm: { gt: new Date() } },
        select: { id: true, alunos: { where: { id: actor.userId }, select: { id: true } } } });
      if (!turma) throw new ApiError(404, 'Convite inválido, expirado ou turma indisponível.');
      if (turma.alunos.length) return { joined: false, message: 'Você já está matriculado nesta turma.' };
      // Legacy classes without institutional enrollment workflow retain direct invite joining.
      // When the workflow is enabled, all requests remain subject to teacher approval.
      if (!institutionsEnabled() && !homologationManifest()) {
        const enrollment = await tx.classJoinRequest.findUnique({ where: { classId_studentId: { classId: turma.id, studentId: actor.userId } } });
        await tx.classJoinRequest.upsert({ where: { classId_studentId: { classId: turma.id, studentId: actor.userId } },
          create: { classId: turma.id, studentId: actor.userId, status: 'APPROVED', decidedAt: new Date() },
          update: { status: 'APPROVED', decidedAt: new Date() } });
        await tx.turma.update({ where: { id: turma.id }, data: { alunos: { connect: { id: actor.userId } } } });
        if (enrollment?.status === 'PENDING') await administrativeEvent(tx, 'STUDENT_JOIN_APPROVED', actor.userId, undefined, turma.id);
        return { joined: true, message: 'Matrícula realizada.' };
      }
      {
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
    });
  }

  async joinRequests(actor: Actor, classId: string | undefined, page: number) {
    if (!institutionsEnabled() && (actor.role !== 'ALUNO' || actor.institutionAdmin)) throw new ApiError(503, 'Gestão institucional não ativada.');
    if (actor.role !== 'ALUNO' || actor.institutionAdmin) {
      staff(actor);
      if (!classId || !await prisma.turma.findFirst({ where: { id: classId, ...await managedClass(actor) }, select: { id: true } })) throw new ApiError(404, 'Turma indisponível.');
    }
    const items = await prisma.classJoinRequest.findMany({ where: {...(actor.role === 'ALUNO' && !actor.institutionAdmin ? { studentId: actor.userId } : { classId }), turma:{AND:[await visibleClasses(),...(homologationClassBoundary()?[homologationClassBoundary()!]:[])]}}, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, skip: (page - 1) * 50 });
    const students = actor.role === 'ALUNO' && !actor.institutionAdmin ? [] : await prisma.user.findMany({ where: { id: { in: items.map(i => i.studentId) }, deletedAt: null }, select: { id: true, nome: true } });
    const classes = await prisma.turma.findMany({ where: { id: { in: items.map(i => i.classId) } }, select: { id: true, nome: true } });
    return pageOf(items.map(i => ({ ...i, studentName: students.find(s => s.id === i.studentId)?.nome, className: classes.find(c => c.id === i.classId)?.nome })), page);
  }

  async decideJoin(actor: Actor, classId: string, requestId: string, approve: boolean) {
    staff(actor);
    return institutionalTransaction(async tx => {
      await lock(tx, 'Turma', classId);
      if (!await tx.turma.findFirst({ where: { id: classId, archivedAt: null, ...await managedClass(actor) }, select: { id: true } })) throw new ApiError(404, 'Turma indisponível.');
      const request = await tx.classJoinRequest.findFirst({ where: { id: requestId, classId, status: 'PENDING' } });
      if (!request) throw new ApiError(409, 'Solicitação já decidida ou indisponível.');
      const student = await tx.user.findFirst({ where: { id: request.studentId, role: 'ALUNO', deletedAt: null, emailVerifiedAt: { not: null } }, select: { id: true } });
      assertRestrictedParticipant(request.studentId);
      if (approve && !student) throw new ApiError(409, 'Conta do aluno indisponível ou e-mail não confirmado.');
      await tx.classJoinRequest.update({ where: { id: requestId }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedAt: new Date() } });
      if (approve) await tx.turma.update({ where: { id: classId }, data: { alunos: { connect: { id: request.studentId } } }, select: { id: true } });
      await tx.administrativeNotification.create({ data: { userId: request.studentId, message: `Solicitação para a turma ${classId}: ${approve ? 'aprovada' : 'recusada'}.` } });
      await classAdministrativeEvent(tx, approve ? 'STUDENT_JOIN_APPROVED' : 'STUDENT_JOIN_REJECTED', actor, classId);
      return { message: approve ? 'Aluno aprovado.' : 'Solicitação recusada.' };
    });
  }

  async removeStudent(actor: Actor, classId: string, studentId: string) {
    assertRestrictedParticipant(studentId);
    staff(actor);
    return institutionalTransaction(async tx => {
      await lock(tx, 'Turma', classId);
      if (!await tx.turma.findFirst({ where: { id: classId, archivedAt:null, ...await managedClass(actor), alunos: { some: { id: studentId } } }, select: { id: true } })) throw new ApiError(404, 'Aluno ou turma indisponível.');
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
      if (!await tx.turma.findFirst({ where: { id, ...await managedClass(actor) }, select: { id: true } })) throw new ApiError(404, 'Turma indisponível.');
      await tx.turma.update({ where: { id }, data: { conviteExpiraEm: new Date(0) }, select: { id: true } });
      await classAdministrativeEvent(tx, 'CLASS_CODE_DISABLED', actor, id);
      return { message: 'Código desativado.' };
    });
  }

  async students(actor: Actor, id: string | undefined, page: number) {
    staff(actor);
    const turma=id?await prisma.turma.findFirst({ where: { id, ...await managedClass(actor) }, select: { id: true,nome:true,archivedAt:true } }):null;
    if (id && !turma) throw new ApiError(404, 'Turma indisponível para esta conta.');
    const items = await prisma.user.findMany({ where: { role: 'ALUNO', deletedAt: null,
      turmasComoAluno: { some: { ...(id ? { id } : {}), ...await managedClass(actor) } } },
      select: { id: true, nome: true, email: true, turmasComoAluno:{where:{...(id?{id}:{}),...await managedClass(actor)},select:{id:true,nome:true,archivedAt:true}} }, orderBy: [{ nome: 'asc' }, { id: 'asc' }], take: 51, skip: (page - 1) * 50 });
    return {...pageOf(items, page),class:turma};
  }

  async listExams(actor: Actor, page: number,classId?:string,includeArchived=false,filters:{search?:string;status?:'ALL'|'DRAFT'|'PUBLISHED'|'CLOSED'|'ARCHIVED'}={}) {
    if(actor.role!=='ALUNO'||actor.institutionAdmin)examStaff(actor);
    const personalStudent=actor.role==='ALUNO'&&!actor.institutionAdmin;
    const settingsReady=await examSettingsReady();
    const activitiesReady=await classActivitiesReady();
    const scopeWhere:Prisma.AvaliacaoWhereInput=personalStudent
      ? { publishedAt: { not: null }, turmas: { some: { archivedAt: null, ...await enrolledClass(actor.userId) } } }
      : await managedExam(actor);
    const commonAnd:Prisma.AvaliacaoWhereInput[]=[
      ...(classId?[{turmas:{some:{id:classId}}}]:[]),
      ...(activitiesReady?[{activity:null}]:[]),
    ];
    const commonWhere:Prisma.AvaliacaoWhereInput={
      ...scopeWhere,
      ...(filters.search?{titulo:{contains:filters.search,mode:'insensitive'}}:{}),
      ...(commonAnd.length?{AND:commonAnd}:{}),
    };
    const statusAnd:Prisma.AvaliacaoWhereInput[]=personalStudent?[]:
      filters.status==='DRAFT'?[{publishedAt:null}]:
      filters.status==='PUBLISHED'?[{publishedAt:{not:null}},...(settingsReady?[{OR:[{settings:null},{settings:{closedAt:null,archivedAt:null}}]}]:[])]:
      filters.status==='CLOSED'?settingsReady?[{publishedAt:{not:null}},{settings:{closedAt:{not:null},archivedAt:null}}]:[{id:'__closed_status_unavailable__'}]:
      filters.status==='ARCHIVED'?settingsReady?[{settings:{archivedAt:{not:null}}}]:[{id:'__archived_status_unavailable__'}]:[];
    const archiveGuard:Prisma.AvaliacaoWhereInput[]=
      settingsReady&&!includeArchived&&filters.status!=='ARCHIVED'?[{OR:[{settings:null},{settings:{archivedAt:null}}]}]:[];
    const listWhere:Prisma.AvaliacaoWhereInput={...scopeWhere,...(filters.search?{titulo:{contains:filters.search,mode:'insensitive'}}:{}),AND:[...commonAnd,...archiveGuard,...statusAnd]};
    const items = await prisma.avaliacao.findMany({ where: listWhere, select: personalStudent
        ? { id: true, titulo: true, descricao: true, duracaoSegundos: true, publishedAt: true, _count: { select: { questoes: true } },
            tentativas: { where: { alunoId: actor.userId }, select: { id: true, finalizadoEm: true } } }
        : {...examSelect,...(settingsReady?{settings:{select:{expectedQuestions:true,closedAt:true,archivedAt:true}}}:{})},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, skip: (page - 1) * 50 });
    if(personalStudent)return pageOf(items,page);
    const ids=items.slice(0,50).map(item=>item.id);
    const [participantRows,drafts,published,closed,archived]=await Promise.all([
      ids.length?prisma.simulado.findMany({where:{avaliacaoId:{in:ids},tipo:'AVALIACAO'},distinct:['avaliacaoId','alunoId'],select:{avaliacaoId:true,alunoId:true}}):Promise.resolve([]),
      prisma.avaliacao.count({where:{...scopeWhere,...(filters.search?{titulo:{contains:filters.search,mode:'insensitive'}}:{}),publishedAt:null,AND:[...commonAnd,...(settingsReady?[{OR:[{settings:null},{settings:{archivedAt:null}}]}]:[])]}}),
      prisma.avaliacao.count({where:{...scopeWhere,...(filters.search?{titulo:{contains:filters.search,mode:'insensitive'}}:{}),publishedAt:{not:null},AND:[...commonAnd,...(settingsReady?[{OR:[{settings:null},{settings:{closedAt:null,archivedAt:null}}]}]:[])]}}),
      settingsReady?prisma.avaliacao.count({where:{...commonWhere,publishedAt:{not:null},AND:[...commonAnd,{settings:{closedAt:{not:null},archivedAt:null}}]}}):Promise.resolve(0),
      settingsReady?prisma.avaliacao.count({where:{...commonWhere,AND:[...commonAnd,{settings:{archivedAt:{not:null}}}]}}):Promise.resolve(0),
    ]);
    const participants=new Map<string,number>();
    for(const row of participantRows)if(row.avaliacaoId)participants.set(row.avaliacaoId,(participants.get(row.avaliacaoId)??0)+1);
    return {...pageOf(items.map(item=>({...item,participants:participants.get(item.id)??0})),page),summary:{drafts,published,closed,archived,settingsAvailable:settingsReady}};
  }

  async saveExam(actor: Actor, data: ExamInput, id?: string, activity?:{dueAt:Date|null;maxPoints?:number}) {
    examStaff(actor);
    const activitiesReady=await classActivitiesReady();
    const settingsReady=await examSettingsReady();
    const expected=data.expectedQuestions??data.questaoIds.length;
    if(!Number.isInteger(expected)||expected<1||expected>80||data.questaoIds.length>expected)throw new ApiError(422,'Revise a quantidade configurada de questões.');
    if(!activity&&!settingsReady&&expected!==data.questaoIds.length)throw new ApiError(503,'Rascunhos parciais aguardam atualização segura do banco.');
    if(activity&&!activitiesReady)throw new ApiError(503,'Atividades aguardam a migração segura do banco.');
    if(activity&&data.turmaIds.length!==1)throw new ApiError(422,'Atividades pertencem a uma única turma.');
    return transaction(async tx => {
      const responsibleTeacherId = data.responsibleTeacherId;
      if (responsibleTeacherId) {
        if (!actor.institutionAdmin || !actor.institutionId) throw new ApiError(403, 'Somente a instituição pode designar o professor responsável.');
        const membership = await tx.institutionalMembership.findFirst({ where: { institutionId: actor.institutionId, userId: responsibleTeacherId, role: 'TEACHER', active: true, institution: { status: 'ACTIVE' }, user: { role: 'PROFESSOR', deletedAt: null } }, select: { userId: true } });
        const assignedClasses = await tx.turma.count({ where: { id: { in: data.turmaIds }, ...await managedClass(actor), professores: { some: { id: responsibleTeacherId } } } });
        if (!membership || assignedClasses !== data.turmaIds.length) throw new ApiError(403, 'O professor responsável deve ter vínculo ativo e designação em todas as turmas selecionadas.');
      }
      if (id) {
        await lock(tx, 'Avaliacao', id);
        const exam = await tx.avaliacao.findFirst({ where: { id, ...await managedExam(actor) }, select: { publishedAt: true, _count: { select: { tentativas: true } } } });
        if (!exam) throw new ApiError(404, 'Simulado indisponível para esta conta.');
        const metadata=activitiesReady?await tx.classActivity.findUnique({where:{evaluationId:id}}):null;
        if(Boolean(metadata)!==Boolean(activity))throw new ApiError(404,'Recurso indisponível neste fluxo.');
        if(metadata&&(metadata.closedAt||metadata.cancelledAt||metadata.classId!==data.turmaIds[0]))throw new ApiError(409,'Atividade encerrada, cancelada ou de outra turma.');
        if ((!activity&&exam.publishedAt) || exam._count.tentativas) throw new ApiError(409, 'Avaliações iniciadas não podem ser alteradas.');
      }
      const pilot = await this.validateSelection(tx, actor, data,Boolean(activity));
      if(activity){
        data={...data,descricao:activityDescription(data.descricao,pilot)};
        if(data.descricao.length>3000)throw new ApiError(422,'Reduza as orientações para incluir o aviso de atividade piloto.');
      }
      const fields = { titulo: data.titulo, descricao: data.descricao, duracaoSegundos: data.duracaoSegundos, ...(responsibleTeacherId ? { autorId: responsibleTeacherId } : {}),
        turmas: { set: data.turmaIds.map(id => ({ id })) },
        questoes: { deleteMany: {}, create: data.questaoIds.map((questaoId, i) => ({ questaoId, posicao: i + 1 })) } };
      if (id) return tx.avaliacao.update({ where: { id }, data: {...fields,...(activity?{publishedAt:null,activity:{update:{dueAt:activity.dueAt,maxPoints:activity.maxPoints??10}}}:settingsReady?{settings:{upsert:{create:{expectedQuestions:expected},update:{expectedQuestions:expected}}}}:{})}, select: examSelect });
      return tx.avaliacao.create({ data: { titulo: data.titulo, descricao: data.descricao, duracaoSegundos: data.duracaoSegundos, autorId: responsibleTeacherId ?? actor.userId,
        turmas: { connect: data.turmaIds.map(id => ({ id })) }, ...(activity?{activity:{create:{classId:data.turmaIds[0],dueAt:activity.dueAt,maxPoints:activity.maxPoints??10}}}:settingsReady?{settings:{create:{expectedQuestions:expected}}}:{}), questoes: { create: data.questaoIds.map((questaoId, i) => ({ questaoId, posicao: i + 1 })) } }, select: examSelect });
    });
  }

  async publish(actor: Actor, id: string, activity=false) {
    examStaff(actor);
    return transaction(async tx => {
      await lock(tx, 'Avaliacao', id);
      const exam = await tx.avaliacao.findFirst({ where: { id, ...await managedExam(actor) }, select: examSelect });
      if (!exam) throw new ApiError(404, 'Simulado indisponível para esta conta.');
      const metadata=await classActivitiesReady()?await tx.classActivity.findUnique({where:{evaluationId:id}}):null;
      if(Boolean(metadata)!==activity)throw new ApiError(404,'Recurso indisponível neste fluxo.');
      if(metadata&&(metadata.closedAt||metadata.cancelledAt||(metadata.dueAt&&metadata.dueAt<=new Date())))throw new ApiError(409,'Atividade encerrada, cancelada ou com prazo expirado.');
      if (exam.publishedAt) throw new ApiError(409, 'Este simulado já foi publicado.');
      const settings=await examSettingsReady()?await tx.classExamSettings.findUnique({where:{evaluationId:id}}):null;
      if(settings&&(settings.closedAt||settings.archivedAt||settings.expectedQuestions!==exam.questoes.length))throw new ApiError(409,`Publicação bloqueada: ${exam.questoes.length} de ${settings.expectedQuestions} questões selecionadas ou simulado encerrado.`);
      await this.validateSelection(tx, actor, { titulo: exam.titulo, descricao: exam.descricao, duracaoSegundos: exam.duracaoSegundos,
        turmaIds: exam.turmas.map(t => t.id), questaoIds: exam.questoes.map(q => q.questaoId) },activity);
      return tx.avaliacao.update({ where: { id }, data: { publishedAt: new Date() }, select: examSelect });
    });
  }

  private async validateSelection(tx: Prisma.TransactionClient, actor: Actor, data: ExamInput,activity=false) {
    const ids = [...data.turmaIds].sort();
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Turma" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
    const classes = await tx.turma.count({ where: { id: { in: ids }, archivedAt: null, ...await managedClass(actor) } });
    if (classes !== ids.length) throw new ApiError(403, 'Selecione somente turmas ativas sob sua gestão.');
    // Lock question rows as well so edits and publication cannot race.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Questao" WHERE id IN (${Prisma.join([...data.questaoIds].sort())}) ORDER BY id FOR UPDATE`);
    const questions = await tx.questao.findMany({ where: { id: { in: data.questaoIds } }, include: { alternativas: true } });
    if (questions.length !== data.questaoIds.length || questions.some(q => activity ? !activityQuestionSelectable(q,ids[0]) : !eligibleForExam(q,actor,ids))) throw new ApiError(403, 'Há questões indisponíveis ou privadas incompatíveis com as turmas selecionadas.');
    return activity&&questions.some(q=>activityPilotQuestion(q));
  }

  async start(actor: Actor, examId: string) {
    if(actor.role!=='ALUNO'||actor.institutionAdmin)throw new ApiError(403,'Tentativas pertencem ao contexto pessoal do aluno.');
    return transaction(async tx => {
      await lock(tx, 'Avaliacao', examId);
      const exam = await tx.avaliacao.findFirst({ where: { id: examId, publishedAt: { not: null } }, include: { questoes: { orderBy: { posicao: 'asc' } }, turmas: { select: { id: true } } } });
      if (!exam || !await tx.turma.findFirst({ where: { id: { in: exam.turmas.map(t => t.id) }, archivedAt: null, ...await enrolledClass(actor.userId) } })) throw new ApiError(404, 'Simulado publicado indisponível para esta conta.');
      const existing = await tx.simulado.findUnique({ where: { avaliacaoId_alunoId: { avaliacaoId: examId, alunoId: actor.userId } }, select: { id: true } });
      if (existing) return existing;
      const settings=await examSettingsReady()?await tx.classExamSettings.findUnique({where:{evaluationId:examId}}):null;
      if(settings&&(settings.closedAt||settings.archivedAt))throw new ApiError(409,'Este simulado não aceita novos inícios. Tentativas já iniciadas foram preservadas.');
      const activity=await classActivitiesReady()?await tx.classActivity.findUnique({where:{evaluationId:examId}}):null;
      if(activity&&(activity.closedAt||activity.cancelledAt||(activity.dueAt&&activity.dueAt<=new Date())))throw new ApiError(409,'Esta atividade está encerrada ou fora do prazo para novos inícios. Tentativas já iniciadas são preservadas.');
      if(activity){
        const questions=await tx.questao.findMany({where:{id:{in:exam.questoes.map(q=>q.questaoId)}},include:{alternativas:true}});
        if(questions.some(q=>!activityQuestionSelectable(q,activity.classId)))throw new ApiError(409,'Há questões indisponíveis para novos inícios desta atividade.');
      }
      return tx.simulado.create({ data: { tipo: 'AVALIACAO', alunoId: actor.userId, avaliacaoId: examId, tempoLimiteSegundos: exam.duracaoSegundos,
        questoes: { create: exam.questoes.map(q => ({ questaoId: q.questaoId, posicao: q.posicao })) } }, select: { id: true } });
    });
  }

  private async ownedAttempt(tx: Prisma.TransactionClient, actor: Actor, id: string) {
    if (actor.role !== 'ALUNO'||actor.institutionAdmin) throw new ApiError(403, 'Recurso exclusivo do aluno da tentativa.');
    const attempt = await tx.simulado.findFirst({ where: { id, alunoId: actor.userId, tipo: 'AVALIACAO',
      OR:[{finalizadoEm:{not:null}},{avaliacao: { turmas: { some: await enrolledClass(actor.userId) } }}] }, include: attemptInclude });
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
    const activity=await classActivitiesReady()?await prisma.classActivity.findUnique({where:{evaluationId:attempt.avaliacaoId!},select:{id:true,classId:true,maxPoints:true}}):null;
    return { id: attempt.id, kind:activity?'ACTIVITY':'EXAM', classId:activity?.classId, titulo: attempt.avaliacao!.titulo, startedAt: attempt.iniciadoEm, deadline,
      serverTime: new Date(), status: attempt.finalizadoEm ? 'COMPLETED' : deadline && deadline.getTime() <= Date.now() ? 'EXPIRED' : 'IN_PROGRESS',
      questions: attempt.questoes.map(q => ({ id: q.questaoId, statement: q.questao.enunciado, discipline: q.questao.disciplina,
        alternatives: q.questao.alternativas.map(a => ({ id: a.id, text: a.texto })), selectedOptionId: q.resposta?.alternativaEscolhidaId ?? null })),
      result: attempt.finalizadoEm ? {...this.result(attempt),...(activity?{maxPoints:activity.maxPoints,points:Math.round(this.result(attempt).overallPercentage*activity.maxPoints)/100}:{})} : null };
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
