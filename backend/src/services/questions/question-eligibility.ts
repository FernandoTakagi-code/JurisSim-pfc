/** Política pura de elegibilidade e de alocação de inventário para futuros modos de questão.
 * Este módulo propositalmente não tem integração com banco nem com rotas. Os fluxos
 * existentes de Diagnóstico e de avaliação da turma continuam usando suas regras atuais.
 */

export type QuestionLevel = 'BASICO' | 'INTERMEDIARIO' | 'AVANCADO';
export type QuestionOrigin = 'IA' | 'OAB_OFICIAL' | 'PROFESSOR';

export interface QuestionCandidate {
  id: string;
  origin: QuestionOrigin;
  level: QuestionLevel;
  /** Escopo de toda a plataforma. Publicação e revisão são verificadas separadamente. */
  public: boolean;
  complete: boolean;
  annulled: boolean;
  published: boolean;
  /** Obrigatório para questões criadas por IA. */
  legalReviewApproved: boolean;
  pedagogicalReviewApproved: boolean;
  /** Obrigatório para material oficial antes da reprodução integral. */
  reproductionRightsDocumented: boolean;
}

export interface MediumOriginRatio {
  iaPercent: number;
  oabPercent: number;
}

export const DEFAULT_MEDIUM_ORIGIN_RATIO: Readonly<MediumOriginRatio> = Object.freeze({
  iaPercent: 50,
  oabPercent: 50,
});

export type SelectionRequest =
  | { level: 'BASICO'; quantity: number }
  | { level: 'INTERMEDIARIO'; quantity: number; mediumRatio?: MediumOriginRatio }
  | { level: 'AVANCADO'; quantity: number };

export type SelectionPlan =
  | {
      status: 'READY';
      level: QuestionLevel;
      questionIds: string[];
      requiredByOrigin: Partial<Record<QuestionOrigin, number>>;
      availableByOrigin: Partial<Record<QuestionOrigin, number>>;
    }
  | {
      status: 'INSUFFICIENT';
      level: QuestionLevel;
      questionIds: [];
      requiredByOrigin: Partial<Record<QuestionOrigin, number>>;
      availableByOrigin: Partial<Record<QuestionOrigin, number>>;
      deficitsByOrigin: Partial<Record<QuestionOrigin, number>>;
    };

function hasValidCommonState(question: QuestionCandidate): boolean {
  return question.public && question.complete && !question.annulled && question.published;
}

/** Origem e dificuldade continuam independentes: isto verifica apenas procedência/revisão. */
export function isEligiblePublicQuestion(question: QuestionCandidate): boolean {
  if (!hasValidCommonState(question)) return false;

  switch (question.origin) {
    case 'IA':
      return question.legalReviewApproved && question.pedagogicalReviewApproved;
    case 'OAB_OFICIAL':
      return question.reproductionRightsDocumented && question.legalReviewApproved && question.pedagogicalReviewApproved;
    case 'PROFESSOR':
      // Itens criados por professores nunca entram implicitamente no acervo público,
      // mesmo que um registro malformado/importado esteja marcado como público.
      return false;
  }
}

function validateRequest(request: SelectionRequest): void {
  if (!Number.isSafeInteger(request.quantity) || request.quantity < 1) {
    throw new RangeError('A quantidade deve ser um inteiro positivo.');
  }
  if (request.level === 'INTERMEDIARIO') {
    const ratio = request.mediumRatio ?? DEFAULT_MEDIUM_ORIGIN_RATIO;
    if (!Number.isInteger(ratio.iaPercent) || !Number.isInteger(ratio.oabPercent)
      || ratio.iaPercent < 0 || ratio.oabPercent < 0
      || ratio.iaPercent + ratio.oabPercent !== 100) {
      throw new RangeError('A proporção do nível médio deve usar percentuais inteiros não negativos que somem 100.');
    }
  }
}

function requiredCounts(request: SelectionRequest): Partial<Record<QuestionOrigin, number>> {
  if (request.level === 'BASICO') return { IA: request.quantity };
  if (request.level === 'AVANCADO') return { OAB_OFICIAL: request.quantity };

  const ratio = request.mediumRatio ?? DEFAULT_MEDIUM_ORIGIN_RATIO;
  const iaExact = request.quantity * ratio.iaPercent / 100;
  const oabExact = request.quantity * ratio.oabPercent / 100;
  let ia = Math.floor(iaExact);
  let oab = Math.floor(oabExact);
  let remainder = request.quantity - ia - oab;

  // Alocação pelo maior resto. Os empates vão para IA, tornando lotes 50/50 ímpares
  // determinísticos (ex.: 3 => 2 IA + 1 OAB), sem nunca mudar a origem silenciosamente.
  while (remainder > 0) {
    if (iaExact - ia >= oabExact - oab) ia++;
    else oab++;
    remainder--;
  }
  return { IA: ia, OAB_OFICIAL: oab };
}

/**
 * Produz um plano tudo-ou-nada a partir de um inventário fornecido. Em caso de falta,
 * retorna os déficits por origem e nenhum ID; quem chama deve pedir ao usuário que altere
 * a quantidade/composição explicitamente, em vez de substituir por outra origem.
 */
export function planQuestionSelection(
  inventory: readonly QuestionCandidate[],
  request: SelectionRequest,
): SelectionPlan {
  validateRequest(request);
  const requiredByOrigin = requiredCounts(request);
  const eligibleByOrigin: Partial<Record<QuestionOrigin, QuestionCandidate[]>> = {};

  for (const question of inventory) {
    if (question.level !== request.level || !isEligiblePublicQuestion(question)) continue;
    if (question.origin !== 'IA' && question.origin !== 'OAB_OFICIAL') continue;
    const bucket = eligibleByOrigin[question.origin] ?? [];
    bucket.push(question);
    eligibleByOrigin[question.origin] = bucket;
  }

  const availableByOrigin: Partial<Record<QuestionOrigin, number>> = {};
  const deficitsByOrigin: Partial<Record<QuestionOrigin, number>> = {};
  for (const [origin, required] of Object.entries(requiredByOrigin) as [QuestionOrigin, number][]) {
    const available = eligibleByOrigin[origin]?.length ?? 0;
    availableByOrigin[origin] = available;
    if (available < required) deficitsByOrigin[origin] = required - available;
  }

  if (Object.keys(deficitsByOrigin).length) {
    return { status: 'INSUFFICIENT', level: request.level, questionIds: [], requiredByOrigin, availableByOrigin, deficitsByOrigin };
  }

  const questionIds = (Object.entries(requiredByOrigin) as [QuestionOrigin, number][])
    .flatMap(([origin, quantity]) => (eligibleByOrigin[origin] ?? []).slice(0, quantity).map(question => question.id));
  return { status: 'READY', level: request.level, questionIds, requiredByOrigin, availableByOrigin };
}
