import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>{
  const model=()=>Object.fromEntries(['findUnique','findFirst','findMany','create','update','updateMany','upsert','count'].map(key=>[key,vi.fn()]));
  return {user:model(),institution:model(),auditLog:model(),accountControl:model(),administrativeEvent:model(),institutionalMembership:model(),$transaction:vi.fn(),$executeRaw:vi.fn(),$queryRaw:vi.fn()};
});
vi.mock('../lib/prisma',()=>({prisma:db}));
vi.mock('bcrypt',()=>({default:{hash:vi.fn(async()=> 'isolated-test-hash'),compare:vi.fn()}}));
import {AuthService} from './auth-service';
import {InstitutionService} from './institution-service';
import {institutionAccountRegistrationSchema} from './institution-account-registration';
import {institutionApplication} from '../__tests__/fixtures/institution-request';
import versions from '../legal-versions.json';
import {AuthController} from '../controllers/auth-controller';
import {createAuthRoutes} from '../routes/auth-routes';
import {errorHandler} from '../middlewares/error-handler';
import {denyGlobalAcademicAccess} from '../middlewares/academic-access';
import type {AuthenticatedRequest} from '../middlewares/auth-middleware';
import express,{type Response} from 'express';
const id='00000000-0000-4000-8000-000000000071';
const input={institution:institutionApplication,email:'owner@example.invalid',emailConfirmation:'OWNER@example.invalid',senha:'Test-secret9!',confirmacaoSenha:'Test-secret9!',acceptance:{accepted:true,termsVersion:versions.termsVersion,privacyVersion:versions.privacyVersion}};
let user:Record<string,unknown>|null;
beforeEach(()=>{
  vi.clearAllMocks();user=null;vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','true');vi.stubEnv('ADMINISTRATION_ENABLED','true');vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('INSTITUTION_HOMOLOGATION_ENABLED','false');vi.stubEnv('JWT_SECRET','local-test-secret-with-more-than-32-characters');
  db.$transaction.mockImplementation(work=>work(db));
  db.user.findUnique.mockImplementation(({where})=>where.email?user:user);
  db.user.create.mockImplementation(({data})=>{user={...data,id,sessionVersion:0,emailVerifiedAt:null,deletedAt:null};return user;});
  db.institution.findFirst.mockResolvedValue(null);db.accountControl.findUnique.mockResolvedValue(null);
  db.institution.create.mockImplementation(({data})=>({...data,id:'application-id'}));
});
afterEach(()=>vi.unstubAllEnvs());
it('creates account plus EMAIL_PENDING application in one serializable transaction without institutional privileges',async()=>{
  const result=await new AuthService().registerInstitutionalApplication(input);
  expect(db.$transaction).toHaveBeenCalledTimes(1);expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable'});
  expect(db.user.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({email:'owner@example.invalid',role:'ALUNO',registrationIntent:'INSTITUTION'})}));
  expect(db.institution.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({ownerId:id,status:'EMAIL_PENDING',registrationNumber:'12ABC34501DE35'})}));
  expect(result.institution.status).toBe('EMAIL_PENDING');expect(result.usuario.role).toBe('ALUNO');expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
});
it.each(['name','tradeName','registrationNumber','institutionType','postalCode','city','state','representationEvidence','representationDeclaration'])('rejects missing institutional field %s before any write',async key=>{
  const institution:Record<string,unknown>={...institutionApplication};delete institution[key];
  await expect(new AuthService().registerInstitutionalApplication({...input,institution})).rejects.toThrow();expect(db.$transaction).not.toHaveBeenCalled();
});
it.each([{emailConfirmation:'different@example.invalid'},{confirmacaoSenha:'Different9!'},{acceptance:{accepted:false}}])('rejects mismatched access/consent data',async override=>{
  await expect(new AuthService().registerInstitutionalApplication({...input,...override})).rejects.toThrow();expect(db.user.create).not.toHaveBeenCalled();
});
it('public schema refuses fixture exemptions and privilege injection',()=>{
  expect(institutionAccountRegistrationSchema.safeParse({...input,institution:{...institutionApplication,registrationNumber:null},ownerId:id,homologation:true}).success).toBe(false);
});
it('existing owner is never duplicated or assigned a new password',async()=>{
  user={id,email:input.email,emailVerifiedAt:new Date()};
  await expect(new AuthService().registerInstitutionalApplication(input)).rejects.toMatchObject({statusCode:409});
  expect(db.user.create).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();expect(db.institution.create).not.toHaveBeenCalled();
});
it('a duplicate institution aborts the account/application transaction instead of returning a partial success',async()=>{
  db.institution.findFirst.mockResolvedValue({id:'existing'});
  await expect(new AuthService().registerInstitutionalApplication(input)).rejects.toMatchObject({statusCode:409});
  expect(db.institution.create).not.toHaveBeenCalled();expect(db.auditLog.create).not.toHaveBeenCalled();
});
it('registration disabled refuses the entire combined flow',async()=>{
  vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','false');await expect(new AuthService().registerInstitutionalApplication(input)).rejects.toMatchObject({statusCode:503});expect(db.user.create).not.toHaveBeenCalled();
});
it('confirmed existing account completes an application without changing confirmation, password or global role',async()=>{
  user={id,email:input.email,emailVerifiedAt:new Date(),role:'ALUNO'};
  await new InstitutionService().request({userId:id,role:'ALUNO'},institutionAccountRegistrationSchema.parse(input).institution);
  expect(db.user.create).not.toHaveBeenCalled();expect(db.user.update).toHaveBeenCalledWith({where:{id},data:{registrationIntent:'INSTITUTION'},select:{id:true}});
  expect(db.institution.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'PENDING',ownerId:id})}));
});
it('a refusal may be corrected only by its owner, reusing the same account and application',async()=>{
  db.institution.findUnique.mockResolvedValue({id:'application-id',ownerId:id,status:'REJECTED',decisionReason:'Dados incompletos'});
  await new InstitutionService().resubmit({userId:id,role:'ALUNO'},'application-id',institutionApplication);
  expect(db.institution.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:'application-id'},data:expect.objectContaining({status:'PENDING',decisionReason:null})}));
  expect(db.user.create).not.toHaveBeenCalled();expect(db.institution.create).not.toHaveBeenCalled();expect(db.institutionalMembership.upsert).not.toHaveBeenCalled();
  db.institution.findUnique.mockResolvedValue({id:'application-id',ownerId:'foreign',status:'REJECTED'});
  await expect(new InstitutionService().resubmit({userId:id,role:'ALUNO'},'application-id',institutionApplication)).rejects.toMatchObject({statusCode:403});
});
it.each(['PENDING','ACTIVE','SUSPENDED','EMAIL_PENDING'])('does not allow resubmission of %s',async status=>{
  db.institution.findUnique.mockResolvedValue({ownerId:id,status});await expect(new InstitutionService().resubmit({userId:id,role:'ALUNO'},'application-id',institutionApplication)).rejects.toMatchObject({statusCode:409});expect(db.institution.update).not.toHaveBeenCalled();
});
it('confirmation delivery failure keeps the consistent combined registration and permits no duplicate submission',async()=>{
  const verification={requestVerification:vi.fn().mockRejectedValue(new Error('Simulated unavailable mail'))};
  const controller=new AuthController(new AuthService(),undefined,verification as never);
  const app=express();app.use(express.json());app.use('/auth',createAuthRoutes(controller));app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/auth/institution-register`;
  try{
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    expect(response.status).toBe(201);expect(await response.json()).toMatchObject({institution:{status:'EMAIL_PENDING'},emailVerification:{status:'unavailable'}});
    expect((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})).status).toBe(409);
    expect(db.user.create).toHaveBeenCalledTimes(1);expect(verification.requestVerification).toHaveBeenCalledTimes(1);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('institutional accounts have no student academic access or implicit global admin privileges',()=>{
  for(const [url,auth,denied] of [
    ['/diagnostics',{role:'ALUNO',institutionalAccount:true},true],
    ['/turmas',{role:'ALUNO',institutionalAccount:true},true],
    ['/turmas',{role:'ALUNO',institutionalAccount:true,institutionAdmin:true},false],
    ['/diagnostics',{role:'ALUNO',institutionalAccount:true,institutionAdmin:true},true],
    ['/turmas',{role:'ALUNO'},false],['/reports/classes',{role:'ADMIN'},true],['/turmas',{role:'PROFESSOR'},false],
  ] as const){const next=vi.fn();denyGlobalAcademicAccess({originalUrl:url,auth:{userId:id,...auth}} as AuthenticatedRequest,{} as Response,next);if(denied)expect(next).toHaveBeenCalledWith(expect.objectContaining({statusCode:403}));else expect(next).toHaveBeenCalledWith();}
});
