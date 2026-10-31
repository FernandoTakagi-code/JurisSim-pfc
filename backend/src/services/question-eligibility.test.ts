import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEDIUM_ORIGIN_RATIO,
  isEligiblePublicQuestion,
  planQuestionSelection,
  type QuestionCandidate,
  type SelectionRequest,
} from './question-eligibility';

function candidate(id: string, overrides: Partial<QuestionCandidate> = {}): QuestionCandidate {
  return {
    id,
    origin: 'IA',
    level: 'BASICO',
    public: true,
    complete: true,
    annulled: false,
    published: true,
    legalReviewApproved: true,
    pedagogicalReviewApproved: true,
    reproductionRightsDocumented: false,
    ...overrides,
  };
}

function inventory(iaCount: number, oabCount: number, level: QuestionCandidate['level'] = 'INTERMEDIARIO') {
  return [
    ...Array.from({ length: iaCount }, (_, index) => candidate(`ia-${index + 1}`, { level })),
    ...Array.from({ length: oabCount }, (_, index) => candidate(`oab-${index + 1}`, {
      level,
      origin: 'OAB_OFICIAL',
      reproductionRightsDocumented: true,
    })),
  ];
}

describe('política pura de elegibilidade das questões públicas', () => {
  it('mantém origem e dificuldade independentes, com IA elegível no nível fácil após revisão', () => {
    const easyIa = candidate('easy-ia', { level: 'BASICO' });
    expect(isEligiblePublicQuestion(easyIa)).toBe(true);
    expect(planQuestionSelection([easyIa], { level: 'BASICO', quantity: 1 })).toMatchObject({
      status: 'READY', questionIds: ['easy-ia'], requiredByOrigin: { IA: 1 },
    });
  });

  it('exige revisão jurídica e pedagógica e publicação para questões de IA', () => {
    for (const changes of [
      { legalReviewApproved: false },
      { pedagogicalReviewApproved: false },
      { published: false },
    ]) expect(isEligiblePublicQuestion(candidate('blocked', changes))).toBe(false);
  });

  it('permite no nível médio a proporção configurável padrão 50/50', () => {
    expect(DEFAULT_MEDIUM_ORIGIN_RATIO).toEqual({ iaPercent: 50, oabPercent: 50 });
    expect(planQuestionSelection(inventory(2, 2), { level: 'INTERMEDIARIO', quantity: 4 })).toMatchObject({
      status: 'READY', questionIds: ['ia-1', 'ia-2', 'oab-1', 'oab-2'],
      requiredByOrigin: { IA: 2, OAB_OFICIAL: 2 },
    });
  });

  it('arredonda lote ímpar de forma determinística sem substituir a origem', () => {
    expect(planQuestionSelection(inventory(2, 1), { level: 'INTERMEDIARIO', quantity: 3 })).toMatchObject({
      status: 'READY', questionIds: ['ia-1', 'ia-2', 'oab-1'],
      requiredByOrigin: { IA: 2, OAB_OFICIAL: 1 },
    });
  });

  it('retorna insuficiência por origem e nenhum item quando falta uma das partes do mix', () => {
    expect(planQuestionSelection(inventory(4, 1), { level: 'INTERMEDIARIO', quantity: 4 })).toEqual({
      status: 'INSUFFICIENT', level: 'INTERMEDIARIO', questionIds: [],
      requiredByOrigin: { IA: 2, OAB_OFICIAL: 2 },
      availableByOrigin: { IA: 4, OAB_OFICIAL: 1 },
      deficitsByOrigin: { OAB_OFICIAL: 1 },
    });
  });

  it('não substitui questões oficiais ausentes por IA no nível difícil', () => {
    expect(planQuestionSelection([
      candidate('ia-advanced', { level: 'AVANCADO' }),
    ], { level: 'AVANCADO', quantity: 1 })).toMatchObject({
      status: 'INSUFFICIENT', questionIds: [], requiredByOrigin: { OAB_OFICIAL: 1 },
      availableByOrigin: { OAB_OFICIAL: 0 }, deficitsByOrigin: { OAB_OFICIAL: 1 },
    });
  });

  it('exige autorização documentada e revisões para OAB oficial', () => {
    const official = candidate('oab', {
      origin: 'OAB_OFICIAL', level: 'AVANCADO', reproductionRightsDocumented: true,
    });
    expect(isEligiblePublicQuestion(official)).toBe(true);
    expect(isEligiblePublicQuestion({ ...official, reproductionRightsDocumented: false })).toBe(false);
    expect(isEligiblePublicQuestion({ ...official, legalReviewApproved: false })).toBe(false);
  });

  it.each([
    ['anulada', { annulled: true }],
    ['incompleta', { complete: false }],
    ['não publicada', { published: false }],
    ['privada', { public: false }],
  ])('exclui questão %s', (_label, changes) => {
    expect(isEligiblePublicQuestion(candidate('blocked', changes))).toBe(false);
  });

  it('nunca inclui questão particular de professor no conjunto público', () => {
    const teacher = candidate('teacher', { origin: 'PROFESSOR' });
    expect(isEligiblePublicQuestion(teacher)).toBe(false);
    expect(planQuestionSelection([teacher], { level: 'BASICO', quantity: 1 })).toMatchObject({
      status: 'INSUFFICIENT', questionIds: [],
    });
  });

  it('trata inventário vazio como insuficiente sem criar seleção parcial', () => {
    expect(planQuestionSelection([], { level: 'BASICO', quantity: 2 })).toMatchObject({
      status: 'INSUFFICIENT', questionIds: [], requiredByOrigin: { IA: 2 },
      availableByOrigin: { IA: 0 }, deficitsByOrigin: { IA: 2 },
    });
  });

  it('permite proporção configurada e valida percentuais inválidos', () => {
    const request: SelectionRequest = {
      level: 'INTERMEDIARIO', quantity: 4, mediumRatio: { iaPercent: 25, oabPercent: 75 },
    };
    expect(planQuestionSelection(inventory(1, 3), request)).toMatchObject({
      status: 'READY', requiredByOrigin: { IA: 1, OAB_OFICIAL: 3 },
    });
    expect(() => planQuestionSelection([], {
      level: 'INTERMEDIARIO', quantity: 2, mediumRatio: { iaPercent: 60, oabPercent: 50 },
    })).toThrow(RangeError);
  });

  it('rejeita quantidades inválidas', () => {
    expect(() => planQuestionSelection([], { level: 'BASICO', quantity: 0 })).toThrow(RangeError);
  });
});
