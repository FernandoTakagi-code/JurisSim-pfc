import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';
import {
  InitialDiagnosticServiceUnavailableError,
  type InitialDiagnosticService,
} from '../services/initial-diagnostic-service';
import type { InitialDiagnosticResolutionService } from '../services/initial-diagnostic-resolution-service';
import { z } from 'zod';

type InitialDiagnosticApplication = Pick<InitialDiagnosticService, 'getOrCreate'>;
type InitialDiagnosticResolutionApplication = Pick<InitialDiagnosticResolutionService,
  'getQuestions' | 'getAnswers' | 'saveAnswer' | 'finalize' | 'getResult'>;
const uuidSchema = z.uuid();
const answerSchema = z.object({ selectedOptionId: z.uuid() }).strict();

export class InitialDiagnosticController {
  constructor(
    private readonly service: InitialDiagnosticApplication,
    private readonly resolution: InitialDiagnosticResolutionApplication,
  ) {}

  startOrRecover = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');

    try {
      // The student identity comes only from the authenticated session. Body,
      // query string and path values are deliberately ignored.
      const result = await this.service.getOrCreate(request.auth!.userId);

      if (result.status === 'INSUFFICIENT') {
        response.status(409).json({
          code: 'INITIAL_DIAGNOSTIC_INSUFFICIENT_QUESTION_BANK',
          shortages: result.shortages,
        });
        return;
      }

      response.status(result.created ? 201 : 200).json({
        attemptId: result.attempt.id,
        status: result.status,
        created: result.created,
      });
    } catch (error) {
      if (error instanceof InitialDiagnosticServiceUnavailableError) {
        response.status(503).json({ code: 'INITIAL_DIAGNOSTIC_UNAVAILABLE' });
        return;
      }

      // Do not leak Prisma errors, candidate content or internal diagnostics.
      response.status(500).json({ code: 'INITIAL_DIAGNOSTIC_FAILED' });
    }
  };

  getQuestions = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ questions: await this.resolution.getQuestions(request.auth!.userId, this.pathParam(request, 'attemptId')) });
  };

  getAnswers = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json(await this.resolution.getAnswers(request.auth!.userId, this.pathParam(request, 'attemptId')));
  };

  saveAnswer = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    const { selectedOptionId } = answerSchema.parse(request.body);
    response.json(await this.resolution.saveAnswer(
      request.auth!.userId,
      this.pathParam(request, 'attemptId'),
      this.pathParam(request, 'questionId'),
      selectedOptionId,
    ));
  };

  finalize = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json(await this.resolution.finalize(request.auth!.userId, this.pathParam(request, 'attemptId')));
  };

  getResult = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json(await this.resolution.getResult(request.auth!.userId, this.pathParam(request, 'attemptId')));
  };

  private pathParam(request: AuthenticatedRequest, name: string): string {
    return uuidSchema.parse(request.params[name]);
  }
}
