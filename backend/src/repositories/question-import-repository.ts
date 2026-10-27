import { createHash } from 'node:crypto';
import { ApiError } from '../errors/api-error';

export type QuestionImportRecord = {
  fingerprint: string;
  enunciado: string;
  disciplina: string;
  assunto: string;
  nivel: 'BASICO' | 'INTERMEDIARIO' | 'AVANCADO';
  fundamentacaoJuridica: string;
  publica: true;
  fonteNome: string;
  fonteReferencia: string;
  licencaOuAutorizacao: string;
  alternativas: { texto: string; correta: boolean }[];
  line: number;
};

export type QuestionImportBatch = {
  id: string;
  administradorId: string;
  importadoEm: Date;
  arquivoHash: string;
  totalQuestoes: number;
};

export interface QuestionImportTransaction {
  findExistingFingerprints(fingerprints: string[]): Promise<Set<string>>;
  createBatch(data: Omit<QuestionImportBatch, 'id'>): Promise<QuestionImportBatch>;
  createQuestionWithAlternatives(data: Omit<QuestionImportRecord, 'line'> & { autorId: string; loteImportacaoId: string }): Promise<{ id: string }>;
}

export interface QuestionImportDatabase {
  transaction<T>(
    operation: (transaction: QuestionImportTransaction) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<T>;
}

export class QuestionImportDuplicateError extends ApiError {
  constructor(readonly lines: number[]) {
    super(409, `O lote contém questões já cadastradas nas linhas: ${lines.join(', ')}.`);
    this.name = 'QuestionImportDuplicateError';
  }
}

export class QuestionImportRepository {
  constructor(private readonly database: QuestionImportDatabase) {}

  async persistAtomically(administratorId: string, csv: string, records: QuestionImportRecord[]) {
    const archiveHash = createHash('sha256').update(csv, 'utf8').digest('hex');
    try {
      return await this.database.transaction(async transaction => {
        const existing = await transaction.findExistingFingerprints(records.map(record => record.fingerprint));
        const duplicateLines = records.filter(record => existing.has(record.fingerprint)).map(record => record.line);
        if (duplicateLines.length) throw new QuestionImportDuplicateError(duplicateLines);

        const batch = await transaction.createBatch({
          administradorId: administratorId,
          importadoEm: new Date(),
          arquivoHash: archiveHash,
          totalQuestoes: records.length,
        });
        const created: { id: string; line: number }[] = [];
        for (const record of records) {
          const { line, ...question } = record;
          const saved = await transaction.createQuestionWithAlternatives({
            ...question,
            autorId: administratorId,
            loteImportacaoId: batch.id,
          });
          created.push({ id: saved.id, line });
        }
        return { batchId: batch.id, imported: created.length, questions: created };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error instanceof QuestionImportDuplicateError) throw error;
      const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
      if (code === 'P2002' || code === 'P2034') {
        throw new ApiError(409, 'Uma questão do lote já foi importada em paralelo. Nenhum registro deste lote foi salvo.');
      }
      throw error;
    }
  }
}
