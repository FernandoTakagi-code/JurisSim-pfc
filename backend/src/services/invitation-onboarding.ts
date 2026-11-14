import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';
import { administrativeEvent, hashInvitation, institutionalTransaction, InstitutionService, type Tx } from './institution-service';
import { acceptanceData, acceptanceSchema } from './legal-acceptance';
import { assertValidPassword } from './password-policy';
import { createBrevoEmailTransport, type TransactionalEmailTransport } from './brevo-email-transport';
import { isValidAppUrl } from './app-url';

const hashProof = (token:string) => createHash('sha256').update(token).digest('hex');
import {escapeMail} from './email-html';
export {escapeMail} from './email-html';
const generic = {message:'Se este for seu primeiro acesso, consulte as instruções no e-mail convidado. Se já possui conta, entre pelo login único. Caso não receba a mensagem, aguarde um minuto e tente novamente ou procure o responsável.'};

export async function validInvitation(tx:Tx, token:string) {
  const found = await tx.teacherInvitation.findUnique({where:{tokenHash:hashInvitation(token)}});
  if(!found) throw new ApiError(409,'Convite inválido ou indisponível. Solicite orientação à instituição.');
  await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${found.institutionId} FOR UPDATE`;
  const invitation = await tx.teacherInvitation.findUnique({where:{id:found.id}});
  const institution = await tx.institution.findUnique({where:{id:found.institutionId},select:{id:true,name:true,status:true}});
  if(invitation?.status!=='PENDING' || invitation.expiresAt<=new Date() || institution?.status!=='ACTIVE')
    throw new ApiError(409,'Convite inválido ou indisponível. Solicite orientação à instituição.');
  return {invitation,institution};
}

export class InvitationOnboardingService {
  constructor(private readonly mail:TransactionalEmailTransport=createBrevoEmailTransport()) {}
  inspect(token:string) {
    return institutionalTransaction(async tx=>{
      const {invitation,institution}=await validInvitation(tx,token);
      const [local,domain]=invitation.email.split('@');
      return {institution:{id:institution.id,name:institution.name},invitedName:invitation.invitedName,
        maskedEmail:`${local.slice(0,1)}***@${domain}`,expiresAt:invitation.expiresAt};
    });
  }
  async start(token:string,nome:string,acceptance:unknown) {
    acceptanceSchema.parse(acceptance);
    if(!this.mail.isConfigured || !isValidAppUrl(process.env.APP_PUBLIC_URL)) throw new ApiError(503,'Primeiro acesso indisponível. Procure o responsável institucional.');
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
      const url=`${process.env.APP_PUBLIC_URL!.replace(/\/$/,'')}/#/ativar-professor?convite=${token}&confirmacao=${proof}`;
      try {
        await this.mail.send({to:delivery.email,subject:'Confirme seu primeiro acesso ao JurisSim',
          text:`Olá, ${delivery.name}. Confirme seu e-mail e defina sua própria senha para o convite de ${delivery.institution}: ${url}\nValidade máxima: 30 minutos. Ignore se não reconhecer. Não compartilhe o link.`,
          html:`<h1>JurisSim · Educação Jurídica</h1><p>Olá, ${escapeMail(delivery.name)}.</p><p>Confirme seu e-mail para o convite de ${escapeMail(delivery.institution)} e defina sua própria senha.</p><p><a href="${escapeMail(url)}">Confirmar e-mail e concluir acesso</a></p><p>Validade máxima: 30 minutos. Ignore se não reconhecer. Não compartilhe este link. Nunca enviamos senhas.</p>`});
      } catch {
        await prisma.invitationOnboarding.updateMany({where:{id:delivery.id,completedAt:null},data:{expiresAt:new Date(0)}});
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
      if(control?.suspended || !current || current.completedAt || current.expiresAt<=new Date() || current.proofHash!==hashProof(proof) || !user || user.deletedAt || user.role!=='ALUNO' || user.email.toLowerCase()!==invitation.email || user.senhaHash!==current.initialPasswordHash)
        throw new ApiError(409,'Primeiro acesso já concluído, expirado ou conta alterada. Use o login e a recuperação existentes.');
      await tx.user.update({where:{id:user.id},data:{senhaHash,emailVerifiedAt:new Date(),sessionVersion:{increment:1},auditLogs:{create:{action:'EMAIL_CONFIRMADO'}}},select:{id:true}});
      const result=await new InstitutionService(this.mail).acceptInTransaction(tx,{userId:user.id,role:'ALUNO'},token);
      await tx.invitationOnboarding.update({where:{id:entry.id},data:{completedAt:new Date()}});
      return {...result,message:'E-mail confirmado e primeiro acesso concluído. Entre pelo login único.',nextStep:'LOGIN'};
    });
  }
  async decline(token:string,actor:{userId:string;role:string}) {
    return institutionalTransaction(async tx=>{
      const {invitation}=await validInvitation(tx,token);
      const user=await tx.user.findUnique({where:{id:actor.userId},select:{email:true,emailVerifiedAt:true,deletedAt:true}});
      if(!user || user.deletedAt || !user.emailVerifiedAt || user.email.toLowerCase()!==invitation.email) throw new ApiError(403,'Entre e confirme o e-mail convidado para recusar.');
      const result=await tx.teacherInvitation.updateMany({where:{id:invitation.id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:'DECLINED',acceptedById:actor.userId}});
      if(result.count!==1) throw new ApiError(409,'Convite indisponível.');
      await administrativeEvent(tx,'TEACHER_INVITATION_DECLINED',actor.userId,invitation.institutionId,invitation.id);
      return {message:'Convite recusado. Nenhum vínculo foi ativado.'};
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
