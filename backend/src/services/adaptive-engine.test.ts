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
  it('preserves full topic names containing the grouping delimiter', () => {
    const result = analyzeDiagnostic([{ discipline: 'Civil', topic: 'Contratos::consumo', difficulty: 'BASICO', isCorrect: false }]);
    expect(result.trail.priorityTopic).toBe('Contratos::consumo');
    expect(result.performances.find(metric => metric.metricType === 'ASSUNTO_E_NIVEL')).toMatchObject({
      discipline: 'Civil', topic: 'Contratos::consumo', difficulty: 'BASICO',
    });
  });

  it('does not merge different discipline/topic tuples that have the same concatenation', () => {
    const result = analyzeDiagnostic([
      { discipline: 'A::B', topic: 'C', difficulty: 'BASICO', isCorrect: false },
      { discipline: 'A', topic: 'B::C', difficulty: 'BASICO', isCorrect: true },
    ]);
    expect(result.trail).toMatchObject({ priorityDiscipline: 'A::B', priorityTopic: 'C', recommendedLevel: 'BASICO' });
    expect(result.performances.filter(metric => metric.metricType === 'ASSUNTO')).toHaveLength(2);
    expect(result.performances.filter(metric => metric.metricType === 'ASSUNTO_E_NIVEL')).toHaveLength(2);
  });
  it.each([[0, 'BASICO'], [49.5, 'BASICO'], [49.99, 'BASICO'], [79.5, 'INTERMEDIARIO'], [79.99, 'INTERMEDIARIO'], [100, 'AVANCADO']] as const)(
    'preserva a faixa contínua para %s%%', (percentage, level) => expect(getLevel(percentage)).toBe(level),
  );

  it('seleciona o assunto mais fraco dentro da disciplina priorizada', () => {
    const result = analyzeDiagnostic([
      ...Array.from({ length: 4 }, (_, i) => ({ discipline: 'Civil', topic: 'Contratos', difficulty: 'BASICO' as const, isCorrect: i === 0 })),
      { discipline: 'Penal', topic: 'Crimes', difficulty: 'BASICO' as const, isCorrect: false },
      ...Array.from({ length: 9 }, () => ({ discipline: 'Penal', topic: 'Penas', difficulty: 'BASICO' as const, isCorrect: true })),
    ]);
    expect(result.weakestDiscipline).toBe('Civil');
    expect(result.weakestTopic).toBe('Contratos');
  });
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
