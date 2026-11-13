import { describe, expect, it } from 'vitest';
import { composeInitialDiagnostic, getInitialDiagnosticComposition, type InitialDiagnosticCandidate } from './initial-diagnostic-composition';
import { isEligiblePublicQuestion } from './question-eligibility';
import { initialDiagnosticPilotBatchId } from '../config/initial-diagnostic-pilot';
import { createDiagnosticQuestionSnapshot, readDiagnosticQuestionSnapshot } from './diagnostic-question-snapshot';

const batchId='00000000-0000-4000-8000-000000000001';
const inventory=(): InitialDiagnosticCandidate[] => getInitialDiagnosticComposition('AUTORAL_30').flatMap((slot,index)=>[0,1].map(n=>({
 id:`${index}-${n}`,discipline:slot.discipline,level:slot.level,origin:'IA',public:true,complete:true,annulled:false,
 published:false,legalReviewApproved:false,pedagogicalReviewApproved:false,reproductionRightsDocumented:false,draftPilotBatchId:batchId,
})));
describe('piloto explícito de questões em revisão',()=>{
 it('fica desativado por padrão e exige lote e composição explícitos',()=>{
  expect(initialDiagnosticPilotBatchId({})).toBeUndefined();
  expect(()=>initialDiagnosticPilotBatchId({INITIAL_DIAGNOSTIC_PILOT_ENABLED:'true'})).toThrow();
  expect(()=>initialDiagnosticPilotBatchId({INITIAL_DIAGNOSTIC_PILOT_ENABLED:'true',INITIAL_DIAGNOSTIC_PILOT_BATCH_ID:'-'.repeat(36),INITIAL_DIAGNOSTIC_COMPOSITION_MODE:'AUTORAL_30'})).toThrow();
  expect(initialDiagnosticPilotBatchId({INITIAL_DIAGNOSTIC_PILOT_ENABLED:'true',INITIAL_DIAGNOSTIC_PILOT_BATCH_ID:batchId,INITIAL_DIAGNOSTIC_COMPOSITION_MODE:'AUTORAL_30'})).toBe(batchId);
 });
 it('não torna rascunhos elegíveis ao acervo normal ou à prática',()=>{
  expect(inventory().every(q=>!isEligiblePublicQuestion(q))).toBe(true);
  expect(composeInitialDiagnostic(inventory(),new Set(),()=>0,'AUTORAL_30').status).toBe('INSUFFICIENT');
 });
 it('seleciona somente lote explicitamente habilitado e conserva revisões falsas',()=>{
  const source=inventory();
  const selected=composeInitialDiagnostic(source,new Set(),()=>0,'AUTORAL_30',batchId);
  expect(selected.status).toBe('READY');
  if(selected.status!=='READY')throw new Error('Expected fixture pilot');
  expect(selected.questions).toHaveLength(30);
  expect(selected.questions.every(q=>!q.legalReviewApproved&&!q.pedagogicalReviewApproved&&!q.published)).toBe(true);
  expect(composeInitialDiagnostic(source,new Set(),()=>0,'AUTORAL_30','another-batch').status).toBe('INSUFFICIENT');
 });
 it.each(['public','complete','annulled','origin'] as const)('a exceção de piloto não ignora %s',field=>{
  const source=inventory();
  if(field==='origin')source[0].origin='OAB_OFICIAL';
  else source[0][field]=field==='annulled';
  expect(composeInitialDiagnostic(source,new Set(),()=>0,'AUTORAL_30',batchId).status).toBe('INSUFFICIENT');
 });
 it('preserva a indicação provisória no snapshot sem alterar snapshots antigos',()=>{
  const q={enunciado:'Questão sintética de snapshot.',disciplina:'Direito Civil',assunto:'Fixture',nivel:'BASICO',fundamentacaoJuridica:'Fixture',alternativas:[...'ABCD'].map((letra,i)=>({id:letra,letra,texto:`Opção ${letra}`,correta:i===0}))};
  expect(readDiagnosticQuestionSnapshot(createDiagnosticQuestionSnapshot(q,true))?.provisional).toBe(true);
  expect(createDiagnosticQuestionSnapshot(q)).not.toHaveProperty('provisional');
 });
});
