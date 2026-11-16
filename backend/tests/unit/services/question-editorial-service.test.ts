import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { editorialDigest, editorialIssues, QuestionEditorialService } from "../../../src/services/questions/question-editorial-service";
import type { InventoryRow } from "../../../src/repositories/prisma-initial-diagnostic-repository";
const question = () => ({ id:'q', enunciado:'Questão de conteúdo completo para revisão.', disciplina:'Direito Civil', assunto:'Contratos', nivel:'BASICO',
  fundamentacaoJuridica:'Justificativa preenchida.', publica:false, turmaId:null, origem:'IA', fonteNome:'Fonte', fonteReferencia:'Referência',
  licencaOuAutorizacao:'Autorização documentada', alternativas:['A','B','C','D'].map((letra,i)=>({id:String(i),letra,texto:letra,correta:i===0})) }) as InventoryRow;
describe('editorial integrity',()=>{
  afterEach(()=>vi.unstubAllEnvs());
  it.each(['P2034','40001','40P01'])('returns a conflict for concurrent editorial writes: %s',async code=>{
    vi.stubEnv('ADMINISTRATION_ENABLED','true');vi.stubEnv('QUESTION_EDITORIAL_WRITES_ENABLED','true');
    const error=new Prisma.PrismaClientKnownRequestError('isolated concurrency failure',{code:code==='P2034'?code:'P2010',clientVersion:'test',meta:{code}});
    const db={user:{findUnique:vi.fn(async()=>({role:'ADMIN',deletedAt:null,emailVerifiedAt:new Date(),accountControl:null}))},$transaction:vi.fn().mockRejectedValue(error)};
    const service=new QuestionEditorialService(db as never);
    await expect(service.review({userId:'admin',role:'ADMIN'},'question','legal',{expectedDigest:'a'.repeat(64),evidenceRef:'documento-isolado',confirmed:true})).rejects.toMatchObject({statusCode:409});
  });
  it('does not mistake complete content for legal approval',()=>{
    const q=question(); expect(editorialIssues(q)).toEqual([]); expect(q.revisaoJuridicaEm).toBeUndefined();
    expect(editorialIssues({...q,licencaOuAutorizacao:'PENDENTE_CONFERENCIA'})).toContain('A declaração de licença/autoria continua pendente.');
  });
  it('binds review evidence to content, justification and documentation, not approval timestamps',()=>{
    const q=question(), digest=editorialDigest(q);
    expect(editorialDigest({...q,fundamentacaoJuridica:'Outra justificativa'})).not.toBe(digest);
    expect(editorialDigest({...q,fonteReferencia:'Outra fonte'})).not.toBe(digest);
    expect(editorialDigest({...q,revisaoJuridicaEm:new Date()})).toBe(digest);
    expect(editorialDigest({...q,alternativas:[...q.alternativas].reverse()})).toBe(digest);
  });
  it('does not authorize private class or annulled official content',()=>{
    expect(editorialIssues({...question(),turmaId:'class'}).length).toBeGreaterThan(0);
    expect(editorialIssues({...question(),origem:'OAB_OFICIAL',situacaoQuestaoOficial:'ANULADA'}).length).toBeGreaterThan(0);
  });
});
