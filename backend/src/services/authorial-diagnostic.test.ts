import { describe, expect, it, vi } from 'vitest';
import { composeInitialDiagnostic, getInitialDiagnosticComposition, parseInitialDiagnosticCompositionMode, type InitialDiagnosticCandidate } from './initial-diagnostic-composition';
import { InitialDiagnosticService } from './initial-diagnostic-service';
import { validateQuestionBatch } from './eligible-question-batch';

const mode = 'AUTORAL_30' as const;
function inventory(extra = 0): InitialDiagnosticCandidate[] {
  return getInitialDiagnosticComposition(mode).flatMap((slot, index) =>
    Array.from({ length: slot.quantity + extra }, (_, n) => ({
      id: `${index}-${n}`, discipline: slot.discipline, level: slot.level, origin: slot.origin,
      public: true, complete: true, annulled: false, published: true,
      legalReviewApproved: true, pedagogicalReviewApproved: true, reproductionRightsDocumented: false,
    })));
}

// Synthetic identities/evidence belong only to test fixtures, never real drafts.
function approvedFixture() {
  return { practiceTopics: [], questions: inventory().map(q => ({
    enunciado: `Fixture sintética sem conteúdo jurídico real ${q.id}.`, disciplina: q.discipline,
    assunto: `Assunto fixture ${q.id}`, nivel: q.level, origem: q.origin,
    fundamentacaoJuridica: 'FIXTURE_ONLY: sem aprovação jurídica real.',
    alternativas: [...'ABCD'].map((letra, i) => ({ letra, texto: `Opção ${letra}`, correta: i === 0 })),
    source: { name: 'FIXTURE_ONLY', reference: 'fixture.invalid', licenseOrAuthorization: 'FIXTURE_ONLY' },
    legalReview: { reviewerId: 'fixture-legal', reviewedAt: '2026-01-01T00:00:00Z', evidenceRef: 'fixture-only' },
    pedagogicalReview: { reviewerId: 'fixture-pedagogic', reviewedAt: '2026-01-01T00:00:00Z', evidenceRef: 'fixture-only' },
    release: { releasedById: 'fixture-admin', releasedAt: '2026-01-01T00:00:00Z', evidenceRef: 'fixture-only' },
  })) };
}

describe('diagnóstico autoral opcional', () => {
  it('preserva o modo misto por padrão e recusa configuração inválida', () => {
    expect(parseInitialDiagnosticCompositionMode()).toBe('MISTA_15_15');
    expect(parseInitialDiagnosticCompositionMode(' AUTORAL_30 ')).toBe(mode);
    expect(() => parseInitialDiagnosticCompositionMode('AUTORAL')).toThrow(RangeError);
    expect(composeInitialDiagnostic(inventory()).status).toBe('INSUFFICIENT');
  });

  it('seleciona 30 autorais distintas, seis por disciplina e duas por nível, ignorando oficiais extras', () => {
    const candidates = inventory();
    const result = composeInitialDiagnostic([...candidates, ...candidates.map(q => ({ ...q, id: `official-${q.id}`, origin: 'OAB_OFICIAL' as const, reproductionRightsDocumented: true }))], new Set(), () => 0, mode);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') throw new Error('Fixture insuficiente');
    expect(new Set(result.questions.map(q => q.id)).size).toBe(30);
    expect(result.questions.every(q => q.origin === 'IA')).toBe(true);
    for (const slot of getInitialDiagnosticComposition(mode)) {
      expect(result.questions.filter(q => q.discipline === slot.discipline && q.level === slot.level)).toHaveLength(2);
    }
  });

  it('prefere inéditas e registra reutilização somente quando faltam inéditas na categoria', () => {
    const candidates = inventory(1);
    const answered = new Set(candidates.filter(q => !q.id.endsWith('-2')).map(q => q.id));
    const result = composeInitialDiagnostic(candidates, answered, () => 0, mode);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') throw new Error('Fixture insuficiente');
    expect(result.repeatedFromHistory).toHaveLength(15);
    expect(result.questions.filter(q => !answered.has(q.id))).toHaveLength(15);
  });

  it.each(['published', 'legalReviewApproved', 'pedagogicalReviewApproved', 'complete', 'public'] as const)('não aceita lote sem %s nem cria tentativa parcial', async field => {
    const candidates = inventory().map((q, i) => i === 0 ? { ...q, [field]: false } : q);
    const create = vi.fn();
    const service = new InitialDiagnosticService({ findInitialAttempt: async () => null,
      listEligibleInventory: async () => candidates, listAnsweredQuestionIds: async () => new Set(),
      createInitialOrGetExisting: create }, () => 0, mode);
    expect(await service.getOrCreate('fixture-student')).toMatchObject({ status: 'INSUFFICIENT', shortages: [{ required: 2, available: 1, origin: 'IA' }] });
    expect(create).not.toHaveBeenCalled();
  });

  it('recupera a tentativa existente mesmo quando muda a composição configurada', async () => {
    const attempt = { id: 'old-attempt', state: 'COMPLETED' as const, orderedQuestionIds: ['snapshot-existing'] };
    const list = vi.fn();
    const service = new InitialDiagnosticService({ findInitialAttempt: async () => attempt, listEligibleInventory: list,
      listAnsweredQuestionIds: vi.fn(), createInitialOrGetExisting: vi.fn() }, () => 0, mode);
    expect(await service.getOrCreate('fixture-student')).toEqual({ status: 'COMPLETED', attempt, created: false });
    expect(list).not.toHaveBeenCalled();
  });

  it('encaminha os 30 IDs autorais ao repositório e recupera a ordem persistida', async () => {
    let stored: { id: string; state: 'IN_PROGRESS'; orderedQuestionIds: readonly string[] } | null = null;
    const create = vi.fn(async ({ orderedQuestionIds }: { studentId: string; orderedQuestionIds: readonly string[] }) => {
      stored = { id: 'fixture-authorial-attempt', state: 'IN_PROGRESS', orderedQuestionIds: [...orderedQuestionIds] };
      return { attempt: stored, created: true };
    });
    const list = vi.fn(async () => inventory());
    const service = new InitialDiagnosticService({ findInitialAttempt: async () => stored, listEligibleInventory: list,
      listAnsweredQuestionIds: async () => new Set(), createInitialOrGetExisting: create }, () => 0, mode);
    const first = await service.getOrCreate('fixture-student');
    expect(first.status).toBe('IN_PROGRESS');
    expect(create).toHaveBeenCalledWith({ studentId: 'fixture-student', orderedQuestionIds: expect.any(Array) });
    expect(create.mock.calls[0][0].orderedQuestionIds).toHaveLength(30);
    const recovered = await service.getOrCreate('fixture-student');
    expect(recovered).toEqual({ ...first, created: false });
    expect(list).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('valida um diagnóstico sem prometer cobertura prática e mantém a validação estrita como padrão', () => {
    const batch = approvedFixture();
    expect(validateQuestionBatch(batch, { compositionMode: mode, scope: 'DIAGNOSTIC_ONLY' }).errors).toEqual([]);
    expect(validateQuestionBatch(batch, { compositionMode: mode }).errors.some(e => e.startsWith('pratica:'))).toBe(true);
    expect(validateQuestionBatch(batch).errors.some(e => e.startsWith('diagnostico:'))).toBe(true);
  });

  it.each(['legalReview', 'pedagogicalReview', 'release'] as const)('o modo autoral não dispensa %s', field => {
    const batch = approvedFixture();
    Object.assign(batch.questions[0][field], field === 'release' ? { releasedById: null, releasedAt: null, evidenceRef: null } : { reviewerId: null, reviewedAt: null, evidenceRef: null });
    expect(validateQuestionBatch(batch, { compositionMode: mode, scope: 'DIAGNOSTIC_ONLY' }).errors)
      .toContain('questions[0].revisoes_publicacao_fonte_evidencias');
  });

  it('continua recusando alternativas repetidas e assuntos de prática declarados sem cobertura', () => {
    const batch = approvedFixture();
    batch.questions[0].alternativas[1].texto = '  Opção A  ';
    expect(validateQuestionBatch(batch, { compositionMode: mode, scope: 'DIAGNOSTIC_ONLY' }).errors)
      .toContain('questions[0].alternativas_A-D_gabarito');
    const other = { ...approvedFixture(), practiceTopics: [{ disciplina: 'Direito Civil', assunto: 'Assunto inexistente' }] };
    expect(validateQuestionBatch(other, { compositionMode: mode, scope: 'DIAGNOSTIC_ONLY' }).errors.some(e => e.startsWith('pratica:'))).toBe(true);
  });
});
