import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ restricted: false, authorized: true, participantCheck: vi.fn() }));
const db = vi.hoisted(() => {
  const model = () => Object.fromEntries(['findFirst', 'findUnique', 'findMany', 'count', 'create', 'update', 'updateMany', 'upsert'].map(key => [key, vi.fn()]));
  return { $transaction: vi.fn(), $queryRaw: vi.fn(), user: model(), accountControl: model(), institution: model(), institutionalMembership: model(), teacherInvitation: model(), teacherInvitationClass: model(), administrativeEvent: model() };
});
vi.mock('../lib/prisma', () => ({ prisma: db }));
vi.mock('../config/institution-homologation', async original => {
  const { ApiError } = await import('../errors/api-error');
  return { ...await original<typeof import('../config/institution-homologation')>(),
    restrictedInstitutionId: () => fixture.restricted ? 'institution' : undefined,
    homologationManifest: () => ({ institutionId: 'institution', adminIds: ['admin'], runId: 'fixture-run' }),
    assertRestrictedInstitution: () => {},
    assertRestrictedParticipant: () => { fixture.participantCheck(); if (fixture.restricted && !fixture.authorized) throw new ApiError(403, 'Conta fora do escopo autorizado.'); },
  };
});
import { InstitutionService } from './institution-service';
import { EmailDeliveryFailure } from './email-delivery-failure';
import { emailFrontendContext } from './email-frontend';
import type { Request, Response } from 'express';
const mail = { isConfigured: true, send: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks(); fixture.restricted = false; fixture.authorized = true;
  vi.stubEnv('APP_PUBLIC_URL', 'https://jurissim.example'); vi.stubEnv('INSTITUTIONS_ENABLED', 'true');
  // These fixtures own their deployment mode; never inherit a private overlay.
  vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED', 'false');
  vi.stubEnv('TEACHER_INVITATIONS_MODE', '');
  vi.stubEnv('JURISSIM_RUNTIME_DATA_SOURCE', '');
  vi.stubEnv('LOCAL_EMAIL_CAPTURE_ENABLED', 'false');
  vi.stubEnv('LOCAL_DIAGNOSTIC_DEMO_MODE', 'false');
  db.$transaction.mockImplementation(work => work(db));
  db.administrativeEvent.findFirst.mockResolvedValue({ result: JSON.stringify({ runId: 'fixture-run' }) });
  db.institutionalMembership.findFirst.mockResolvedValue({ id: 'manager' });
  db.institution.findUnique.mockResolvedValue({ name: 'Fixture institution', status: 'ACTIVE' });
  db.teacherInvitation.count.mockResolvedValue(0); db.teacherInvitation.findFirst.mockResolvedValue(null);
  db.teacherInvitation.create.mockImplementation(({ data }) => ({ id: 'invitation', ...data }));
  db.user.findMany.mockResolvedValue([{ id: 'existing-student', role: 'ALUNO', emailVerifiedAt: new Date(), deletedAt: null }]);
  db.accountControl.findUnique.mockResolvedValue(null);
  db.teacherInvitation.updateMany.mockResolvedValue({ count: 1 });
  db.teacherInvitationClass.findMany.mockResolvedValue([]);
  db.institutionalMembership.count.mockResolvedValue(0);
});
afterEach(() => vi.unstubAllEnvs());
it('standard mode can invite an existing Aluno without changing role, identity or history on send', async () => {
  await new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'student@example.invalid');
  expect(db.teacherInvitation.create).toHaveBeenCalled(); expect(mail.send).toHaveBeenCalled(); expect(db.user.update).not.toHaveBeenCalled(); expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
  expect(fixture.participantCheck).not.toHaveBeenCalled();
});
it('restricted mode refuses an existing Aluno outside the explicit participant scope with an actionable explanation', async () => {
  fixture.restricted = true; fixture.authorized = false;
  await expect(new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'student@example.invalid')).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('não está disponível para convite neste ambiente') });
  expect(db.teacherInvitation.create).not.toHaveBeenCalled(); expect(mail.send).not.toHaveBeenCalled(); expect(db.user.update).not.toHaveBeenCalled();
});
it('restricted mode permits the previously authorized existing Aluno but still does not promote on send', async () => {
  fixture.restricted = true;
  await new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'student@example.invalid');
  expect(db.teacherInvitation.create).toHaveBeenCalled(); expect(db.user.update).not.toHaveBeenCalled();
});
it('restricted mode refuses a new/unknown account without creating one or sending mail', async () => {
  fixture.restricted = true; db.user.findMany.mockResolvedValue([]);
  await expect(new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'new@example.invalid')).rejects.toMatchObject({ statusCode: 403 });
  expect(db.user.create).not.toHaveBeenCalled(); expect(mail.send).not.toHaveBeenCalled();
});
it('normal institutional flow supports a new recipient even if a private homologation registry exists', async () => {
  db.user.findMany.mockResolvedValue([]);
  await new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'new@example.invalid');
  expect(db.teacherInvitation.create).toHaveBeenCalled(); expect(mail.send).toHaveBeenCalledOnce();
  expect(fixture.participantCheck).not.toHaveBeenCalled(); expect(db.user.create).not.toHaveBeenCalled(); expect(db.user.update).not.toHaveBeenCalled();
});
it('normal flow does not impose restricted pre-registration confirmation on an existing Aluno', async () => {
  db.user.findMany.mockResolvedValue([{ id: 'student', role: 'ALUNO', emailVerifiedAt: null, deletedAt: null }]);
  await new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'student@example.invalid');
  expect(mail.send).toHaveBeenCalledOnce(); expect(db.user.update).not.toHaveBeenCalled();
});
it('checks actor authorization before recipient eligibility or provider availability', async () => {
  db.institutionalMembership.findFirst.mockResolvedValue(null);
  await expect(new InstitutionService({ isConfigured: false, send: mail.send }).invite({ userId: 'outsider', role: 'ALUNO' }, 'institution', 'student@example.invalid')).rejects.toMatchObject({ statusCode: 403, message: 'Administração institucional não autorizada.' });
  expect(db.user.findMany).not.toHaveBeenCalled(); expect(db.teacherInvitation.create).not.toHaveBeenCalled(); expect(mail.send).not.toHaveBeenCalled();
});
it.each(['ADMIN', 'deleted', 'suspended'])('rejects an already ineligible recipient (%s) before sending an unusable invitation', async state => {
  db.user.findMany.mockResolvedValue([{ id: 'recipient', role: state === 'ADMIN' ? 'ADMIN' : 'ALUNO', deletedAt: state === 'deleted' ? new Date() : null, emailVerifiedAt: new Date() }]);
  db.accountControl.findUnique.mockResolvedValue({ suspended: state === 'suspended' });
  await expect(new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'recipient@example.invalid')).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('não está elegível') });
  expect(db.teacherInvitation.create).not.toHaveBeenCalled(); expect(mail.send).not.toHaveBeenCalled();
});
it('reports duplicate pending invitation without cancelling it or sending another email', async () => {
  db.teacherInvitation.findFirst.mockResolvedValue({ id: 'pending-invitation' });
  await expect(new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'recipient@example.invalid')).rejects.toMatchObject({ statusCode: 409, message: 'Já existe um convite pendente para este e-mail.' });
  expect(db.teacherInvitation.updateMany).not.toHaveBeenCalled(); expect(db.teacherInvitation.create).not.toHaveBeenCalled(); expect(mail.send).not.toHaveBeenCalled();
});
it('reports provider unavailability only after authorization and without persisting an invitation', async () => {
  await expect(new InstitutionService({ isConfigured: false, send: mail.send }).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'recipient@example.invalid')).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('serviço de envio') });
  expect(db.teacherInvitation.create).not.toHaveBeenCalled(); expect(db.teacherInvitation.updateMany).not.toHaveBeenCalled(); expect(mail.send).not.toHaveBeenCalled();
});
it.each(['not_accepted', 'indeterminate'] as const)('does not report success on provider failure %s (mock transport only)', async outcome => {
  mail.send.mockRejectedValue(new EmailDeliveryFailure(outcome, 'provider'));
  await expect(new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'recipient@example.invalid')).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining(outcome === 'indeterminate' ? 'indeterminado' : 'cancelado') });
  const cancelledCurrent = db.teacherInvitation.updateMany.mock.calls.some(([args]) => args.where.id === 'invitation' && args.data.status === 'CANCELLED');
  expect(cancelledCurrent).toBe(outcome === 'not_accepted');
  expect(db.user.update).not.toHaveBeenCalled(); expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('does not claim cancellation when persistence of delivery-failure compensation fails', async () => {
  mail.send.mockRejectedValue(new EmailDeliveryFailure('not_accepted', 'smtp'));
  db.teacherInvitation.updateMany.mockResolvedValueOnce({ count: 0 }).mockRejectedValueOnce(new Error('mock compensation unavailable'));
  await expect(new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', 'recipient@example.invalid')).rejects.toThrow('mock compensation unavailable');
  expect(db.user.update).not.toHaveBeenCalled();
  expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('resending does not bypass restricted recipient authorization', async () => {
  fixture.restricted = true; fixture.authorized = false;
  db.teacherInvitation.findFirst.mockResolvedValue({ id: 'old', email: 'original@example.invalid', createdAt: new Date(Date.now() - 120000) });
  await expect(new InstitutionService(mail).invite({ userId: 'owner', role: 'ALUNO' }, 'institution', '', 'old')).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('não está disponível para convite neste ambiente') });
  expect(db.user.findMany.mock.calls[0][0].where.email.equals).toBe('original@example.invalid');
  expect(db.teacherInvitation.updateMany).not.toHaveBeenCalled(); expect(mail.send).not.toHaveBeenCalled();
});
it.each([false,true])('production invites existing/new recipients without private participant authorization: new=%s', async isNew => {
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('TEACHER_INVITATIONS_MODE','production');vi.stubEnv('BREVO_EMAIL_TRANSPORT','api');vi.stubEnv('BREVO_API_KEY','isolated-test-key');
  if(isNew)db.user.findMany.mockResolvedValue([]);
  await new InstitutionService(mail).invite({userId:'owner',role:'ALUNO'},'institution','production-recipient@example.invalid');
  expect(mail.send).toHaveBeenCalledOnce();expect(fixture.participantCheck).not.toHaveBeenCalled();
  expect(db.user.create).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('production missing explicit mode fails before any persistence or email', async () => {
  vi.stubEnv('NODE_ENV','production');
  await expect(new InstitutionService(mail).invite({userId:'owner',role:'ALUNO'},'institution','recipient@example.invalid')).rejects.toMatchObject({statusCode:503});
  expect(db.$transaction).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
});
it('does not invite an account already teaching in the same institution', async () => {
  db.institutionalMembership.count.mockResolvedValue(1);
  await expect(new InstitutionService(mail).invite({userId:'owner',role:'ALUNO'},'institution','recipient@example.invalid')).rejects.toMatchObject({statusCode:409,message:expect.stringContaining('vínculo docente ativo')});
  expect(db.teacherInvitation.create).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
});
it('blocks resend of a live invitation whose delivery was not confirmed', async () => {
  db.teacherInvitation.findFirst.mockResolvedValueOnce({id:'old',email:'recipient@example.invalid',status:'PENDING',sentAt:null,createdAt:new Date(Date.now()-120000),expiresAt:new Date(Date.now()+3600000)});
  await expect(new InstitutionService(mail).invite({userId:'owner',role:'ALUNO'},'institution','','old')).rejects.toMatchObject({statusCode:409,message:expect.stringContaining('envio anterior')});
  expect(db.teacherInvitation.create).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
});
it('a cancelled invitation may be resent with a fresh token while retaining the old record', async () => {
  db.teacherInvitation.findFirst.mockResolvedValueOnce({id:'old',email:'recipient@example.invalid',status:'CANCELLED',sentAt:null,createdAt:new Date(Date.now()-120000),expiresAt:new Date(Date.now()+3600000)}).mockResolvedValueOnce(null);
  await new InstitutionService(mail).invite({userId:'owner',role:'ALUNO'},'institution','','old');
  expect(db.teacherInvitation.create).toHaveBeenCalledOnce();expect(mail.send).toHaveBeenCalledOnce();
  expect(db.teacherInvitation.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({where:expect.objectContaining({id:{not:'old'}})}));
});
it('a stale cancelled invitation cannot replace another live pending invitation', async () => {
  db.teacherInvitation.findFirst.mockResolvedValueOnce({id:'old',email:'recipient@example.invalid',status:'CANCELLED',createdAt:new Date(Date.now()-120000)}).mockResolvedValueOnce({id:'newer'});
  await expect(new InstitutionService(mail).invite({userId:'owner',role:'ALUNO'},'institution','','old')).rejects.toMatchObject({statusCode:409,message:expect.stringContaining('pendente')});
  expect(db.teacherInvitation.create).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
});
it('does not claim cancellation if no pending invitation was changed', async () => {
  mail.send.mockRejectedValue(new EmailDeliveryFailure('not_accepted','smtp'));
  db.teacherInvitation.updateMany.mockResolvedValueOnce({count:0}).mockResolvedValueOnce({count:0});
  await expect(new InstitutionService(mail).invite({userId:'owner',role:'ALUNO'},'institution','recipient@example.invalid')).rejects.toMatchObject({statusCode:409,message:expect.stringContaining('Não foi possível confirmar o cancelamento')});
});
it('restricted invitations use the canonical server origin even when the trusted browser origin is IPv4', async () => {
  fixture.restricted=true;
  vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','true');vi.stubEnv('INSTITUTIONS_ENABLED','false');
  vi.stubEnv('APP_PUBLIC_URL','http://localhost:5173');vi.stubEnv('CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173');
  await new Promise<void>((resolve,reject)=>emailFrontendContext({get:()=> 'http://127.0.0.1:5173'} as unknown as Request,{} as Response,error=>{
    if(error)return reject(error);
    void new InstitutionService(mail).invite({userId:'owner',role:'ALUNO'},'institution','recipient@example.invalid').then(()=>resolve(),reject);
  }));
  expect(mail.send.mock.calls[0][0].text).toContain('http://localhost:5173/#/convite-professor?token=');
  expect(mail.send.mock.calls[0][0].text).not.toContain('http://127.0.0.1:5173');
});
it('retries a rolled-back serialization conflict without sending twice', async () => {
  db.$transaction.mockRejectedValueOnce({code:'P2034'}).mockImplementation(work=>work(db));
  await new InstitutionService(mail).invite({userId:'owner',role:'ALUNO'},'institution','recipient@example.invalid');
  expect(db.teacherInvitation.create).toHaveBeenCalledOnce();expect(mail.send).toHaveBeenCalledOnce();
});
