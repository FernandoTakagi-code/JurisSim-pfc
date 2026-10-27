import { describe, expect, it } from 'vitest';
import { QUESTION_CSV_HEADERS, QUESTION_CSV_LIMITS, previewQuestionCsv } from './question-csv-preview';

const validRow = [
  '"Uma pergunta original com vírgula, e detalhes."', 'Direito Civil', 'Contratos', 'BASICO',
  'Explicação didática original.', 'Alternativa A', 'Alternativa B', '', '', '', 'A', 'true',
  'JurisSim', 'Material autoral de demonstração', 'Autorização declarada para uso de demonstração',
].join(',');
const validValues = [
  'Uma pergunta original com vírgula, e detalhes.', 'Direito Civil', 'Contratos', 'BASICO',
  'Explicação didática original.', 'Alternativa A', 'Alternativa B', '', '', '', 'A', 'true',
  'JurisSim', 'Material autoral de demonstração', 'Autorização declarada para uso de demonstração',
];
const encodeRow = (values: string[]) => values.map(value => `"${value.replace(/"/g, '""')}"`).join(',');
const csv = (row = validRow, header = QUESTION_CSV_HEADERS.join(',')) => `${header}\r\n${row}`;

describe('pré-validação CSV de questões', () => {
  it('aceita CSV válido com BOM, campos entre aspas, vírgulas e quebras de linha', () => {
    const row = validRow.replace('detalhes.', 'detalhes.\nContinuação do enunciado.');
    const result = previewQuestionCsv(`\uFEFF${csv(row)}`);
    expect(result.totals).toEqual({ total: 1, valid: 1, invalid: 0, duplicated: 0 });
    expect(result.rows[0].question?.enunciado).toContain('\nContinuação');
  });

  it('aponta campos e rejeita nível, gabarito, visibilidade e origem ausentes ou inválidos', () => {
    const values = [...validValues];
    values[3] = 'EXPERT'; values[10] = 'E'; values[11] = 'false'; values[12] = '';
    const row = previewQuestionCsv(csv(encodeRow(values))).rows[0];
    expect(row.status).toBe('INVALID');
    expect(row.errors.map(error => error.field)).toEqual(expect.arrayContaining(['nivel', 'gabarito', 'publica', 'fonte_nome']));
  });

  it('classifica repetição determinística dentro do próprio arquivo', () => {
    const normalizedDuplicate = [...validValues];
    normalizedDuplicate[0] = '  UMA   pergunta original com vírgula, e detalhes.  ';
    const result = previewQuestionCsv(`${QUESTION_CSV_HEADERS.join(',')}\n${encodeRow(validValues)}\n${encodeRow(normalizedDuplicate)}`);
    expect(result.totals).toEqual({ total: 2, valid: 1, invalid: 0, duplicated: 1 });
    expect(result.rows[1].status).toBe('DUPLICATE');
  });

  it('detecta lacunas, alternativas insuficientes e cabeçalho duplicado, ausente ou desconhecido', () => {
    const gappedValues = [...validValues];
    gappedValues[8] = 'Alternativa D';
    const gapped = encodeRow(gappedValues);
    expect(previewQuestionCsv(csv(gapped)).rows[0].errors.some(error => error.field === 'alternativa_d')).toBe(true);
    const tooFewValues = [...validValues];
    tooFewValues[6] = '';
    const tooFew = encodeRow(tooFewValues);
    expect(previewQuestionCsv(csv(tooFew)).rows[0].errors.some(error => error.field.startsWith('alternativa_'))).toBe(true);
    const duplicateHeader = [...QUESTION_CSV_HEADERS.slice(0, 1), 'enunciado', ...QUESTION_CSV_HEADERS.slice(2)].join(',');
    expect(() => previewQuestionCsv(csv(validRow, duplicateHeader))).toThrow(/duplicado/i);
    expect(() => previewQuestionCsv(csv(validRow, QUESTION_CSV_HEADERS.slice(1).join(',')))).toThrow(/ausente/i);
    expect(() => previewQuestionCsv(csv(validRow, [...QUESTION_CSV_HEADERS, 'campo_extra'].join(',')))).toThrow(/desconhecido/i);
  });

  it('rejeita CSV vazio, aspas malformadas e limites de bytes/questões', () => {
    expect(() => previewQuestionCsv('  ')).toThrow(/vazio/i);
    expect(() => previewQuestionCsv(`${QUESTION_CSV_HEADERS.join(',')}\n"aberto`)).toThrow(/malformado/i);
    expect(() => previewQuestionCsv('x'.repeat(QUESTION_CSV_LIMITS.bytes + 1))).toThrow(/2 MiB/i);
    const tooMany = `${QUESTION_CSV_HEADERS.join(',')}\n${Array(QUESTION_CSV_LIMITS.questions + 1).fill(validRow).join('\n')}`;
    expect(() => previewQuestionCsv(tooMany)).toThrow(/limite de 200/i);
  });

  it('rejeita comprimento excessivo por campo e coluna inesperada por registro', () => {
    const tooLong = validRow.replace('Direito Civil', 'x'.repeat(QUESTION_CSV_LIMITS.disciplina + 1));
    expect(previewQuestionCsv(csv(tooLong)).rows[0].errors.some(error => error.field === 'disciplina')).toBe(true);
    expect(previewQuestionCsv(csv(`${validRow},extra`)).rows[0].errors[0].field).toBe('linha');
  });
});
