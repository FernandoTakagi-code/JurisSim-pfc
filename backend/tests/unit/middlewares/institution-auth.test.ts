import { beforeEach, afterEach, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  control: vi.fn(),
  memberships: vi.fn(),
  classes: vi.fn(),
}));
vi.mock("../../../src/repositories/auth-repository", () => ({
  AuthRepository: class {
    findByIdForAuth = mocks.user;
  },
}));
vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    accountControl: { findUnique: mocks.control },
    institutionalMembership: { findMany: mocks.memberships },
    institutionalClass: { findMany: mocks.classes },
  },
}));
import { requireAuth, requireLimitedAuth, type AuthenticatedRequest } from "../../../src/middlewares/auth-middleware";
const secret = "institution-middleware-test-secret-more-than-32";
const userId = "00000000-0000-4000-8000-000000000099";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INSTITUTIONS_ENABLED", "true");
  vi.stubEnv("JWT_SECRET", secret);
  mocks.user.mockResolvedValue({
    id: userId,
    role: "PROFESSOR",
    emailVerifiedAt: new Date(), termsVersion: '2026-11-13.1', privacyVersion: '2026-11-22.1',
    sessionVersion: 0,
  });
  mocks.control.mockResolvedValue(null);
  mocks.memberships.mockResolvedValue([
    {
      institutionId: "first",
      role: "TEACHER",
      institution: { name: "Primeira" },
    },
    {
      institutionId: "second",
      role: "TEACHER",
      institution: { name: "Segunda" },
    },
  ]);
  mocks.classes.mockResolvedValue([{ classId: "class-second" }]);
});
afterEach(() => vi.unstubAllEnvs());
it('does not elevate a personal ALUNO merely because an administrative membership exists',async()=>{
  mocks.user.mockResolvedValue({id:userId,role:'ALUNO',emailVerifiedAt:new Date(), termsVersion: '2026-11-13.1', privacyVersion: '2026-11-22.1',sessionVersion:0});
  mocks.memberships.mockResolvedValue([{institutionId:'first',role:'INSTITUTION_ADMIN',institution:{name:'Primeira'}}]);
  const {req,next}=await authenticate('first');expect(next).toHaveBeenCalledWith();expect(req.auth).toEqual({userId,role:'ALUNO'});expect(mocks.classes).not.toHaveBeenCalled();
});
it('does not turn a professor administrative membership into teaching delegation in personal mode',async()=>{
  mocks.memberships.mockResolvedValue([{institutionId:'first',role:'INSTITUTION_ADMIN',institution:{name:'Primeira'}}]);
  const {next}=await authenticate('first');expect(next).toHaveBeenCalledWith(expect.objectContaining({statusCode:403}));
});
it('rejects a forged administrative context without the required membership',async()=>{
  const {next}=await authenticate('first','/turmas',true);expect(next).toHaveBeenCalledWith(expect.objectContaining({statusCode:403}));expect(mocks.classes).not.toHaveBeenCalled();
});
it('derives institutional administration from the active backend membership, without changing the individual role',async()=>{
  mocks.user.mockResolvedValue({id:userId,role:'ALUNO',emailVerifiedAt:new Date(), termsVersion: '2026-11-13.1', privacyVersion: '2026-11-22.1',sessionVersion:0});
  mocks.memberships.mockResolvedValue([{institutionId:'first',role:'INSTITUTION_ADMIN',institution:{name:'Primeira'}}]);
  const {req,next}=await authenticate('first','/turmas',true);
  expect(next).toHaveBeenCalledWith();expect(req.auth).toMatchObject({role:'ALUNO',institutionId:'first',institutionAdmin:true});
});
it('allows only invitations and teacher-class assignment through the narrow read-only capability',async()=>{
  vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('ADMINISTRATION_ENABLED','false');vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','false');vi.stubEnv('INSTITUTION_TEACHER_MANAGEMENT_ENABLED','true');
  mocks.user.mockResolvedValue({id:userId,role:'ALUNO',registrationIntent:'INSTITUTION',emailVerifiedAt:new Date(), termsVersion: '2026-11-13.1', privacyVersion: '2026-11-22.1',sessionVersion:0});
  mocks.memberships.mockResolvedValue([{institutionId:'first',role:'INSTITUTION_ADMIN',institution:{name:'Primeira'}}]);
  const invitation=await authenticate('first',`/institutions/${userId}/invitations`,true,'POST');
  expect(invitation.next).toHaveBeenCalledWith();expect(invitation.req.auth).toMatchObject({role:'ALUNO',institutionId:'first',institutionAdmin:true});
  const assignment=await authenticate('first',`/turmas/${userId}/teachers/${userId}`,true,'PUT');
  expect(assignment.next).toHaveBeenCalledWith();
  const unrelated=await authenticate('first','/turmas',true,'POST');
  expect(unrelated.next).toHaveBeenCalledWith(expect.objectContaining({statusCode:503}));
});
it('does not infer academic delegation from ADMIN or a requested institution header',async()=>{
  mocks.user.mockResolvedValue({id:userId,role:'ADMIN',emailVerifiedAt:new Date(), termsVersion: '2026-11-13.1', privacyVersion: '2026-11-22.1',sessionVersion:0});
  const {req}=await authenticate('first');expect(req.auth?.institutionAdmin).toBeUndefined();expect(req.auth?.allowedClassIds).toBeUndefined();
});
async function authenticate(institution?: string, originalUrl = "/turmas", administrative=false, method='GET') {
  const token = jwt.sign(
    { id: userId, role: "ALUNO", sessionVersion: 0 },
    secret,
    { expiresIn: "1h" },
  );
  const req = {
    originalUrl,
    method,
    header: (key: string) =>
      key === "authorization" ? `Bearer ${token}` : key==='x-institution-id'?institution:key==='x-institution-context'&&administrative?'administration':undefined,
  } as AuthenticatedRequest;
  const next = vi.fn();
  await requireAuth(req, { set: vi.fn() } as never, next);
  return { req, next };
}
it("requires explicit context when a teacher has multiple institutions", async () => {
  const { next } = await authenticate();
  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ statusCode: 409 }),
  );
  expect(mocks.classes).not.toHaveBeenCalled();
});
it("selects only classes from a current verified teaching membership", async () => {
  const { req, next } = await authenticate("second");
  expect(req.auth).toEqual({
    userId,
    role: "PROFESSOR",
    institutionAdmin:false,
    institutionId: "second",
    allowedClassIds: ["class-second"],
  });
  expect(next).toHaveBeenCalledWith();
  expect(mocks.classes).toHaveBeenCalledWith({
    where: { institutionId: "second",turma:{professores:{some:{id:userId}}} },
    select: { classId: true },
  });
});
it("rejects a forged institution even if the JWT still exists", async () => {
  const { next } = await authenticate("unrelated");
  expect(next).toHaveBeenCalledWith(
    expect.objectContaining({ statusCode: 403 }),
  );
  expect(mocks.classes).not.toHaveBeenCalled();
});
it("revocation denies teaching access while preserving the personal professor identity", async () => {
  mocks.memberships.mockResolvedValue([]);
  const { req, next } = await authenticate("first");
  expect(req.auth?.role).toBe('PROFESSOR');
  expect(next).toHaveBeenCalledWith(expect.objectContaining({statusCode:403}));
  expect(mocks.classes).not.toHaveBeenCalled();
});
it("keeps session inspection accessible before a teacher selects a context", async () => {
  const { req, next } = await authenticate(undefined, "/auth/session");
  expect(req.auth?.role).toBe("PROFESSOR");
  expect(next).toHaveBeenCalledWith();
});
it('preserves verified legacy teacher access with the feature disabled without querying memberships', async () => {
  vi.stubEnv('INSTITUTIONS_ENABLED', 'false');
  mocks.memberships.mockRejectedValue(new Error('Must not query this table'));
  const { req, next } = await authenticate();
  expect(req.auth).toEqual({ userId, role: 'PROFESSOR' }); expect(next).toHaveBeenCalledWith();
  expect(mocks.control).not.toHaveBeenCalled(); expect(mocks.memberships).not.toHaveBeenCalled();
});
it('keeps email confirmation mandatory but permits the limited existing confirmation flow', async () => {
  vi.stubEnv('INSTITUTIONS_ENABLED', 'false');
  mocks.user.mockResolvedValue({ id: userId, role: 'PROFESSOR', emailVerifiedAt: null, sessionVersion: 0 });
  const { req, next } = await authenticate(undefined, '/auth/session');
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  const limited = vi.fn(); await requireLimitedAuth(req, { set: vi.fn() } as never, limited);
  expect(limited).toHaveBeenCalledWith(); expect(req.auth?.role).toBe('PROFESSOR');
  expect(mocks.memberships).not.toHaveBeenCalled();
});
it('denies a previously issued token after session revocation even while institutions are disabled', async () => {
  vi.stubEnv('INSTITUTIONS_ENABLED', 'false');
  mocks.user.mockResolvedValue({ id: userId, role: 'ADMIN', emailVerifiedAt: new Date(), termsVersion: '2026-11-13.1', privacyVersion: '2026-11-22.1', sessionVersion: 1 });
  const { next } = await authenticate();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
});

it.each([
 ['POST','/avaliacoes'],['PUT',`/avaliacoes/${userId}`],['POST',`/avaliacoes/${userId}/publish`],['POST',`/avaliacoes/${userId}/close`],['POST',`/avaliacoes/${userId}/archive`],['DELETE',`/avaliacoes/${userId}`],
])('permite escrita de simulados com capacidade específica: %s %s',async(method,path)=>{
 vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('INSTITUTION_EXAM_MANAGEMENT_ENABLED','true');vi.stubEnv('INSTITUTION_TEACHER_MANAGEMENT_ENABLED','false');
 mocks.user.mockResolvedValue({id:userId,role:'ALUNO',registrationIntent:'INSTITUTION',emailVerifiedAt:new Date(), termsVersion: '2026-11-13.1', privacyVersion: '2026-11-22.1',sessionVersion:0});mocks.memberships.mockResolvedValue([{institutionId:'first',role:'INSTITUTION_ADMIN',institution:{name:'Primeira'}}]);
 const result=await authenticate('first',path,true,method);expect(result.next).toHaveBeenCalledWith();expect(result.req.auth).toMatchObject({institutionId:'first',institutionAdmin:true});
});
it('a capacidade de simulados não libera outras operações nem ignora revogação',async()=>{
 vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('INSTITUTION_EXAM_MANAGEMENT_ENABLED','true');vi.stubEnv('INSTITUTION_TEACHER_MANAGEMENT_ENABLED','false');
 mocks.user.mockResolvedValue({id:userId,role:'ALUNO',registrationIntent:'INSTITUTION',emailVerifiedAt:new Date(), termsVersion: '2026-11-13.1', privacyVersion: '2026-11-22.1',sessionVersion:0});mocks.memberships.mockResolvedValue([{institutionId:'first',role:'INSTITUTION_ADMIN',institution:{name:'Primeira'}}]);
 for(const path of ['/turmas','/atividades',`/avaliacoes/${userId}/attempts`])expect((await authenticate('first',path,true,'POST')).next).toHaveBeenCalledWith(expect.objectContaining({statusCode:503}));
 vi.stubEnv('INSTITUTION_EXAM_MANAGEMENT_ENABLED','false');expect((await authenticate('first','/avaliacoes',true,'POST')).next).toHaveBeenCalledWith(expect.objectContaining({statusCode:503}));
 vi.stubEnv('INSTITUTION_EXAM_MANAGEMENT_ENABLED','true');mocks.memberships.mockResolvedValue([]);expect((await authenticate('first','/avaliacoes',true,'POST')).next).toHaveBeenCalledWith(expect.objectContaining({statusCode:403}));
});
