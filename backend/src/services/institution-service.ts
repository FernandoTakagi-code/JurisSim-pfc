import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../errors/api-error";
import { institutionsEnabled } from "../config/institution-feature";
import {
  createBrevoEmailTransport,
  type TransactionalEmailTransport,
} from "./brevo-email-transport";
import { isValidAppUrl } from "./app-url";

export type InstitutionActor = {
  userId: string;
  role: string;
  institutionId?: string;
  allowedClassIds?: string[];
};
export type Tx = Prisma.TransactionClient;
export const hashInvitation = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const institutionMemberWhere = (userId: string) => ({
  userId,
  active: true,
  institution: { status: "ACTIVE" },
});
export function requireGlobal(actor: InstitutionActor) {
  if (actor.role !== "ADMIN")
    throw new ApiError(403, "Acesso exclusivo do administrador geral.");
}
export async function institutionalTransaction<T>(
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2034" && attempt < 2)
        continue;
      if ((error as { code?: string }).code === "P2002")
        throw new ApiError(
          409,
          "Registro duplicado ou solicitação já existente.",
        );
      throw error;
    }
  }
}
export async function administrativeEvent(
  tx: Tx,
  event: string,
  actorId?: string,
  institutionId?: string,
  resourceId?: string,
  result = "SUCCESS",
  severity = "INFO",
) {
  return tx.administrativeEvent.create({
    data: { event, actorId, institutionId, resourceId, result, severity },
  });
}
export async function institutionAdmin(
  tx: Tx,
  actor: InstitutionActor,
  institutionId: string,
) {
  const member = await tx.institutionalMembership.findFirst({
    where: {
      ...institutionMemberWhere(actor.userId),
      institutionId,
      role: "INSTITUTION_ADMIN",
    },
    select: { id: true },
  });
  if (!member)
    throw new ApiError(403, "Administração institucional não autorizada.");
}
export async function currentAccess(userId: string, originalRole: string) {
  if (!institutionsEnabled()) return undefined;
  const restriction = await prisma.accountControl.findUnique({
    where: { userId },
  });
  if (restriction?.suspended)
    throw new ApiError(
      403,
      "Conta suspensa. Procure o responsável pela plataforma.",
    );
  const memberships = await prisma.institutionalMembership.findMany({
    where: institutionMemberWhere(userId),
    select: {
      institutionId: true,
      role: true,
      institution: { select: { name: true } },
    },
    orderBy: { institutionId: "asc" },
  });
  return {
    enabled: true,
    globalAdmin: originalRole === "ADMIN",
    memberships,
    effectiveRole:
      originalRole === "PROFESSOR" &&
      !memberships.some((m) => m.role === "TEACHER")
        ? "ALUNO"
        : originalRole,
  };
}
const pageResult = <T>(items: T[], page: number) => ({
  items: items.slice(0, 25),
  page,
  hasMore: items.length > 25,
});
const pagination = (page: number) => ({ take: 26, skip: (page - 1) * 25 });
const institutionSelect = {
  id: true,
  name: true,
  registrationNumber: true,
  responsibleName: true,
  ownerId: true,
  email: true,
  phone: true,
  description: true,
  status: true,
  decisionReason: true,
  createdAt: true,
} as const;
const userSelect = {
  id: true,
  nome: true,
  email: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;
export type InstitutionInput = {
  name: string;
  registrationNumber?: string;
  responsibleName: string;
  phone: string;
  description: string;
};

export class InstitutionService {
  constructor(
    private readonly mail: TransactionalEmailTransport = createBrevoEmailTransport(),
  ) {}

  async request(actor: InstitutionActor, data: InstitutionInput) {
    return institutionalTransaction(async (tx) => {
      const owner = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { email: true, emailVerifiedAt: true, deletedAt: true },
      });
      if (!owner || owner.deletedAt)
        throw new ApiError(401, "Conta indisponível.");
      const institution = await tx.institution.create({
        data: {
          ...data,
          email: owner.email.toLowerCase(),
          ownerId: actor.userId,
          status: owner.emailVerifiedAt ? "PENDING" : "EMAIL_PENDING",
        },
        select: institutionSelect,
      });
      await administrativeEvent(
        tx,
        "INSTITUTION_REQUESTED",
        actor.userId,
        institution.id,
        institution.id,
      );
      return institution;
    });
  }

  async myInstitutions(actor: InstitutionActor) {
    return prisma.institution.findMany({
      where: {
        OR: [
          { ownerId: actor.userId },
          { memberships: { some: { userId: actor.userId, active: true } } },
        ],
      },
      select: institutionSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async institutions(actor: InstitutionActor, page: number, status?: string) {
    requireGlobal(actor);
    return pageResult(
      await prisma.institution.findMany({
        where: { status },
        select: institutionSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pagination(page),
      }),
      page,
    );
  }

  async decide(
    actor: InstitutionActor,
    id: string,
    status: "ACTIVE" | "REJECTED" | "SUSPENDED",
    reason: string,
  ) {
    requireGlobal(actor);
    return institutionalTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${id} FOR UPDATE`;
      const institution = await tx.institution.findUnique({ where: { id } });
      if (!institution) throw new ApiError(404, "Instituição não encontrada.");
      const owner = await tx.user.findUnique({
        where: { id: institution.ownerId },
        select: { emailVerifiedAt: true, deletedAt: true },
      });
      if (
        status === "ACTIVE" &&
        (!owner?.emailVerifiedAt ||
          owner.deletedAt ||
          institution.status === "EMAIL_PENDING")
      ) {
        throw new ApiError(
          409,
          "O responsável precisa confirmar o e-mail antes da aprovação.",
        );
      }
      if (status === "SUSPENDED" && institution.status !== "ACTIVE")
        throw new ApiError(
          409,
          "Somente instituições ativas podem ser suspensas.",
        );
      if (status === "REJECTED" && institution.status !== "PENDING")
        throw new ApiError(
          409,
          "Somente solicitações pendentes podem ser recusadas.",
        );
      if (status === institution.status)
        throw new ApiError(409, "A instituição já está neste estado.");
      if (status === "ACTIVE")
        await tx.institutionalMembership.upsert({
          where: {
            institutionId_userId_role: {
              institutionId: id,
              userId: institution.ownerId,
              role: "INSTITUTION_ADMIN",
            },
          },
          create: {
            institutionId: id,
            userId: institution.ownerId,
            role: "INSTITUTION_ADMIN",
          },
          update: { active: true },
        });
      const updated = await tx.institution.update({
        where: { id },
        data: { status, decisionReason: reason },
        select: institutionSelect,
      });
      await tx.administrativeNotification.create({
        data: {
          userId: institution.ownerId,
          message: `Solicitação institucional: ${status === "ACTIVE" ? "aprovada" : status === "REJECTED" ? "recusada" : "suspensa"}. ${reason}`,
        },
      });
      await administrativeEvent(
        tx,
        `INSTITUTION_${status}`,
        actor.userId,
        id,
        id,
      );
      return updated;
    });
  }

  async update(
    actor: InstitutionActor,
    id: string,
    data: Pick<InstitutionInput, "name" | "phone" | "description">,
  ) {
    return institutionalTransaction(async (tx) => {
      await institutionAdmin(tx, actor, id);
      const updated = await tx.institution.update({
        where: { id },
        data,
        select: institutionSelect,
      });
      await administrativeEvent(
        tx,
        "INSTITUTION_UPDATED",
        actor.userId,
        id,
        id,
      );
      return updated;
    });
  }

  async users(
    actor: InstitutionActor,
    page: number,
    search?: string,
    role?: "ALUNO" | "PROFESSOR" | "ADMIN",
  ) {
    requireGlobal(actor);
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        role,
        ...(search
          ? {
              OR: [
                { nome: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: userSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pagination(page),
    });
    const ids = users.map((user) => user.id);
    const [controls, memberships] = await Promise.all([
      prisma.accountControl.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, suspended: true },
      }),
      prisma.institutionalMembership.findMany({
        where: { userId: { in: ids } },
        select: {
          userId: true,
          active: true,
          role: true,
          institution: { select: { id: true, name: true, status: true } },
        },
      }),
    ]);
    return pageResult(
      users.map((user) => ({
        ...user,
        suspended: controls.some((c) => c.userId === user.id && c.suspended),
        memberships: memberships.filter((m) => m.userId === user.id),
      })),
      page,
    );
  }

  async controlUser(
    actor: InstitutionActor,
    userId: string,
    data: { suspended?: boolean; globalAdmin?: boolean },
  ) {
    requireGlobal(actor);
    if (userId === actor.userId)
      throw new ApiError(
        409,
        "Não altere suas próprias permissões ou suspensão.",
      );
    return institutionalTransaction(async (tx) => {
      // Serialize all administrative permission changes, including last-admin checks.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(710911)`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, emailVerifiedAt: true, deletedAt: true },
      });
      if (!user || user.deletedAt)
        throw new ApiError(404, "Conta indisponível.");
      if (data.globalAdmin && !user.emailVerifiedAt)
        throw new ApiError(
          409,
          "Confirme o e-mail antes de conceder administração.",
        );
      if (
        user.role === "ADMIN" &&
        (data.globalAdmin === false || data.suspended === true)
      ) {
        const activeAdmins = await tx.user.findMany({
          where: {
            role: "ADMIN",
            deletedAt: null,
            emailVerifiedAt: { not: null },
          },
          select: { id: true },
        });
        const blocked = await tx.accountControl.findMany({
          where: {
            userId: { in: activeAdmins.map((a) => a.id) },
            suspended: true,
          },
        });
        if (
          activeAdmins.filter((a) => !blocked.some((b) => b.userId === a.id))
            .length <= 1
        )
          throw new ApiError(
            409,
            "É necessário manter um administrador geral ativo.",
          );
      }
      if (data.suspended !== undefined)
        await tx.accountControl.upsert({
          where: { userId },
          create: { userId, suspended: data.suspended },
          update: { suspended: data.suspended },
        });
      const teacher = await tx.institutionalMembership.findFirst({
        where: { ...institutionMemberWhere(userId), role: "TEACHER" },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          sessionVersion: { increment: 1 },
          ...(data.globalAdmin === undefined
            ? {}
            : {
                role: data.globalAdmin
                  ? "ADMIN"
                  : teacher
                    ? "PROFESSOR"
                    : "ALUNO",
              }),
        },
        select: { id: true },
      });
      await administrativeEvent(
        tx,
        data.globalAdmin !== undefined
          ? "PERMISSION_CHANGED"
          : data.suspended
            ? "ACCOUNT_SUSPENDED"
            : "ACCOUNT_REACTIVATED",
        actor.userId,
        undefined,
        userId,
      );
      return {
        message: "Conta atualizada. As sessões anteriores foram revogadas.",
      };
    });
  }

  async summary(actor: InstitutionActor) {
    requireGlobal(actor);
    const [users, institutions, pending, teachers, classes, errors] =
      await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.institution.count(),
        prisma.institution.count({ where: { status: "PENDING" } }),
        prisma.institutionalMembership.count({
          where: {
            active: true,
            role: "TEACHER",
            institution: { status: "ACTIVE" },
          },
        }),
        prisma.turma.count({ where: { archivedAt: null } }),
        prisma.administrativeEvent.count({
          where: {
            severity: "ERROR",
            occurredAt: { gte: new Date(Date.now() - 86400_000) },
          },
        }),
      ]);
    return { users, institutions, pending, teachers, classes, errors };
  }

  async unassignedClasses(actor: InstitutionActor, page: number) {
    requireGlobal(actor);
    return pageResult(
      await prisma.turma.findMany({
        where: { institutionalClass: null },
        select: {
          id: true,
          nome: true,
          professores: { select: { id: true, nome: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pagination(page),
      }),
      page,
    );
  }

  async adoptClass(
    actor: InstitutionActor,
    classId: string,
    institutionId: string,
  ) {
    requireGlobal(actor);
    return institutionalTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${institutionId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Turma" WHERE id = ${classId} FOR UPDATE`;
      const institution = await tx.institution.findUnique({
        where: { id: institutionId },
        select: { status: true },
      });
      const turma = await tx.turma.findFirst({
        where: { id: classId, institutionalClass: null },
        select: { professores: { select: { id: true } } },
      });
      if (!turma || institution?.status !== "ACTIVE")
        throw new ApiError(
          409,
          "Selecione uma turma sem instituição e uma instituição ativa.",
        );
      for (const teacher of turma.professores) {
        if (
          !(await tx.institutionalMembership.findFirst({
            where: {
              institutionId,
              userId: teacher.id,
              role: "TEACHER",
              active: true,
            },
          }))
        )
          throw new ApiError(
            409,
            "Os professores da turma precisam aceitar os convites desta instituição antes do vínculo.",
          );
      }
      await tx.institutionalClass.create({ data: { classId, institutionId } });
      await administrativeEvent(
        tx,
        "EXISTING_CLASS_LINKED",
        actor.userId,
        institutionId,
        classId,
      );
      return {
        message: "Turma vinculada. Alunos, avaliações e histórico preservados.",
      };
    });
  }

  async institutionSummary(actor: InstitutionActor, id: string, page: number) {
    await institutionAdmin(prisma, actor, id);
    const [teachers, links, institution] = await Promise.all([
      prisma.institutionalMembership.findMany({
        where: { institutionId: id, role: "TEACHER" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pagination(page),
      }),
      prisma.institutionalClass.findMany({
        where: { institutionId: id },
        select: { classId: true },
      }),
      prisma.institution.findUnique({
        where: { id },
        select: institutionSelect,
      }),
    ]);
    const classIds = links.map((link) => link.classId);
    const [classes, teacherUsers, students, completedAttempts] =
      await Promise.all([
        prisma.turma.findMany({
          where: { id: { in: classIds } },
          select: {
            id: true,
            nome: true,
            archivedAt: true,
            _count: { select: { alunos: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...pagination(page),
        }),
        prisma.user.findMany({
          where: { id: { in: teachers.map((t) => t.userId) }, deletedAt: null },
          select: { id: true, nome: true, email: true },
        }),
        prisma.user.count({
          where: {
            deletedAt: null,
            turmasComoAluno: { some: { id: { in: classIds } } },
          },
        }),
        prisma.simulado.count({
          where: {
            tipo: "AVALIACAO",
            finalizadoEm: { not: null },
            avaliacao: { turmas: { some: { id: { in: classIds } } } },
            aluno: { turmasComoAluno: { some: { id: { in: classIds } } } },
          },
        }),
      ]);
    return {
      institution,
      teachers: pageResult(
        teachers.map((t) => ({
          ...t,
          user: teacherUsers.find((u) => u.id === t.userId),
        })),
        page,
      ),
      classes: pageResult(classes, page),
      indicators: { classes: classIds.length, students, completedAttempts },
    };
  }

  async invitations(
    actor: InstitutionActor,
    id: string,
    page: number,
    status?: string,
  ) {
    await institutionAdmin(prisma, actor, id);
    const now = new Date();
    const where = {
      institutionId: id,
      ...(status === "EXPIRED"
        ? { status: "PENDING", expiresAt: { lte: now } }
        : status === "PENDING"
          ? { status, expiresAt: { gt: now } }
          : status
            ? { status }
            : {}),
    };
    const items = await prisma.teacherInvitation.findMany({
      where,
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        sentAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pagination(page),
    });
    return pageResult(
      items.map((i) => ({
        ...i,
        status:
          i.status === "PENDING" && i.expiresAt <= now ? "EXPIRED" : i.status,
      })),
      page,
    );
  }

  async invite(
    actor: InstitutionActor,
    institutionId: string,
    email: string,
    replacingId?: string,
  ) {
    if (!this.mail.isConfigured || !isValidAppUrl(process.env.APP_PUBLIC_URL))
      throw new ApiError(
        503,
        "Envio de convites indisponível. Configure o provedor e a URL pública.",
      );
    const token = randomBytes(32).toString("hex");
    const invitation = await institutionalTransaction(async (tx) => {
      await institutionAdmin(tx, actor, institutionId);
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${institutionId} FOR UPDATE`;
      if (replacingId) {
        const existing = await tx.teacherInvitation.findFirst({
          where: { id: replacingId, institutionId, status: "PENDING" },
        });
        if (!existing)
          throw new ApiError(409, "Convite não disponível para reenvio.");
        email = existing.email;
        if (Date.now() - existing.createdAt.getTime() < 60_000)
          throw new ApiError(429, "Aguarde um minuto antes de reenviar.");
      }
      if (
        (await tx.teacherInvitation.count({
          where: {
            institutionId,
            createdAt: { gt: new Date(Date.now() - 3600_000) },
          },
        })) >= 30
      )
        throw new ApiError(429, "Limite de convites por hora atingido.");
      if (
        !replacingId &&
        (await tx.teacherInvitation.findFirst({
          where: {
            institutionId,
            email,
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
        }))
      )
        throw new ApiError(
          409,
          "Já existe um convite pendente para este e-mail.",
        );
      await tx.teacherInvitation.updateMany({
        where: { institutionId, email, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      const created = await tx.teacherInvitation.create({
        data: {
          institutionId,
          email,
          tokenHash: hashInvitation(token),
          expiresAt: new Date(Date.now() + 48 * 3600_000),
        },
      });
      await administrativeEvent(
        tx,
        replacingId ? "TEACHER_INVITATION_RESENT" : "TEACHER_INVITED",
        actor.userId,
        institutionId,
        created.id,
      );
      return created;
    });
    const url = `${process.env.APP_PUBLIC_URL!.replace(/\/$/, "")}/#/convite-professor?token=${token}`;
    try {
      await this.mail.send({
        to: invitation.email,
        subject: "Convite para professor — JurisSim",
        text: `Você recebeu um convite institucional para atuar como professor no JurisSim. Entre ou cadastre-se com o e-mail convidado, confirme seu e-mail e aceite: ${url}\nValidade: 48 horas. Se não reconhecer, ignore.`,
        html: `<p>Você recebeu um convite institucional para atuar como professor no JurisSim.</p><p>Entre ou cadastre-se com o e-mail convidado e confirme seu e-mail.</p><p><a href="${url}">Aceitar convite</a></p><p>Validade: 48 horas.</p>`,
      });
      await prisma.teacherInvitation.update({
        where: { id: invitation.id },
        data: { sentAt: new Date() },
        select: { id: true },
      });
    } catch {
      await institutionalTransaction(async (tx) => {
        await tx.teacherInvitation.updateMany({
          where: { id: invitation.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        await administrativeEvent(
          tx,
          "INVITATION_DELIVERY_FAILED",
          actor.userId,
          institutionId,
          invitation.id,
          "FAILED",
          "ERROR",
        );
      });
      throw new ApiError(
        503,
        "O envio não foi confirmado. O convite foi cancelado; solicite um novo envio.",
      );
    }
    return { message: "Convite submetido ao provedor. Validade de 48 horas." };
  }

  async cancelInvitation(
    actor: InstitutionActor,
    institutionId: string,
    id: string,
  ) {
    return institutionalTransaction(async (tx) => {
      await institutionAdmin(tx, actor, institutionId);
      const result = await tx.teacherInvitation.updateMany({
        where: { id, institutionId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      if (!result.count)
        throw new ApiError(404, "Convite pendente não encontrado.");
      await administrativeEvent(
        tx,
        "TEACHER_INVITATION_CANCELLED",
        actor.userId,
        institutionId,
        id,
      );
      return { message: "Convite cancelado." };
    });
  }

  async accept(actor: InstitutionActor, token: string) {
    return institutionalTransaction(async (tx) => {
      const invitation = await tx.teacherInvitation.findUnique({
        where: { tokenHash: hashInvitation(token) },
      });
      if (!invitation)
        throw new ApiError(400, "Convite inválido ou indisponível.");
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${invitation.institutionId} FOR UPDATE`;
      const institution = await tx.institution.findUnique({
        where: { id: invitation.institutionId },
        select: { status: true },
      });
      const user = await tx.user.findUnique({
        where: { id: actor.userId },
        select: {
          email: true,
          emailVerifiedAt: true,
          deletedAt: true,
          role: true,
        },
      });
      if (
        !user ||
        user.deletedAt ||
        !user.emailVerifiedAt ||
        user.email.toLowerCase() !== invitation.email
      )
        throw new ApiError(
          403,
          "Entre com a conta e confirme o e-mail que recebeu o convite.",
        );
      if (institution?.status !== "ACTIVE")
        throw new ApiError(409, "Instituição indisponível.");
      const claimed = await tx.teacherInvitation.updateMany({
        where: {
          id: invitation.id,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        data: { status: "ACCEPTED", acceptedById: actor.userId },
      });
      if (claimed.count !== 1)
        throw new ApiError(409, "Convite expirado, cancelado ou já utilizado.");
      await tx.institutionalMembership.upsert({
        where: {
          institutionId_userId_role: {
            institutionId: invitation.institutionId,
            userId: actor.userId,
            role: "TEACHER",
          },
        },
        create: {
          institutionId: invitation.institutionId,
          userId: actor.userId,
          role: "TEACHER",
        },
        update: { active: true },
      });
      if (user.role !== "ADMIN")
        await tx.user.update({
          where: { id: actor.userId },
          data: { role: "PROFESSOR" },
          select: { id: true },
        });
      await administrativeEvent(
        tx,
        "TEACHER_INVITATION_ACCEPTED",
        actor.userId,
        invitation.institutionId,
        invitation.id,
      );
      return {
        message: "Convite aceito. Acesso de professor liberado.",
        institutionId: invitation.institutionId,
      };
    });
  }

  async unlink(actor: InstitutionActor, institutionId: string, userId: string) {
    return institutionalTransaction(async (tx) => {
      await institutionAdmin(tx, actor, institutionId);
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${institutionId} FOR UPDATE`;
      const result = await tx.institutionalMembership.updateMany({
        where: { institutionId, userId, role: "TEACHER", active: true },
        data: { active: false },
      });
      if (!result.count)
        throw new ApiError(404, "Vínculo ativo não encontrado.");
      const classes = await tx.institutionalClass.findMany({
        where: { institutionId },
        select: { classId: true },
      });
      for (const item of classes)
        await tx.turma.update({
          where: { id: item.classId },
          data: { professores: { disconnect: { id: userId } } },
          select: { id: true },
        });
      await tx.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
        select: { id: true },
      });
      await administrativeEvent(
        tx,
        "TEACHER_UNLINKED",
        actor.userId,
        institutionId,
        userId,
      );
      return {
        message:
          "Professor desvinculado. Histórico preservado e sessões revogadas.",
      };
    });
  }

  async notifications(actor: InstitutionActor, page: number) {
    return pageResult(
      await prisma.administrativeNotification.findMany({
        where: { userId: actor.userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pagination(page),
      }),
      page,
    );
  }

  async logs(
    actor: InstitutionActor,
    filters: {
      page: number;
      institutionId?: string;
      event?: string;
      actorId?: string;
      severity?: string;
      from?: string;
      to?: string;
    },
    institutional = false,
  ) {
    if (institutional) {
      if (!filters.institutionId)
        throw new ApiError(400, "Selecione uma instituição.");
      await institutionAdmin(prisma, actor, filters.institutionId);
    } else requireGlobal(actor);
    const { page, from, to, ...where } = filters;
    return pageResult(
      await prisma.administrativeEvent.findMany({
        where: {
          ...where,
          occurredAt: {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
          },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        ...pagination(page),
      }),
      page,
    );
  }
}
