import { criarQuestaoSchema } from '../schemas/questao-schemas';
import { getInitialDiagnosticComposition } from './initial-diagnostic-composition';

/** Projects editorial drafts to the import format without granting approvals. */
export function prepareAuthorialDraftBatch(input: unknown) {
  const document = input as { questions?: unknown[] } | null;
  if (!document || !Array.isArray(document.questions) || document.questions.length !== 30) {
    throw new Error('Selecione exatamente 30 rascunhos para preparar o diagnóstico.');
  }
  const ids = new Set<string>();
  const questions = document.questions.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Rascunho ${index + 1} inválido.`);
    const draft = raw as Record<string, any>;
    if (draft.origem !== 'IA' || draft.publica !== true || draft.turmaId != null
      || typeof draft._draftSlot !== 'string' || !draft._draftSlot.trim() || ids.has(draft._draftSlot)) {
      throw new Error(`Rascunho ${index + 1}: origem, visibilidade ou identificador inválido.`);
    }
    ids.add(draft._draftSlot);
    const content = criarQuestaoSchema.parse({ ...draft, turmaId: undefined });
    const alternatives = draft.alternativas as { letra: string; texto: string; correta: boolean; comentario?: string }[];
    if (!alternatives.every((a, i) => a.letra === 'ABCD'[i]) || !draft.source
      || typeof draft.source.name !== 'string' || !Array.isArray(draft.source.reference)
      || !draft.source.reference.length || typeof draft.source.licenseOrAuthorization !== 'string') {
      throw new Error(`Rascunho ${index + 1}: letras ou fontes ausentes.`);
    }
    const references = draft.source.reference.map((r: any) => {
      if (!r || typeof r.name !== 'string' || typeof r.article !== 'string' || typeof r.url !== 'string'
        || !['https:', 'http:'].includes(new URL(r.url).protocol)) throw new Error('Referência inválida.');
      return `${r.name}; ${r.article}; ${r.url}`;
    });
    return {
      _draftSlot: draft._draftSlot, ...content, origem: 'IA' as const,
      alternativas: alternatives.map(a => ({ ...a, texto: a.texto.trim() })),
      source: { name: draft.source.name, reference: references.join('\n'), licenseOrAuthorization: draft.source.licenseOrAuthorization },
      // Keep null identities/dates and pending statuses; never synthesize reviewers.
      legalReview: structuredClone(draft.legalReview ?? null),
      pedagogicalReview: structuredClone(draft.pedagogicalReview ?? null),
      release: structuredClone(draft.release ?? null),
    };
  });
  for (const slot of getInitialDiagnosticComposition('AUTORAL_30')) {
    if (questions.filter(q => q.disciplina === slot.discipline && q.nivel === slot.level).length !== slot.quantity) {
      throw new Error('A seleção deve ter seis questões por disciplina, duas por nível.');
    }
  }
  return {
    _draftMetadata: { compositionMode: 'AUTORAL_30', scope: 'DIAGNOSTIC_ONLY',
      eligibleForImport: false, reason: 'Preparação de formato não concede revisão ou liberação. Execute a prévia antes de qualquer aplicação.' },
    questions, practiceTopics: [],
  };
}
