import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { hasCompleteContent, type InventoryRow } from '../../repositories/prisma-initial-diagnostic-repository';
import { INITIAL_DIAGNOSTIC_DISCIPLINES } from '../diagnostics/initial-diagnostic-config';

export const OWNER_PRACTICE_RELEASE = 'OWNER_AUTHORIZED_PRACTICE_RELEASE';
export const OWNER_PRACTICE_REVOKE = 'OWNER_AUTHORIZED_PRACTICE_REVOKED';
export const OWNER_PRACTICE_POLICY = 'OWNER_AUTHORIZATION_FOR_STUDENT_PRACTICE_ONLY_NOT_LEGAL_REVIEW';
export const ownerPracticeEnabled = () => process.env.QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED === 'true';
export const ownerPracticeScope = {
  publica:true, turmaId:null, origem:'IA',
  avaliacoes:{none:{avaliacao:{publishedAt:{not:null}}}},
} as const satisfies Prisma.QuestaoWhereInput;
const normalize = (s:string) => s.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('pt-BR');
export function ownerPracticeContentValid(q:InventoryRow) {
  return q.publica && q.turmaId===null && q.origem==='IA' && q.situacaoQuestaoOficial!=='ANULADA'
    && INITIAL_DIAGNOSTIC_DISCIPLINES.includes(q.disciplina as typeof INITIAL_DIAGNOSTIC_DISCIPLINES[number])
    && hasCompleteContent(q) && new Set(q.alternativas.map(a=>normalize(a.texto))).size===4;
}
// Mesmo digest do manifesto somente leitura aprovado. Os horários de revisão/liberação
// propositalmente não são inventados nem reutilizados como prova da autorização do proprietário.
export function ownerPracticeDigest(q:InventoryRow) {
  return createHash('sha256').update(JSON.stringify({enunciado:q.enunciado,disciplina:q.disciplina,assunto:q.assunto,
    nivel:q.nivel,explicacao:q.fundamentacaoJuridica,origem:q.origem,
    alternativas:[...q.alternativas].sort((a,b)=>(a.letra??'').localeCompare(b.letra??'')).map(a=>({id:a.id,letra:a.letra,texto:a.texto,correta:a.correta})),
    fonteNome:q.fonteNome,fonteReferencia:q.fonteReferencia,licenca:q.licencaOuAutorizacao})).digest('hex');
}
type Db = PrismaClient | Prisma.TransactionClient;
export async function ownerPracticeAuthorizedIds(db:Db, rows:InventoryRow[]):Promise<Set<string>> {
  const valid=new Set<string>();
  if(!ownerPracticeEnabled() || !rows.length) return valid;
  const ids=rows.filter(ownerPracticeContentValid).map(q=>q.id);
  if(!ids.length)return valid;
  const [scoped,events]=await Promise.all([
    db.questao.findMany({where:{...ownerPracticeScope,id:{in:ids}},select:{id:true}}),
    db.administrativeEvent.findMany({where:{resourceId:{in:ids},event:{in:[OWNER_PRACTICE_RELEASE,OWNER_PRACTICE_REVOKE]}},
      select:{event:true,resourceId:true,result:true,actor:{select:{id:true,role:true,emailVerifiedAt:true,deletedAt:true,accountControl:{select:{suspended:true}}}}}}),
  ]);
  const allowedScope=new Set(scoped.map(q=>q.id)),revoked=new Set<string>();
  const parsed=events.flatMap(e=>{try{const data=JSON.parse(e.result);return data&&typeof data==='object'&&!Array.isArray(data)?[{...e,data}]:[];}catch{return [];}});
  for(const e of parsed)if(e.event===OWNER_PRACTICE_REVOKE&&e.data.policy===OWNER_PRACTICE_POLICY&&typeof e.data.batchId==='string')revoked.add(`${e.resourceId}:${e.data.batchId}`);
  const content=new Map(rows.map(q=>[q.id,q]));
  for(const e of parsed){
    const q=e.resourceId?content.get(e.resourceId):undefined,a=e.actor,d=e.data;
    if(e.event!==OWNER_PRACTICE_RELEASE||!q||!allowedScope.has(q.id)||!a||a.role!=='ADMIN'||!a.emailVerifiedAt||a.deletedAt||a.accountControl?.suspended)continue;
    if(d.policy!==OWNER_PRACTICE_POLICY||d.version!==1||typeof d.batchId!=='string'||!d.batchId||typeof d.authorizationRef!=='string'||d.authorizationRef.trim().length<8||d.legalReviewClaimed!==false||revoked.has(`${q.id}:${d.batchId}`))continue;
    if(d.contentDigest===ownerPracticeDigest(q))valid.add(q.id);
  }
  return valid;
}
