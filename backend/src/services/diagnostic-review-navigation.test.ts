import { describe, expect, it } from 'vitest';
import { clampDiagnosticReviewIndex, diagnosticReviewStatus } from './diagnostic-review-navigation';

describe('diagnostic review navigation and answer states', () => {
  it('moves between first, middle and last questions without leaving the available range', () => {
    expect(clampDiagnosticReviewIndex(-1, 30)).toBe(0);
    expect(clampDiagnosticReviewIndex(16, 30)).toBe(16);
    expect(clampDiagnosticReviewIndex(30, 30)).toBe(29);
    expect(clampDiagnosticReviewIndex(0, 0)).toBe(0);
  });

  it('distinguishes correct, incorrect and unanswered items', () => {
    expect(diagnosticReviewStatus({ selectedAlternativeId: 'a', correct: true })).toBe('correct');
    expect(diagnosticReviewStatus({ selectedAlternativeId: 'b', correct: false })).toBe('incorrect');
    expect(diagnosticReviewStatus({ selectedAlternativeId: null, correct: null })).toBe('unanswered');
  });
});
