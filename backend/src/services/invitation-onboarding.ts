import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';
import { assertTeacherInvitationsAvailable } from '../config/teacher-invitations';
import { administrativeEvent, hashInvitation, institutionalTransaction, fixtureProvenance, type Tx } from './institution-service';
import { acceptanceData, acceptanceSchema } from './legal-acceptance';
import { assertValidPassword } from './password-policy';
import { createBrevoEmailTransport, type TransactionalEmailTransport } from './brevo-email-transport';
import { isValidAppUrl } from './app-url';
import { emailFrontendUrl } from './email-frontend';
import { classifyEmailDeliveryFailure } from './email-delivery-failure';
import { emailAccepted, emailFailed } from './transactional-email-log';
import { homologationManifest, institutionRequestScope, assertRestrictedInstitution, assertRestrictedParticipant } from '../config/institution-homologation';
import { institutionsGloballyEnabled } from '../config/institution-feature';
import { assertEmailReusable } from './account-deletion';

const hashProof = (token:string) => createHash('sha256').update(token).digest('hex');
import {escapeMail} from './email-html';
export {escapeMail} from './email-html';
const generic = {message:'Se este for seu primeiro acesso, consulte as instruções no e-mail convidado. Se já possui conta, entre pelo login único. Caso não receba a mensagem, aguarde um minuto e tente novamente ou procure o responsável.'};

export async function validInvitation(tx:Tx, token:string) {
  assertTeacherInvitationsAvailable();
  const found = await tx.teacherInvitation.findUnique({where:{tokenHash:hashInvitation(token)}});
  if(!found) throw new ApiError(409,'Convite inválido ou indisponível. Solicite orientação à instituição.',undefined,'INVITATION_INVALID');
  assertRestrictedInstitution(found.institutionId);
  if (!institutionsGloballyEnabled() && homologationManifest()) {
    if(!await fixtureProvenance(tx,homologationManifest()!)) throw new ApiError(403,'Fixture sem provisionamento autorizado.');
    const scope = institutionRequestScope.getStore();
    if (!scope) throw new ApiError(403,'Autenticação autorizada obrigatória.');
    assertRestrictedParticipant(scope.userId);
    const user = await tx.user.findUnique({where:{id:scope.userId},select:{email:true,emailVerifiedAt:true,deletedAt:true}});
    if(!user || user.deletedAt || !user.emailVerifiedAt || user.email.toLowerCase() !== found.email.toLowerCase()) throw new ApiError(403,'Entre com a conta destinatária e confirme seu e-mail para validar este convite.',undefined,'INVITATION_WRONG_ACCOUNT');
  }
  await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${found.institutionId} FOR UPDATE`;
  const invitation = await tx.teacherInvitation.findUnique({where:{id:found.id}});
  const institution = await tx.institution.findUnique({where:{id:found.institutionId},select:{id:true,name:true,status:true}});
  if (!invitation || institution?.status !== 'ACTIVE')
    throw new ApiError(409,'Convite inválido ou indisponível. Solicite orientação à instituição.');
  if(invitation.status==='ACCEPTED') throw new ApiError(409,'Este convite já foi aceito. Entre na sua conta para acessar sua área.',undefined,'INVITATION_ACCEPTED');
  if(invitation.status==='CANCELLED') throw new ApiError(409,'Este convite foi revogado. Procure a instituição para orientação.',undefined,'INVITATION_REVOKED');
  if(invitation.status==='DECLINED') throw new ApiError(409,'Este convite foi recusado e não pode ser aceito novamente.',undefined,'INVITATION_DECLINED');
  if(invitation.expiresAt<=new Date()) throw new ApiError(409,'Este convite expirou. Solicite um novo convite à instituição.',undefined,'INVITATION_EXPIRED');
  if(invitation.status!=='PENDING') throw new ApiError(409,'Convite inválido ou indisponível. Solicite orientação à instituição.',undefined,'INVITATION_INVALID');
  return {invitation,institution};
}

export class InvitationOnboardingService {
  constructor(private readonly mail:TransactionalEmailTransport=createBrevoEmailTransport()) {}
  inspect(token:string) {
    return institutionalTransaction(async tx=>{
      const {invitation,institution}=await validInvitation(tx,token);
      const [local,domain]=invitation.email.split('@');
      const existing=await tx.user.findFirst({where:{email:{equals:invitation.email,mode:'insensitive'}}});
      const legacy=existing && await tx.invitationOnboarding.findUnique({where:{userId:existing.id}});
      const resumable=!!existing&&!existing.deletedAt&&!existing.emailVerifiedAt&&existing.role==='ALUNO'&&legacy?.invitationId===invitation.id&&!legacy.completedAt&&existing.senhaHash===legacy.initialPasswordHash;
      return {institution:{id:institution.id,name:institution.name},invitedName:invitation.invitedName,
        email:invitation.email,accountExists:!!existing&&!resumable,maskedEmail:`${local.slice(0,1)}***@${domain}`,expiresAt:invitation.expiresAt};
    });
  }
  async register(token:string,nome:string,password:string,confirmation:string,acceptance:unknown) {
    // The exceptional H3 runtime still requires pre-existing authorized accounts.
    if(!institutionsGloballyEnabled()) throw new ApiError(403,'Use uma conta individual previamente cadastrada e confirmada.');
    nome=nome.trim();
    if(nome.length<2||nome.length>120)throw new ApiError(422,'Informe seu nome completo.');
    acceptanceSchema.parse(acceptance);assertValidPassword(password);
    if(password!==confirmation)throw new ApiError(422,'As senhas não coincidem.');
    const senhaHash=await bcrypt.hash(password,10);
    return institutionalTransaction(async tx=>{
      const {invitation}=await validInvitation(tx,token);
      await assertEmailReusable(invitation.email);
      const accounts=await tx.user.findMany({where:{email:{equals:invitation.email,mode:'insensitive'}},take:2});
      const existing=accounts[0];
      const legacy=existing&&await tx.invitationOnboarding.findUnique({where:{userId:existing.id}});
      const resumable=accounts.length===1&&!existing.deletedAt&&!existing.emailVerifiedAt&&existing.role==='ALUNO'&&legacy?.invitationId===invitation.id&&!legacy.completedAt&&existing.senhaHash===legacy.initialPasswordHash;
      if(existing&&!resumable)throw new ApiError(409,'Já existe uma conta para este convite. Entre com sua senha ou Google para aceitar o vínculo.');
      if(existing&&(await tx.accountControl.findUnique({where:{userId:existing.id}}))?.suspended)throw new ApiError(403,'Conta indisponível. Procure o suporte.');
      const legal=acceptanceData(acceptance);
      const data={nome,senhaHash,emailVerifiedAt:new Date(),registrationIntent:'TEACHER_INVITATION',...legal,auditLogs:{create:[legal.auditLogs.create,{action:'EMAIL_CONFIRMADO' as const}]}};
      const user=existing?await tx.user.update({where:{id:existing.id},data:{...data,sessionVersion:{increment:1}}}):await tx.user.create({data:{...data,email:invitation.email.toLowerCase(),role:'ALUNO'}});
      if(legacy)await tx.invitationOnboarding.update({where:{id:legacy.id},data:{completedAt:new Date()}});
      await administrativeEvent(tx,'INVITATION_IDENTITY_CREATED',user.id,invitation.institutionId,invitation.id);
      return {message:'Sua conta foi criada. Entre com a senha que definiu para revisar e aceitar ou recusar o convite.',nextStep:'LOGIN',invitationPending:true};
    });
  }
  /** Legacy compatibility for isolated regression fixtures. No public route calls this method. */
  async start(token:string,nome:string,acceptance:unknown) {
    acceptanceSchema.parse(acceptance);
    const publicAppUrl=emailFrontendUrl();
    if(!this.mail.isConfigured || !isValidAppUrl(publicAppUrl)) throw new ApiError(503,'Primeiro acesso indisponível. Procure o responsável institucional.');
    const proof=randomBytes(32).toString('hex'), initialPasswordHash=await bcrypt.hash(randomBytes(32).toString('hex'),10);
    let delivery: {id:string;email:string;name:string;institution:string}|undefined;
    try {
      delivery=await institutionalTransaction(async tx=>{
        const {invitation,institution}=await validInvitation(tx,token);
        const existing=await tx.user.findFirst({where:{email:{equals:invitation.email,mode:'insensitive'}}});
        const pending=await tx.invitationOnboarding.findUnique({where:{invitationId:invitation.id}})
          ?? (existing ? await tx.invitationOnboarding.findUnique({where:{userId:existing.id}}) : undefined);
        if(existing && (!pending || pending.userId!==existing.id || existing.deletedAt || existing.senhaHash!==pending.initialPasswordHash || existing.role!=='ALUNO')) return undefined;
        if(pending && (pending.completedAt || (pending.invitationId===invitation.id && pending.sendAttempts>=3) || Date.now()-pending.lastSentAt.getTime()<60_000)) return undefined;
        const user=existing ?? await tx.user.create({data:{nome,email:invitation.email,senhaHash:initialPasswordHash,role:'ALUNO',...acceptanceData(acceptance)},select:{id:true}});
        const expiresAt=new Date(Math.min(invitation.expiresAt.getTime(),Date.now()+30*60_000));
        const onboarding=pending ? await tx.invitationOnboarding.update({where:{id:pending.id},data:{invitationId:invitation.id,proofHash:hashProof(proof),expiresAt,lastSentAt:new Date(),sendAttempts:pending.invitationId===invitation.id?{increment:1}:1}})
          : await tx.invitationOnboarding.create({data:{invitationId:invitation.id,userId:user.id,proofHash:hashProof(proof),initialPasswordHash,expiresAt}});
        await administrativeEvent(tx,'INVITATION_ONBOARDING_STARTED',user.id,institution.id,invitation.id);
        return {id:onboarding.id,email:invitation.email,name:nome,institution:institution.name};
      });
    } catch(error) {
      if(error instanceof ApiError && error.statusCode===409 && error.message==='Registro duplicado ou solicitação já existente.') return generic;
      throw error;
    }
    if(delivery) {
      const url=`${publicAppUrl}/#/ativar-professor?convite=${token}&confirmacao=${proof}`;
      try {
        await this.mail.send({to:delivery.email,subject:'Confirme seu primeiro acesso ao JurisSim',
          text:`Olá, ${delivery.name}. Confirme seu e-mail e defina sua própria senha para o convite de ${delivery.institution}: ${url}\nValidade máxima: 30 minutos. Ignore se não reconhecer. Não compartilhe o link.`,
          html:`<h1>JurisSim · Educação Jurídica</h1><p>Olá, ${escapeMail(delivery.name)}.</p><p>Confirme seu e-mail para o convite de ${escapeMail(delivery.institution)} e defina sua própria senha.</p><p><a href="${escapeMail(url)}">Confirmar e-mail e concluir acesso</a></p><p>Validade máxima: 30 minutos. Ignore se não reconhecer. Não compartilhe este link. Nunca enviamos senhas.</p>`});
        emailAccepted('teacher_onboarding',delivery.id);
      } catch (error) {
        const failure=classifyEmailDeliveryFailure(error);
        emailFailed('teacher_onboarding',delivery.id,error);
        if(failure.outcome==='not_accepted')await prisma.invitationOnboarding.updateMany({where:{id:delivery.id,completedAt:null,proofHash:hashProof(proof)},data:{expiresAt:new Date(0)}});
        // Generic response deliberately does not reveal whether an account existed.
        console.error('Falha no envio de confirmação de convite; dados e credenciais omitidos.');
      }
    }
    return generic;
  }
  async complete(token:string,proof:string,password:string,confirmation:string) {
    assertValidPassword(password);
    if(password!==confirmation) throw new ApiError(422,'As senhas não coincidem.');
    const senhaHash=await bcrypt.hash(password,10);
    return institutionalTransaction(async tx=>{
      const {invitation}=await validInvitation(tx,token);
      const entry=await tx.invitationOnboarding.findUnique({where:{proofHash:hashProof(proof)}});
      if(!entry || entry.invitationId!==invitation.id) throw new ApiError(409,'Confirmação inválida ou indisponível.');
      await tx.$queryRaw`SELECT id FROM "InvitationOnboarding" WHERE id = ${entry.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${entry.userId} FOR UPDATE`;
      const current=await tx.invitationOnboarding.findUnique({where:{id:entry.id}});
      const user=await tx.user.findUnique({where:{id:entry.userId}});
      const control=await tx.accountControl.findUnique({where:{userId:entry.userId}});
      if(control?.suspended || !current || current.completedAt || current.expiresAt<=new Date() || current.proofHash!==hashProof(proof) || !user || user.deletedAt || user.role!=='ALUNO' || user.email.toLowerCase()!==invitation.email.toLowerCase() || user.senhaHash!==current.initialPasswordHash)
        throw new ApiError(409,'Primeiro acesso já concluído, expirado ou conta alterada. Use o login e a recuperação existentes.');
      await tx.user.update({where:{id:user.id},data:{senhaHash,emailVerifiedAt:new Date(),registrationIntent:'TEACHER_INVITATION',sessionVersion:{increment:1},auditLogs:{create:{action:'EMAIL_CONFIRMADO'}}},select:{id:true}});
      await tx.invitationOnboarding.update({where:{id:entry.id},data:{completedAt:new Date()}});
      return {message:'E-mail confirmado e senha definida. Entre para revisar e aceitar ou recusar o convite.',nextStep:'LOGIN',invitationPending:true};
    });
  }
  async decline(token:string,actor:{userId:string;role:string}) {
    return institutionalTransaction(async tx=>{
      const {invitation}=await validInvitation(tx,token);
      const user=await tx.user.findUnique({where:{id:actor.userId},select:{email:true,emailVerifiedAt:true,deletedAt:true}});
      if(actor.role==='ADMIN'||!user || user.deletedAt || !user.emailVerifiedAt || user.email.toLowerCase()!==invitation.email.toLowerCase()) throw new ApiError(403,'Entre e confirme o e-mail convidado para recusar.');
      const result=await tx.teacherInvitation.updateMany({where:{id:invitation.id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:'DECLINED',acceptedById:actor.userId}});
      if(result.count!==1) throw new ApiError(409,'Convite indisponível.');
      await administrativeEvent(tx,'TEACHER_INVITATION_DECLINED',actor.userId,invitation.institutionId,invitation.id);
      return {message:'Convite recusado. Nenhum vínculo foi ativado.'};
    });
  }
  async declineNew(token:string) {
    if(!institutionsGloballyEnabled())throw new ApiError(403,'Use uma conta individual previamente cadastrada e confirmada.');
    return institutionalTransaction(async tx=>{
      const {invitation}=await validInvitation(tx,token);
      const existing=await tx.user.findFirst({where:{email:{equals:invitation.email,mode:'insensitive'}}});
      const legacy=existing&&await tx.invitationOnboarding.findUnique({where:{userId:existing.id}});
      const resumable=existing&&!existing.deletedAt&&!existing.emailVerifiedAt&&existing.role==='ALUNO'&&legacy?.invitationId===invitation.id&&!legacy.completedAt&&existing.senhaHash===legacy.initialPasswordHash;
      if(existing&&!resumable)throw new ApiError(409,'Entre com sua conta para recusar este vínculo.');
      const claimed=await tx.teacherInvitation.updateMany({where:{id:invitation.id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:'DECLINED'}});
      if(claimed.count!==1)throw new ApiError(409,'Convite indisponível.');
      if(legacy)await tx.invitationOnboarding.update({where:{id:legacy.id},data:{completedAt:new Date()}});
      await administrativeEvent(tx,'TEACHER_INVITATION_DECLINED',undefined,invitation.institutionId,invitation.id);
      return {message:'Convite recusado. Nenhuma conta ou vínculo docente foi criado.'};
    });
  }
  async declineWithProof(token:string,proof:string){
    return institutionalTransaction(async tx=>{
      const {invitation}=await validInvitation(tx,token);
      const entry=await tx.invitationOnboarding.findUnique({where:{proofHash:hashProof(proof)}});
      if(!entry||entry.invitationId!==invitation.id||entry.completedAt||entry.expiresAt<=new Date())throw new ApiError(409,'Confirmação inválida ou indisponível.');
      const claimed=await tx.teacherInvitation.updateMany({where:{id:invitation.id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:'DECLINED',acceptedById:entry.userId}});
      if(claimed.count!==1)throw new ApiError(409,'Convite indisponível.');
      await tx.invitationOnboarding.update({where:{id:entry.id},data:{completedAt:new Date()}});
      await administrativeEvent(tx,'TEACHER_INVITATION_DECLINED',entry.userId,invitation.institutionId,invitation.id);
      return {message:'Convite recusado. Nenhum vínculo de professor foi ativado.'};
    });
  }
}
