import { describe, expect, it } from 'vitest';
import type { AnsweredQuestion } from '../types/diagnostic';
import { analyzeDiagnostic, getLevel } from './adaptive-engine';

function questions(correctAnswers: number, total = 100): AnsweredQuestion[] {
  return Array.from({ length: total }, (_, index) => ({
    discipline: index < total / 2 ? 'Constitucional' : 'Penal', topic: index < total / 2 ? 'Controle' : 'Crimes',
    difficulty: index < total / 2 ? 'BASICO' : 'INTERMEDIARIO', isCorrect: index < correctAnswers,
  }));
}

describe('motor adaptativo', () => {
  it.each([[49, 'BASICO'], [50, 'INTERMEDIARIO'], [79, 'INTERMEDIARIO'], [80, 'AVANCADO']] as const)(
    'classifica %s%% como %s', (percentage, level) => expect(getLevel(percentage)).toBe(level),
  );

  it('identifica disciplina e assunto mais fracos e gera recomendacao', () => {
    const result = analyzeDiagnostic([
      ...Array.from({ length: 4 }, () => ({ discipline: 'Constitucional', topic: 'Controle', difficulty: 'BASICO' as const, isCorrect: false })),
      ...Array.from({ length: 4 }, () => ({ discipline: 'Penal', topic: 'Crimes', difficulty: 'AVANCADO' as const, isCorrect: true })),
    ]);
    expect(result.weakestDiscipline).toBe('Constitucional');
    expect(result.weakestTopic).toBe('Controle');
    expect(result.recommendation).toContain('Constitucional');
    expect(result.trail.recommendedLevel).toBe('BASICO');
  });

  it('calcula o percentual a partir das respostas registradas', () => {
    expect(analyzeDiagnostic(questions(50)).overallPercentage).toBe(50);
  });
});
