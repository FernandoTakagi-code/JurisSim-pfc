import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError } from '../errors/api-error';
import { inventorySelect } from '../repositories/prisma-initial-diagnostic-repository';
import { OWNER_PRACTICE_POLICY, OWNER_PRACTICE_RELEASE, OWNER_PRACTICE_REVOKE, ownerPracticeContentValid, ownerPracticeDigest } from './owner-practice-release';

export type OwnerPracticeManifest = { candidateCount:number; selectionSha256:string; questions:{id:string;contentDigest:string}[] };
const canonical = (value:unknown):unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>[key,canonical(v)])) : value;
export const ownerManifestSelectionDigest = (questions:unknown[]) => createHash('sha256').update(JSON.stringify(canonical(questions))).digest('hex');
const normalize = (s:string)=>s.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('pt-BR');
export async function publishOwnerPractice(db:PrismaClient, manifest:OwnerPracticeManifest, email:string, authorizationRef:string) {
  if(!authorizationRef || authorizationRef.trim().length<8 || manifest.candidateCount!==manifest.questions.length || !manifest.questions.length
    || !/^[a-f0-9]{64}$/.test(manifest.selectionSha256) || ownerManifestSelectionDigest(manifest.questions)!==manifest.selectionSha256
    || new Set(manifest.questions.map(q=>q.id)).size!==manifest.questions.length)throw new ApiError(422,'Manifesto ou referência de autorização inválidos.');
  const batchId=createHash('sha256').update(`${OWNER_PRACTICE_POLICY}:${manifest.selectionSha256}:${email}`).digest('hex');
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('jurissim:owner-practice-release'))::text`;
    const actor=await tx.user.findUnique({where:{email},select:{id:true,role:true,emailVerifiedAt:true,deletedAt:true,accountControl:{select:{suspended:true}}}});
    if(!actor||actor.role!=='ADMIN'||!actor.emailVerifiedAt||actor.deletedAt||actor.accountControl?.suspended)throw new ApiError(403,'A conta responsável deve ser ADMIN ativa e verificada.');
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id=${actor.id} FOR UPDATE`);
    const ids=manifest.questions.map(q=>q.id);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Questao" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
    const rows=await tx.questao.findMany({where:{id:{in:ids}},select:{...inventorySelect,avaliacoes:{select:{avaliacao:{select:{publishedAt:true}}}}}});
    const all=await tx.questao.findMany({select:{id:true,enunciado:true}});
    const expected=new Map(manifest.questions.map(q=>[q.id,q.contentDigest]));
    if(rows.length!==ids.length)throw new ApiError(409,'O conjunto de questões mudou.');
    for(const q of rows){
      if(!ownerPracticeContentValid(q)||q.avaliacoes.some(a=>a.avaliacao.publishedAt)||ownerPracticeDigest(q)!==expected.get(q.id)
        || all.some(other=>other.id!==q.id&&normalize(other.enunciado)===normalize(q.enunciado)))throw new ApiError(409,'Uma questão mudou ou possui impedimentos; nenhum registro foi publicado.');
    }
    const prior=await tx.administrativeEvent.findMany({where:{resourceId:{in:ids},event:{in:[OWNER_PRACTICE_RELEASE,OWNER_PRACTICE_REVOKE]}},select:{event:true,resourceId:true,result:true}});
    const priorBatch=prior.flatMap(e=>{try{return JSON.parse(e.result).batchId===batchId?[e]:[];}catch{return [];}});
    if(priorBatch.some(e=>e.event===OWNER_PRACTICE_REVOKE))throw new ApiError(409,'Este lote foi revogado; exige nova autorização.');
    const existing=new Set(priorBatch.filter(e=>e.event===OWNER_PRACTICE_RELEASE).map(e=>e.resourceId));
    if(existing.size && existing.size!==ids.length)throw new ApiError(409,'Lote anterior incompleto; operação interrompida.');
    if(existing.size===ids.length)return {batchId,published:0,alreadyPublished:ids.length};
    await tx.administrativeEvent.createMany({data:rows.map(q=>({event:OWNER_PRACTICE_RELEASE,actorId:actor.id,resourceId:q.id,severity:'INFO',
      result:JSON.stringify({policy:OWNER_PRACTICE_POLICY,version:1,batchId,contentDigest:ownerPracticeDigest(q),authorizationRef,legalReviewClaimed:false})}))});
    return {batchId,published:rows.length,alreadyPublished:0};
  },{isolationLevel:'Serializable',timeout:60000});
}

export async function revokeOwnerPractice(db:PrismaClient,batchId:string,email:string,reason:string){
  if(!/^[a-f0-9]{64}$/.test(batchId)||reason.trim().length<8)throw new ApiError(422,'Lote e motivo obrigatórios.');
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('jurissim:owner-practice-release'))::text`;
    const actor=await tx.user.findUnique({where:{email},select:{id:true,role:true,emailVerifiedAt:true,deletedAt:true,accountControl:{select:{suspended:true}}}});
    if(!actor||actor.role!=='ADMIN'||!actor.emailVerifiedAt||actor.deletedAt||actor.accountControl?.suspended)throw new ApiError(403,'ADMIN responsável indisponível.');
    const events=await tx.administrativeEvent.findMany({where:{event:{in:[OWNER_PRACTICE_RELEASE,OWNER_PRACTICE_REVOKE]}},select:{event:true,resourceId:true,result:true}});
    const matching=events.flatMap(e=>{try{const d=JSON.parse(e.result);return d.policy===OWNER_PRACTICE_POLICY&&d.batchId===batchId?[e]:[];}catch{return [];}});
    const revoked=new Set(matching.filter(e=>e.event===OWNER_PRACTICE_REVOKE).map(e=>e.resourceId));
    const ids=[...new Set(matching.filter(e=>e.event===OWNER_PRACTICE_RELEASE&&e.resourceId&&!revoked.has(e.resourceId)).map(e=>e.resourceId!))];
    if(ids.length)await tx.administrativeEvent.createMany({data:ids.map(resourceId=>({event:OWNER_PRACTICE_REVOKE,actorId:actor.id,resourceId,severity:'INFO',result:JSON.stringify({policy:OWNER_PRACTICE_POLICY,version:1,batchId,reason})}))});
    return {batchId,revoked:ids.length};
  },{isolationLevel:'Serializable',timeout:60000});
}
