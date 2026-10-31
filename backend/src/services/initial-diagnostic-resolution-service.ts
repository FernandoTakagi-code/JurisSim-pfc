import { ApiError } from '../errors/api-error';
import { analyzeDiagnostic } from './adaptive-engine';
import type { AdaptiveResult } from '../types/diagnostic';
import type { InitialDiagnosticAttemptState } from './initial-diagnostic-service';

export interface InitialDiagnosticResolutionAlternative {
  id: string;
  letter: 'A' | 'B' | 'C' | 'D' | null;
  text: string;
  correct: boolean;
}

export interface InitialDiagnosticResolutionQuestion {
  questionId: string;
  position: number;
  statement: string;
  explanation: string;
  discipline: string;
  topic: string;
  difficulty: 'BASICO' | 'INTERMEDIARIO' | 'AVANCADO';
  alternatives: readonly InitialDiagnosticResolutionAlternative[];
  selectedAlternativeId: string | null;
  answeredAt: Date | null;
  correct: boolean;
}

export interface InitialDiagnosticResolutionAttempt {
  id: string;
  state: InitialDiagnosticAttemptState;
  finalizedAt: Date | null;
  questions: readonly InitialDiagnosticResolutionQuestion[];
  performances: readonly unknown[];
  trail: unknown | null;
}

export type InitialDiagnosticFinalizeOutcome =
  | { status: 'NOT_FOUND' }
  | { status: 'INCOMPLETE'; answered: number; required: 30 }
  | { status: 'FINALIZED' | 'ALREADY_FINALIZED'; attempt: InitialDiagnosticResolutionAttempt };

export interface InitialDiagnosticResolutionRepository {
  findOwnedAttempt(studentId: string, attemptId: string): Promise<InitialDiagnosticResolutionAttempt | null>;
  saveOrUpdateAnswer(studentId: string, attemptId: string, questionId: string, alternativeId: string): Promise<
    'NOT_FOUND' | 'FINALIZED' | 'QUESTION_NOT_FOUND' | 'ALTERNATIVE_NOT_FOUND' | 'SAVED'
  >;
  finalizeAtomically(studentId: string, attemptId: string, analyze: (attempt: InitialDiagnosticResolutionAttempt) => AdaptiveResult): Promise<InitialDiagnosticFinalizeOutcome>;
}

function assertCompleteAttempt(attempt: InitialDiagnosticResolutionAttempt): void {
  const questions = attempt.questions;
  const validPositions = questions.length === 30 && questions.every((question, index) => question.position === index + 1);
  const validDistribution = [
    'Direito Constitucional', 'Direito Civil', 'Direito Penal', 'Direito Administrativo', 'Direito do Trabalho',
  ].every(discipline => questions.filter(question => question.discipline === discipline).length === 6);
  const validAlternatives = questions.every(question => {
    const letters = question.alternatives.map(alternative => alternative.letter);
    return question.statement.trim().length >= 10
      && question.alternatives.length === 4
      && new Set(letters).size === 4
      && ['A', 'B', 'C', 'D'].every(letter => letters.includes(letter as 'A' | 'B' | 'C' | 'D'))
      && question.alternatives.every(alternative => alternative.text.trim())
      && question.alternatives.filter(alternative => alternative.correct).length === 1;
  });

  if (!validPositions || !validDistribution || !validAlternatives) {
    throw new ApiError(503, 'Tentativa de diagnóstico indisponível.');
  }
}

function toAdaptiveResult(attempt: InitialDiagnosticResolutionAttempt): AdaptiveResult {
  return analyzeDiagnostic(attempt.questions.map(question => ({
    discipline: question.discipline,
    topic: question.topic,
    difficulty: question.difficulty,
    isCorrect: question.selectedAlternativeId !== null && question.correct,
  })));
}

function toPerformanceRows(result: AdaptiveResult) {
  return result.performances.map(performance => ({
    tipo: performance.metricType,
    disciplina: performance.discipline,
    assunto: performance.topic,
    nivel: performance.difficulty,
    acertos: performance.correctAnswers,
    totalQuestoes: performance.totalQuestions,
    percentual: performance.percentage,
  }));
}

function toTrailRow(result: AdaptiveResult) {
  return {
    disciplinaPrioritaria: result.trail.priorityDiscipline,
    assuntoPrioritario: result.trail.priorityTopic,
    nivelRecomendado: result.trail.recommendedLevel,
    quantidadeRecomendada: result.trail.recommendedQuantity,
    justificativa: result.trail.reason,
  };
}

function resultResponse(attempt: InitialDiagnosticResolutionAttempt, result = toAdaptiveResult(attempt)) {
  const answered = attempt.questions.filter(question => question.selectedAlternativeId !== null).length;
  const storedTrail = attempt.trail as { justificativa?: string } | null;
  return {
    id: attempt.id,
    finalizedAt: attempt.finalizedAt,
    correctAnswers: result.correctAnswers,
    totalQuestions: result.totalQuestions,
    answeredQuestions: answered,
    incorrectAnswers: answered - result.correctAnswers,
    unansweredQuestions: result.totalQuestions - answered,
    overallPercentage: result.overallPercentage,
    level: result.level,
    weakestDiscipline: result.weakestDiscipline,
    weakestTopic: result.weakestTopic,
    recommendation: storedTrail?.justificativa ?? result.recommendation,
    performances: attempt.performances.length ? attempt.performances : toPerformanceRows(result),
    trail: attempt.trail ?? toTrailRow(result),
  };
}

export class InitialDiagnosticResolutionService {
  constructor(private readonly repository: InitialDiagnosticResolutionRepository) {}

  async getQuestions(studentId: string, attemptId: string) {
    const attempt = await this.getOwnedAttempt(studentId, attemptId);
    assertCompleteAttempt(attempt);
    return attempt.questions.map(question => ({
      id: question.questionId,
      position: question.position,
      statement: question.statement,
      discipline: question.discipline,
      topic: question.topic,
      difficulty: question.difficulty,
      alternatives: question.alternatives
        .slice()
        .sort((left, right) => (left.letter ?? '').localeCompare(right.letter ?? ''))
        .map(({ id, letter, text }) => ({ id, letter, text })),
      selectedOptionId: question.selectedAlternativeId,
    }));
  }

  async getAnswers(studentId: string, attemptId: string) {
    const attempt = await this.getOwnedAttempt(studentId, attemptId);
    assertCompleteAttempt(attempt);
    const answers = attempt.questions.flatMap(question => question.selectedAlternativeId
      ? [{ questionId: question.questionId, selectedOptionId: question.selectedAlternativeId, respondedAt: question.answeredAt }]
      : []);
    return { attemptId: attempt.id, answered: answers.length, total: 30, answers };
  }

  async saveAnswer(studentId: string, attemptId: string, questionId: string, alternativeId: string) {
    const status = await this.repository.saveOrUpdateAnswer(studentId, attemptId, questionId, alternativeId);
    if (status === 'NOT_FOUND') throw new ApiError(404, 'Diagnóstico inicial não encontrado.');
    if (status === 'FINALIZED') throw new ApiError(409, 'O diagnóstico inicial já foi finalizado.');
    if (status === 'QUESTION_NOT_FOUND') throw new ApiError(404, 'A questão não pertence a este diagnóstico inicial.');
    if (status === 'ALTERNATIVE_NOT_FOUND') throw new ApiError(422, 'A alternativa não pertence a esta questão.');

    const attempt = await this.getOwnedAttempt(studentId, attemptId);
    const question = attempt.questions.find(item => item.questionId === questionId)!;
    // Never reveal correctness or explanation while an answer key is still active.
    return { questionId, selectedOptionId: question.selectedAlternativeId, respondedAt: question.answeredAt };
  }

  async finalize(studentId: string, attemptId: string) {
    const outcome = await this.repository.finalizeAtomically(studentId, attemptId, attempt => {
      assertCompleteAttempt(attempt);
      return toAdaptiveResult(attempt);
    });
    if (outcome.status === 'NOT_FOUND') throw new ApiError(404, 'Diagnóstico inicial não encontrado.');
    if (outcome.status === 'INCOMPLETE') {
      throw new ApiError(422, `Responda às 30 questões antes de finalizar. ${outcome.answered} de ${outcome.required} respondidas.`);
    }
    assertCompleteAttempt(outcome.attempt);
    return resultResponse(outcome.attempt);
  }

  async getResult(studentId: string, attemptId: string) {
    const attempt = await this.getOwnedAttempt(studentId, attemptId);
    if (attempt.state !== 'COMPLETED' || !attempt.finalizedAt) {
      throw new ApiError(409, 'Finalize o diagnóstico inicial antes de consultar o resultado.');
    }
    assertCompleteAttempt(attempt);
    if (attempt.questions.some(question => question.selectedAlternativeId === null)) {
      throw new ApiError(503, 'Resultado do diagnóstico inicial indisponível.');
    }
    return resultResponse(attempt);
  }

  private async getOwnedAttempt(studentId: string, attemptId: string) {
    const attempt = await this.repository.findOwnedAttempt(studentId, attemptId);
    if (!attempt) throw new ApiError(404, 'Diagnóstico inicial não encontrado.');
    return attempt;
  }
}
