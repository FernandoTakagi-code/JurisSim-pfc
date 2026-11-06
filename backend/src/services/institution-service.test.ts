import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => {
  const model = () =>
    Object.fromEntries(
      [
        "findUnique",
        "findFirst",
        "findMany",
        "create",
        "createMany",
        "update",
        "updateMany",
        "upsert",
        "count",
      ].map((k) => [k, vi.fn()]),
    );
  return {
    user: model(),
    institution: model(),
    institutionalMembership: model(),
    teacherInvitation: model(),
    teacherInvitationClass: model(),
    institutionalClass: model(),
    administrativeNotification: model(),
    administrativeEvent: model(),
    accountControl: model(),
    turma: model(),
    simulado: model(),
    classJoinRequest: model(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
});
vi.mock("../lib/prisma", () => ({ prisma: db }));
import {
  InstitutionService,
  currentAccess,
  hashInvitation,
} from "./institution-service";
import { ClassExamService } from "./class-exam-service";

const global = { userId: "global", role: "ADMIN" },
  owner = { userId: "owner", role: "ALUNO" };
const teacher = {
  userId: "teacher",
  role: "PROFESSOR",
  institutionId: "institution",
  allowedClassIds: ["class"],
};
const student = { userId: "student", role: "ALUNO" };
const mail = { isConfigured: true, send: vi.fn() };
let service: InstitutionService;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("INSTITUTIONS_ENABLED", "true");
  vi.stubEnv("APP_PUBLIC_URL", "https://jurissim.example");
  db.$transaction.mockImplementation(async (work) => work(db));
  db.$queryRaw.mockResolvedValue([]);
  db.administrativeEvent.create.mockResolvedValue({});
  db.administrativeNotification.create.mockResolvedValue({});
  db.institutionalMembership.findMany.mockResolvedValue([]);
  db.institutionalMembership.findFirst.mockResolvedValue({ id: "membership" });
  db.accountControl.findUnique.mockResolvedValue(null);
  db.teacherInvitationClass.findMany.mockResolvedValue([]);
  db.user.findFirst.mockResolvedValue({id:"authorized"});
  db.institution.findUnique.mockResolvedValue({
    id: "institution",
    status: "PENDING",
    ownerId: "owner",
  });
  db.user.findUnique.mockResolvedValue({
    id: "owner",
    email: "owner@example.com",
    emailVerifiedAt: new Date(),
    deletedAt: null,
    role: "ALUNO",
  });
  db.institution.update.mockResolvedValue({
    id: "institution",
    status: "ACTIVE",
  });
  db.institution.create.mockResolvedValue({ id: "institution" });
  db.teacherInvitation.count.mockResolvedValue(0);
  db.teacherInvitation.updateMany.mockResolvedValue({ count: 1 });
  db.institutionalClass.findMany.mockResolvedValue([]);
  mail.send.mockResolvedValue(undefined);
  service = new InstitutionService(mail);
});
afterEach(() => vi.unstubAllEnvs());

describe('institution-owned class delegation',()=>{
  it('returns current institutional counts instead of inferring totals from a paginated list',async()=>{
    db.institutionalMembership.findMany.mockResolvedValue([]);db.institutionalClass.findMany.mockResolvedValue([{classId:'class'}]);
    db.turma.findMany.mockResolvedValue([]);db.user.findMany.mockResolvedValue([]);db.user.count.mockResolvedValue(8);db.simulado.count.mockResolvedValue(3);
    db.institutionalMembership.count.mockResolvedValue(2);db.teacherInvitation.count.mockResolvedValue(1);db.turma.count.mockResolvedValue(1);
    const result=await service.institutionSummary(owner,'institution',1);
    expect(result.indicators).toEqual({classes:1,students:8,completedAttempts:3,activeTeachers:2,pendingInvitations:1,activeClasses:1});
    expect(db.teacherInvitation.count).toHaveBeenCalledWith({where:{institutionId:'institution',status:'PENDING',expiresAt:{gt:expect.any(Date)}}});
  });
  const admin={userId:'owner',role:'ALUNO',institutionId:'institution',institutionAdmin:true,allowedClassIds:['class']};
  it('creates institutional ownership without assigning the owner as professor',async()=>{
    db.turma.create.mockResolvedValue({id:'class',nome:'Turma institucional'});
    await new ClassExamService().createClass(admin,'Turma institucional');
    expect(db.turma.create.mock.calls[0][0].data).not.toHaveProperty('professores');
    expect(db.institutionalClass.create).toHaveBeenCalledWith({data:{classId:'class',institutionId:'institution'}});
  });
  it('denies professor attempts to designate other professors',async()=>{
    await expect(new ClassExamService().assignTeacher(teacher,'class','other',true)).rejects.toMatchObject({statusCode:403});
    expect(db.turma.update).not.toHaveBeenCalled();
  });
  it('denies global ADMIN academic mutations even with a forged institutional context',async()=>{
    await expect(new ClassExamService().createClass({...global,institutionId:'institution',institutionAdmin:true},'Turma')).rejects.toMatchObject({statusCode:403});
    expect(db.turma.create).not.toHaveBeenCalled();
  });
  it('denies assignment to a class outside the authorized institution',async()=>{
    db.turma.findFirst.mockResolvedValue(null);
    await expect(new ClassExamService().assignTeacher(admin,'foreign-class','other',true)).rejects.toMatchObject({statusCode:403});
    expect(db.turma.update).not.toHaveBeenCalled();
  });
  it('requires active institutional membership before assigning a teacher',async()=>{
    db.turma.findFirst.mockResolvedValue({id:'class'});
    db.institutionalMembership.findFirst.mockResolvedValueOnce({id:'owner-membership'}).mockResolvedValueOnce(null);
    await expect(new ClassExamService().assignTeacher(admin,'class','foreign-teacher',true)).rejects.toMatchObject({statusCode:403});
    expect(db.turma.update).not.toHaveBeenCalled();
  });
  it('assigns only the current institution without changing class ownership',async()=>{
    db.turma.findFirst.mockResolvedValue({id:'class'});
    await new ClassExamService().assignTeacher(admin,'class','authorized-teacher',true);
    expect(db.turma.update).toHaveBeenCalledWith({where:{id:'class'},data:{professores:{connect:{id:'authorized-teacher'}}},select:{id:true}});
    expect(db.institutionalClass.update).not.toHaveBeenCalled();
  });
  it('restricts the global directory to administrative identities',async()=>{
    db.user.findMany.mockResolvedValue([]);db.accountControl.findMany.mockResolvedValue([]);db.institutionalMembership.findMany.mockResolvedValue([]);
    await service.users(global,1);
    expect(db.user.findMany.mock.calls[0][0].where.AND[0].OR).toEqual(expect.arrayContaining([{institutionsOwned:{some:{}}},{institutionalMemberships:{some:{role:'INSTITUTION_ADMIN'}}}]));
  });
});
describe('administrative institution maintenance',()=>{
  it('denies maintenance to an institutional owner without a global role',async()=>{
    await expect(service.editAdministrativeInstitution(owner,'institution',{name:'Novo nome',reason:'Correção autorizada'})).rejects.toMatchObject({statusCode:403});
    expect(db.institution.update).not.toHaveBeenCalled();
  });
  it('updates only institutional information and records the administrator',async()=>{
    await service.editAdministrativeInstitution(global,'institution',{name:'Novo nome',reason:'Correção autorizada'});
    expect(db.institution.update.mock.calls[0][0].data).toEqual({name:'Novo nome',decisionReason:'Correção autorizada'});expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it('refuses an unconfirmed or unavailable new representative',async()=>{
    db.user.findFirst.mockResolvedValue(null);
    await expect(service.editAdministrativeInstitution(global,'institution',{responsibleEmail:'pending@example.invalid',reason:'Troca autorizada'})).rejects.toMatchObject({statusCode:409});
    expect(db.institutionalMembership.updateMany).not.toHaveBeenCalled();
  });
  it('transfers only institutional responsibility, preserving passwords and academic records',async()=>{
    db.institution.findUnique.mockResolvedValue({id:'institution',ownerId:'previous-owner',status:'ACTIVE'});
    db.user.findFirst.mockResolvedValue({id:'new-owner',nome:'Responsável',email:'new@example.invalid'});
    await service.editAdministrativeInstitution(global,'institution',{responsibleEmail:'new@example.invalid',reason:'Troca autorizada'});
    expect(db.institutionalMembership.updateMany).toHaveBeenCalledWith({where:{institutionId:'institution',userId:'previous-owner',role:'INSTITUTION_ADMIN'},data:{active:false}});
    expect(db.user.updateMany).toHaveBeenCalledWith({where:{id:{in:['previous-owner','new-owner']}},data:{sessionVersion:{increment:1}}});
    expect(db.turma.update).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("institutional approval and global authorization", () => {
  it("returns capabilities for the global administrator", async () => {
    expect(await currentAccess("global", "ADMIN")).toMatchObject({
      globalAdmin: true,
      effectiveRole: "ADMIN",
      enabled: true,
    });
  });
  it("does not query new tables before authorized activation (legacy DB compatibility)", async () => {
    vi.stubEnv("INSTITUTIONS_ENABLED", "false");
    expect(await currentAccess("student", "ALUNO")).toBeUndefined();
    expect(db.accountControl.findUnique).not.toHaveBeenCalled();
    expect(db.institutionalMembership.findMany).not.toHaveBeenCalled();
  });
  it("denies global indicators to regular users and institutional administrators", async () => {
    await expect(service.summary(owner)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(db.user.count).not.toHaveBeenCalled();
  });
  it("records a pending request with verified account identity and no administrative privileges", async () => {
    await service.request(owner, {
      name: "Instituição",
      responsibleName: "Responsável",
      phone: "11999999999",
      description: "Curso preparatório",
    });
    expect(db.institution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "owner",
          email: "owner@example.com",
          status: "PENDING",
        }),
      }),
    );
    expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
    expect(db.administrativeEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: "INSTITUTION_REQUESTED",
        institutionId: "institution",
      }),
    });
  });
  it("keeps requests awaiting email confirmation out of approval", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "owner@example.com",
      emailVerifiedAt: null,
    });
    await expect(service.request(owner,{name:'Instituição',responsibleName:'Responsável',phone:'11999999999',description:'Curso preparatório'})).rejects.toMatchObject({statusCode:403});
    expect(db.institution.create).not.toHaveBeenCalled();
    await expect(
      service.decide(global, "institution", "ACTIVE", "Aprovada"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
  });
  it("approves an institution, creates only institutional administration and notifies the owner atomically", async () => {
    await service.decide(global, "institution", "ACTIVE", "Dados conferidos");
    expect(db.institutionalMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          institutionId: "institution",
          userId: "owner",
          role: "INSTITUTION_ADMIN",
        },
      }),
    );
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.administrativeNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "owner",
        message: expect.stringContaining("aprovada"),
      }),
    });
  });
  it("rejects approval by an institutional administrator", async () => {
    await expect(
      service.decide(owner, "institution", "ACTIVE", "Forjada"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.institution.update).not.toHaveBeenCalled();
  });
  it("prevents self-promotion and changing the last active global administrator", async () => {
    await expect(
      service.controlUser(global, "global", { globalAdmin: true }),
    ).rejects.toMatchObject({ statusCode: 409 });
    db.user.findUnique.mockResolvedValue({
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    });
    db.user.findMany.mockResolvedValue([{ id: "last" }]);
    db.accountControl.findMany.mockResolvedValue([]);
    await expect(
      service.controlUser(global, "last", { suspended: true }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("denies suspended accounts on the next authenticated access", async () => {
    db.accountControl.findUnique.mockResolvedValue({ suspended: true });
    await expect(currentAccess("student", "ALUNO")).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe("teacher invitation lifecycle", () => {
  beforeEach(()=>db.institution.findUnique.mockResolvedValue({id:"institution",name:"Instituição de teste",status:"ACTIVE"}));
  it("sends an invitation with a token hash at rest and no raw credential in events or response", async () => {
    db.teacherInvitation.findFirst.mockResolvedValue(null);
    db.teacherInvitation.create.mockImplementation(async ({ data }) => ({
      id: "invite",
      ...data,
    }));
    const result = await service.invite(
      owner,
      "institution",
      "teacher@example.com",
    );
    const sent = mail.send.mock.calls[0][0];
    const token = sent.text.match(/token=([a-f0-9]{64})/)[1];
    expect(db.teacherInvitation.create.mock.calls[0][0].data.tokenHash).toBe(
      hashInvitation(token),
    );
    expect(JSON.stringify(result)).not.toContain(token);
    expect(
      JSON.stringify(db.administrativeEvent.create.mock.calls),
    ).not.toContain(token);
  });
  it("rejects invitations from an administrator of a different institution", async () => {
    db.institutionalMembership.findFirst.mockResolvedValue(null);
    await expect(
      service.invite(owner, "other-institution", "teacher@example.com"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mail.send).not.toHaveBeenCalled();
  });
  it("accepts only the invited verified identity and preserves the existing account", async () => {
    db.teacherInvitation.findUnique.mockResolvedValue({
      id: "invite",
      institutionId: "institution",
      email: "teacher@example.com",
    });
    db.institution.findUnique.mockResolvedValue({ status: "ACTIVE" });
    db.user.findUnique.mockResolvedValue({
      email: "teacher@example.com",
      emailVerifiedAt: new Date(),
      role: "ALUNO",
    });
    await service.accept({ userId: "teacher", role: "ALUNO" }, "a".repeat(64));
    expect(db.teacherInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
    expect(db.institutionalMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          institutionId: "institution",
          userId: "teacher",
          role: "TEACHER",
        },
      }),
    );
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "teacher" },
        data: { role: "PROFESSOR" },
      }),
    );
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it.each([
    ["other@example.com", new Date()],
    ["teacher@example.com", null],
  ])(
    "rejects wrong identity or unverified email",
    async (email, emailVerifiedAt) => {
      db.teacherInvitation.findUnique.mockResolvedValue({
        id: "invite",
        institutionId: "institution",
        email: "teacher@example.com",
      });
      db.user.findUnique.mockResolvedValue({ email, emailVerifiedAt });
      await expect(
        service.accept(student, "a".repeat(64)),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
    },
  );
  it("rejects cancelled, consumed or expired invitations without granting membership", async () => {
    db.teacherInvitation.findUnique.mockResolvedValue({
      id: "invite",
      institutionId: "institution",
      email: "owner@example.com",
    });
    db.institution.findUnique.mockResolvedValue({ status: "ACTIVE" });
    db.teacherInvitation.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.accept(owner, "a".repeat(64))).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
  });
  it("cancels invitation and records only safe operational context after mail failure", async () => {
    db.teacherInvitation.findFirst.mockResolvedValue(null);
    db.teacherInvitation.create.mockImplementation(async ({ data }) => ({
      id: "invite",
      ...data,
    }));
    mail.send.mockRejectedValue(
      new Error("provider credentials must never be logged"),
    );
    await expect(
      service.invite(owner, "institution", "teacher@example.com"),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(db.teacherInvitation.updateMany).toHaveBeenLastCalledWith({
      where: { id: "invite", status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    expect(db.administrativeEvent.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        event: "INVITATION_DELIVERY_FAILED",
        severity: "ERROR",
      }),
    });
  });
  it("removes only one institutional relationship, revokes sessions and preserves history", async () => {
    db.institutionalMembership.updateMany.mockResolvedValue({ count: 1 });
    db.institutionalClass.findMany.mockResolvedValue([{ classId: "class" }]);
    await service.unlink(owner, "institution", "teacher");
    expect(db.turma.update).toHaveBeenCalledWith({
      where: { id: "class" },
      data: { professores: { disconnect: { id: "teacher" } } },
      select: { id: true },
    });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sessionVersion: { increment: 1 } } }),
    );
    db.institutionalMembership.findMany.mockResolvedValue([]);
    expect(await currentAccess("teacher", "PROFESSOR")).toMatchObject({
      effectiveRole: "PROFESSOR",
      needsInstitutionLink:true,
    });
    db.institutionalMembership.findMany.mockResolvedValue([
      { role: "TEACHER", institutionId: "other" },
    ]);
    expect(await currentAccess("teacher", "PROFESSOR")).toMatchObject({
      effectiveRole: "PROFESSOR",
    });
  });
});

describe("class admissions and tenant boundaries", () => {
  it("creates a class only with a current active teaching relationship", async () => {
    db.turma.create.mockResolvedValue({ id: "class", nome: "Turma" });
    await new ClassExamService().createClass(teacher, "Turma");
    expect(db.institutionalClass.create).toHaveBeenCalledWith({
      data: { classId: "class", institutionId: "institution" },
    });
    expect(db.administrativeEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: "CLASS_CREATED",
        institutionId: "institution",
      }),
    });
    db.institutionalMembership.findFirst.mockResolvedValue(null);
    await expect(
      new ClassExamService().createClass(teacher, "Outra"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("records pending admission and does not enroll the student immediately", async () => {
    db.$queryRaw.mockResolvedValue([{ id: "class" }]);
    db.turma.findFirst.mockResolvedValue({ id: "class", alunos: [] });
    db.institutionalClass.findUnique.mockResolvedValue({
      institutionId: "institution",
      institution: { status: "ACTIVE" },
    });
    db.classJoinRequest.findUnique.mockResolvedValue(null);
    db.turma.findUnique.mockResolvedValue({ professores: [] });
    const result = await new ClassExamService().join(student, "a".repeat(32));
    expect(result.joined).toBe(false);
    expect(db.classJoinRequest.upsert).toHaveBeenCalled();
    expect(db.turma.update).not.toHaveBeenCalled();
  });
  it("approves a pending student and grants enrollment atomically", async () => {
    db.turma.findFirst.mockResolvedValue({ id: "class" });
    db.classJoinRequest.findFirst.mockResolvedValue({
      id: "request",
      studentId: "student",
    });
    db.user.findFirst.mockResolvedValue({ id: "student" });
    await new ClassExamService().decideJoin(teacher, "class", "request", true);
    expect(db.classJoinRequest.update).toHaveBeenCalledWith({
      where: { id: "request" },
      data: { status: "APPROVED", decidedAt: expect.any(Date) },
    });
    expect(db.turma.update).toHaveBeenCalledWith({
      where: { id: "class" },
      data: { alunos: { connect: { id: "student" } } },
      select: { id: true },
    });
  });
  it("denies pending and unapproved students access to class exams", async () => {
    db.simulado.findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      new ClassExamService().attempt(student, "attempt"),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.simulado.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          alunoId: "student",
          avaliacao: expect.objectContaining({
            turmas: expect.objectContaining({
              some: expect.objectContaining({
                alunos: { some: { id: "student" } },
              }),
            }),
          }),
        }),
      }),
    );
  });
  it("denies management of another institutional class", async () => {
    db.turma.findFirst.mockResolvedValue(null);
    await expect(
      new ClassExamService().decideJoin(
        teacher,
        "other-class",
        "request",
        true,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.turma.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "other-class",
          AND: [{ id: { in: ["class"] } }],
          professores: { some: { id: "teacher" } },
        }),
      }),
    );
    expect(db.classJoinRequest.update).not.toHaveBeenCalled();
  });
  it("removes enrollment without deleting any student attempts or history", async () => {
    db.turma.findFirst.mockResolvedValue({ id: "class" });
    await new ClassExamService().removeStudent(teacher, "class", "student");
    expect(db.turma.update).toHaveBeenCalledWith({
      where: { id: "class" },
      data: { alunos: { disconnect: { id: "student" } } },
      select: { id: true },
    });
    expect(db.simulado.update).not.toHaveBeenCalled();
  });
});

describe("audit isolation", () => {
  it("denies global audit to institutional administrators", async () => {
    await expect(service.logs(owner, { page: 1 })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(db.administrativeEvent.findMany).not.toHaveBeenCalled();
  });
  it("applies institution, event, severity, period and pagination filters", async () => {
    db.administrativeEvent.findMany.mockResolvedValue([]);
    await service.logs(
      owner,
      {
        page: 2,
        institutionId: "institution",
        severity: "WARN",
        event: "ACCESS_DENIED",
        from: "2026-11-01T00:00:00Z",
      },
      true,
    );
    expect(db.administrativeEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          institutionId: "institution",
          severity: "WARN",
          event: "ACCESS_DENIED",
          occurredAt: { gte: new Date("2026-11-01T00:00:00Z"), lte: undefined },
        }),
        take: 26,
        skip: 25,
      }),
    );
  });
  it("denies audit access to a different institution", async () => {
    db.institutionalMembership.findFirst.mockResolvedValue(null);
    await expect(
      service.logs(owner, { page: 1, institutionId: "other" }, true),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.administrativeEvent.findMany).not.toHaveBeenCalled();
  });
});
