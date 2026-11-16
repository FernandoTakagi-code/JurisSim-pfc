import type {Prisma} from '@prisma/client';
import {pilotBatchIds} from '../../config/pilot-batches';
import {inventoryWhere,toEligibleCandidate,type InventoryRow} from '../../repositories/prisma-initial-diagnostic-repository';
import {draftPilotInventoryWhere,isDraftPilotQuestion} from '../questions/draft-pilot-eligibility';
import {questionAlternativesError} from '../../question-alternatives';

export function activityPilotQuestion(row:InventoryRow) {
  return isDraftPilotQuestion(row,pilotBatchIds('CLASS_ACTIVITY'));
}
export function activityQuestionWhere(classId:string):Prisma.QuestaoWhereInput {
  const batches=pilotBatchIds('CLASS_ACTIVITY');
  return {OR:[{publica:false,turmaId:classId},inventoryWhere,...(batches.length?[draftPilotInventoryWhere(batches)]:[])]};
}
export function activityQuestionSelectable(row:InventoryRow,classId:string) {
  return activityPilotQuestion(row)||Boolean(toEligibleCandidate(row))||(!row.publica&&row.turmaId===classId&&!questionAlternativesError(row.alternativas));
}
export const ACTIVITY_PILOT_NOTICE='Atividade piloto: contém questões em revisão humana. O gabarito e os resultados são provisórios.';
export function activityDescription(description:string,pilot:boolean) {
  const content=description.startsWith(ACTIVITY_PILOT_NOTICE)?description.slice(ACTIVITY_PILOT_NOTICE.length).trimStart():description;
  return pilot?ACTIVITY_PILOT_NOTICE+(content?'\n\n'+content:''):content;
}
