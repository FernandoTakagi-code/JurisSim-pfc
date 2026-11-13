import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
const state=vi.hoisted(()=>({manifest:''}));
vi.mock('node:fs',async original=>{
  const actual=await original<typeof import('node:fs')>();
  const isManifest=(p:unknown)=>String(p).endsWith('institution-homologation.json');
  return {...actual,default:{...actual,
    lstatSync:(p:never)=>isManifest(p)?{isSymbolicLink:()=>false}:actual.lstatSync(p),
    realpathSync:(p:never)=>isManifest(p)?String(p):actual.realpathSync(p),
    statSync:(p:never)=>isManifest(p)?{size:state.manifest.length}:actual.statSync(p),
    readFileSync:(p:never,...args:never[])=>isManifest(p)?state.manifest:(actual.readFileSync as Function)(p,...args),
  }};
});
const db=vi.hoisted(()=>{
  const model=()=>Object.fromEntries(['findUnique','findFirst','findMany','count','create','update','updateMany','upsert'].map(k=>[k,vi.fn()]));
  return {user:model(),questao:model(),accountControl:model(),institution:model(),institutionalMembership:model(),institutionalClass:model(),administrativeEvent:model(),administrativeNotification:model(),teacherInvitation:model(),teacherInvitationClass:model(),classJoinRequest:model(),turma:model(),avaliacao:model(),simulado:model(),$transaction:vi.fn(),$queryRaw:vi.fn(),$executeRaw:vi.fn()};
});
vi.mock('../lib/prisma',()=>({prisma:db}));
import {homologationManifest,institutionRequestScope,restrictedInstitutionId,homologationClassBoundary,assertRestrictedParticipant} from '../config/institution-homologation';
import {institutionsEnabled,institutionsGloballyEnabled} from '../config/institution-feature';
import {currentAccess,InstitutionService,institutionAdmin} from './institution-service';
import {ClassExamService} from './class-exam-service';
import {ClassReportService} from './class-report-service';
import {validInvitation} from './invitation-onboarding';
import {institutionRequestSchema} from './institution-registration-validation';
import {institutionApplication} from '../__tests__/fixtures/institution-request';
import {requireAuth,type AuthenticatedRequest} from '../middlewares/auth-middleware';
import type {Response} from 'express';
import express from 'express';
import {createInstitutionRoutes} from '../routes/institution-routes';
import {errorHandler} from '../middlewares/error-handler';
import {classRoutes,examRoutes} from '../routes/class-exam-routes';
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),teacher=uid(2),student=uid(3),admin=uid(4),institution=uid(5),foreign=uid(6),runId=uid(7);
const manifest={version:1,projectRef:'a'.repeat(20),runId,institutionId:institution,ownerId:owner,adminIds:[admin],participantIds:[owner,teacher,student]};
const actor={userId:owner,role:'ALUNO',institutionId:institution,institutionAdmin:true};
const global={userId:admin,role:'ADMIN'};
const mail={isConfigured:true,send:vi.fn()};
const service=new InstitutionService(mail);
const {registrationNumber: _unusedRegistrationNumber, ...fixtureInput}=institutionApplication;
const scoped=<T>(fn:()=>T,userId=owner,operational=true)=>institutionRequestScope.run({userId,institutionId:institution,operational},fn);
beforeEach(()=>{
  vi.resetAllMocks();state.manifest=JSON.stringify(manifest);
  vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','true');vi.stubEnv('INSTITUTIONS_ENABLED','false');
  vi.stubEnv('ADMINISTRATION_ENABLED','true');vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','true');
  vi.stubEnv('HOST','127.0.0.1');vi.stubEnv('JWT_SECRET','homologation-test-secret-with-more-than-32-characters');
  for(const key of ['DATABASE_URL','DIRECT_URL'])vi.stubEnv(key,`postgresql://postgres:fixture@db.${manifest.projectRef}.supabase.co:5432/postgres?sslmode=require&sslaccept=strict`);
  db.$transaction.mockImplementation(work=>work(db));db.$queryRaw.mockResolvedValue([]);
  db.accountControl.findUnique.mockResolvedValue(null);db.accountControl.findMany.mockResolvedValue([]);
  db.institutionalMembership.findMany.mockResolvedValue([{institutionId:institution,role:'INSTITUTION_ADMIN',institution:{name:'Fixture'}}]);
  db.institutionalMembership.findFirst.mockResolvedValue({id:uid(8)});
  db.user.findUnique.mockResolvedValue({id:owner,role:'ALUNO',email:'owner@example.invalid',emailVerifiedAt:new Date(),deletedAt:null,sessionVersion:0});
  db.institution.findUnique.mockResolvedValue({...institutionApplication,id:institution,ownerId:owner,registrationNumber:null,status:'PENDING',description:'Declaração: instituição sem site oficial.'});
  db.institutionalClass.findMany.mockResolvedValue([]);db.institution.findFirst.mockResolvedValue(null);
  db.administrativeEvent.findFirst.mockResolvedValue({result:JSON.stringify({runId})});
  db.institution.update.mockResolvedValue({id:institution,status:'ACTIVE'});
});
afterEach(()=>vi.unstubAllEnvs());
it('mode off preserves global flags and legacy access without new memberships',async()=>{
  vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','false');
  expect(homologationManifest()).toBeNull();expect(scoped(institutionsEnabled)).toBe(false);
  expect(await currentAccess(owner,'ALUNO')).toBeUndefined();expect(db.institutionalMembership.findMany).not.toHaveBeenCalled();
});
it('H4.6 never recognizes the restricted fixture exception in production',()=>{
  vi.stubEnv('NODE_ENV','production');
  expect(homologationManifest()).toBeNull();expect(scoped(institutionsEnabled)).toBe(false);
});
it.each(['{}','not-json',JSON.stringify({...manifest,participantIds:[admin]})])('invalid private configuration grants nothing: %s',async invalid=>{
  state.manifest=invalid;expect(homologationManifest()).toBeNull();expect(scoped(institutionsEnabled)).toBe(false);
  expect(await currentAccess(owner,'ALUNO')).toBeUndefined();
});
it('wrong project or non-loopback listener grants nothing',()=>{
  vi.stubEnv('DIRECT_URL','postgresql://postgres:fixture@db.'+'b'.repeat(20)+'.supabase.co:5432/postgres');expect(homologationManifest()).toBeNull();
  vi.stubEnv('DIRECT_URL',process.env.DATABASE_URL!);vi.stubEnv('HOST','0.0.0.0');expect(homologationManifest()).toBeNull();
});
it('only request scope enables operations, never the global flag',async()=>{
  expect(institutionsEnabled()).toBe(false);expect((await currentAccess(owner,'ALUNO'))?.enabled).toBe(true);
  expect(scoped(institutionsEnabled)).toBe(true);expect(institutionsGloballyEnabled()).toBe(false);expect(institutionsEnabled()).toBe(false);
  expect(db.institutionalMembership.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({institutionId:institution,active:true,institution:{status:'ACTIVE'}})}));
});
it('an unlisted UUID or a client-supplied scope cannot enable operations',async()=>{
  expect(await currentAccess(foreign,'PROFESSOR')).toBeUndefined();expect(scoped(institutionsEnabled,foreign)).toBe(false);
  expect(institutionRequestScope.run({userId:owner,institutionId:foreign,operational:true},institutionsEnabled)).toBe(false);
});
it('rereads approved participant additions without module reload and preserves every other scope boundary',()=>{
  const first=uid(20),second=uid(21),unapproved=uid(22);
  scoped(()=>{
    expect(()=>assertRestrictedParticipant(first)).toThrow('Conta fora do escopo autorizado.');
    state.manifest=JSON.stringify({...manifest,participantIds:[...manifest.participantIds,first,second]});
    expect(()=>assertRestrictedParticipant(first)).not.toThrow();
    expect(()=>assertRestrictedParticipant(second)).not.toThrow();
    expect(()=>assertRestrictedParticipant(owner)).not.toThrow();
    expect(()=>assertRestrictedParticipant(unapproved)).toThrow('Conta fora do escopo autorizado.');
    expect(homologationManifest()?.adminIds).toEqual(manifest.adminIds);
    expect(restrictedInstitutionId()).toBe(institution);
    state.manifest=JSON.stringify(manifest);
    expect(()=>assertRestrictedParticipant(first)).toThrow('Conta fora do escopo autorizado.');
  });
  expect(institutionRequestScope.run({userId:owner,institutionId:foreign,operational:true},()=>restrictedInstitutionId())).toBeUndefined();
  expect(db.user.update).not.toHaveBeenCalled();
  expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('suspended accounts are denied before membership resolution',async()=>{
  db.accountControl.findUnique.mockResolvedValue({suspended:true});await expect(currentAccess(owner,'ALUNO')).rejects.toMatchObject({statusCode:403});
  expect(db.institutionalMembership.findMany).not.toHaveBeenCalled();
});
it.each(['suspended institution','revoked membership'])('no active link: %s grants no operations',async()=>{
  db.institutionalMembership.findMany.mockResolvedValue([]);db.user.findFirst.mockResolvedValue(null);
  expect((await currentAccess(owner,'ALUNO'))?.enabled).toBe(false);expect(scoped(institutionsEnabled,owner,false)).toBe(false);
  db.institutionalMembership.findFirst.mockResolvedValue(null);await expect(scoped(()=>institutionAdmin(db as never,actor,institution))).rejects.toMatchObject({statusCode:403});
});
it('request authentication resolves actual membership without changing global role',async()=>{
  const token=jwt.sign({id:owner,sessionVersion:0,role:'ADMIN'},process.env.JWT_SECRET!,{expiresIn:'1h'});
  const req={originalUrl:'/turmas',header:(key:string)=>({'authorization':`Bearer ${token}`,'x-institution-id':institution,'x-institution-context':'administration'}[key])} as AuthenticatedRequest;
  const next=vi.fn(()=>{expect(institutionsEnabled()).toBe(true);expect(restrictedInstitutionId()).toBe(institution);});
  await requireAuth(req,{} as Response,next);expect(next).toHaveBeenCalledWith();expect(req.auth).toMatchObject({role:'ALUNO',institutionAdmin:true,institutionId:institution});
});
it('forged cross-institution context is denied',async()=>{
  const token=jwt.sign({id:owner,sessionVersion:0,role:'ALUNO'},process.env.JWT_SECRET!,{expiresIn:'1h'});
  const req={originalUrl:'/turmas',header:(key:string)=>({'authorization':`Bearer ${token}`,'x-institution-id':foreign,'x-institution-context':'administration'}[key])} as AuthenticatedRequest;
  const next=vi.fn();await requireAuth(req,{} as Response,next);expect(next).toHaveBeenCalledWith(expect.objectContaining({statusCode:403}));
});
it('professor keeps PROFESSOR and students do not receive administrative membership',async()=>{
  db.institutionalMembership.findMany.mockResolvedValue([{institutionId:institution,role:'TEACHER',institution:{name:'Fixture'}}]);
  expect(await currentAccess(teacher,'PROFESSOR')).toMatchObject({effectiveRole:'PROFESSOR',globalAdmin:false});
  db.institutionalMembership.findMany.mockResolvedValue([]);db.user.findFirst.mockResolvedValue({id:student});
  expect(await currentAccess(student,'ALUNO')).toMatchObject({effectiveRole:'ALUNO',globalAdmin:false,memberships:[]});
  await expect(scoped(()=>institutionAdmin(db as never,{userId:student,role:'ALUNO'},foreign),student)).rejects.toMatchObject({statusCode:403});
});
it('cross-institution summary authorization fails before database access',async()=>{
  await expect(scoped(()=>service.institutionSummary(actor,foreign,1))).rejects.toMatchObject({statusCode:403});expect(db.institutionalMembership.findFirst).not.toHaveBeenCalled();
});
it('public registration still requires a CNPJ and rejects injected exemption markers',()=>{
  expect(institutionRequestSchema.safeParse(fixtureInput).success).toBe(false);
  expect(institutionRequestSchema.safeParse({...institutionApplication,registrationNumber:undefined,homologation:true}).success).toBe(false);
});
it('ordinary approval without CNPJ is denied even if its name contains HOMOLOGAÇÃO',async()=>{
  db.institution.findUnique.mockResolvedValue({...institutionApplication,id:foreign,ownerId:owner,registrationNumber:null,status:'PENDING',name:'HOMOLOGAÇÃO'});
  await expect(service.decide(global,foreign,'ACTIVE','Reviewed')).rejects.toMatchObject({statusCode:409});expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('fixture waiver requires the configured ADMIN and provisioning audit for this run',async()=>{
  await expect(service.decide({userId:owner,role:'ALUNO'},institution,'ACTIVE','Reviewed')).rejects.toMatchObject({statusCode:403});
  await expect(service.decide({userId:foreign,role:'ADMIN'},institution,'ACTIVE','Reviewed')).rejects.toMatchObject({statusCode:409});
  db.administrativeEvent.findFirst.mockResolvedValue(null);
  await expect(service.decide(global,institution,'ACTIVE','Reviewed')).rejects.toMatchObject({statusCode:409});
});
it('a proven pending fixture can be approved without a CNPJ, with audit and normal membership',async()=>{
  await service.decide(global,institution,'ACTIVE','Authorized test approval');
  expect(db.institutionalMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({create:{institutionId:institution,userId:owner,role:'INSTITUTION_ADMIN'}}));
  expect(db.administrativeEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({event:'HOMOLOGATION_FIXTURE_APPROVED',actorId:admin,institutionId:institution,result:expect.stringContaining(runId)})});
  expect(db.user.update).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
});
it('fixture provisioning cannot be called by an ordinary user and cannot replace an existing UUID',async()=>{
  await expect(service.provisionHomologationFixture(actor,{},'Testing')).rejects.toMatchObject({statusCode:403});expect(db.institution.create).not.toHaveBeenCalled();
  db.user.findUnique.mockImplementation(({where})=>where.id===admin?{role:'ADMIN',emailVerifiedAt:new Date(),deletedAt:null}:{role:'ALUNO',email:'owner@example.invalid',emailVerifiedAt:new Date(),deletedAt:null});
  await expect(service.provisionHomologationFixture(global,fixtureInput,'Testing')).rejects.toMatchObject({statusCode:409});expect(db.institution.create).not.toHaveBeenCalled();
});
it('fixture provisioning reserves the configured UUID, creates PENDING and audits without activating memberships',async()=>{
  db.user.findUnique.mockImplementation(({where})=>where.id===admin?{id:admin,role:'ADMIN',emailVerifiedAt:new Date(),deletedAt:null}:{id:owner,role:'ALUNO',email:'owner@example.invalid',emailVerifiedAt:new Date(),deletedAt:null});
  db.institution.findUnique.mockResolvedValue(null);db.institution.create.mockImplementation(({data})=>data);
  const result=await service.provisionHomologationFixture(global,fixtureInput,'Authorized fixture preparation');
  expect(result).toMatchObject({id:institution,ownerId:owner,registrationNumber:null,status:'PENDING',name:'JurisSim Academy — HOMOLOGAÇÃO'});
  expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
  expect(db.administrativeEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({event:'HOMOLOGATION_FIXTURE_PROVISIONED',actorId:admin,resourceId:institution,result:expect.stringContaining(runId)})});
});
it.each(['','  ','ab'])('provisioning/approval requires a meaningful reason: %s',async reason=>{
  await expect(service.provisionHomologationFixture(global,fixtureInput,reason)).rejects.toMatchObject({statusCode:403});
  await expect(service.decide(global,institution,'ACTIVE',reason)).rejects.toMatchObject({statusCode:400});
  expect(db.institution.create).not.toHaveBeenCalled();expect(db.institution.update).not.toHaveBeenCalled();
});
it('H4.3 exact replay is idempotent and never resets a reviewed fixture or duplicates its audit',async()=>{
  db.user.findUnique.mockImplementation(({where})=>where.id===admin?{id:admin,role:'ADMIN',emailVerifiedAt:new Date(),deletedAt:null}:{id:owner,role:'ALUNO',email:'owner@example.invalid',emailVerifiedAt:new Date(),deletedAt:null});
  let stored:Record<string,unknown>|null=null;
  db.institution.findUnique.mockImplementation(async()=>stored);
  db.institution.create.mockImplementation(async({data})=>{stored={...data};return stored;});
  const first=await service.provisionHomologationFixture(global,fixtureInput,'Authorized fixture preparation');
  expect(first).toMatchObject({status:'PENDING',tradeName:'JurisSim Academy — TESTE'});
  const writes=db.administrativeEvent.create.mock.calls.length;
  const replay=await service.provisionHomologationFixture(global,fixtureInput,'Authorized fixture preparation');
  expect(replay).toMatchObject({id:institution,status:'PENDING'});
  stored!.status='ACTIVE';
  expect(await service.provisionHomologationFixture(global,fixtureInput,'Authorized fixture preparation')).toMatchObject({status:'ACTIVE'});
  expect(db.institution.create).toHaveBeenCalledTimes(1);expect(db.user.update).toHaveBeenCalledTimes(1);
  expect(db.administrativeEvent.create).toHaveBeenCalledTimes(writes);expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
  stored!.name='Registro alterado';
  await expect(service.provisionHomologationFixture(global,fixtureInput,'Authorized fixture preparation')).rejects.toMatchObject({statusCode:409});
});
it('H4.3 refuses replay without the exact audit run and propagates audit failure inside the transaction',async()=>{
  db.user.findUnique.mockImplementation(({where})=>where.id===admin?{id:admin,role:'ADMIN',emailVerifiedAt:new Date(),deletedAt:null}:{id:owner,role:'ALUNO',email:'owner@example.invalid',emailVerifiedAt:new Date(),deletedAt:null});
  db.institution.findUnique.mockResolvedValue(null);
  db.administrativeEvent.create.mockRejectedValue(new Error('isolated audit failure'));
  db.institution.create.mockImplementation(async({data})=>data);
  await expect(service.provisionHomologationFixture(global,fixtureInput,'Authorized fixture preparation')).rejects.toThrow('isolated audit failure');
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable'});
  expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
  const stored=db.institution.create.mock.calls[0][0].data;
  db.institution.findUnique.mockResolvedValue(stored);db.administrativeEvent.findFirst.mockResolvedValue({result:JSON.stringify({runId:foreign})});
  await expect(service.provisionHomologationFixture(global,fixtureInput,'Authorized fixture preparation')).rejects.toMatchObject({statusCode:409});
});
it('fixture approval still rejects missing institutional data and a suspended owner',async()=>{
  const current=await db.institution.findUnique();
  db.institution.findUnique.mockResolvedValue({...current,street:null});
  await expect(service.decide(global,institution,'ACTIVE','Reviewed')).rejects.toMatchObject({statusCode:409});
  db.institution.findUnique.mockResolvedValue(current);db.accountControl.findUnique.mockResolvedValue({suspended:true});
  await expect(service.decide(global,institution,'ACTIVE','Reviewed')).rejects.toMatchObject({statusCode:409});
  expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('an audit from a different run cannot authorize the CNPJ waiver',async()=>{
  db.administrativeEvent.findFirst.mockResolvedValue({result:JSON.stringify({runId:foreign})});
  await expect(service.decide(global,institution,'ACTIVE','Reviewed')).rejects.toMatchObject({statusCode:409});
});
it('an authorized participant cannot invite an unlisted recipient or assign an unlisted teacher',async()=>{
  vi.stubEnv('APP_PUBLIC_URL','http://127.0.0.1:5180');
  db.institution.findUnique.mockResolvedValue({status:'ACTIVE',name:'Fixture'});db.user.findFirst.mockResolvedValue({id:foreign});
  db.user.findMany.mockResolvedValue([{id:foreign,role:'ALUNO',deletedAt:null,emailVerifiedAt:new Date()}]);
  await expect(scoped(()=>service.invite(actor,institution,'outsider@example.invalid'))).rejects.toMatchObject({statusCode:403});
  await expect(scoped(()=>new ClassExamService().assignTeacher(actor,uid(10),foreign,true))).rejects.toMatchObject({statusCode:403});
  expect(mail.send).not.toHaveBeenCalled();expect(db.teacherInvitation.create).not.toHaveBeenCalled();
});
it('teacher invitation acceptance cannot use a token from another institution or elevate ADMIN',async()=>{
  db.teacherInvitation.findUnique.mockResolvedValue({id:uid(9),institutionId:foreign});
  await expect(scoped(()=>service.accept({userId:teacher,role:'PROFESSOR'},'a'.repeat(64)),teacher,false)).rejects.toMatchObject({statusCode:403});
  await expect(service.accept(global,'a'.repeat(64))).rejects.toMatchObject({statusCode:403});
  expect(db.user.update).not.toHaveBeenCalled();expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('a class invite code cannot join the fixture from an unlisted user or another institution from a scoped user',async()=>{
  db.$queryRaw.mockResolvedValue([{id:uid(10)}]);db.institutionalClass.findUnique.mockResolvedValue({institutionId:institution});
  await expect(new ClassExamService().join({userId:foreign,role:'ALUNO'},'code')).rejects.toMatchObject({statusCode:403});
  db.institutionalClass.findUnique.mockResolvedValue({institutionId:foreign});
  await expect(scoped(()=>new ClassExamService().join({userId:student,role:'ALUNO'},'code'),student,false)).rejects.toMatchObject({statusCode:403});
  expect(db.turma.update).not.toHaveBeenCalled();expect(db.classJoinRequest.upsert).not.toHaveBeenCalled();
});
it('classes and reports add the fixture boundary to existing ownership filters',async()=>{
  db.turma.findMany.mockResolvedValue([]);
  await scoped(()=>new ClassExamService().listClasses(actor,1));
  expect(db.turma.findMany.mock.calls[0][0].where.AND).toContainEqual({institutionalClass:{institutionId:institution,institution:{status:'ACTIVE'}}});
  await scoped(()=>new ClassReportService().classes(actor,1));
  expect(db.turma.findMany.mock.calls[1][0].where.AND).toContainEqual({institutionalClass:{institutionId:institution,institution:{status:'ACTIVE'}}});
  expect(homologationClassBoundary()).toMatchObject({OR:expect.any(Array)});
});
it('valid institutional staff can create a class only in the bound fixture',async()=>{
  db.turma.create.mockResolvedValue({id:uid(10)});
  await scoped(()=>new ClassExamService().createClass(actor,'Fixture class'));
  expect(db.institutionalClass.create).toHaveBeenCalledWith({data:{classId:uid(10),institutionId:institution}});
  db.turma.create.mockClear();
  await expect(scoped(()=>new ClassExamService().createClass({...actor,institutionId:foreign},'Wrong class'))).rejects.toMatchObject({statusCode:403});
  expect(db.turma.create).not.toHaveBeenCalled();
});
it('an authorized student class code creates a pending request, never direct enrollment',async()=>{
  db.$queryRaw.mockResolvedValue([{id:uid(10)}]);
  db.institutionalClass.findUnique.mockResolvedValue({institutionId:institution,institution:{status:'ACTIVE'}});
  db.turma.findFirst.mockResolvedValue({id:uid(10),alunos:[]});db.turma.findUnique.mockResolvedValue({professores:[]});
  await scoped(()=>new ClassExamService().join({userId:student,role:'ALUNO'},'code'),student,false);
  expect(db.classJoinRequest.upsert).toHaveBeenCalledWith(expect.objectContaining({create:{classId:uid(10),studentId:student},update:expect.objectContaining({status:'PENDING'})}));
  expect(db.turma.update).not.toHaveBeenCalled();
});
it('individual reports refuse unauthorized classes before any academic SQL query',async()=>{
  db.turma.findFirst.mockResolvedValue(null);
  await expect(scoped(()=>new ClassReportService().report(actor,foreign,1,1))).rejects.toMatchObject({statusCode:404});
  expect(db.$queryRaw).not.toHaveBeenCalled();
});
it('disabled mode with retained registry, or invalid enabled configuration, hides audited fixture classes from legacy access',()=>{
  state.manifest='{}';expect(homologationClassBoundary()).toMatchObject({OR:expect.arrayContaining([{institutionalClass:{institution:{events:{none:{event:'HOMOLOGATION_FIXTURE_PROVISIONED'}}}}}])});
  vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','false');
  const exists=vi.spyOn(fs,'existsSync').mockReturnValue(true);
  try {expect(institutionsEnabled()).toBe(false);expect(homologationClassBoundary()).toMatchObject({OR:expect.any(Array)});} finally {exists.mockRestore();}
});
it('invitation inspection cannot cross institutions or expose another recipient',async()=>{
  db.teacherInvitation.findUnique.mockResolvedValue({id:uid(9),institutionId:foreign,email:'other@example.invalid'});
  await expect(scoped(()=>validInvitation(db as never,'a'.repeat(64)))).rejects.toMatchObject({statusCode:403});expect(db.$queryRaw).not.toHaveBeenCalled();
  db.teacherInvitation.findUnique.mockResolvedValue({id:uid(9),institutionId:institution,email:'other@example.invalid'});
  await expect(scoped(()=>validInvitation(db as never,'a'.repeat(64)))).rejects.toMatchObject({statusCode:403});
});
it('revoking configuration invalidates an in-flight scoped policy',()=>{
  scoped(()=>{state.manifest='{}';expect(institutionsEnabled()).toBe(false);expect(()=>homologationClassBoundary()).toThrow();});
});
it('scope is isolated across concurrent asynchronous requests',async()=>{
  const results=await Promise.all([scoped(async()=>{await Promise.resolve();return institutionsEnabled();}),Promise.resolve().then(()=>institutionsEnabled())]);
  expect(results).toEqual([true,false]);
});
it('HTTP availability reflects the authenticated scope and gates invitations consistently',async()=>{
  const app=express();app.use(express.json());app.use('/institutions',createInstitutionRoutes(service));app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/institutions`;
  const token=jwt.sign({id:owner,role:'ALUNO',sessionVersion:0},process.env.JWT_SECRET!,{expiresIn:'1h'});
  const headers={'Authorization':`Bearer ${token}`,'Content-Type':'application/json'};
  try {
    expect((await (await fetch(base+'/availability')).json()).enabled).toBe(false);
    expect((await (await fetch(base+'/availability',{headers})).json()).enabled).toBe(true);
    expect((await fetch(base+`/${foreign}/summary`,{headers})).status).toBe(403);
    expect((await fetch(base+'/invitations/onboarding',{method:'POST',headers,body:JSON.stringify({token:'a'.repeat(64)})})).status).toBe(403);
    db.institutionalMembership.findMany.mockResolvedValue([]);db.user.findFirst.mockResolvedValue(null);
    db.teacherInvitation.findUnique.mockResolvedValue({id:uid(9),institutionId:foreign,email:'owner@example.invalid'});
    expect((await fetch(base+'/invitations/inspect',{method:'POST',headers,body:JSON.stringify({token:'a'.repeat(64)})})).status).toBe(403);
    db.user.findUnique.mockResolvedValue({id:foreign,role:'ALUNO',emailVerifiedAt:new Date(),sessionVersion:0});
    expect((await (await fetch(base+'/availability',{headers})).json()).enabled).toBe(false);
    expect((await fetch(base+`/${institution}/summary`,{headers})).status).toBe(503);
    expect(mail.send).not.toHaveBeenCalled();
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('restricted recipient without a teaching link can inspect only after authentication, never automatically accept',async()=>{
  const app=express();app.use(express.json());app.use('/institutions',createInstitutionRoutes(service));app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/institutions`;
  const invitationToken='a'.repeat(64);
  try{
    expect((await fetch(base+'/invitations/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:invitationToken})})).status).toBe(503);
    expect(db.teacherInvitation.findUnique).not.toHaveBeenCalled();
    db.user.findUnique.mockResolvedValue({id:teacher,role:'ALUNO',email:'invited@example.invalid',emailVerifiedAt:new Date(),deletedAt:null,sessionVersion:0});
    db.user.findFirst.mockResolvedValue(null);db.user.findMany.mockResolvedValue([]);
    db.institutionalMembership.findMany.mockResolvedValue([]);
    db.teacherInvitation.findUnique.mockResolvedValue({id:uid(9),institutionId:institution,email:'invited@example.invalid',status:'PENDING',expiresAt:new Date(Date.now()+3600000)});
    db.institution.findUnique.mockResolvedValue({id:institution,name:'Fixture',status:'ACTIVE'});
    const jwtToken=jwt.sign({id:teacher,role:'ALUNO',sessionVersion:0},process.env.JWT_SECRET!,{expiresIn:'1h'});
    const response=await fetch(base+'/invitations/inspect',{method:'POST',headers:{Authorization:`Bearer ${jwtToken}`,'Content-Type':'application/json'},body:JSON.stringify({token:invitationToken})});
    expect(response.status).toBe(200);expect((await response.json()).institution.id).toBe(institution);
    db.teacherInvitation.findUnique.mockResolvedValue({id:uid(9),institutionId:institution,email:'invited@example.invalid',status:'CANCELLED',expiresAt:new Date(Date.now()+3600000)});
    const revoked=await fetch(base+'/invitations/inspect',{method:'POST',headers:{Authorization:`Bearer ${jwtToken}`,'Content-Type':'application/json'},body:JSON.stringify({token:invitationToken})});
    expect(revoked.status).toBe(409);expect((await revoked.json()).code).toBe('INVITATION_REVOKED');
    expect(db.teacherInvitation.updateMany).not.toHaveBeenCalled();expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('restricted teacher reads exam-eligible metadata while question management remains forbidden',async()=>{
  const classId=uid(80);
  db.user.findUnique.mockResolvedValue({id:teacher,role:'PROFESSOR',email:'teacher@example.invalid',emailVerifiedAt:new Date(),deletedAt:null,sessionVersion:0});
  db.institutionalMembership.findMany.mockResolvedValue([{institutionId:institution,role:'TEACHER',institution:{name:'Fixture'}}]);
  db.institutionalClass.findMany.mockResolvedValue([{classId}]);
  db.turma.count.mockImplementation(({where})=>where.id.in.every((id:string)=>id===classId)?1:0);
  db.questao.findMany.mockResolvedValue([{id:uid(81),enunciado:'Questão elegível',disciplina:'Civil',assunto:'Tema',nivel:'BASICO',publica:true,turmaId:null,autorId:teacher,alternativas:[{correta:true},{correta:false}]}]);
  const app=express();const management=vi.fn((_req:unknown,res:Response)=>res.json({unexpected:true}));
  app.use('/questoes',requireAuth,management);app.use('/avaliacoes',examRoutes);app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const headers={Authorization:`Bearer ${jwt.sign({id:teacher,role:'PROFESSOR',sessionVersion:0},process.env.JWT_SECRET!,{expiresIn:'1h'})}`};
  try{
    expect((await fetch(base+'/questoes',{headers})).status).toBe(403);expect(management).not.toHaveBeenCalled();
    const response=await fetch(base+'/avaliacoes/eligible-questions?turmaIds='+classId,{headers});
    expect(response.status).toBe(200);const body=await response.json();expect(body.items).toHaveLength(1);expect(body.items[0]).not.toHaveProperty('alternativas');
    expect((await fetch(base+'/avaliacoes/eligible-questions?turmaIds='+foreign,{headers})).status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();expect(db.avaliacao.create).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('a repeated provision cannot overwrite the pending fixture or create a duplicate',async()=>{
  let created: Record<string,unknown>|null=null;
  db.user.findUnique.mockImplementation(({where})=>where.id===admin?{role:'ADMIN',emailVerifiedAt:new Date()}:{role:'ALUNO',email:'owner@example.invalid',emailVerifiedAt:new Date()});
  db.institution.findUnique.mockImplementation(async()=>created);
  db.institution.create.mockImplementation(async({data})=>{created=data;return data;});
  await service.provisionHomologationFixture(global,fixtureInput,'Reviewed operation');
  await expect(service.provisionHomologationFixture(global,fixtureInput,'Repeated operation')).resolves.toMatchObject({id:institution,status:'PENDING'});
  expect(db.institution.create).toHaveBeenCalledTimes(1);expect(db.institution.update).not.toHaveBeenCalled();expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it('a provisioning audit failure propagates to the serializable transaction; no permission is created',async()=>{
  db.user.findUnique.mockImplementation(({where})=>where.id===admin?{role:'ADMIN',emailVerifiedAt:new Date()}:{role:'ALUNO',email:'owner@example.invalid',emailVerifiedAt:new Date()});
  db.institution.findUnique.mockResolvedValue(null);db.institution.create.mockResolvedValue({id:institution});
  db.administrativeEvent.create.mockRejectedValue(new Error('Simulated audit failure'));
  await expect(service.provisionHomologationFixture(global,fixtureInput,'Reviewed operation')).rejects.toThrow('Simulated audit failure');
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable'});
  expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();
});
it('institutional dashboard returns the authorized fixture and real empty indicators',async()=>{
  db.institutionalMembership.findMany.mockResolvedValue([]);db.institutionalMembership.count.mockResolvedValue(0);
  db.turma.findMany.mockResolvedValue([]);db.turma.count.mockResolvedValue(0);db.user.findMany.mockResolvedValue([]);db.user.count.mockResolvedValue(0);db.simulado.count.mockResolvedValue(0);db.teacherInvitation.count.mockResolvedValue(0);
  const result=await scoped(()=>service.institutionSummary(actor,institution,1));
  expect(result.institution?.id).toBe(institution);expect(result.classes.items).toEqual([]);expect(result.indicators).toMatchObject({classes:0,students:0,completedAttempts:0});
});
it('H4.4 ADMIN read model exempts only the proven null CNPJ and grants no permission before approval',async()=>{
  const row=await db.institution.findUnique();
  db.institution.findMany.mockResolvedValue([{...row,owner:{emailVerifiedAt:new Date(),deletedAt:null,accountControl:null}}]);
  const result=await service.institutions(global,1,'PENDING');
  expect(result.items[0]).toMatchObject({registrationNumber:null,status:'PENDING',homologationApproval:true,approvalReview:{pendingFields:[],canApprove:true}});
  expect(db.institution.update).not.toHaveBeenCalled();expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();expect(db.administrativeEvent.create).not.toHaveBeenCalled();expect(mail.send).not.toHaveBeenCalled();
});
it.each(['mode off','manifest missing','manifest invalid','unlisted admin','similar UUID and same name','wrong owner','audit missing','wrong run','wrong project'])('H4.4 read model keeps CNPJ blocking when %s',async condition=>{
  let row={...await db.institution.findUnique(),name:'JurisSim Academy — HOMOLOGAÇÃO',owner:{emailVerifiedAt:new Date(),deletedAt:null,accountControl:null}};
  let adminActor=global;
  if(condition==='mode off')vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','false');
  if(condition==='manifest missing')state.manifest='';
  if(condition==='manifest invalid')state.manifest='{}';
  if(condition==='unlisted admin')adminActor={userId:foreign,role:'ADMIN'};
  if(condition==='similar UUID and same name')row={...row,id:foreign};
  if(condition==='wrong owner')row={...row,ownerId:foreign};
  if(condition==='audit missing')db.administrativeEvent.findFirst.mockResolvedValue(null);
  if(condition==='wrong run')db.administrativeEvent.findFirst.mockResolvedValue({result:JSON.stringify({runId:foreign})});
  if(condition==='wrong project')vi.stubEnv('DIRECT_URL',process.env.DIRECT_URL!.replace(manifest.projectRef,'b'.repeat(20)));
  db.institution.findMany.mockResolvedValue([row]);
  const result=await service.institutions(adminActor,1,'PENDING');
  expect(result.items[0]).toMatchObject({homologationApproval:false,approvalReview:{pendingFields:['CNPJ'],canApprove:false}});
  expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();expect(db.institution.update).not.toHaveBeenCalled();
});
it.each(['other missing field','invalid field','unconfirmed owner','deleted owner','suspended owner'])('H4.4 fixture waiver cannot bypass %s',async condition=>{
  const row=await db.institution.findUnique();
  const ownerState={emailVerifiedAt:new Date() as Date|null,deletedAt:null as Date|null,accountControl:null as {suspended:boolean}|null};
  const change:Record<string,unknown>={};
  if(condition==='other missing field')change.street=null;
  if(condition==='invalid field')change.postalCode='invalid';
  if(condition==='unconfirmed owner')ownerState.emailVerifiedAt=null;
  if(condition==='deleted owner')ownerState.deletedAt=new Date();
  if(condition==='suspended owner')ownerState.accountControl={suspended:true};
  db.institution.findMany.mockResolvedValue([{...row,...change,owner:ownerState}]);
  const result=await service.institutions(global,1,'PENDING');
  expect(result.items[0]).toMatchObject({homologationApproval:true,approvalReview:{canApprove:false}});
  expect(result.items[0].approvalReview.pendingFields).not.toContain('CNPJ');
  if(condition==='other missing field')expect(result.items[0].approvalReview.pendingFields).toContain('Logradouro');
  expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();expect(db.institution.update).not.toHaveBeenCalled();
});
it('an authenticated teacher accesses assigned classes but neither institutional administration nor global ADMIN endpoints',async()=>{
  db.user.findUnique.mockResolvedValue({id:teacher,role:'PROFESSOR',email:'teacher@example.invalid',emailVerifiedAt:new Date(),sessionVersion:0});
  db.institutionalMembership.findMany.mockResolvedValue([{institutionId:institution,role:'TEACHER',institution:{name:'Fixture'}}]);
  db.institutionalMembership.findFirst.mockImplementation(({where})=>where.role==='INSTITUTION_ADMIN'?null:{id:uid(8)});
  db.institutionalClass.findMany.mockResolvedValue([{classId:uid(10)}]);db.turma.findMany.mockResolvedValue([{id:uid(10),nome:'Assigned class'}]);
  const app=express();app.use(express.json());app.use('/turmas',classRoutes);app.use('/institutions',createInstitutionRoutes(service));app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const token=jwt.sign({id:teacher,role:'PROFESSOR',sessionVersion:0},process.env.JWT_SECRET!,{expiresIn:'1h'});
  const headers={Authorization:`Bearer ${token}`,'x-institution-id':institution};
  try {
    const classes=await fetch(base+'/turmas',{headers});expect(classes.status).toBe(200);expect((await classes.json()).items[0].id).toBe(uid(10));
    expect((await fetch(base+`/institutions/${institution}/summary`,{headers})).status).toBe(403);
    expect((await fetch(base+'/institutions/admin/summary',{headers})).status).toBe(403);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
