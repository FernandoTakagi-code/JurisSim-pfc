import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';
import { CsvPreviewError, previewQuestionCsv } from '../services/question-csv-preview';

export function previewQuestionCsvController(request: AuthenticatedRequest, response: Response) {
  if (typeof request.body !== 'string') throw new CsvPreviewError('Envie o arquivo como texto CSV (Content-Type: text/csv).');
  response.json(previewQuestionCsv(request.body));
}
