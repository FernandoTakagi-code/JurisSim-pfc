import { describe, expect, it } from 'vitest';
import { prepareAuthorialDraftBatch } from './authorial-draft-batch';
import { getInitialDiagnosticComposition } from './initial-diagnostic-composition';
import { validateQuestionBatch } from './eligible-question-batch';

function drafts() {
  return { questions: getInitialDiagnosticComposition('AUTORAL_30').flatMap((slot, i) => [0, 1].map(n => ({
    _draftSlot: `fixture-${i}-${n}`, enunciado: `Fixture de rascunho sem conteúdo jurídico ${i}-${n}`,
    disciplina: slot.discipline, assunto: `Fixture ${i}`, nivel: slot.level, origem: 'IA', publica: true, turmaId: null,
    fundamentacaoJuridica: 'Fixture sem aprovação.',
    alternativas: [...'ABCD'].map((letra, index) => ({ letra, texto: `Opção ${letra}`, correta: index === 0, comentario: `Comentário ${letra}` })),
    source: { name: 'FIXTURE_ONLY', reference: [{ name: 'Fonte fixture', article: 'Fixture', url: 'https://fixture.invalid/legal' }], licenseOrAuthorization: 'PENDENTE' },
    legalReview: { reviewerId: null, reviewedAt: null, evidenceRef: null, status: 'PENDENTE' },
    pedagogicalReview: { reviewerId: null, reviewedAt: null, evidenceRef: null, status: 'PENDENTE' },
    release: { releasedById: null, releasedAt: null, evidenceRef: null, status: 'PENDENTE' },
  }))) };
}

describe('preparação de rascunhos autorais para revisão', () => {
  it('preserva comentários e revisões pendentes, sem converter IA em aprovação humana', () => {
    const input = drafts();
    const before = structuredClone(input);
    const batch = prepareAuthorialDraftBatch(input);
    expect(input).toEqual(before);
    expect(batch.questions).toHaveLength(30);
    expect(batch.questions[0].alternativas[0].comentario).toBe('Comentário A');
    expect(batch.questions[0].legalReview).toEqual(before.questions[0].legalReview);
    expect(batch.questions[0].source.reference).toContain('https://fixture.invalid/legal');
    expect(batch._draftMetadata.eligibleForImport).toBe(false);
    expect(validateQuestionBatch(batch, { compositionMode: 'AUTORAL_30', scope: 'DIAGNOSTIC_ONLY' }).valid).toHaveLength(0);
  });

  it.each(['count', 'origin', 'duplicate-id', 'level', 'letters', 'source'] as const)('recusa seleção inválida: %s', problem => {
    const input = drafts();
    if (problem === 'count') input.questions.pop();
    if (problem === 'origin') input.questions[0].origem = 'OAB_OFICIAL';
    if (problem === 'duplicate-id') input.questions[1]._draftSlot = input.questions[0]._draftSlot;
    if (problem === 'level') input.questions[0].nivel = 'AVANCADO';
    if (problem === 'letters') input.questions[0].alternativas[1].letra = 'A';
    if (problem === 'source') input.questions[0].source.reference[0].url = 'javascript:alert(1)';
    expect(() => prepareAuthorialDraftBatch(input)).toThrow();
  });
});
