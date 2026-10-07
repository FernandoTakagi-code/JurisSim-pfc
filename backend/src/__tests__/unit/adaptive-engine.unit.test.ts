import { describe, expect, it } from 'vitest';
import { analyzeDiagnostic, buildTrailFilters, getLevel } from '../../services/adaptive-engine';
import type { AnsweredQuestion, Level } from '../../types/diagnostic';

// Gera respostas de uma disciplina/assunto com uma quantidade exata de acertos.
function respostas(disciplina: string, assunto: string, acertos: number, total: number, nivel: Level = 'BASICO'): AnsweredQuestion[] {
  return Array.from({ length: total }, (_, i) => ({ discipline: disciplina, topic: assunto, difficulty: nivel, isCorrect: i < acertos }));
}

describe('getLevel() - fronteiras de classificação', () => {
  it.each([
    [0, 'BASICO'],
    [49, 'BASICO'],
    [50, 'INTERMEDIARIO'],
    [79, 'INTERMEDIARIO'],
    [80, 'AVANCADO'],
    [100, 'AVANCADO'],
  ] as const)('deveClassificar %s%% como %s', (percentual, nivelEsperado) => {
    // Act + Assert
    expect(getLevel(percentual)).toBe(nivelEsperado);
  });
});

describe('analyzeDiagnostic() - motor de recomendação', () => {
  it('deveRecomendarADisciplinaEOAssuntoComMenorTaxaDeAcerto', () => {
    // Arrange
    const diagnostico = [
      ...respostas('Direito Civil', 'Contratos', 1, 4),
      ...respostas('Direito Penal', 'Crimes contra a vida', 4, 4),
    ];

    // Act
    const resultado = analyzeDiagnostic(diagnostico);

    // Assert
    expect(resultado.overallPercentage).toBe(62.5);
    expect(resultado.level).toBe('INTERMEDIARIO');
    expect(resultado.trail.priorityDiscipline).toBe('Direito Civil');
    expect(resultado.trail.priorityTopic).toBe('Contratos');
    expect(resultado.trail.recommendedLevel).toBe('BASICO');
    expect(resultado.trail.recommendedQuantity).toBe(15);
  });

  it('deveLancarErroQuandoODiagnosticoNaoTemRespostas', () => {
    // Act + Assert
    expect(() => analyzeDiagnostic([])).toThrow(Error);
    expect(() => analyzeDiagnostic([])).toThrow('Nao e possivel analisar um diagnostico sem respostas.');
  });

  it('deveDesempatarDisciplinasComMesmoDesempenhoPelaOrdemAlfabetica', () => {
    // Arrange - caso-limite: duas disciplinas com exatamente o mesmo percentual
    const diagnostico = [
      ...respostas('Direito Penal', 'Penas', 1, 2),
      ...respostas('Direito Administrativo', 'Licitações', 1, 2),
    ];

    // Act
    const resultado = analyzeDiagnostic(diagnostico);

    // Assert
    expect(resultado.trail.priorityDiscipline).toBe('Direito Administrativo');
  });

  it.each([
    [2, 10, 'BASICO', 15],
    [7, 10, 'INTERMEDIARIO', 10],
    [9, 10, 'AVANCADO', 5],
  ] as const)('deveRecomendarQuantidadeConformeNivel (%s de %s acertos -> %s, %s questões)', (acertos, total, nivel, quantidade) => {
    // Arrange
    const diagnostico = respostas('Direito Constitucional', 'Controle de constitucionalidade', acertos, total);

    // Act
    const resultado = analyzeDiagnostic(diagnostico);

    // Assert
    expect(resultado.trail.recommendedLevel).toBe(nivel);
    expect(resultado.trail.recommendedQuantity).toBe(quantidade);
  });
});

describe('buildTrailFilters()', () => {
  it('deveMontarFiltrosDoMaisEspecificoParaOMaisAmploQuandoHaAssunto', () => {
    // Act
    const filtros = buildTrailFilters('Direito Civil', 'Contratos', 'BASICO');

    // Assert
    expect(filtros).toEqual([
      { disciplina: 'Direito Civil', assunto: 'Contratos', nivel: 'BASICO' },
      { disciplina: 'Direito Civil', assunto: 'Contratos', nivel: null },
      { disciplina: 'Direito Civil', assunto: null, nivel: 'BASICO' },
      { disciplina: 'Direito Civil', assunto: null, nivel: null },
    ]);
  });

  it('deveMontarApenasFiltrosPorDisciplinaQuandoNaoHaAssunto', () => {
    // Act
    const filtros = buildTrailFilters('Direito Civil', null, 'AVANCADO');

    // Assert
    expect(filtros).toEqual([
      { disciplina: 'Direito Civil', assunto: null, nivel: 'AVANCADO' },
      { disciplina: 'Direito Civil', assunto: null, nivel: null },
    ]);
  });
});