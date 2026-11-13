import type { Prisma } from '@prisma/client';
import { INITIAL_DIAGNOSTIC_DISCIPLINES } from './initial-diagnostic-config';
import { hasCompleteContent, inventoryWhere, type InventoryRow } from '../repositories/prisma-initial-diagnostic-repository';
export function draftPilotInventoryWhere(batchId: string | null): Prisma.QuestaoWhereInput {
  return batchId ? { loteImportacaoId: batchId, origem: 'IA', publica: false, turmaId: null,
    revisaoJuridicaEm: null, revisorJuridicoId: null, revisaoPedagogicaEm: null, revisorPedagogicoId: null,
    liberadaAcervoEm: null, liberadaAcervoPorId: null } : inventoryWhere;
}
export function isDraftPilotQuestion(row: InventoryRow, batchId: string | null) {
  if (!batchId || row.loteImportacaoId !== batchId || row.origem !== 'IA' || row.publica || row.turmaId !== null
    || row.revisaoJuridicaEm || row.revisorJuridicoId || row.revisaoPedagogicaEm || row.revisorPedagogicoId
    || row.liberadaAcervoEm || row.liberadaAcervoPorId || !hasCompleteContent(row)
    || !INITIAL_DIAGNOSTIC_DISCIPLINES.includes(row.disciplina as typeof INITIAL_DIAGNOSTIC_DISCIPLINES[number])
    || row.licencaOuAutorizacao !== 'PENDENTE_CONFERENCIA_DE_AUTORIA_ORIGINALIDADE_E_LIBERACAO'
    || !row.fonteReferencia?.startsWith('RASCUNHO_PRATICA_EM_REVISAO\n')) return false;
  try {
    const metadata = JSON.parse(row.fonteReferencia.slice('RASCUNHO_PRATICA_EM_REVISAO\n'.length));
    return /^TRE-(CON|CIV|PEN|ADM|TRA)-\d{2}$/.test(metadata.draftId)
      && metadata.preliminaryReview?.humanApproval === false
      && Array.isArray(metadata.reference) && metadata.reference.length > 0
      && Array.isArray(metadata.comentarios) && metadata.comentarios.length === 4;
  } catch { return false; }
}
