import { ApiError } from '../errors/api-error';
import { criarQuestaoSchema } from '../schemas/questao-schemas';
import { QuestaoService } from './QuestaoService';
import { fingerprintQuestionContent } from './question-fingerprint';

export const QUESTION_CSV_HEADERS = [
  'enunciado', 'disciplina', 'assunto', 'nivel', 'fundamentacao_juridica',
  'alternativa_a', 'alternativa_b', 'alternativa_c', 'alternativa_d', 'alternativa_e',
  'gabarito', 'publica', 'fonte_nome', 'fonte_referencia', 'licenca_ou_autorizacao',
] as const;

export const QUESTION_CSV_LIMITS = {
  bytes: 2 * 1024 * 1024,
  questions: 200,
  enunciado: 10_000,
  disciplina: 120,
  assunto: 160,
  fundamentacao_juridica: 10_000,
  alternativa: 2_000,
  gabarito: 1,
  publica: 5,
  fonte_nome: 200,
  fonte_referencia: 1_000,
  licenca_ou_autorizacao: 1_000,
} as const;

type CsvRecord = { line: number; cells: string[] };
type RowError = { field: string; message: string };
export type PreviewQuestion = {
  enunciado: string;
  disciplina: string;
  assunto: string;
  nivel: 'BASICO' | 'INTERMEDIARIO' | 'AVANCADO';
  fundamentacao_juridica: string;
  alternativas: { letra: string; texto: string }[];
  gabarito: string;
  publica: true;
  fonte_nome: string;
  fonte_referencia: string;
  licenca_ou_autorizacao: string;
};
export type CsvPreviewRow = {
  line: number;
  status: 'VALID' | 'INVALID' | 'DUPLICATE';
  question?: PreviewQuestion;
  errors: RowError[];
};

export class CsvPreviewError extends ApiError {
  constructor(message: string, statusCode = 422) { super(statusCode, message); }
}

function parseCsv(source: string): CsvRecord[] {
  if (Buffer.byteLength(source, 'utf8') > QUESTION_CSV_LIMITS.bytes) {
    throw new CsvPreviewError('O arquivo CSV excede o limite de 2 MiB.', 413);
  }
  const csv = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  if (!csv.trim()) throw new CsvPreviewError('O arquivo CSV está vazio.');

  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let line = 1;
  let recordLine = 1;
  let quoted = false;
  let closedQuote = false;
  let atCellStart = true;
  let endedWithRecordBreak = false;

  const pushRecord = () => {
    cells.push(cell);
    if (cells.some(value => value.trim() !== '')) records.push({ line: recordLine, cells });
    cells = [];
    cell = '';
    atCellStart = true;
    closedQuote = false;
    recordLine = line + 1;
  };

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else {
        cell += char;
        if (char === '\n') line += 1;
        else if (char === '\r' && csv[index + 1] !== '\n') line += 1;
      }
      endedWithRecordBreak = false;
      continue;
    }

    if (closedQuote && char !== ',' && char !== '\n' && char !== '\r') {
      throw new CsvPreviewError(`CSV malformado: caractere inesperado após aspas na linha ${line}.`);
    }
    if (char === '"') {
      if (!atCellStart) throw new CsvPreviewError(`CSV malformado: aspas fora de um campo citado na linha ${line}.`);
      quoted = true;
      atCellStart = false;
      endedWithRecordBreak = false;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
      atCellStart = true;
      closedQuote = false;
      endedWithRecordBreak = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[index + 1] === '\n') index += 1;
      line += 1;
      pushRecord();
      endedWithRecordBreak = true;
    } else {
      cell += char;
      if (!/\s/.test(char)) atCellStart = false;
      endedWithRecordBreak = false;
    }
  }
  if (quoted) throw new CsvPreviewError(`CSV malformado: campo entre aspas não foi fechado (linha ${recordLine}).`);
  if (!endedWithRecordBreak && (cells.length > 0 || cell.length > 0 || closedQuote)) pushRecord();
  if (records.length === 0) throw new CsvPreviewError('O arquivo CSV não contém cabeçalho ou questões.');
  return records;
}

function fieldErrors(cells: Record<string, string>): RowError[] {
  const errors: RowError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });
  const limits: Record<string, number> = QUESTION_CSV_LIMITS;
  for (const [field, limit] of Object.entries(limits)) {
    if (field === 'bytes' || field === 'questions' || field === 'alternativa') continue;
    const value = field === 'alternativa_a' ? cells.alternativa_a : cells[field];
    if (value !== undefined && value.length > limit) add(field, `Máximo de ${limit} caracteres.`);
  }

  for (const field of ['enunciado', 'disciplina', 'assunto', 'nivel', 'fundamentacao_juridica', 'gabarito', 'publica', 'fonte_nome', 'fonte_referencia', 'licenca_ou_autorizacao']) {
    if (!cells[field]?.trim()) add(field, 'Campo obrigatório.');
  }
  if (cells.enunciado.trim().length > 0 && cells.enunciado.trim().length < 10) add('enunciado', 'O enunciado deve ter pelo menos 10 caracteres.');
  if (cells.nivel && !['BASICO', 'INTERMEDIARIO', 'AVANCADO'].includes(cells.nivel.trim().toUpperCase())) add('nivel', 'Use BASICO, INTERMEDIARIO ou AVANCADO.');
  if (cells.publica && cells.publica.trim().toLowerCase() !== 'true') add('publica', 'Esta etapa aceita somente questões públicas; informe true.');

  const letters = ['A', 'B', 'C', 'D', 'E'];
  const alternatives = letters.map((letter, index) => ({ field: `alternativa_${letter.toLowerCase()}`, text: cells[`alternativa_${letter.toLowerCase()}`]?.trim() ?? '', index }));
  const filled = alternatives.filter(alternative => alternative.text.length > 0);
  if (filled.length < 2) add('alternativa_a', 'Preencha pelo menos duas alternativas.');
  let emptySeen = false;
  for (const alternative of alternatives) {
    if (!alternative.text) emptySeen = true;
    else if (emptySeen) add(alternative.field, 'Não deixe lacunas entre as alternativas.');
    if (alternative.text.length > QUESTION_CSV_LIMITS.alternativa) add(alternative.field, `Máximo de ${QUESTION_CSV_LIMITS.alternativa} caracteres.`);
  }
  const answer = cells.gabarito.trim().toUpperCase();
  if (answer && !letters.includes(answer)) add('gabarito', 'Informe uma letra de A a E.');
  else if (answer && !alternatives[letters.indexOf(answer)]?.text) add('gabarito', 'O gabarito deve apontar para uma alternativa preenchida.');

  if (!errors.length) {
    const common = criarQuestaoSchema.safeParse({
      enunciado: cells.enunciado.trim(), disciplina: cells.disciplina.trim(), assunto: cells.assunto.trim(),
      nivel: cells.nivel.trim().toUpperCase(), fundamentacaoJuridica: cells.fundamentacao_juridica.trim(), publica: true,
      alternativas: filled.map(item => ({ texto: item.text, correta: letters[item.index] === answer })),
    });
    if (!common.success) {
      for (const issue of common.error.issues) add(String(issue.path[0] ?? 'linha'), issue.message);
    } else {
      try {
        QuestaoService.validarAlternativas(common.data.alternativas);
      } catch (error) {
        add('gabarito', error instanceof Error ? error.message : 'Gabarito inválido.');
      }
    }
  }
  return errors;
}

export function questionFingerprint(question: PreviewQuestion): string {
  return fingerprintQuestionContent({
    enunciado: question.enunciado,
    disciplina: question.disciplina,
    assunto: question.assunto,
    nivel: question.nivel,
    alternativas: question.alternativas.map(alternative => ({
      texto: alternative.texto,
      correta: alternative.letra === question.gabarito,
    })),
  });
}

export function previewQuestionCsv(source: string) {
  const records = parseCsv(source);
  const header = records[0].cells.map(cell => cell.trim());
  const headerErrors: string[] = [];
  const seen = new Set<string>();
  for (const name of header) {
    if (seen.has(name)) headerErrors.push(`Cabeçalho duplicado: ${name || '(vazio)'}.`);
    seen.add(name);
    if (name && !(QUESTION_CSV_HEADERS as readonly string[]).includes(name)) headerErrors.push(`Cabeçalho desconhecido: ${name}.`);
  }
  for (const required of QUESTION_CSV_HEADERS) if (!seen.has(required)) headerErrors.push(`Cabeçalho obrigatório ausente: ${required}.`);
  if (headerErrors.length) throw new CsvPreviewError(headerErrors.join(' '));

  const dataRecords = records.slice(1);
  if (dataRecords.length > QUESTION_CSV_LIMITS.questions) throw new CsvPreviewError(`O arquivo excede o limite de ${QUESTION_CSV_LIMITS.questions} questões.`, 413);
  const fingerprints = new Set<string>();
  const rows: CsvPreviewRow[] = dataRecords.map(record => {
    const errors: RowError[] = [];
    if (record.cells.length !== header.length) {
      errors.push({ field: 'linha', message: `Esperadas ${header.length} colunas; encontradas ${record.cells.length}.` });
      return { line: record.line, status: 'INVALID', errors };
    }
    const cells = Object.fromEntries(header.map((name, index) => [name, record.cells[index].trim().normalize('NFC')])) as Record<string, string>;
    errors.push(...fieldErrors(cells));
    if (errors.length) return { line: record.line, status: 'INVALID', errors };

    const letters = ['A', 'B', 'C', 'D', 'E'];
    const alternatives = letters.map((letter, index) => ({ letra: letter, texto: cells[`alternativa_${letter.toLowerCase()}`] })).filter(item => item.texto);
    const question: PreviewQuestion = {
      enunciado: cells.enunciado, disciplina: cells.disciplina, assunto: cells.assunto,
      nivel: cells.nivel.toUpperCase() as PreviewQuestion['nivel'], fundamentacao_juridica: cells.fundamentacao_juridica,
      alternativas: alternatives, gabarito: cells.gabarito.toUpperCase(), publica: true,
      fonte_nome: cells.fonte_nome, fonte_referencia: cells.fonte_referencia, licenca_ou_autorizacao: cells.licenca_ou_autorizacao,
    };
    const digest = questionFingerprint(question);
    if (fingerprints.has(digest)) return { line: record.line, status: 'DUPLICATE', question, errors: [{ field: 'linha', message: 'Conteúdo duplicado de outra questão neste CSV.' }] };
    fingerprints.add(digest);
    return { line: record.line, status: 'VALID', question, errors: [] };
  });
  return {
    totals: {
      total: rows.length,
      valid: rows.filter(row => row.status === 'VALID').length,
      invalid: rows.filter(row => row.status === 'INVALID').length,
      duplicated: rows.filter(row => row.status === 'DUPLICATE').length,
    },
    rows,
  };
}
