import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {activityQuestionSelectable,activityPilotQuestion,activityQuestionWhere,activityDescription,ACTIVITY_PILOT_NOTICE} from "../../../src/services/class-activity-eligibility";
import {toEligibleCandidate,type InventoryRow} from "../../../src/repositories/prisma-initial-diagnostic-repository";
const batch='9218bdec-f4e3-43a1-8b54-cdc40720dea5';
function row():InventoryRow {
 const q=JSON.parse(readFileSync(resolve(__dirname,"../../../scripts/drafts/authorial-practice-60.draft.json"),'utf8')).questions[0];
 return {...q,id:'question',loteImportacaoId:batch,publica:false,turmaId:null,revisaoJuridicaEm:null,revisorJuridicoId:null,revisaoPedagogicaEm:null,revisorPedagogicoId:null,liberadaAcervoEm:null,liberadaAcervoPorId:null,
  fonteReferencia:`RASCUNHO_PRATICA_EM_REVISAO\n${JSON.stringify({draftId:q._draftSlot,preliminaryReview:q.preliminaryReview,reference:q.source.reference,comentarios:q.alternativas.map((a:any)=>({letra:a.letra,comentario:a.comentario}))})}`,
  licencaOuAutorizacao:q.source.licenseOrAuthorization,alternativas:q.alternativas.map((a:any,i:number)=>({...a,id:`a${i}`}))} as InventoryRow;
}
afterEach(()=>vi.unstubAllEnvs());
it('requires an independent, valid activity pilot opt-in without approving the source',()=>{
 vi.stubEnv('QUESTION_PRACTICE_PILOT_ENABLED','true');vi.stubEnv('CLASS_ACTIVITY_PILOT_ENABLED','false');
 expect(activityQuestionSelectable(row(),'class-a')).toBe(false);
 vi.stubEnv('CLASS_ACTIVITY_PILOT_ENABLED','true');vi.stubEnv('CLASS_ACTIVITY_PILOT_BATCH_IDS',batch);
 expect(activityQuestionSelectable(row(),'class-a')).toBe(true);expect(activityPilotQuestion(row())).toBe(true);expect(toEligibleCandidate(row())).toBeNull();
 expect(activityQuestionWhere('class-a').OR).toHaveLength(3);
});
it('rejects unrelated lots, incomplete answers, public unreviewed questions and forged review data',()=>{
 vi.stubEnv('CLASS_ACTIVITY_PILOT_ENABLED','true');vi.stubEnv('CLASS_ACTIVITY_PILOT_BATCH_IDS',batch);
 for(const changes of [{loteImportacaoId:'another'},{publica:true},{revisorJuridicoId:'invented'},{alternativas:row().alternativas.slice(0,3)},{turmaId:'another-class'}])expect(activityQuestionSelectable({...row(),...changes} as InventoryRow,'class-a')).toBe(false);
});
it('preserves private class scope independently of the pilot',()=>{
 vi.stubEnv('CLASS_ACTIVITY_PILOT_ENABLED','false');const privateRow={...row(),turmaId:'class-a'};
 expect(activityQuestionSelectable(privateRow,'class-a')).toBe(true);expect(activityQuestionSelectable(privateRow,'class-b')).toBe(false);
});
it('keeps the provisional warning in saved descriptions without duplicating it',()=>{
 const description=activityDescription('Orientações da tarefa',true);
 expect(description).toContain(ACTIVITY_PILOT_NOTICE);expect(activityDescription(description,true)).toBe(description);
 expect(activityDescription(description,false)).toBe('Orientações da tarefa');
});
