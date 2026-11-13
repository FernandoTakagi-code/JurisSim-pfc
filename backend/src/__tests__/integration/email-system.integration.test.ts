import {beforeAll,beforeEach,afterEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import type {Server} from 'node:http';
import express from 'express';
import bcrypt from 'bcrypt';
const smtp=vi.hoisted(()=>({createTransport:vi.fn(),sendMail:vi.fn()}));
vi.mock('nodemailer',()=>({default:{createTransport:smtp.createTransport}}));
import {prisma} from '../../lib/prisma';
import {assertDisposableDatabase} from './disposable-database';
import {AuthController} from '../../controllers/auth-controller';
import {AuthService} from '../../services/auth-service';
import {EmailVerificationService} from '../../services/email-verification-service';
import {PasswordRecoveryService} from '../../services/password-recovery-service';
import {BrevoEmailVerificationSender} from '../../services/email-verification-sender';
import {BrevoRecoveryEmailSender} from '../../services/recovery-email-sender';
import {createBrevoSmtpTransport} from '../../services/brevo-email-transport';
import {InstitutionService} from '../../services/institution-service';
import {InvitationOnboardingService} from '../../services/invitation-onboarding';
import {ClassExamService} from '../../services/class-exam-service';
import {validRegistrationNumber} from '../../institution-registration';
import {createAuthRoutes} from '../../routes/auth-routes';
import {createInstitutionRoutes} from '../../routes/institution-routes';
import {errorHandler} from '../../middlewares/error-handler';
import {institutionRequestSchema} from '../../services/institution-registration-validation';
import {institutionApplication} from '../fixtures/institution-request';
import versions from '../../legal-versions.json';
const acceptance={accepted:true,...versions},password='Original-test9!';
type Message={to:string;text:string;html:string;subject:string};
let messages:Message[],server:Server,base:string;
const verification=()=>new EmailVerificationService(undefined,new BrevoEmailVerificationSender('smtp@example.invalid','isolated-fixture-key'));
const recovery=()=>new PasswordRecoveryService(undefined,new BrevoRecoveryEmailSender('smtp@example.invalid','isolated-fixture-key'));
const mail=()=>createBrevoSmtpTransport('smtp@example.invalid','isolated-fixture-key');
beforeAll(()=>assertDisposableDatabase(prisma));
beforeEach(async()=>{
  await assertDisposableDatabase(prisma);messages=[];smtp.sendMail.mockReset();smtp.createTransport.mockReset();
  smtp.createTransport.mockReturnValue({sendMail:smtp.sendMail});smtp.sendMail.mockImplementation(async message=>{messages.push(message);return {accepted:[message.to],rejected:[]};});
  vi.stubEnv('INSTITUTIONS_ENABLED','true');vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','false');vi.stubEnv('APP_PUBLIC_URL','http://localhost:5173');vi.stubEnv('CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5180,https://app.example.invalid');
  const app=express();app.use(express.json());app.use('/auth',createAuthRoutes(new AuthController(new AuthService(),recovery(),verification())));app.use('/institutions',createInstitutionRoutes(new InstitutionService(mail()),new InvitationOnboardingService(mail())));app.use(errorHandler);
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterEach(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
afterAll(async()=>{vi.unstubAllEnvs();await prisma.$disconnect();});
const rawToken=(message:Message,key='token')=>{const url=new URL(message.text.match(/https?:\/\/\S+/)![0]);return new URLSearchParams(url.hash.split('?')[1]).get(key)!;};
const post=async(path:string,body:unknown,token?:string,origin?:string)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
async function account(confirmed=true){return prisma.user.create({data:{nome:'Pessoa fictícia',email:`person-${randomUUID()}@example.invalid`,role:'ALUNO',senhaHash:await bcrypt.hash(password,4),emailVerifiedAt:confirmed?new Date():null}});}
it.each(['http://localhost:5173','http://127.0.0.1:5180','https://app.example.invalid'])('registration automatically sends the confirmation for authorized frontend %s, with one-time token',async origin=>{
  const email=`register-${randomUUID()}@example.invalid`;
  const result=await post('/auth/register',{nome:'Pessoa fictícia',email,senha:password,confirmacaoSenha:password,acceptance},undefined,origin);
  expect(result.status).toBe(201);expect(messages).toHaveLength(1);expect(messages[0]!.to).toBe(email);
  expect(new URL(messages[0]!.text.match(/https?:\/\/\S+/)![0]).origin).toBe(origin);
  const token=rawToken(messages[0]!);const rows=await prisma.authToken.findMany({where:{userId:result.body.usuario.id}});
  expect(rows[0]!.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));expect(rows[0]!.tokenHash).not.toBe(token);
  expect((await post('/auth/email-verification',{},result.body.token,origin)).status).toBe(429);expect(messages).toHaveLength(1);
  expect((await post('/auth/email-verification/confirm',{token},undefined,origin)).status).toBe(200);
  expect((await post('/auth/email-verification/confirm',{token},undefined,origin)).status).toBe(400);
});
it.each(['not_accepted','indeterminate'])('SMTP %s does not undo registration and invalidates only an unaccepted proof',async outcome=>{
  smtp.sendMail.mockRejectedValue(Object.assign(new Error('private SMTP failure'),outcome==='not_accepted'?{code:'ECONNREFUSED'}:{command:'DATA'}));
  const email=`failed-${randomUUID()}@example.invalid`;const result=await post('/auth/register',{nome:'Pessoa fictícia',email,senha:password,acceptance});
  expect(result.status).toBe(201);expect(result.body.emailVerification.status).toBe('unavailable');
  const user=await prisma.user.findUniqueOrThrow({where:{email}});expect(user.emailVerifiedAt).toBeNull();
  const token=await prisma.authToken.findFirstOrThrow({where:{userId:user.id}});
  if(outcome==='not_accepted')expect(token.usedAt).not.toBeNull();else expect(token.usedAt).toBeNull();
});
it('confirmation resend rotates the old token after cooldown, rejects expiration and accepts only the latest usable proof',async()=>{
  const user=await account(false),service=verification();await service.requestVerification(user.id);const first=rawToken(messages[0]!);
  await prisma.authToken.updateMany({where:{userId:user.id},data:{createdAt:new Date(Date.now()-61000)}});
  await service.requestVerification(user.id);const second=rawToken(messages[1]!);
  await expect(service.confirm(first)).rejects.toMatchObject({statusCode:400});
  await prisma.authToken.updateMany({where:{userId:user.id,usedAt:null},data:{expiresAt:new Date(0)}});
  await expect(service.confirm(second)).rejects.toMatchObject({statusCode:400});
  expect((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).emailVerifiedAt).toBeNull();
});
it('legacy case-insensitive recovery sends only to the stored recipient, respects cooldown and consumes its token once',async()=>{
  const user=await account();const stored=`Legacy-${randomUUID()}@Example.invalid`;await prisma.user.update({where:{id:user.id},data:{email:stored}});
  const service=recovery();await service.requestRecovery(stored.toLowerCase());expect(messages).toHaveLength(1);expect(messages[0]!.to).toBe(stored);
  await service.requestRecovery(stored.toUpperCase());expect(messages).toHaveLength(1);
  const token=rawToken(messages[0]!);await service.resetPassword(token,'Different-test9!','Different-test9!');
  const current=await prisma.user.findUniqueOrThrow({where:{id:user.id}});expect(await bcrypt.compare('Different-test9!',current.senhaHash!)).toBe(true);expect(current.sessionVersion).toBe(user.sessionVersion+1);
  await expect(service.resetPassword(token,'Another-test9!','Another-test9!')).rejects.toMatchObject({statusCode:400});
});
it('expired password token and unknown recovery email cannot reset an account or leak identity',async()=>{
  const user=await account(),service=recovery();await service.requestRecovery(user.email);const token=rawToken(messages[0]!);
  await prisma.passwordRecoveryToken.updateMany({where:{userId:user.id},data:{expiresAt:new Date(0)}});
  await expect(service.resetPassword(token,'Different-test9!','Different-test9!')).rejects.toMatchObject({statusCode:400});
  expect(await service.requestRecovery(`absent-${randomUUID()}@example.invalid`)).toMatch(/^Se existir/);expect(messages).toHaveLength(1);
});
it.each(['not_accepted','indeterminate'])('password recovery SMTP %s preserves neutral feedback and correct token usability',async outcome=>{
  const user=await account();smtp.sendMail.mockRejectedValue(Object.assign(new Error('private SMTP failure'),outcome==='not_accepted'?{code:'ECONNREFUSED'}:{command:'DATA'}));
  expect(await recovery().requestRecovery(user.email)).toMatch(/^Se existir/);
  const token=await prisma.passwordRecoveryToken.findFirstOrThrow({where:{userId:user.id}});
  if(outcome==='not_accepted')expect(token.consumedAt).not.toBeNull();else expect(token.consumedAt).toBeNull();
  expect((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).sessionVersion).toBe(user.sessionVersion);
});
let serial=0;
async function institution(){
  const owner=await account();const admin=await prisma.user.create({data:{nome:'ADMIN fictício',email:`admin-${randomUUID()}@example.invalid`,role:'ADMIN',emailVerifiedAt:new Date()}});
  const cnpjBase='140000000'+String(++serial).padStart(3,'0');const cnpj=Array.from({length:100},(_,n)=>cnpjBase+String(n).padStart(2,'0')).find(validRegistrationNumber)!;
  const service=new InstitutionService(mail());const created=await service.request({userId:owner.id,role:'ALUNO'},institutionRequestSchema.parse({...institutionApplication,name:`Instituição fictícia ${randomUUID()}`,registrationNumber:cnpj}));
  await service.decide({userId:admin.id,role:'ADMIN'},created.id,'ACTIVE','Aprovação fictícia para teste isolado.');messages.length=0;
  return {id:created.id,owner,service,actor:{userId:owner.id,role:'ALUNO',institutionId:created.id,institutionAdmin:true}};
}
it('existing teacher invitation targets the correct user and repeated acceptance is idempotent',async()=>{
  const item=await institution(),teacher=await account(),wrong=await account();await item.service.invite(item.actor,item.id,teacher.email.toUpperCase());
  expect(messages).toHaveLength(1);expect(messages[0]!.to).toBe(teacher.email.toLowerCase());const token=rawToken(messages[0]!);
  await expect(item.service.accept({userId:wrong.id,role:'ALUNO'},token)).rejects.toMatchObject({statusCode:403});
  await item.service.accept({userId:teacher.id,role:'ALUNO'},token);
  await expect(item.service.accept({userId:teacher.id,role:'PROFESSOR'},token)).resolves.toHaveProperty('message');
  expect(await prisma.administrativeEvent.count({where:{institutionId:item.id,event:'TEACHER_INVITATION_ACCEPTED'}})).toBe(1);
  expect(await prisma.institutionalMembership.count({where:{institutionId:item.id,userId:teacher.id,role:'TEACHER',active:true}})).toBe(1);expect(messages).toHaveLength(1);
});
it('legacy proof prepares identity and grants membership only after explicit acceptance',async()=>{
  const item=await institution(),email=`new-teacher-${randomUUID()}@example.invalid`;await item.service.invite(item.actor,item.id,email);const token=rawToken(messages[0]!);
  const onboarding=new InvitationOnboardingService(mail());await onboarding.start(token,'Professor fictício',acceptance);expect(messages).toHaveLength(2);
  const proof=rawToken(messages[1]!,'confirmacao');const user=await prisma.user.findUniqueOrThrow({where:{email}});expect(user.emailVerifiedAt).toBeNull();
  expect(await prisma.institutionalMembership.count({where:{userId:user.id}})).toBe(0);
  await onboarding.complete(token,proof,'Professor-test9!','Professor-test9!');
  expect((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).role).toBe('ALUNO');
  expect(await prisma.institutionalMembership.count({where:{userId:user.id}})).toBe(0);
  await item.service.accept({userId:user.id,role:'ALUNO'},token);
  expect((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).role).toBe('PROFESSOR');
  await expect(onboarding.complete(token,proof,'Professor-test9!','Professor-test9!')).rejects.toMatchObject({statusCode:409});expect(messages).toHaveLength(2);
});
it('expired teacher invite and expired onboarding proof never grant membership',async()=>{
  const item=await institution(),email=`expired-teacher-${randomUUID()}@example.invalid`;await item.service.invite(item.actor,item.id,email);const token=rawToken(messages[0]!);
  const onboarding=new InvitationOnboardingService(mail());await onboarding.start(token,'Professor fictício',acceptance);const proof=rawToken(messages[1]!,'confirmacao');
  const user=await prisma.user.findUniqueOrThrow({where:{email}});await prisma.invitationOnboarding.updateMany({where:{userId:user.id},data:{expiresAt:new Date(0)}});
  await expect(onboarding.complete(token,proof,'Professor-test9!','Professor-test9!')).rejects.toMatchObject({statusCode:409});
  await prisma.teacherInvitation.updateMany({where:{institutionId:item.id},data:{expiresAt:new Date(0)}});
  await expect(onboarding.inspect(token)).rejects.toMatchObject({statusCode:409});expect(await prisma.institutionalMembership.count({where:{userId:user.id}})).toBe(0);
});
it('a demonstrable SMTP failure cancels only the new teacher invitation and grants no membership',async()=>{
  const item=await institution(),email=`failed-teacher-${randomUUID()}@example.invalid`;smtp.sendMail.mockRejectedValue(Object.assign(new Error('private SMTP failure'),{code:'ECONNREFUSED'}));
  await expect(item.service.invite(item.actor,item.id,email)).rejects.toMatchObject({statusCode:503});
  expect((await prisma.teacherInvitation.findFirstOrThrow({where:{institutionId:item.id,email}})).status).toBe('CANCELLED');
  expect(await prisma.user.findUnique({where:{email}})).toBeNull();
});
it.each(['not_accepted','indeterminate'])('teacher onboarding SMTP %s preserves the account without granting privileges and retains only potentially delivered proof',async outcome=>{
  const item=await institution(),email=`failed-onboarding-${randomUUID()}@example.invalid`;await item.service.invite(item.actor,item.id,email);const token=rawToken(messages[0]!);
  smtp.sendMail.mockRejectedValue(Object.assign(new Error('private SMTP failure'),outcome==='not_accepted'?{code:'ECONNREFUSED'}:{command:'DATA'}));
  await expect(new InvitationOnboardingService(mail()).start(token,'Professor fictício',acceptance)).resolves.toHaveProperty('message');
  const user=await prisma.user.findUniqueOrThrow({where:{email}}),proof=await prisma.invitationOnboarding.findUniqueOrThrow({where:{userId:user.id}});
  if(outcome==='not_accepted')expect(proof.expiresAt.getTime()).toBe(0);else expect(proof.expiresAt.getTime()).toBeGreaterThan(Date.now());
  expect(user.role).toBe('ALUNO');expect(user.emailVerifiedAt).toBeNull();expect(await prisma.institutionalMembership.count({where:{userId:user.id}})).toBe(0);
});
it('student code invitation, acceptance and internal notifications do not pretend to send email',async()=>{
  const item=await institution(),student=await account();const classes=new ClassExamService();const created=await classes.createClass(item.actor,'Turma fictícia');
  const actor={userId:student.id,role:'ALUNO'};expect((await classes.join(actor,created.inviteCode)).joined).toBe(false);
  const pending=await prisma.classJoinRequest.findUniqueOrThrow({where:{classId_studentId:{classId:created.turma.id,studentId:student.id}}});
  await classes.decideJoin(item.actor,created.turma.id,pending.id,true);
  expect((await classes.join(actor,created.inviteCode)).message).toContain('matriculado');expect(messages).toHaveLength(0);
});

async function directInvite(){
  const item=await institution(),email=`h412-${randomUUID()}@example.invalid`;
  await item.service.invite(item.actor,item.id,email);
  return {...item,email,token:rawToken(messages[0]!)};
}
const registration=(token:string)=>({token,nome:'Professor novo',password,confirmation:password,acceptance});
it('H4.32 inspection is read-only; registration, login and explicit acceptance remain separate without another email',async()=>{
  const item=await directInvite();const before=await prisma.user.count();
  for(let n=0;n<2;n++){const inspected=await post('/institutions/invitations/inspect',{token:item.token});expect(inspected.status).toBe(200);expect(inspected.body).toMatchObject({email:item.email,accountExists:false});}
  expect(await prisma.user.count()).toBe(before);
  smtp.sendMail.mockRejectedValue(new Error('SMTP unavailable during acceptance'));
  expect((await post('/institutions/invitations/register',registration(item.token))).status).toBe(201);
  const user=await prisma.user.findUniqueOrThrow({where:{email:item.email}});
  expect(user.role).toBe('ALUNO');expect(user.registrationIntent).toBe('TEACHER_INVITATION');expect(user.emailVerifiedAt).not.toBeNull();expect(user.legalAcceptedAt).not.toBeNull();
  expect(await bcrypt.compare(password,user.senhaHash!)).toBe(true);
  expect(await prisma.invitationOnboarding.count({where:{userId:user.id}})).toBe(0);
  expect(await prisma.institutionalMembership.count({where:{userId:user.id,institutionId:item.id,role:'TEACHER',active:true}})).toBe(0);
  const login=await post('/auth/login',{email:item.email,senha:password});expect(login.status).toBe(200);
  expect((await prisma.teacherInvitation.findFirstOrThrow({where:{institutionId:item.id}})).status).toBe('PENDING');
  expect((await post('/institutions/invitations/accept',{token:item.token},login.body.token)).status).toBe(200);
  expect((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).role).toBe('PROFESSOR');
  expect(await prisma.institutionalMembership.count({where:{userId:user.id,institutionId:item.id,role:'TEACHER',active:true}})).toBe(1);
  expect((await post('/institutions/invitations/register',registration(item.token))).status).toBe(409);expect(messages).toHaveLength(1);
});
it('H4.32 concurrent registration creates one pending identity; explicit acceptance grants one membership',async()=>{
  const item=await directInvite();
  const outcomes=await Promise.all([post('/institutions/invitations/register',registration(item.token)),post('/institutions/invitations/register',registration(item.token))]);
  expect(outcomes.map(r=>r.status).sort()).toEqual([201,409]);
  expect(await prisma.user.count({where:{email:item.email}})).toBe(1);
  const user=await prisma.user.findUniqueOrThrow({where:{email:item.email}});
  expect(user.role).toBe('ALUNO');expect(await prisma.institutionalMembership.count({where:{userId:user.id}})).toBe(0);
  expect(await prisma.teacherInvitation.count({where:{institutionId:item.id,status:'PENDING'}})).toBe(1);
  await item.service.accept({userId:user.id,role:'ALUNO'},item.token);
  expect(await prisma.institutionalMembership.count({where:{userId:user.id,institutionId:item.id,active:true,role:'TEACHER'}})).toBe(1);
  expect(await prisma.teacherInvitation.count({where:{institutionId:item.id,status:'ACCEPTED'}})).toBe(1);expect(messages).toHaveLength(1);
});
it.each(['expired','revoked','inactive'])('H4.12 %s invitation creates no identity or privilege',async state=>{
  const item=await directInvite();
  if(state==='inactive')await prisma.institution.update({where:{id:item.id},data:{status:'SUSPENDED'}});
  else await prisma.teacherInvitation.updateMany({where:{institutionId:item.id},data:state==='expired'?{expiresAt:new Date(0)}:{status:'CANCELLED'}});
  expect((await post('/institutions/invitations/register',registration(item.token))).status).toBe(409);
  expect(await prisma.user.count({where:{email:item.email}})).toBe(0);
});
it('H4.12 existing password and Google accounts require authenticated matching identity without password changes',async()=>{
  const item=await institution(),wrong=await account();
  for(const google of [false,true]){
    const user=await account();if(google)await prisma.user.update({where:{id:user.id},data:{senhaHash:null}});
    const original=await prisma.user.findUniqueOrThrow({where:{id:user.id}});
    await item.service.invite(item.actor,item.id,user.email);const token=rawToken(messages[messages.length-1]!);
    expect((await post('/institutions/invitations/register',registration(token))).status).toBe(409);
    await expect(item.service.accept({userId:wrong.id,role:'ALUNO'},token)).rejects.toMatchObject({statusCode:403});
    await item.service.accept({userId:user.id,role:'ALUNO'},token);
    const current=await prisma.user.findUniqueOrThrow({where:{id:user.id}});expect(current.senhaHash).toBe(original.senhaHash);
  }
});
it('H4.12 missing acceptance or mismatch cannot create an account; retired endpoint sends no email',async()=>{
  const item=await directInvite();
  expect((await post('/institutions/invitations/register',{...registration(item.token),acceptance:{accepted:false,...versions}})).status).toBe(422);
  expect((await post('/institutions/invitations/register',{...registration(item.token),confirmation:'Different9!'})).status).toBe(422);
  expect((await post('/institutions/invitations/onboarding',{token:item.token,nome:'Professor',acceptance})).status).toBe(410);
  expect(await prisma.user.count({where:{email:item.email}})).toBe(0);expect(messages).toHaveLength(1);
});
it('H4.32 transaction failure after identity insertion rolls back identity and keeps invitation pending',async()=>{
  const item=await directInvite();
  const original=prisma.$transaction.bind(prisma);
  const failure=vi.spyOn(prisma,'$transaction').mockImplementationOnce(async work=>{
    if(typeof work!=='function')throw new Error('Expected interactive transaction');
    return original(async tx=>{await work(tx);throw new Error('Isolated database failure');});
  });
  try { await expect(new InvitationOnboardingService(mail()).register(item.token,'Professor',password,password,acceptance)).rejects.toThrow('Isolated database failure'); }
  finally { failure.mockRestore(); }
  expect(await prisma.user.count({where:{email:item.email}})).toBe(0);
  expect((await prisma.teacherInvitation.findFirstOrThrow({where:{institutionId:item.id}})).status).toBe('PENDING');
  expect(await prisma.institutionalMembership.count({where:{institutionId:item.id,role:'TEACHER'}})).toBe(0);
});
it('H4.12 new invitee can explicitly decline without creating an identity or sending another message',async()=>{
  const item=await directInvite();
  expect((await post('/institutions/invitations/decline-new',{token:item.token})).status).toBe(200);
  expect((await post('/institutions/invitations/register',registration(item.token))).status).toBe(409);
  expect(await prisma.user.count({where:{email:item.email}})).toBe(0);expect(messages).toHaveLength(1);
});
it('H4.12 resumes only an untouched legacy provisional account from the same invitation',async()=>{
  const item=await directInvite(),service=new InvitationOnboardingService(mail());
  await service.start(item.token,'Professor',acceptance);
  const pending=await prisma.user.findUniqueOrThrow({where:{email:item.email}});
  await service.register(item.token,'Professor',password,password,acceptance);
  const current=await prisma.user.findUniqueOrThrow({where:{email:item.email}});
  expect(current.id).toBe(pending.id);expect(current.role).toBe('ALUNO');expect(current.registrationIntent).toBe('TEACHER_INVITATION');
  expect(await prisma.institutionalMembership.count({where:{userId:current.id}})).toBe(0);
  await item.service.accept({userId:current.id,role:'ALUNO'},item.token);
  expect((await prisma.user.findUniqueOrThrow({where:{id:current.id}})).role).toBe('PROFESSOR');expect(messages).toHaveLength(2);
});
