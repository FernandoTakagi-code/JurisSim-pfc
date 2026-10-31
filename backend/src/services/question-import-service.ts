import { ApiError } from '../errors/api-error';
import { QuestionImportRepository, type QuestionImportRecord } from '../repositories/question-import-repository';
import { previewQuestionCsv, questionFingerprint } from './question-csv-preview';

export interface QuestionImportAdminAuthorizer {
  assertAdmin(administratorId: string): Promise<void>;
}

export class QuestionImportService {
  constructor(
    private readonly repository: QuestionImportRepository,
    private readonly authorizer: QuestionImportAdminAuthorizer,
  ) {}

  async confirm(csv: string, administratorId: string) {
    // The identifier must come from the authenticated server session, never a CSV/body role.
    await this.authorizer.assertAdmin(administratorId);
    const preview = previewQuestionCsv(csv);
    const rejected = preview.rows.filter(row => row.status !== 'VALID');
    if (rejected.length) {
      const details = rejected.map(row => `linha ${row.line}: ${row.status === 'DUPLICATE' ? 'duplicada' : row.errors.map(error => error.field).join(', ')}`).join('; ');
      throw new ApiError(422, `Lote recusado sem gravação. Corrija ou remova os registros indicados antes de confirmar: ${details}.`);
    }
    if (!preview.rows.length) throw new ApiError(422, 'O lote não contém questões válidas para importar.');

    const records: QuestionImportRecord[] = preview.rows.map(row => {
      const question = row.question!;
      return {
        fingerprint: questionFingerprint(question),
        enunciado: question.enunciado,
        disciplina: question.disciplina,
        assunto: question.assunto,
        nivel: question.nivel,
        fundamentacaoJuridica: question.fundamentacao_juridica,
        publica: true,
        fonteNome: question.fonte_nome,
        fonteReferencia: question.fonte_referencia,
        licencaOuAutorizacao: question.licenca_ou_autorizacao,
        alternativas: question.alternativas.map(alternative => ({ texto: alternative.texto, correta: alternative.letra === question.gabarito })),
        line: row.line,
      };
    });

    // Recheck current role immediately before the transaction as well as at confirmation entry.
    await this.authorizer.assertAdmin(administratorId);
    return this.repository.persistAtomically(administratorId, csv, records);
  }
}
