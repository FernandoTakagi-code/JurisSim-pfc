import { InstitutionDecisionEmail, decisionEmailEvent } from './institution-decision-email';
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../errors/api-error";
import { assertTeacherInvitationsAvailable, teacherInvitationMode } from '../config/teacher-invitations';
import { institutionsGloballyEnabled, administrationEnabled, institutionRegistrationEnabled } from "../config/institution-feature";
import { homologationParticipant, assertRestrictedInstitution, assertRestrictedParticipant, restrictedInstitutionId } from '../config/institution-homologation';
import {
  createBrevoEmailTransport,
  type TransactionalEmailTransport,
} from "./brevo-email-transport";
import { isValidAppUrl } from "./app-url";
import { emailFrontendUrl } from './email-frontend';
import { classifyEmailDeliveryFailure } from './email-delivery-failure';
import { emailAccepted, emailFailed } from './transactional-email-log';
import {escapeMail} from './email-html';
import { representationDeclarationVersion, institutionRequestSchema, institutionFixtureSchema } from './institution-registration-validation';
import { homologationManifest, fixtureApprovalAllowed, type HomologationManifest } from '../config/institution-homologation';
import { institutionPendingFields, noWebsiteDeclaration } from '../institution-registration';

export type InstitutionActor = {
  userId: string;
  role: string;
  institutionId?: string;
  allowedClassIds?: string[];
  institutionAdmin?: boolean;
};
export type Tx = Prisma.TransactionClient;
export const hashInvitation = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function assertInvitedParticipant(userId: string) {
  try { assertRestrictedParticipant(userId); }
  catch (error) {
    if (error instanceof ApiError && error.statusCode === 403 && restrictedInstitutionId())
      throw new ApiError(403, 'O destinatário não está disponível para convite neste ambiente. Procure o responsável pela plataforma.');
    throw error;
  }
}
export const institutionMemberWhere = (userId: string) => ({
  userId,
  active: true,
  institution: { status: "ACTIVE" },
});
async function fixtureEligibility(tx: Pick<Tx, 'administrativeEvent'>, actor: InstitutionActor, institution: {id:string;ownerId?:string;registrationNumber?:string|null}) {
  if(!fixtureApprovalAllowed(actor,institution)) return false;
  const manifest=homologationManifest()!;
  return fixtureProvenance(tx,manifest);
}
// Shared by the ADMIN read model and the transactional decision. The public
// registration schema never receives or accepts an exemption from the client.
async function institutionRegistrationReview(tx: Pick<Tx,'administrativeEvent'>,actor:InstitutionActor,institution:Record<string,unknown>&{id:string;ownerId?:string;registrationNumber?:string|null}) {
  const homologationApproval=await fixtureEligibility(tx,actor,institution);
  const pendingFields=institutionPendingFields(institution).filter(field=>!homologationApproval||field!=='CNPJ');
  const fields=Object.fromEntries(Object.keys(institutionRequestSchema.shape).map(key=>[key,institution[key]??undefined]));
  fields.description=undefined;
  fields.noWebsite=!institution.website&&String(institution.description??'').includes(noWebsiteDeclaration);
  const valid=homologationApproval?institutionFixtureSchema.safeParse(Object.fromEntries(Object.entries(fields).filter(([key])=>key!=='registrationNumber'))).success:institutionRequestSchema.safeParse(fields).success;
  return {homologationApproval,pendingFields,valid:pendingFields.length===0&&valid};
}
export async function fixtureProvenance(tx: Pick<Tx, 'administrativeEvent'>, manifest: HomologationManifest) {
  const event=await tx.administrativeEvent.findFirst({where:{event:'HOMOLOGATION_FIXTURE_PROVISIONED',institutionId:manifest.institutionId,resourceId:manifest.institutionId,actorId:{in:manifest.adminIds}},orderBy:[{occurredAt:'desc'},{id:'desc'}],select:{result:true}});
  try { return JSON.parse(event?.result ?? '{}').runId===manifest.runId; } catch { return false; }
}
export function requireGlobal(actor: InstitutionActor) {
  if (actor.role !== "ADMIN")
    throw new ApiError(403, "Acesso exclusivo do administrador geral.");
}
export async function institutionalTransaction<T>(
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2034" && attempt < 2)
        continue;
      if ((error as { code?: string }).code === "P2002")
        throw new ApiError(
          409,
          "Registro duplicado ou solicitação já existente.",
        );
      throw error;
    }
  }
}
export async function administrativeEvent(
  tx: Tx,
  event: string,
  actorId?: string,
  institutionId?: string,
  resourceId?: string,
  result = "SUCCESS",
  severity = "INFO",
) {
  return tx.administrativeEvent.create({
    data: { event, actorId, institutionId, resourceId, result, severity },
  });
}
export async function institutionAdmin(
  tx: Tx,
  actor: InstitutionActor,
  institutionId: string,
) {
  assertRestrictedInstitution(institutionId);
  const restricted=homologationManifest();
  if(restrictedInstitutionId() && (!restricted || !await fixtureProvenance(tx,restricted))) throw new ApiError(403,'Fixture sem provisionamento autorizado.');
  if(actor.role==='ADMIN')throw new ApiError(403,'Administração global não substitui vínculo institucional autorizado.');
  const member = await tx.institutionalMembership.findFirst({
    where: {
      ...institutionMemberWhere(actor.userId),
      institutionId,
      role: "INSTITUTION_ADMIN",
    },
    select: { id: true },
  });
  if (!member)
    throw new ApiError(403, "Administração institucional não autorizada.");
}
export async function currentAccess(userId: string, originalRole: string) {
  const restricted = !institutionsGloballyEnabled() ? homologationParticipant(userId) : null;
  if (!administrationEnabled() && !institutionRegistrationEnabled() && !restricted) return undefined;
  const restriction = await prisma.accountControl.findUnique({
    where: { userId },
  });
  if (restriction?.suspended)
    throw new ApiError(
      403,
      "Conta suspensa. Procure o responsável pela plataforma.",
    );
  // Global controls must not activate institutional membership requirements.
  if (!institutionsGloballyEnabled() && !restricted) return undefined;
  if(restricted && !await fixtureProvenance(prisma,restricted)) return {enabled:false,restricted:true,globalAdmin:originalRole==='ADMIN',needsInstitutionLink:originalRole==='PROFESSOR',memberships:[],effectiveRole:originalRole};
  const memberships = await prisma.institutionalMembership.findMany({
    where: {...institutionMemberWhere(userId), ...(restricted ? {institutionId: restricted.institutionId} : {})},
    select: {
      institutionId: true,
      role: true,
      institution: { select: { name: true } },
    },
    orderBy: { institutionId: "asc" },
  });
  const studentClass = restricted ? {archivedAt:null,institutionalClass:{institutionId:restricted.institutionId,institution:{status:'ACTIVE'}}} : undefined;
  const studentLink = restricted && originalRole === 'ALUNO' && !memberships.length ? await prisma.user.findFirst({where:{id:userId,deletedAt:null,emailVerifiedAt:{not:null},OR:[{turmasComoAluno:{some:studentClass}},{classJoinRequests:{some:{status:'PENDING',turma:studentClass}}}]},select:{id:true}}) : null;
  return {
    enabled: !restricted || memberships.length > 0 || !!studentLink,
    ...(restricted ? {restricted:true} : {}),
    globalAdmin: originalRole === "ADMIN",
    needsInstitutionLink: originalRole === 'PROFESSOR' && !memberships.some(m=>m.role==='TEACHER'),
    memberships,
    effectiveRole: originalRole,
  };
}
const pageResult = <T>(items: T[], page: number) => ({
  items: items.slice(0, 25),
  page,
  hasMore: items.length > 25,
});
const pagination = (page: number) => ({ take: 26, skip: (page - 1) * 25 });
const institutionSelect = {
  id: true,
  name: true,
  registrationNumber: true,
  responsibleName: true,
  tradeName: true,
  address: true,
  representativePosition: true,
  contactEmail: true,
  institutionType: true, postalCode: true, street: true, number: true,
  addressComplement: true, district: true, city: true, state: true, website: true,
  representativePhone: true, representationDeclaration: true,
  representationDeclaredAt: true, representationDeclarationVersion: true, representationEvidence: true,
  ownerId: true,
  owner: {select:{emailVerifiedAt:true,deletedAt:true,accountControl:{select:{suspended:true}}}},
  email: true,
  phone: true,
  description: true,
  status: true,
  decisionReason: true,
  createdAt: true,
} as const;
const userSelect = {
  id: true,
  nome: true,
  email: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;
export type InstitutionInput = {
  name: string;
  registrationNumber?: string;
  responsibleName: string;
  tradeName?: string;
  address?: string;
  representativePosition?: string;
  contactEmail?: string;
  phone: string;
  description?: string;
  postalCode?: string; street?: string; number?: string; addressComplement?: string;
  district?: string; city?: string; state?: string; website?: string;
  representativePhone?: string; representationDeclaration?: boolean; representationEvidence?: string;
  institutionType?: 'ENSINO_SUPERIOR' | 'CURSO_PREPARATORIO' | 'OUTRA_ORGANIZACAO';
  noWebsite?: boolean;
};

export class InstitutionService {
  constructor(
    private readonly mail: TransactionalEmailTransport = createBrevoEmailTransport(),
  ) {}

  async request(actor: InstitutionActor, data: InstitutionInput) {
    if(actor.role==='ADMIN')throw new ApiError(403,'Utilize uma conta individual independente da administração geral.');
    return this.createRequest(actor, data);
  }

  async resubmit(actor:InstitutionActor,id:string,input:unknown) {
    assertRestrictedInstitution(id);
    const data=institutionRequestSchema.parse(input);
    return institutionalTransaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${id} FOR UPDATE`;
      const institution=await tx.institution.findUnique({where:{id}});
      if(!institution||institution.ownerId!==actor.userId)throw new ApiError(403,'Solicitação não autorizada.');
      if(institution.status!=='REJECTED')throw new ApiError(409,'Somente solicitações recusadas podem ser corrigidas e reenviadas.');
      if(await tx.institution.findFirst({where:{id:{not:id},registrationNumber:data.registrationNumber},select:{id:true}}))throw new ApiError(409,'CNPJ já cadastrado.');
      const {noWebsite,...fields}=data;
      const result=await tx.institution.update({where:{id},data:{...fields,address:[data.street,data.number,data.addressComplement,data.district,data.city,data.state,data.postalCode].filter(Boolean).join(', '),description:(noWebsite?noWebsiteDeclaration+'\n':'')+(data.description??'Solicitação institucional para análise administrativa.'),representationDeclaredAt:new Date(),representationDeclarationVersion,status:'PENDING',decisionReason:null},select:institutionSelect});
      await administrativeEvent(tx,'INSTITUTION_RESUBMITTED',actor.userId,id,id,JSON.stringify({status:'SUCCESS',previousReason:institution.decisionReason}));
      await tx.user.update({where:{id:actor.userId},data:{registrationIntent:'INSTITUTION'},select:{id:true}});
      return result;
    });
  }

  /** Offline administrative operation only. No HTTP endpoint or automatic call. */
  async provisionHomologationFixture(actor: InstitutionActor, input: unknown, reason: string) {
    requireGlobal(actor);
    const manifest=homologationManifest();
    if(!manifest?.adminIds.includes(actor.userId) || reason.trim().length<3 || reason.length>500) throw new ApiError(403,'Provisionamento não autorizado.');
    const data=institutionFixtureSchema.parse(input);
    return this.createRequest({userId:manifest.ownerId,role:'ALUNO'}, {...data,name:'JurisSim Academy — HOMOLOGAÇÃO',tradeName:'JurisSim Academy — TESTE',description:'Instituição fictícia para homologação acadêmica interna do JurisSim, sem representação de instituição real e sem finalidade operacional.'}, {manifest,actor,reason:reason.trim()});
  }

  private async createRequest(actor: InstitutionActor, data: InstitutionInput, fixture?: {manifest: HomologationManifest; actor: InstitutionActor; reason: string}) {
    return institutionalTransaction(tx=>this.createRequestInTransaction(tx,actor,data,fixture));
  }

  async requestForNewAccountInTransaction(tx: Tx, userId: string, input: unknown) {
    return this.createRequestInTransaction(tx,{userId,role:'ALUNO'},institutionRequestSchema.parse(input),undefined,true);
  }

  private async createRequestInTransaction(tx: Tx, actor: InstitutionActor, data: InstitutionInput, fixture?: {manifest: HomologationManifest; actor: InstitutionActor; reason: string}, newAccount=false) {

      // Serializes duplicate/quota checks across processes without storing PII in locks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(710912)`;
      if(fixture) {
        const configured=homologationManifest();
        if(!configured || JSON.stringify(configured)!==JSON.stringify(fixture.manifest)) throw new ApiError(403,'Configuração de homologação alterada.');
        const admin=await tx.user.findUnique({where:{id:fixture.actor.userId},select:{role:true,deletedAt:true,emailVerifiedAt:true}});
        const control=await tx.accountControl.findUnique({where:{userId:fixture.actor.userId}});
        if(admin?.role!=='ADMIN' || admin.deletedAt || !admin.emailVerifiedAt || control?.suspended) throw new ApiError(403,'Administrador indisponível.');
        const owner=await tx.user.findUnique({where:{id:actor.userId},select:{role:true}});
        if(owner?.role!=='ALUNO' || (await tx.accountControl.findUnique({where:{userId:actor.userId}}))?.suspended) throw new ApiError(403,'Responsável indisponível.');
      }
      const owner = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { email: true, emailVerifiedAt: true, deletedAt: true },
      });
      if (!owner || owner.deletedAt)
        throw new ApiError(401, "Conta indisponível.");
      if(!owner.emailVerifiedAt && !newAccount) throw new ApiError(403,"Confirme seu e-mail antes de solicitar o cadastro institucional.");
      if(fixture){
        const existing=await tx.institution.findUnique({where:{id:fixture.manifest.institutionId},select:institutionSelect});
        if(existing){
          const matches=existing.ownerId===actor.userId&&existing.email===owner.email.toLowerCase()&&existing.registrationNumber===null&&
            Object.entries(data).filter(([key])=>!['noWebsite','description'].includes(key)).every(([key,value])=>((existing as unknown as Record<string,unknown>)[key]??undefined)===(value??undefined))&&
            (!data.noWebsite||(!existing.website&&existing.description.includes(noWebsiteDeclaration)));
          if(!matches||!await fixtureProvenance(tx,fixture.manifest))throw new ApiError(409,'UUID de fixture já utilizado ou dados/proveniência divergentes; não substitua registros existentes.');
          return existing; // Replay of this exact run: never reset status, audit, intent or memberships.
        }
      }
      const duplicate = await tx.institution.findFirst({where: { OR: [
        {email:owner.email.toLowerCase()}, ...(data.registrationNumber ? [{registrationNumber:data.registrationNumber}] : []),
        {name:{equals:data.name.trim(),mode:'insensitive'},phone:data.phone.trim()},
      ]},select:{id:true}});
      if (duplicate) throw new ApiError(409,'Já existe uma solicitação ou instituição com esses dados. Consulte suas solicitações ou procure o suporte.');
      const {institutionType, noWebsite, ...fields} = data;
      const types = {ENSINO_SUPERIOR:'Ensino superior',CURSO_PREPARATORIO:'Curso preparatório',OUTRA_ORGANIZACAO:'Outra organização'};
      const details = (noWebsite ? noWebsiteDeclaration + '\n' : '') + (fields.description ?? 'Solicitação institucional para análise administrativa.');
      const description = institutionType ? `Tipo de instituição: ${types[institutionType]}.\n${details}` : details;
      if (description.length > 2000) throw new ApiError(422,'Reduza as informações institucionais para até 1900 caracteres.');
      const institution = await tx.institution.create({
        data: {
          ...fields,
          ...(fixture ? {id:fixture.manifest.institutionId,registrationNumber:null} : {}),
          institutionType,
          ...(fields.street ? { address: [fields.street, fields.number, fields.addressComplement, fields.district, fields.city, fields.state, fields.postalCode].filter(Boolean).join(', ') } : {}),
          ...(fields.representationDeclaration ? { representationDeclaredAt: new Date(), representationDeclarationVersion } : {}),
          description,
          email: owner.email.toLowerCase(),
          ownerId: actor.userId,
          status: owner.emailVerifiedAt ? "PENDING" : "EMAIL_PENDING",
        },
        select: institutionSelect,
      });
      await administrativeEvent(
        tx,
        "INSTITUTION_REQUESTED",
        fixture?.actor.userId ?? actor.userId,
        institution.id,
        institution.id,
      );
      if(fixture) await administrativeEvent(tx,'HOMOLOGATION_FIXTURE_PROVISIONED',fixture.actor.userId,institution.id,institution.id,JSON.stringify({status:'SUCCESS',runId:fixture.manifest.runId,reason:fixture.reason}));
      if(!newAccount) await tx.user.update({where:{id:actor.userId},data:{registrationIntent:'INSTITUTION'},select:{id:true}});
      return institution;

  }

  async myInstitutions(actor: InstitutionActor) {
    return prisma.institution.findMany({
      where: {
        ...(restrictedInstitutionId() ? {id:restrictedInstitutionId()} : {}),
        OR: [
          { ownerId: actor.userId },
          { memberships: { some: { userId: actor.userId, active: true } } },
        ],
      },
      select: institutionSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async institutions(actor: InstitutionActor, page: number, status?: string) {
    requireGlobal(actor);
    return pageResult(
      await Promise.all((await prisma.institution.findMany({
        where: { status },
        select: institutionSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pagination(page),
      })).map(async institution=>{
        const review=await institutionRegistrationReview(prisma,actor,institution);
        const owner= institution.owner;
        const canApprove=['PENDING','REJECTED','SUSPENDED'].includes(institution.status)&&
          (institution.status==='SUSPENDED'||review.valid)&&!!owner?.emailVerifiedAt&&!owner.deletedAt&&!owner.accountControl?.suspended;
        return {...institution,homologationApproval:review.homologationApproval,approvalReview:{pendingFields:review.pendingFields,canApprove}};
      })),
      page,
    );
  }

  async decide(
    actor: InstitutionActor,
    id: string,
    status: "ACTIVE" | "REJECTED" | "SUSPENDED",
    reason: string,
  ) {
    requireGlobal(actor);
    if(reason.trim().length<3 || reason.length>500) throw new ApiError(400,'Justificativa obrigatória (3 a 500 caracteres).');
    const result=await institutionalTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${id} FOR UPDATE`;
      const institution = await tx.institution.findUnique({ where: { id } });
      if (!institution) throw new ApiError(404, "Instituição não encontrada.");
      if (status === 'ACTIVE' && ['PENDING','EMAIL_PENDING','REJECTED'].includes(institution.status)) {
        const review=await institutionRegistrationReview(tx,actor,institution);
        if(review.pendingFields.length)throw new ApiError(409,'Cadastro incompleto: '+review.pendingFields.join(', '));
        if(!review.valid)throw new ApiError(409,'Revise os dados cadastrais antes da aprovação.');
        if(review.homologationApproval) await administrativeEvent(tx,'HOMOLOGATION_FIXTURE_APPROVED',actor.userId,id,id,JSON.stringify({status:'SUCCESS',runId:homologationManifest()!.runId,reason}));
      }
      const owner = await tx.user.findUnique({
        where: { id: institution.ownerId },
        select: { emailVerifiedAt: true, deletedAt: true },
      });
      if (
        status === "ACTIVE" &&
        (!owner?.emailVerifiedAt ||
          owner.deletedAt ||
          institution.status === "EMAIL_PENDING")
      ) {
        throw new ApiError(
          409,
          "O responsável precisa confirmar o e-mail antes da aprovação.",
        );
      }
      if (status === "SUSPENDED" && institution.status !== "ACTIVE")
        throw new ApiError(
          409,
          "Somente instituições ativas podem ser suspensas.",
        );
      if (status === "REJECTED" && institution.status !== "PENDING")
        throw new ApiError(
          409,
          "Somente solicitações pendentes podem ser recusadas.",
        );
      if (status === institution.status)
        throw new ApiError(409, "A instituição já está neste estado.");
      if (status === "ACTIVE")
        if ((await tx.accountControl.findUnique({ where: { userId: institution.ownerId } }))?.suspended)
          throw new ApiError(409, 'O responsável está suspenso. Regularize a conta antes da aprovação.');
      if (status === "ACTIVE")
        await tx.institutionalMembership.upsert({
          where: {
            institutionId_userId_role: {
              institutionId: id,
              userId: institution.ownerId,
              role: "INSTITUTION_ADMIN",
            },
          },
          create: {
            institutionId: id,
            userId: institution.ownerId,
            role: "INSTITUTION_ADMIN",
          },
          update: { active: true },
        });
      const updated = await tx.institution.update({
        where: { id },
        data: { status, decisionReason: reason },
        select: institutionSelect,
      });
      await tx.administrativeNotification.create({
        data: {
          userId: institution.ownerId,
          message: `Solicitação institucional: ${status === "ACTIVE" ? "aprovada" : status === "REJECTED" ? "recusada" : "suspensa"}. ${reason}`,
        },
      });
      await administrativeEvent(
        tx,
        `INSTITUTION_${status}`,
        actor.userId,
        id,
        id,
      );
      const delivery=(status==='ACTIVE'||status==='REJECTED')?await tx.administrativeEvent.create({data:{event:decisionEmailEvent,actorId:actor.userId,institutionId:id,resourceId:id,result:JSON.stringify({state:'PENDING',status,reason,ownerId:institution.ownerId})},select:{id:true}}):undefined;
      return {updated,deliveryId:delivery?.id};
    });
    let decisionEmail='NOT_QUEUED';
    try {if(result.deliveryId) decisionEmail=await new InstitutionDecisionEmail(this.mail).deliver(result.deliveryId);} catch {decisionEmail='UNKNOWN';}
    return {...result.updated,decisionEmail,message:decisionEmail==='SENT'?'Decisão registrada e e-mail aceito pelo provedor.':'Decisão registrada. Consulte o estado do e-mail na ficha administrativa; o envio não foi confirmado.'};
  }

  async update(
    actor: InstitutionActor,
    id: string,
    data: Pick<InstitutionInput, "name" | "phone" | "description">,
  ) {
    return institutionalTransaction(async (tx) => {
      await institutionAdmin(tx, actor, id);
      const updated = await tx.institution.update({
        where: { id },
        data,
        select: institutionSelect,
      });
      await administrativeEvent(
        tx,
        "INSTITUTION_UPDATED",
        actor.userId,
        id,
        id,
      );
      return updated;
    });
  }

  async editAdministrativeInstitution(actor:InstitutionActor,id:string,data:{name?:string;phone?:string;description?:string;responsibleEmail?:string;reason:string}){
    requireGlobal(actor);
    return institutionalTransaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${id} FOR UPDATE`;
      const institution=await tx.institution.findUnique({where:{id}});
      if(!institution)throw new ApiError(404,'Instituição indisponível.');
      const {responsibleEmail,reason,...fields}=data;
      const owner=responsibleEmail?await tx.user.findFirst({where:{email:{equals:responsibleEmail,mode:'insensitive'},emailVerifiedAt:{not:null},deletedAt:null,role:{not:'ADMIN'}},select:{id:true,nome:true,email:true}}):undefined;
      if(responsibleEmail&&!owner)throw new ApiError(409,'Responsável deve possuir conta individual confirmada e não ser administrador global.');
      if(owner&&await tx.accountControl.findUnique({where:{userId:owner.id}}).then(c=>c?.suspended))throw new ApiError(409,'Conta do responsável indisponível.');
      if(owner&&owner.id!==institution.ownerId){
        await tx.institutionalMembership.updateMany({where:{institutionId:id,userId:institution.ownerId,role:'INSTITUTION_ADMIN'},data:{active:false}});
        if(institution.status==='ACTIVE')await tx.institutionalMembership.upsert({where:{institutionId_userId_role:{institutionId:id,userId:owner.id,role:'INSTITUTION_ADMIN'}},create:{institutionId:id,userId:owner.id,role:'INSTITUTION_ADMIN'},update:{active:true}});
        await tx.user.updateMany({where:{id:{in:[institution.ownerId,owner.id]}},data:{sessionVersion:{increment:1}}});
      }
      const result=await tx.institution.update({where:{id},data:{...fields,decisionReason:reason,...(owner?{ownerId:owner.id,responsibleName:owner.nome,email:owner.email.toLowerCase()}: {})},select:institutionSelect});
      await administrativeEvent(tx,owner?'INSTITUTION_RESPONSIBLE_CHANGED':'INSTITUTION_ADMINISTRATIVE_UPDATED',actor.userId,id,id);
      return result;
    });
  }
  async users(
    actor: InstitutionActor,
    page: number,
    search?: string,
    role?: "ALUNO" | "PROFESSOR" | "ADMIN",
    status?: 'ACTIVE' | 'SUSPENDED',
  ) {
    requireGlobal(actor);
    if (!search || search.trim().length < 2) return pageResult([], page);
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        role,
        ...(status === 'SUSPENDED' ? {accountControl: {is: {suspended: true}}} : status === 'ACTIVE' ? {OR: [{accountControl: {is: null}}, {accountControl: {is: {suspended: false}}}]} : {}),
        ...(search
          ? {
              AND: [{ OR: [
                { nome: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
              ] }],
            }
          : {}),
      },
      select: userSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pagination(page),
    });
    const ids = users.map((user) => user.id);
    const [controls, memberships] = await Promise.all([
      prisma.accountControl.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, suspended: true },
      }),
      prisma.institutionalMembership.findMany({
        where: { userId: { in: ids } },
        select: {
          userId: true,
          active: true,
          role: true,
          institution: { select: { id: true, name: true, status: true } },
        },
      }),
    ]);
    return pageResult(
      users.map((user) => ({
        ...user,
        suspended: controls.some((c) => c.userId === user.id && c.suspended),
        memberships: memberships.filter((m) => m.userId === user.id),
      })),
      page,
    );
  }

  async userHistory(actor: InstitutionActor, userId: string, page: number) {
    requireGlobal(actor);
    return pageResult(await prisma.administrativeEvent.findMany({
      where: { resourceId: userId, event: { in: ['ACCOUNT_SUSPENDED', 'ACCOUNT_REACTIVATED', 'PERMISSION_CHANGED'] } },
      select: { id: true, occurredAt: true, event: true, result: true, severity: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], ...pagination(page),
    }), page);
  }

  async controlUser(
    actor: InstitutionActor,
    userId: string,
    data: { suspended?: boolean; globalAdmin?: boolean; reason?: string },
  ) {
    requireGlobal(actor);
    if (!data.reason || data.reason.trim().length < 3 || data.reason.length > 500) throw new ApiError(400, "Justificativa obrigatoria (3 a 500 caracteres).");
    const reason = data.reason.trim();
    if (userId === actor.userId)
      throw new ApiError(
        409,
        "Não altere suas próprias permissões ou suspensão.",
      );
    return institutionalTransaction(async (tx) => {
      // Serialize all administrative permission changes, including last-admin checks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(710911)`;
      const currentAdmin = await tx.user.findFirst({ where: { id: actor.userId, role: 'ADMIN', deletedAt: null, emailVerifiedAt: { not: null }, OR: [{ accountControl: { is: null } }, { accountControl: { is: { suspended: false } } }] }, select: { id: true } });
      if (!currentAdmin) throw new ApiError(403, 'Administração revogada ou indisponível.');
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, emailVerifiedAt: true, deletedAt: true },
      });
      if (!user || user.deletedAt)
        throw new ApiError(404, "Conta indisponível.");
      if (data.globalAdmin !== undefined) {
        const eligible = await tx.user.findFirst({where:{id:userId,OR:[{role:{in:['ADMIN','PROFESSOR']}},{institutionsOwned:{some:{}}},{institutionalMemberships:{some:{role:'INSTITUTION_ADMIN'}}}]},select:{id:true}});
        if (!eligible) throw new ApiError(403, 'Esta conta não integra a gestão de permissões administrativas.');
      }
      if (data.globalAdmin && !user.emailVerifiedAt)
        throw new ApiError(
          409,
          "Confirme o e-mail antes de conceder administração.",
        );
      if (
        user.role === "ADMIN" &&
        (data.globalAdmin === false || data.suspended === true)
      ) {
        const activeAdmins = await tx.user.findMany({
          where: {
            role: "ADMIN",
            deletedAt: null,
            emailVerifiedAt: { not: null },
          },
          select: { id: true },
        });
        const blocked = await tx.accountControl.findMany({
          where: {
            userId: { in: activeAdmins.map((a) => a.id) },
            suspended: true,
          },
        });
        if (
          activeAdmins.filter((a) => !blocked.some((b) => b.userId === a.id))
            .length <= 1
        )
          throw new ApiError(
            409,
            "É necessário manter um administrador geral ativo.",
          );
      }
      if (data.suspended !== undefined)
        await tx.accountControl.upsert({
          where: { userId },
          create: { userId, suspended: data.suspended },
          update: { suspended: data.suspended },
        });
      const teacher = await tx.institutionalMembership.findFirst({
        where: { ...institutionMemberWhere(userId), role: "TEACHER" },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          sessionVersion: { increment: 1 },
          ...(data.globalAdmin === undefined
            ? {}
            : {
                role: data.globalAdmin
                  ? "ADMIN"
                  : teacher
                    ? "PROFESSOR"
                    : "ALUNO",
              }),
        },
        select: { id: true },
      });
      await administrativeEvent(
        tx,
        data.globalAdmin !== undefined
          ? "PERMISSION_CHANGED"
          : data.suspended
            ? "ACCOUNT_SUSPENDED"
            : "ACCOUNT_REACTIVATED",
        actor.userId,
        undefined,
        userId,
        JSON.stringify({ status: "SUCCESS", reason }),
      );
      return {
        message: "Conta atualizada. As sessões anteriores foram revogadas.",
      };
    });
  }

  async summary(actor: InstitutionActor) {
    requireGlobal(actor);
    const [users, institutions, pending, teachers, classes, errors] =
      await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.institution.count(),
        prisma.institution.count({ where: { status: "PENDING" } }),
        prisma.institutionalMembership.count({
          where: {
            active: true,
            role: "TEACHER",
            institution: { status: "ACTIVE" },
          },
        }),
        prisma.turma.count({ where: { archivedAt: null } }),
        prisma.administrativeEvent.count({
          where: {
            severity: "ERROR",
            occurredAt: { gte: new Date(Date.now() - 86400_000) },
          },
        }),
      ]);
    return { users, institutions, pending, teachers, classes, errors };
  }

  async institutionSummary(actor: InstitutionActor, id: string, page: number) {
    await institutionAdmin(prisma, actor, id);
    const [teachers, links, institution] = await Promise.all([
      prisma.institutionalMembership.findMany({
        where: { institutionId: id, role: "TEACHER" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pagination(page),
      }),
      prisma.institutionalClass.findMany({
        where: { institutionId: id },
        select: { classId: true },
      }),
      prisma.institution.findUnique({
        where: { id },
        select: institutionSelect,
      }),
    ]);
    const classIds = links.map((link) => link.classId);
    const [classes, teacherUsers, students, completedAttempts] =
      await Promise.all([
        prisma.turma.findMany({
          where: { id: { in: classIds } },
          select: {
            id: true,
            nome: true,
            archivedAt: true,
            _count: { select: { alunos: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...pagination(page),
        }),
        prisma.user.findMany({
          where: { id: { in: teachers.map((t) => t.userId) }, deletedAt: null },
          select: { id: true, nome: true, email: true },
        }),
        prisma.user.count({
          where: {
            deletedAt: null,
            turmasComoAluno: { some: { id: { in: classIds } } },
          },
        }),
        prisma.simulado.count({
          where: {
            tipo: "AVALIACAO",
            finalizadoEm: { not: null },
            avaliacao: { turmas: { some: { id: { in: classIds } } } },
            aluno: { turmasComoAluno: { some: { id: { in: classIds } } } },
          },
        }),
      ]);
    const [activeTeachers,pendingInvitations,activeClasses]=await Promise.all([
      prisma.institutionalMembership.count({where:{institutionId:id,role:'TEACHER',active:true,user:{deletedAt:null}}}),
      prisma.teacherInvitation.count({where:{institutionId:id,status:'PENDING',expiresAt:{gt:new Date()}}}),
      prisma.turma.count({where:{id:{in:classIds},archivedAt:null}}),
    ]);
    return {
      institution,
      teachers: pageResult(
        teachers.map((t) => ({
          ...t,
          user: teacherUsers.find((u) => u.id === t.userId),
        })),
        page,
      ),
      classes: pageResult(classes, page),
      indicators: { classes: classIds.length, students, completedAttempts,activeTeachers,pendingInvitations,activeClasses },
    };
  }

  async invitations(
    actor: InstitutionActor,
    id: string,
    page: number,
    status?: string,
  ) {
    await institutionAdmin(prisma, actor, id);
    const now = new Date();
    const where = {
      institutionId: id,
      ...(status === "EXPIRED"
        ? { status: "PENDING", expiresAt: { lte: now } }
        : status === "PENDING"
          ? { status, expiresAt: { gt: now } }
          : status
            ? { status }
            : {}),
    };
    const items = await prisma.teacherInvitation.findMany({
      where,
      select: {
        id: true,
        invitedName:true,
        email: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        sentAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pagination(page),
    });
    return pageResult(
      items.map((i) => ({
        ...i,
        deliveryState: i.status === 'PENDING' ? (i.sentAt ? 'ACCEPTED_BY_PROVIDER' : 'UNCONFIRMED') : 'NOT_PENDING',
        status:
          i.status === "PENDING" && i.expiresAt <= now ? "EXPIRED" : i.status,
      })),
      page,
    );
  }

  async invite(
    actor: InstitutionActor,
    institutionId: string,
    email: string,
    replacingId?: string,
    details: {name?:string;classIds?:string[]} = {},
  ) {
    const invitationMode = teacherInvitationMode();
    if (!replacingId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new ApiError(422, 'Informe um e-mail válido.');
    const publicAppUrl=invitationMode === 'institutional' ? emailFrontendUrl() : process.env.APP_PUBLIC_URL;
    email=email.trim().toLowerCase();
    const token = randomBytes(32).toString("hex");
    const invitation = await institutionalTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${institutionId} FOR UPDATE`;
      await institutionAdmin(tx, actor, institutionId);
      const institution=await tx.institution.findUnique({where:{id:institutionId},select:{name:true,status:true}});
      if(institution?.status!=='ACTIVE')throw new ApiError(409,'Instituição indisponível para convites.');
      if (replacingId) {
        const existing = await tx.teacherInvitation.findFirst({
          where: { id: replacingId, institutionId, status: { in: ["PENDING", "CANCELLED"] } },
        });
        if (!existing)
          throw new ApiError(409, "Convite não disponível para reenvio.");
        email = existing.email;
        details = {name: existing.invitedName ?? undefined, classIds:(await tx.teacherInvitationClass.findMany({where:{invitationId:existing.id},select:{classId:true}})).map(c=>c.classId)};
        if (Date.now() - existing.createdAt.getTime() < 60_000)
          throw new ApiError(429, "Aguarde um minuto antes de reenviar.");
        if (existing.status === 'PENDING' && existing.sentAt === null && existing.expiresAt > new Date())
          throw new ApiError(409, 'O envio anterior ainda não foi confirmado. Verifique a situação com o responsável antes de reenviar.');
      }
      // Eligibility does not confer authority. In normal mode, an unknown
      // recipient may complete the existing token-based first-access flow.
      // In restricted mode, retain the explicit pre-existing-account policy.
      const recipients = await tx.user.findMany({
        where: { email: { equals: email, mode: 'insensitive' } }, take: 2,
        select: { id: true, role: true, deletedAt: true, emailVerifiedAt: true },
      });
      if (recipients.length > 1) throw new ApiError(409, 'Não foi possível identificar uma conta única para este destinatário. Solicite revisão ao suporte.');
      const recipient = recipients[0];
      if (recipient && (recipient.deletedAt || recipient.role === 'ADMIN' || (await tx.accountControl.findUnique({ where: { userId: recipient.id }, select: { suspended: true } }))?.suspended))
        throw new ApiError(409, 'A conta destinatária não está elegível para convite docente. Oriente a pessoa a verificar sua conta com o suporte.');
      if (recipient && await tx.institutionalMembership.count({ where: { ...institutionMemberWhere(recipient.id), institutionId, role: 'TEACHER' } }) > 0)
        throw new ApiError(409, 'A conta já possui vínculo docente ativo nesta instituição.');
      if (restrictedInstitutionId()) {
        if (!recipient?.emailVerifiedAt) throw new ApiError(403, 'Nesta homologação, o destinatário precisa ter conta cadastrada, e-mail confirmado e autorização prévia. Nenhum convite foi enviado.');
        assertInvitedParticipant(recipient.id);
      }
      if (
        (await tx.teacherInvitation.count({
          where: {
            institutionId,
            createdAt: { gt: new Date(Date.now() - 3600_000) },
          },
        })) >= 30
      )
        throw new ApiError(429, "Limite de convites por hora atingido.");
      if (
        (await tx.teacherInvitation.findFirst({
          where: {
            institutionId,
            email,
            ...(replacingId ? { id: { not: replacingId } } : {}),
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
        }))
      )
        throw new ApiError(
          409,
          "Já existe um convite pendente para este e-mail.",
        );
      const classIds = [...new Set(details.classIds ?? [])];
      if(classIds.length && await tx.institutionalClass.count({where:{institutionId,classId:{in:classIds},turma:{archivedAt:null}}}) !== classIds.length)
        throw new ApiError(403,'Selecione somente turmas ativas desta instituição.');
      if (!this.mail.isConfigured || !isValidAppUrl(publicAppUrl))
        throw new ApiError(503, 'O serviço de envio de convites está indisponível. Nenhum convite foi enviado; tente novamente após a verificação do serviço.');
      await tx.teacherInvitation.updateMany({
        where: { institutionId, email, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      const created = await tx.teacherInvitation.create({
        data: {
          institutionId,
          email,
          ...(details.name ? {invitedName:details.name} : {}),
          ...(classIds.length ? {classAssignments:{create:classIds.map(classId=>({classId}))}} : {}),
          tokenHash: hashInvitation(token),
          expiresAt: new Date(Date.now() + 48 * 3600_000),
        },
      });
      await administrativeEvent(
        tx,
        replacingId ? "TEACHER_INVITATION_RESENT" : "TEACHER_INVITED",
        actor.userId,
        institutionId,
        created.id,
      );
      return {...created,institutionName:institution.name};
    });
    const url = `${publicAppUrl}/#/convite-professor?token=${token}`;
    try {
      await this.mail.send({
        to: invitation.email,
        subject: "Convite para professor — JurisSim",
        text: `Você recebeu um convite institucional para atuar como professor no JurisSim. Abra o convite para confirmar seu e-mail e definir sua senha no primeiro acesso, ou entre com sua conta existente: ${url}\nValidade: 48 horas. Se não reconhecer, ignore.`,
        html: `<h1>JurisSim · Educação Jurídica</h1><p>Olá, ${escapeMail(invitation.invitedName??'professor')}.</p><p>${escapeMail(invitation.institutionName??'Sua instituição')} convidou você para atuar como professor.</p><p>Defina sua própria senha e aceite os termos para ativar seu acesso, sem outro e-mail de confirmação. Se já possui conta, entre pelo login único.</p><p><a href="${escapeMail(url)}">Aceitar convite</a></p><p>Validade: 48 horas. Abrir o link não aceita o convite automaticamente. Se não reconhecer, ignore. Nunca enviamos senhas.</p>`,
      });
      emailAccepted('teacher_invitation',invitation.id);
    } catch (error) {
      const failure=classifyEmailDeliveryFailure(error);
      const unknown=failure.outcome==='indeterminate';
      emailFailed('teacher_invitation',invitation.id,error);
      await institutionalTransaction(async (tx) => {
        if(!unknown) {
          const cancelled = await tx.teacherInvitation.updateMany({
          where: { id: invitation.id, status: "PENDING" },
          data: { status: "CANCELLED" },
          });
          if (cancelled.count !== 1) throw new ApiError(409, 'Não foi possível confirmar o cancelamento. Consulte a situação do convite antes de tentar novamente.');
        }
        await administrativeEvent(
          tx,
          unknown ? 'INVITATION_DELIVERY_UNKNOWN' : "INVITATION_DELIVERY_FAILED",
          actor.userId,
          institutionId,
          invitation.id,
          JSON.stringify({outcome:failure.outcome,stage:failure.stage}),
          unknown ? 'WARN' : "ERROR",
        );
      });
      throw new ApiError(
        503,
        unknown ? 'O resultado do envio é indeterminado. O convite permanece válido; confira a caixa e o provedor antes de solicitar reenvio.' : "O envio não foi confirmado. O convite foi cancelado; solicite um novo envio.",
      );
    }
    try {
      await prisma.teacherInvitation.update({where:{id:invitation.id},data:{sentAt:new Date()},select:{id:true}});
    } catch {
      // SMTP acceptance must never be undone by a failed metadata write.
      console.warn('email.invitation.metadata_persistence_failed',{invitationId:invitation.id});
      return {message:'O provedor aceitou o envio. Não foi possível atualizar o registro de envio; confira o convite antes de tentar novamente.'};
    }
    return { message: "Convite submetido ao provedor. Validade de 48 horas." };
  }

  async cancelInvitation(
    actor: InstitutionActor,
    institutionId: string,
    id: string,
  ) {
    return institutionalTransaction(async (tx) => {
      await institutionAdmin(tx, actor, institutionId);
      const result = await tx.teacherInvitation.updateMany({
        where: { id, institutionId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      if (!result.count)
        throw new ApiError(404, "Convite pendente não encontrado.");
      await administrativeEvent(
        tx,
        "TEACHER_INVITATION_CANCELLED",
        actor.userId,
        institutionId,
        id,
      );
      return { message: "Convite cancelado." };
    });
  }

  async accept(actor: InstitutionActor, token: string) {
    return institutionalTransaction(tx => this.acceptInTransaction(tx, actor, token));
  }

  async acceptInTransaction(tx: Tx, actor: InstitutionActor, token: string) {
      assertTeacherInvitationsAvailable();
      if(actor.role === 'ADMIN') throw new ApiError(403, 'A administração geral não recebe gestão pedagógica por convite.');
      const invitation = await tx.teacherInvitation.findUnique({
        where: { tokenHash: hashInvitation(token) },
      });
      if (!invitation)
        throw new ApiError(400, "Convite inválido ou indisponível.");
      assertRestrictedInstitution(invitation.institutionId);
      assertRestrictedParticipant(actor.userId);
      if(restrictedInstitutionId() && !await fixtureProvenance(tx,homologationManifest()!)) throw new ApiError(403,'Fixture sem provisionamento autorizado.');
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${invitation.institutionId} FOR UPDATE`;
      const institution = await tx.institution.findUnique({
        where: { id: invitation.institutionId },
        select: { status: true },
      });
      const user = await tx.user.findUnique({
        where: { id: actor.userId },
        select: {
          email: true,
          emailVerifiedAt: true,
          deletedAt: true,
          role: true,
          registrationIntent: true,
        },
      });
      if (
        !user ||
        user.deletedAt ||
        !user.emailVerifiedAt ||
        user.email.toLowerCase() !== invitation.email.toLowerCase()
      )
        throw new ApiError(
          403,
          "Entre com a conta e confirme o e-mail que recebeu o convite.",
        );
      if (institution?.status !== "ACTIVE")
        throw new ApiError(409, "Instituição indisponível.");
      if(user.role==='ADMIN'||(await tx.accountControl.findUnique({where:{userId:actor.userId}}))?.suspended)
        throw new ApiError(403,'Conta indisponível para vínculo docente.');
      if (invitation.status === 'ACCEPTED') {
        if (invitation.acceptedById !== actor.userId) throw new ApiError(409, 'Convite indisponível.');
        return { message: 'Este convite já foi aceito por esta conta. Seus vínculos atuais não foram alterados.' };
      }
      const claimed = await tx.teacherInvitation.updateMany({
        where: {
          id: invitation.id,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        data: { status: "ACCEPTED", acceptedById: actor.userId },
      });
      if (claimed.count !== 1)
        throw new ApiError(409, "Convite expirado, cancelado ou já utilizado.");
      await tx.institutionalMembership.upsert({
        where: {
          institutionId_userId_role: {
            institutionId: invitation.institutionId,
            userId: actor.userId,
            role: "TEACHER",
          },
        },
        create: {
          institutionId: invitation.institutionId,
          userId: actor.userId,
          role: "TEACHER",
        },
        update: { active: true },
      });
      const assignments = await tx.teacherInvitationClass.findMany({where:{invitationId:invitation.id},select:{classId:true}});
      for(const assignment of assignments){
        const own = await tx.institutionalClass.findFirst({where:{classId:assignment.classId,institutionId:invitation.institutionId,turma:{archivedAt:null}}});
        if(!own) throw new ApiError(409,'A turma do convite não está mais disponível nesta instituição. Solicite um novo convite.');
        await tx.turma.update({where:{id:assignment.classId},data:{professores:{connect:{id:actor.userId}}},select:{id:true}});
      }
      await tx.user.update({
          where: { id: actor.userId },
          data: { role: "PROFESSOR", ...(user.registrationIntent === 'TEACHER_INVITATION' ? { registrationIntent: null } : {}) },
          select: { id: true },
        });
      await administrativeEvent(
        tx,
        "TEACHER_INVITATION_ACCEPTED",
        actor.userId,
        invitation.institutionId,
        invitation.id,
      );
      return {
        message: "Convite aceito. Acesso de professor liberado.",
        institutionId: invitation.institutionId,
      };
  }

  async unlink(actor: InstitutionActor, institutionId: string, userId: string) {
    return institutionalTransaction(async (tx) => {
      await institutionAdmin(tx, actor, institutionId);
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${institutionId} FOR UPDATE`;
      const result = await tx.institutionalMembership.updateMany({
        where: { institutionId, userId, role: "TEACHER", active: true },
        data: { active: false },
      });
      if (!result.count)
        throw new ApiError(404, "Vínculo ativo não encontrado.");
      const classes = await tx.institutionalClass.findMany({
        where: { institutionId },
        select: { classId: true },
      });
      for (const item of classes)
        await tx.turma.update({
          where: { id: item.classId },
          data: { professores: { disconnect: { id: userId } } },
          select: { id: true },
        });
      await tx.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
        select: { id: true },
      });
      await administrativeEvent(
        tx,
        "TEACHER_UNLINKED",
        actor.userId,
        institutionId,
        userId,
      );
      return {
        message:
          "Professor desvinculado. Histórico preservado e sessões revogadas.",
      };
    });
  }

  async notifications(actor: InstitutionActor, page: number) {
    return pageResult(
      await prisma.administrativeNotification.findMany({
        where: { userId: actor.userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...pagination(page),
      }),
      page,
    );
  }

  async logs(
    actor: InstitutionActor,
    filters: {
      page: number;
      institutionId?: string;
      event?: string;
      actorId?: string;
      severity?: string;
      from?: string;
      to?: string;
    },
    institutional = false,
  ) {
    if (institutional) {
      if (!filters.institutionId)
        throw new ApiError(400, "Selecione uma instituição.");
      await institutionAdmin(prisma, actor, filters.institutionId);
    } else requireGlobal(actor);
    const { page, from, to, ...where } = filters;
    return pageResult(
      await prisma.administrativeEvent.findMany({
        where: {
          ...where,
          occurredAt: {
            gte: from ? new Date(from) : undefined,
            lte: to ? new Date(to) : undefined,
          },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        ...pagination(page),
      }),
      page,
    );
  }
}
