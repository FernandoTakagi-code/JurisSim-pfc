"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnosticReviewStatus = diagnosticReviewStatus;
exports.clampDiagnosticReviewIndex = clampDiagnosticReviewIndex;
function diagnosticReviewStatus(question) {
    if (question.selectedAlternativeId === null)
        return 'unanswered';
    return question.correct === true ? 'correct' : 'incorrect';
}
function clampDiagnosticReviewIndex(index, questionCount) {
    if (!Number.isFinite(index) || questionCount <= 0)
        return 0;
    return Math.max(0, Math.min(Math.trunc(index), questionCount - 1));
}
