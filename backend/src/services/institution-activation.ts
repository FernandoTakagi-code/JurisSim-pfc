import type { Prisma } from "@prisma/client";
import { institutionsEnabled } from "../config/institution-feature";

const select = {
  id: true,
  emailVerifiedAt: true,
  institutionalMemberships: {
    where: { active: true, role: "TEACHER", institution: { status: "ACTIVE" } },
    select: { institutionId: true },
  },
  turmasComoProfessor: {
    select: { institutionalClass: { select: { institutionId: true } } },
  },
} satisfies Prisma.UserSelect;
export type ActivationReadiness = {
  checked: boolean;
  ready: boolean;
  teachers: number;
  pendingTeachers: number;
  unverifiedEmails: number;
  missingMemberships: number;
  classesWithoutAuthorizedInstitution: number;
};
export class InstitutionActivationBlocked extends Error {
  constructor(readonly readiness: ActivationReadiness) {
    super(
      `Ativação institucional bloqueada: ${readiness.pendingTeachers} professor(es) pendente(s); ` +
        `${readiness.unverifiedEmails} e-mail(s) não confirmado(s), ${readiness.missingMemberships} conta(s) sem vínculo ativo, ` +
        `${readiness.classesWithoutAuthorizedInstitution} turma(s) sem instituição autorizada. Mantenha INSTITUTIONS_ENABLED=false.`,
    );
  }
}
export async function inspectInstitutionActivation(
  db: Pick<Prisma.TransactionClient, "user">,
  requested = institutionsEnabled(),
): Promise<ActivationReadiness> {
  const result: ActivationReadiness = {
    checked: requested,
    ready: true,
    teachers: 0,
    pendingTeachers: 0,
    unverifiedEmails: 0,
    missingMemberships: 0,
    classesWithoutAuthorizedInstitution: 0,
  };
  if (!requested) return result;
  const teachers = await db.user.findMany({
    where: { role: "PROFESSOR", deletedAt: null },
    select,
  });
  result.teachers = teachers.length;
  for (const teacher of teachers) {
    const institutions = new Set(
      teacher.institutionalMemberships.map((m) => m.institutionId),
    );
    const inaccessible = teacher.turmasComoProfessor.filter(
      (c) =>
        !c.institutionalClass ||
        !institutions.has(c.institutionalClass.institutionId),
    ).length;
    if (!teacher.emailVerifiedAt) result.unverifiedEmails++;
    if (!institutions.size) result.missingMemberships++;
    result.classesWithoutAuthorizedInstitution += inaccessible;
    if (!teacher.emailVerifiedAt || !institutions.size || inaccessible)
      result.pendingTeachers++;
  }
  result.ready = result.pendingTeachers === 0;
  return result;
}
export async function assertInstitutionActivationReady(
  db: Pick<Prisma.TransactionClient, "user">,
) {
  const status = await inspectInstitutionActivation(db);
  if (!status.ready) throw new InstitutionActivationBlocked(status);
  return status;
}
