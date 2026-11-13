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
import { institutionApplication } from "../__tests__/fixtures/institution-request";
import { ClassExamService } from "./class-exam-service";
import { EmailDeliveryFailure } from './email-delivery-failure';

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
  db.user.findMany.mockResolvedValue([]);
  db.institution.findUnique.mockResolvedValue({
    ...institutionApplication, registrationNumber: "12ABC34501DE35", description: "Declara\u00e7\u00e3o: institui\u00e7\u00e3o sem site oficial.",
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

describe('H4.29 acceptance retries and transactional failures (in-memory persistence)', () => {
  function lifecycle(failMembership = false) {
    const state = { status: 'PENDING', role: 'ALUNO', acceptedById: null as string | null, history: ['previous-student-attempt'] };
    let queue: Promise<unknown> = Promise.resolve();
    db.$transaction.mockImplementation(work => {
      const operation = queue.then(async () => {
        const before = structuredClone(state);
        try { return await work(db); } catch(error) { Object.assign(state, before); throw error; }
      });
      queue = operation.catch(() => undefined); return operation;
    });
    db.institution.findUnique.mockResolvedValue({status:'ACTIVE'});
    db.teacherInvitation.findUnique.mockImplementation(() => ({id:'invite',institutionId:'institution',email:'teacher@example.com',status:state.status,acceptedById:state.acceptedById,expiresAt:new Date(Date.now()+60000)}));
    db.user.findUnique.mockImplementation(() => ({id:'teacher',email:'teacher@example.com',emailVerifiedAt:new Date(),role:state.role,deletedAt:null}));
    db.teacherInvitation.updateMany.mockImplementation(() => {
      if(state.status!=='PENDING')return {count:0};state.status='ACCEPTED';state.acceptedById='teacher';return {count:1};
    });
    db.institutionalMembership.upsert.mockImplementation(() => {if(failMembership)throw new Error('mock membership persistence failed');return {id:'membership'};});
    db.user.update.mockImplementation(({data}) => {state.role=data.role;return {id:'teacher'};});
    return state;
  }
  it('serializes two repeated accepts, grants once and preserves student history', async () => {
    const state=lifecycle();
    const results=await Promise.all([service.accept({userId:'teacher',role:'ALUNO'},'a'.repeat(64)),service.accept({userId:'teacher',role:'ALUNO'},'a'.repeat(64))]);
    expect(results[1].message).toContain('já foi aceito');expect(state.role).toBe('PROFESSOR');
    expect(state.history).toEqual(['previous-student-attempt']);expect(db.institutionalMembership.upsert).toHaveBeenCalledOnce();expect(db.user.update).toHaveBeenCalledOnce();
  });
  it('rolls back the claimed invitation when membership persistence fails', async () => {
    const state=lifecycle(true);
    await expect(service.accept({userId:'teacher',role:'ALUNO'},'a'.repeat(64))).rejects.toThrow('mock membership persistence failed');
    expect(state.status).toBe('PENDING');expect(state.role).toBe('ALUNO');expect(db.user.update).not.toHaveBeenCalled();
  });
  it('retry of an already accepted invitation does not reactivate a removed membership', async () => {
    const state=lifecycle();state.status='ACCEPTED';state.acceptedById='teacher';state.role='PROFESSOR';
    await expect(service.accept({userId:'teacher',role:'PROFESSOR'},'a'.repeat(64))).resolves.toHaveProperty('message');
    expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();
  });
  it('clears the pending identity marker only on explicitly authenticated acceptance',async()=>{
    lifecycle();
    db.user.findUnique.mockResolvedValue({id:'teacher',email:'teacher@example.com',emailVerifiedAt:new Date(),role:'ALUNO',registrationIntent:'TEACHER_INVITATION'});
    await service.accept({userId:'teacher',role:'ALUNO'},'a'.repeat(64));
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({data:{role:'PROFESSOR',registrationIntent:null}}));
    expect(db.institutionalMembership.upsert).toHaveBeenCalledOnce();
  });
});

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
  it('does not query accounts without an explicit search',async()=>{
    await expect(service.users(global,1)).resolves.toMatchObject({items:[]});
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('searches all account profiles with bounded server pagination',async()=>{
    db.user.findMany.mockResolvedValue([]);db.accountControl.findMany.mockResolvedValue([]);
    await service.users(global,2,'aluno','ALUNO');
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({role:'ALUNO',deletedAt:null}),take:26,skip:25}));
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
    vi.stubEnv("ADMINISTRATION_ENABLED", "false");
    vi.stubEnv("INSTITUTION_REGISTRATION_ENABLED", "false");
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
      service.controlUser(global, "global", { globalAdmin: true, reason: "Authorized review" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    db.user.findUnique.mockResolvedValue({
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    });
    db.user.findMany.mockResolvedValue([{ id: "last" }]);
    db.accountControl.findMany.mockResolvedValue([]);
    await expect(
      service.controlUser(global, "last", { suspended: true, reason: "Authorized review" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("denies suspended accounts on the next authenticated access", async () => {
    db.accountControl.findUnique.mockResolvedValue({ suspended: true });
    await expect(currentAccess("student", "ALUNO")).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('account consultation and control safeguards', () => {
  it('rechecks active verified ADMIN authority inside the suspension transaction', async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(service.controlUser(global, 'student', { suspended: true, reason: 'Authorized account review' })).rejects.toMatchObject({ statusCode: 403 });
    expect(db.accountControl.upsert).not.toHaveBeenCalled(); expect(db.user.update).not.toHaveBeenCalled();
  });
  it.each(['ACTIVE','SUSPENDED'] as const)('combines account status %s with name search in the database', async status => {
    db.user.findMany.mockResolvedValue([]);db.accountControl.findMany.mockResolvedValue([]);
    await service.users(global,1,'student','ALUNO',status);
    const where = db.user.findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toHaveLength(2);
    if(status==='SUSPENDED') expect(where.accountControl).toEqual({is:{suspended:true}});
    else expect(where.OR).toHaveLength(2);
  });
  it('rejects missing reasons before any mutation', async () => {
    await expect(service.controlUser(global,'student',{suspended:true})).rejects.toMatchObject({statusCode:400});
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each([true,false])('controls student suspension %s and revokes sessions atomically', async suspended => {
    await service.controlUser(global,'student',{suspended,reason:'Authorized account review'});
    expect(db.accountControl.upsert).toHaveBeenCalledWith(expect.objectContaining({update:{suspended}}));
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({data:{sessionVersion:{increment:1}}}));
    expect(db.administrativeEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({resourceId:'student',event:suspended?'ACCOUNT_SUSPENDED':'ACCOUNT_REACTIVATED',result:JSON.stringify({status:'SUCCESS',reason:'Authorized account review'})})});
  });
  it('blocks incomplete applications without granting membership', async () => {
    db.institution.findUnique.mockResolvedValue({id:'legacy',status:'PENDING',ownerId:'owner'});
    await expect(service.decide(global,'legacy','ACTIVE','Reviewed application')).rejects.toMatchObject({statusCode:409});
    expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
  });
  it('keeps authorized reactivation available to legacy institutions', async () => {
    db.institution.findUnique.mockResolvedValue({id:'legacy',status:'SUSPENDED',ownerId:'owner'});
    await service.decide(global,'legacy','ACTIVE','Authorized reactivation');
    expect(db.institutionalMembership.upsert).toHaveBeenCalled();
  });
  it('denies non-admin access to account history', async () => {
    await expect(service.userHistory(owner,'student',1)).rejects.toMatchObject({statusCode:403});
    expect(db.administrativeEvent.findMany).not.toHaveBeenCalled();
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
        new EmailDeliveryFailure('not_accepted','connect'),
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
  it('H4.6 retains an invitation when SMTP acceptance is indeterminate',async()=>{
    db.teacherInvitation.findFirst.mockResolvedValue(null);
    db.teacherInvitation.create.mockImplementation(async({data})=>({id:'invite',...data}));
    mail.send.mockRejectedValue(new EmailDeliveryFailure('indeterminate','request_deadline'));
    await expect(service.invite(owner,'institution','teacher@example.com')).rejects.toMatchObject({statusCode:503,message:expect.stringContaining('permanece válido')});
    expect(db.teacherInvitation.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({where:{id:'invite',status:'PENDING'}}));
    expect(db.administrativeEvent.create).toHaveBeenLastCalledWith({data:expect.objectContaining({event:'INVITATION_DELIVERY_UNKNOWN',severity:'WARN'})});
  });
  it('H4.6 does not cancel an accepted SMTP invitation when sentAt persistence fails',async()=>{
    db.teacherInvitation.findFirst.mockResolvedValue(null);
    db.teacherInvitation.create.mockImplementation(async({data})=>({id:'invite',...data}));
    mail.send.mockResolvedValue(undefined);db.teacherInvitation.update.mockRejectedValue(new Error('isolated metadata failure'));
    await expect(service.invite(owner,'institution','teacher@example.com')).resolves.toMatchObject({message:expect.stringContaining('aceitou')});
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(db.teacherInvitation.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({where:{id:'invite',status:'PENDING'}}));
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
