import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prepareAuthorialDraftBatch } from './authorial-draft-batch';
import { fingerprintQuestionContent } from './question-fingerprint';

export function preparePilotImport(input: unknown) {
  const batch = prepareAuthorialDraftBatch(input);
  for (const q of batch.questions) {
    if (q.legalReview?.reviewerId || q.legalReview?.reviewedAt || q.legalReview?.evidenceRef
      || q.pedagogicalReview?.reviewerId || q.pedagogicalReview?.reviewedAt || q.pedagogicalReview?.evidenceRef
      || q.release?.releasedById || q.release?.releasedAt || q.release?.evidenceRef) {
      throw new Error('Use o fluxo de acervo revisado para questões que já possuem aprovações.');
    }
  }
  const fingerprints = batch.questions.map(q => fingerprintQuestionContent({ enunciado:q.enunciado, disciplina:q.disciplina,
    assunto:q.assunto,nivel:q.nivel,alternativas:q.alternativas.map(({texto,correta})=>({texto,correta})) }));
  if (new Set(fingerprints).size !== 30) throw new Error('Questões duplicadas no piloto.');
  const hash = createHash('sha256').update(JSON.stringify(batch)).digest('hex');
  return { batch, fingerprints, hash };
}

/** Maintenance-only import; never called by an HTTP route or authenticated student. */
export async function importAuthorialPilot(db: PrismaClient, input: unknown, operatorId: string) {
  const { batch, fingerprints, hash } = preparePilotImport(input);
  return db.$transaction(async tx => {
    // Serializes retries for the same draft set without overwriting existing items.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hash}))`;
    const operator = await tx.user.findFirst({ where: { id:operatorId, deletedAt:null }, select:{ id:true,role:true } });
    if (operator?.role !== 'ADMIN') throw new Error('Responsável pela manutenção não autorizado.');
    const existing = await tx.loteImportacao.findFirst({ where:{ arquivoHash:hash }, include:{questoes:{select:{id:true,fingerprint:true,revisaoJuridicaEm:true,revisaoPedagogicaEm:true,liberadaAcervoEm:true}}} });
    if (existing) {
      if(existing.questoes.length!==30||existing.questoes.some(q=>!q.fingerprint||!fingerprints.includes(q.fingerprint))) throw new Error('Lote existente inconsistente.');
      return { batchId:existing.id,imported:0,recovered:true,questionIds:existing.questoes.map(q=>q.id) };
    }
    if (await tx.questao.count({ where:{ fingerprint:{in:fingerprints} } })) throw new Error('Há questões existentes; piloto não sobrescreve conteúdo.');
    const record=await tx.loteImportacao.create({data:{administradorId:operator.id,arquivoHash:hash,totalQuestoes:30},select:{id:true}});
    const questionIds:string[]=[];
    for(const [index,q] of batch.questions.entries()){
      const item=await tx.questao.create({data:{enunciado:q.enunciado,disciplina:q.disciplina,assunto:q.assunto,nivel:q.nivel,
        fundamentacaoJuridica:q.fundamentacaoJuridica,origem:'IA',publica:true,turmaId:null,autorId:operator.id,
        fingerprint:fingerprints[index],loteImportacaoId:record.id,fonteNome:q.source.name,
        fonteReferencia:`PILOTO_EM_REVISAO ${q._draftSlot}\n${q.source.reference}`,
        licencaOuAutorizacao:q.source.licenseOrAuthorization,
        alternativas:{create:q.alternativas.map(({letra,texto,correta})=>({letra:letra as 'A'|'B'|'C'|'D',texto,correta}))},
      },select:{id:true}});
      questionIds.push(item.id);
      await tx.auditLog.create({data:{userId:operator.id,action:'QUESTAO_CRIADA',resourceId:item.id}});
    }
    return {batchId:record.id,imported:30,recovered:false,questionIds};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:120_000});
}
