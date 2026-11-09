import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import versions from '../legal-versions.json';
const db=vi.hoisted(()=>{
  const model=()=>Object.fromEntries(['findUnique','findFirst','create','update','updateMany','upsert','findMany'].map(k=>[k,vi.fn()]));
  return {teacherInvitation:model(),invitationOnboarding:model(),institution:model(),user:model(),accountControl:model(),institutionalMembership:model(),teacherInvitationClass:model(),administrativeEvent:model(),$transaction:vi.fn(),$queryRaw:vi.fn()};
});
vi.mock('../lib/prisma',()=>({prisma:db}));
import {InvitationOnboardingService,escapeMail} from './invitation-onboarding';
const mail={isConfigured:true,send:vi.fn()},token='a'.repeat(64),proof='b'.repeat(64);
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const service=new InvitationOnboardingService(mail);
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('APP_PUBLIC_URL','https://jurissim.example.invalid');
  db.$transaction.mockImplementation(work=>work(db));
  db.teacherInvitation.findUnique.mockResolvedValue({id:'invite',institutionId:'inst',email:'invited@example.invalid',status:'PENDING',expiresAt:new Date(Date.now()+3600000)});
  db.institution.findUnique.mockResolvedValue({id:'inst',name:'Instituição de teste',status:'ACTIVE'});
  db.teacherInvitation.updateMany.mockResolvedValue({count:1});
  db.invitationOnboarding.create.mockResolvedValue({id:'setup'});
  db.user.create.mockResolvedValue({id:'new-user'});
  db.teacherInvitationClass.findMany.mockResolvedValue([]);
});
afterEach(()=>vi.unstubAllEnvs());
it('inspects only minimal metadata without exposing email, token hash or account existence',async()=>{
  const details=await service.inspect(token);
  expect(details.maskedEmail).toBe('i***@example.invalid');expect(details).not.toHaveProperty('email');expect(details).not.toHaveProperty('tokenHash');expect(db.user.findFirst).not.toHaveBeenCalled();
});
it.each(['SUSPENDED','REJECTED','PENDING'])('rejects invitation from %s institution',async status=>{
  db.institution.findUnique.mockResolvedValue({id:'inst',status});await expect(service.inspect(token)).rejects.toMatchObject({statusCode:409});
});
it.each(['CANCELLED','ACCEPTED','DECLINED'])('rejects %s invitations',async status=>{
  db.teacherInvitation.findUnique.mockResolvedValue({id:'invite',institutionId:'inst',status,expiresAt:new Date(Date.now()+3600000)});await expect(service.inspect(token)).rejects.toMatchObject({statusCode:409});
});
it('does not overwrite or enumerate an existing identity',async()=>{
  db.user.findFirst.mockResolvedValue({id:'existing',role:'PROFESSOR',senhaHash:'existing-hash'});
  const result=await service.start(token,'Professor',{accepted:true,...versions});
  expect(result.message).toContain('Se este for');expect(db.user.create).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
});
it('stores only proof hash and mails a second email-control proof without password',async()=>{
  await service.start(token,'Professor',{accepted:true,...versions});
  const entry=db.invitationOnboarding.create.mock.calls[0][0].data;
  expect(entry.proofHash).toMatch(/^[a-f0-9]{64}$/);expect(entry).not.toHaveProperty('proof');
  const message=mail.send.mock.calls[0][0];const raw=new URL(message.text.match(/https:\/\/\S+/)![0]).hash.split('confirmacao=')[1];
  expect(digest(raw)).toBe(entry.proofHash);expect(message.text).not.toContain(entry.initialPasswordHash);
  expect(db.user.create.mock.calls[0][0].data.role).toBe('ALUNO');expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('requires explicit legal acceptance before creating an identity',async()=>{
  await expect(service.start(token,'Professor',{accepted:false,...versions})).rejects.toBeDefined();expect(db.user.create).not.toHaveBeenCalled();
});
it('rotates the proof after the resend cooldown without changing the pending account password',async()=>{
  db.user.findFirst.mockResolvedValue({id:'new-user',role:'ALUNO',senhaHash:'original'});
  db.invitationOnboarding.findUnique.mockResolvedValue({id:'setup',invitationId:'invite',userId:'new-user',initialPasswordHash:'original',expiresAt:new Date(Date.now()+60000),lastSentAt:new Date(Date.now()-61000),sendAttempts:1});
  db.invitationOnboarding.update.mockResolvedValue({id:'setup'});
  await service.start(token,'Professor',{accepted:true,...versions});
  expect(db.user.create).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();
  expect(db.invitationOnboarding.update.mock.calls[0][0].data).toMatchObject({invitationId:'invite',sendAttempts:{increment:1},proofHash:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect(mail.send).toHaveBeenCalledTimes(1);
});
it('allows a replacement invitation to resume an unfinished identity without duplicating it',async()=>{
  db.user.findFirst.mockResolvedValue({id:'new-user',role:'ALUNO',senhaHash:'original'});
  db.invitationOnboarding.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({id:'setup',invitationId:'cancelled-invite',userId:'new-user',initialPasswordHash:'original',lastSentAt:new Date(Date.now()-61000),sendAttempts:3});
  db.invitationOnboarding.update.mockResolvedValue({id:'setup'});
  await service.start(token,'Professor',{accepted:true,...versions});
  expect(db.invitationOnboarding.update.mock.calls[0][0].data).toMatchObject({invitationId:'invite',sendAttempts:1});expect(db.user.create).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();
});
it('rejects forged confirmation proof before changing credentials',async()=>{
  await expect(service.complete(token,proof,'SenhaForte123!','SenhaForte123!')).rejects.toMatchObject({statusCode:409});expect(db.user.update).not.toHaveBeenCalled();
});
it('does not replace an account password altered after onboarding started',async()=>{
  const entry={id:'setup',invitationId:'invite',userId:'new-user',proofHash:digest(proof),initialPasswordHash:'original',expiresAt:new Date(Date.now()+60000),completedAt:null};
  db.invitationOnboarding.findUnique.mockResolvedValue(entry);db.user.findUnique.mockResolvedValue({id:'new-user',email:'invited@example.invalid',role:'ALUNO',senhaHash:'changed'});
  await expect(service.complete(token,proof,'SenhaForte123!','SenhaForte123!')).rejects.toMatchObject({statusCode:409});expect(db.user.update).not.toHaveBeenCalled();
});
it('completes only a new proven identity, revoking previous sessions and granting only the invited membership',async()=>{
  const entry={id:'setup',invitationId:'invite',userId:'new-user',proofHash:digest(proof),initialPasswordHash:'original',expiresAt:new Date(Date.now()+60000),completedAt:null};
  db.invitationOnboarding.findUnique.mockResolvedValue(entry);
  db.user.findUnique.mockResolvedValue({id:'new-user',email:'invited@example.invalid',role:'ALUNO',senhaHash:'original',emailVerifiedAt:new Date()});
  await service.complete(token,proof,'SenhaForte123!','SenhaForte123!');
  expect(db.user.update.mock.calls[0][0].data).toMatchObject({sessionVersion:{increment:1},emailVerifiedAt:expect.any(Date)});
  expect(db.institutionalMembership.upsert.mock.calls[0][0].create).toEqual({institutionId:'inst',userId:'new-user',role:'TEACHER'});
  expect(db.invitationOnboarding.update).toHaveBeenCalledWith(expect.objectContaining({data:{completedAt:expect.any(Date)}}));
});
it('declines with email proof without granting a membership or replacing credentials',async()=>{
  db.invitationOnboarding.findUnique.mockResolvedValue({id:'setup',invitationId:'invite',userId:'new-user',expiresAt:new Date(Date.now()+60000)});
  await service.declineWithProof(token,proof);expect(db.teacherInvitation.updateMany.mock.calls[0][0].data.status).toBe('DECLINED');expect(db.user.update).not.toHaveBeenCalled();expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('rejects a different authenticated recipient',async()=>{
  db.user.findUnique.mockResolvedValue({email:'another@example.invalid',emailVerifiedAt:new Date()});await expect(service.decline(token,{userId:'another',role:'ALUNO'})).rejects.toMatchObject({statusCode:403});expect(db.teacherInvitation.updateMany).not.toHaveBeenCalled();
});
it('escapes untrusted names in transactional email HTML',()=>expect(escapeMail('<img onerror="x">&')).toBe('&lt;img onerror=&quot;x&quot;&gt;&amp;'));
