import { describe, expect, it } from 'vitest';
import { INITIAL_DIAGNOSTIC_COMPOSITION, INITIAL_DIAGNOSTIC_DISCIPLINES } from './initial-diagnostic-composition';
import { validateQuestionBatch } from './eligible-question-batch';

function validBatch() {
  const questions = INITIAL_DIAGNOSTIC_COMPOSITION.flatMap((slot, slotIndex) =>
    Array.from({ length: slot.quantity }, (_, itemIndex) => {
      const id = `${slotIndex}-${itemIndex}`;
      const question: Record<string, unknown> = {
        enunciado: `Fixture sintética ${id} para validar somente a estrutura do importador.`,
        disciplina: slot.discipline,
        assunto: `Assunto fixture ${slot.discipline}`,
        nivel: slot.level,
        fundamentacaoJuridica: `Fixture sem conteúdo jurídico real ${id}.`,
        origem: slot.origin,
        alternativas: ['A', 'B', 'C', 'D'].map((letra, index) => ({ letra, texto: `Fixture ${letra} ${id}`, correta: index === 0 })),
        source: { name: 'FIXTURE_ONLY', reference: `fixture:${id}`, licenseOrAuthorization: 'FIXTURE_ONLY; não é autorização real' },
        legalReview: { reviewerId: 'fixture-legal', reviewedAt: '2026-01-01T00:00:00.000Z', evidenceRef: 'fixture-only' },
        pedagogicalReview: { reviewerId: 'fixture-pedagogic', reviewedAt: '2026-01-01T00:00:00.000Z', evidenceRef: 'fixture-only' },
        release: { releasedById: 'fixture-admin', releasedAt: '2026-01-01T00:00:00.000Z', evidenceRef: 'fixture-only' },
      };
      if (slot.origin === 'OAB_OFICIAL') question.oab = {
        exam: 'FIXTURE_ONLY', edition: 'FIXTURE_ONLY', examType: 'FIXTURE_ONLY', questionNumber: slotIndex + itemIndex + 1,
        officialUrl: 'https://fixture.invalid/question', officialStatus: 'VALIDA', rightsStatus: 'AUTORIZADA',
        rightsVerifiedById: 'fixture-admin', rightsVerifiedAt: '2026-01-01T00:00:00.000Z', rightsEvidenceRef: 'fixture-only',
      };
      return question;
    }));
  return {
    questions,
    practiceTopics: INITIAL_DIAGNOSTIC_DISCIPLINES.map(disciplina => ({ disciplina, assunto: `Assunto fixture ${disciplina}` })),
  };
}

describe('validador offline de lotes de questões elegíveis', () => {
  it('aceita lote sintético completo com a composição do diagnóstico e cobertura prática', () => {
    const result = validateQuestionBatch(validBatch());
    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(30);
  });

  it.each([
    ['manifest ausente', null],
    ['alternativa nula', { mutate: (batch: ReturnType<typeof validBatch>) => { (batch.questions[0].alternativas as unknown[])[0] = null; } }],
    ['sem gabarito único', { mutate: (batch: ReturnType<typeof validBatch>) => { (batch.questions[0].alternativas as { correta: boolean }[]).forEach(item => { item.correta = false; }); } }],
    ['sem classificação', { mutate: (batch: ReturnType<typeof validBatch>) => { batch.questions[0].disciplina = ''; } }],
    ['sem evidência de revisão', { mutate: (batch: ReturnType<typeof validBatch>) => { (batch.questions[0].legalReview as { evidenceRef: string }).evidenceRef = ''; } }],
    ['sem evidência de direitos oficiais', { mutate: (batch: ReturnType<typeof validBatch>) => { (batch.questions.find(q => q.origem === 'OAB_OFICIAL')!.oab as { rightsEvidenceRef: string }).rightsEvidenceRef = ''; } }],
    ['proveniência IA com bloco oficial', { mutate: (batch: ReturnType<typeof validBatch>) => { batch.questions[0].oab = {}; } }],
    ['duplicata', { mutate: (batch: ReturnType<typeof validBatch>) => { batch.questions[1] = structuredClone(batch.questions[0]); } }],
    ['lote insuficiente', { mutate: (batch: ReturnType<typeof validBatch>) => { batch.questions.pop(); } }],
    ['sem assunto de prática', { mutate: (batch: ReturnType<typeof validBatch>) => { batch.practiceTopics.pop(); } }],
  ])('recusa %s sem exceção do parser', (_label, input) => {
    if (input && typeof input === 'object' && 'mutate' in input) {
      const batch = validBatch();
      (input as { mutate: (value: ReturnType<typeof validBatch>) => void }).mutate(batch);
      expect(validateQuestionBatch(batch).errors.length).toBeGreaterThan(0);
    } else {
      expect(validateQuestionBatch(input).errors.length).toBeGreaterThan(0);
    }
  });
});
