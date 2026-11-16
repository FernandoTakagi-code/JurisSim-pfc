import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../errors/api-error";
import {
  ClassExamService,
  managedClass,
  enrolledClass,
  staff,
} from "./class-exam-service";
import { classActivitiesReady } from "./class-lifecycle";
import {
  type InstitutionActor,
  institutionalTransaction,
  administrativeEvent,
} from "../institutions/institution-service";
import {activityQuestionWhere,activityQuestionSelectable,activityPilotQuestion} from './class-activity-eligibility';
type Actor = InstitutionActor;
export type ActivityInput = {
  classId: string;
  titulo: string;
  descricao: string;
  questaoIds: string[];
  dueAt: Date | null;
  maxPoints?:number;
};
const exams = new ClassExamService();
async function ready() {
  if (!(await classActivitiesReady()))
    throw new ApiError(
      503,
      "A criação de atividades aguarda uma atualização autorizada do banco de dados. Nenhum dado foi alterado.",
    );
}
function teacher(actor: Actor) {
  staff(actor);
  if (actor.role !== "PROFESSOR" && !actor.institutionAdmin)
    throw new ApiError(
      403,
      "Gestão de atividades exclusiva do contexto docente.",
    );
}
export class ClassActivityService {
  async list(actor: Actor, classId: string | undefined, page = 1, filters: { search?: string; status?: 'ALL' | 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED' } = {}) {
    await ready();
    const student = actor.role === "ALUNO" && !actor.institutionAdmin;
    if (!student) teacher(actor);
    const scope = student
      ? await enrolledClass(actor.userId)
      : await managedClass(actor);
    if (
      classId &&
      !(await prisma.turma.findFirst({
        where: { id: classId, ...scope },
        select: { id: true },
      }))
    )
      throw new ApiError(404, "Turma indisponível.");
    const baseWhere: Prisma.ClassActivityWhereInput = { AND: [
      ...(classId ? [{ classId }] : []),
      { turma: scope },
      ...(student ? [{ cancelledAt: null }, { avaliacao: { publishedAt: { not: null } } }]
        : actor.institutionAdmin ? [] : [{ avaliacao: { autorId: actor.userId } }]),
      ...(filters.search ? [{ avaliacao: { titulo: { contains: filters.search, mode: 'insensitive' as const } } }] : []),
    ] };
    const now = new Date();
    const byStatus: Record<NonNullable<typeof filters.status>, Prisma.ClassActivityWhereInput> = {
      ALL: {},
      DRAFT: { avaliacao: { publishedAt: null } },
      PUBLISHED: { cancelledAt: null, closedAt: null, OR: [{ dueAt: null }, { dueAt: { gt: now } }], avaliacao: { publishedAt: { not: null } } },
      CLOSED: { OR: [{ closedAt: { not: null } }, { closedAt: null, dueAt: { lte: now }, avaliacao: { publishedAt: { not: null } } }] },
      CANCELLED: { cancelledAt: { not: null } },
    };
    const selectedWhere: Prisma.ClassActivityWhereInput = { AND: [baseWhere, byStatus[filters.status ?? 'ALL']] };
    const rowsPromise = prisma.classActivity.findMany({
      where: selectedWhere,
      orderBy: [{ avaliacao: { createdAt: "desc" } }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 21,
      select: {
        evaluationId: true,
        classId: true,
        dueAt: true,
        maxPoints:true,
        closedAt: true,
        cancelledAt: true,
        turma: { select: { nome: true, archivedAt: true,_count:{select:{alunos:{where:{deletedAt:null}}}} } },
        avaliacao: {
          select: {
            titulo: true,
            descricao: true,
            publishedAt: true,
            autor: { select: { id: true, nome: true } },
            questoes: {
              orderBy: { posicao: "asc" },
              select: { questaoId: true },
            },
            _count: { select: { tentativas: true } },
            tentativas: {
              where: { alunoId: actor.userId },
              select: { id: true, finalizadoEm: true },
            },
          },
        },
      },
    });
    const summaryPromise = student ? Promise.resolve(undefined) : Promise.all([
      prisma.classActivity.count({ where: { AND: [baseWhere, byStatus.DRAFT] } }),
      prisma.classActivity.count({ where: { AND: [baseWhere, byStatus.PUBLISHED] } }),
      prisma.classActivity.count({ where: { AND: [baseWhere, byStatus.CLOSED] } }),
      prisma.classActivity.count({ where: { AND: [baseWhere, byStatus.CANCELLED] } }),
      prisma.simulado.count({ where: { tipo: 'AVALIACAO', finalizadoEm: { not: null }, avaliacao: { activity: { is: { ...baseWhere } } } } }),
    ]);
    const [rows, totals] = await Promise.all([rowsPromise, summaryPromise]);
    const delivered=student?[]:await prisma.simulado.groupBy({by:['avaliacaoId'],where:{avaliacaoId:{in:rows.map(r=>r.evaluationId)},finalizadoEm:{not:null}},_count:{_all:true}});
    return {
      items: rows
        .slice(0, 20)
        .map((r) => ({
          id: r.evaluationId,
          classId: r.classId,
          className: r.turma.nome,
          teacherName: r.avaliacao.autor.nome,
          titulo: r.avaliacao.titulo,
          descricao: r.avaliacao.descricao,
          dueAt: r.dueAt,
          maxPoints:r.maxPoints,
          enrolledStudents:student?undefined:r.turma._count.alunos,
          deliveryCount:student?undefined:delivered.find(d=>d.avaliacaoId===r.evaluationId)?._count._all??0,
          publishedAt: r.avaliacao.publishedAt,
          closedAt: r.closedAt,
          cancelledAt: r.cancelledAt,
          status: r.cancelledAt
            ? "CANCELLED"
            : r.closedAt
              ? "CLOSED"
              : !r.avaliacao.publishedAt
                ? "DRAFT"
                : r.dueAt && r.dueAt <= new Date()
                  ? "CLOSED"
                  : "PUBLISHED",
          questionIds: student
            ? undefined
            : r.avaliacao.questoes.map((q) => q.questaoId),
          questionCount: r.avaliacao.questoes.length,
          attemptCount: student ? undefined : r.avaliacao._count.tentativas,
          attempt: r.avaliacao.tentativas[0] ?? null,
          canStart:
            !!r.avaliacao.publishedAt &&
            !r.closedAt &&
            !r.cancelledAt &&
            !r.turma.archivedAt &&
            (!r.dueAt || r.dueAt > new Date()),
        })),
      page,
      hasMore: rows.length > 20,
      ...(totals ? { summary: { drafts: totals[0], published: totals[1], closed: totals[2], cancelled: totals[3], deliveries: totals[4] } } : {}),
    };
  }
  async questions(actor: Actor, classId: string, page = 1) {
    teacher(actor);
    await ready();
    if (
      !(await prisma.turma.findFirst({
        where: {
          id: classId,
          archivedAt: null,
          ...(await managedClass(actor)),
        },
        select: { id: true },
      }))
    )
      throw new ApiError(404, "Turma ativa indisponível.");
    const rows = await prisma.questao.findMany({
      where: activityQuestionWhere(classId),
      include: { alternativas: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 50,
      take: 51,
    });
    return {
      items: rows
        .slice(0, 50)
        .filter((q) => activityQuestionSelectable(q,classId))
        .map((q) => ({
          id: q.id,
          enunciado: q.enunciado,
          disciplina: q.disciplina,
          assunto: q.assunto,
          nivel: q.nivel,
          publica: q.publica,
          pilot: activityPilotQuestion(q),
        })),
      page,
      hasMore: rows.length > 50,
    };
  }
  async save(actor: Actor, input: ActivityInput, id?: string) {
    teacher(actor);
    await ready();
    if (input.dueAt && input.dueAt <= new Date())
      throw new ApiError(422, "O prazo deve estar no futuro.");
    const result = await exams.saveExam(
      actor,
      {
        titulo: input.titulo,
        descricao: input.descricao,
        duracaoSegundos: null,
        turmaIds: [input.classId],
        questaoIds: input.questaoIds,
      },
      id,
      { dueAt: input.dueAt,maxPoints:input.maxPoints??10 },
    );
    return {
      id: result.id,
      message: id
        ? "Atividade atualizada como rascunho. Publique para disponibilizar aos alunos."
        : "Atividade salva como rascunho.",
    };
  }
  async publish(actor: Actor, id: string) {
    teacher(actor);
    await ready();
    await exams.publish(actor, id, true);
    return { message: "Atividade publicada para os alunos matriculados." };
  }
  async end(actor: Actor, id: string, cancel: boolean) {
    teacher(actor);
    await ready();
    return institutionalTransaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Avaliacao" WHERE id=${id} FOR UPDATE`,
      );
      const activity = await tx.classActivity.findFirst({
        where: {
          evaluationId: id,
          turma: await managedClass(actor),
          ...(actor.institutionAdmin ? {} : { avaliacao: { autorId: actor.userId } }),
        },
        include: {
          avaliacao: {
            select: {
              publishedAt: true,
              _count: { select: { tentativas: true } },
            },
          },
        },
      });
      if (!activity) throw new ApiError(404, "Atividade indisponível.");
      if (activity.cancelledAt || activity.closedAt)
        throw new ApiError(409, "Atividade já encerrada ou cancelada.");
      if (cancel && activity.avaliacao._count.tentativas)
        throw new ApiError(
          409,
          "Atividades iniciadas não podem ser canceladas. Encerre novos inícios para preservar tentativas.",
        );
      if (!cancel && !activity.avaliacao.publishedAt)
        throw new ApiError(
          409,
          "Publique antes de encerrar ou cancele o rascunho.",
        );
      await tx.classActivity.update({
        where: { evaluationId: id },
        data: cancel ? { cancelledAt: new Date() } : { closedAt: new Date() },
      });
      await administrativeEvent(
        tx,
        cancel ? "ACTIVITY_CANCELLED" : "ACTIVITY_CLOSED",
        actor.userId,
        actor.institutionId,
        id,
      );
      return {
        message: cancel
          ? "Atividade cancelada. Registros preservados."
          : "Novos inícios encerrados. Tentativas já iniciadas e resultados foram preservados.",
      };
    });
  }
}
