export type DiagnosticReviewAnswerState = { selectedAlternativeId: string | null; correct: boolean | null };

export function diagnosticReviewStatus(question: DiagnosticReviewAnswerState): 'correct' | 'incorrect' | 'unanswered' {
  if (question.selectedAlternativeId === null) return 'unanswered';
  return question.correct === true ? 'correct' : 'incorrect';
}

export function clampDiagnosticReviewIndex(index: number, questionCount: number): number {
  if (!Number.isFinite(index) || questionCount <= 0) return 0;
  return Math.max(0, Math.min(Math.trunc(index), questionCount - 1));
}
