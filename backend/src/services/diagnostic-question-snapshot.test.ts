import { describe, expect, it } from 'vitest';
import { createDiagnosticQuestionSnapshot, readDiagnosticQuestionSnapshot } from './diagnostic-question-snapshot';

describe('diagnostic question content snapshots', () => {
  it('preserves question text, the four labeled choices, answer key and rationale', () => {
    const snapshot = createDiagnosticQuestionSnapshot({
      enunciado: 'Enunciado registrado no início da tentativa.', disciplina: 'Direito Civil', assunto: 'Contratos',
      nivel: 'BASICO', fundamentacaoJuridica: 'Fundamentação gravada.',
      alternativas: ['A', 'B', 'C', 'D'].map((letra, index) => ({ id: `option-${letra}`, letra, texto: `Texto ${letra}`, correta: index === 2 })),
    });
    expect(readDiagnosticQuestionSnapshot(snapshot)).toEqual(snapshot);
    expect(snapshot.alternatives.find(option => option.correct)).toMatchObject({ id: 'option-C', letter: 'C' });
  });

  it('treats old or malformed snapshots as unavailable', () => {
    expect(readDiagnosticQuestionSnapshot(null)).toBeNull();
    expect(readDiagnosticQuestionSnapshot({ version: 1, statement: 'incomplete' })).toBeNull();
  });
});
