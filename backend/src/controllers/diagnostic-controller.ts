import type { Request, Response } from 'express';
import { z } from 'zod';
import { DiagnosticService } from '../services/diagnostic-service';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';

const startSchema = z.object({
  questionCount: z.number().int().min(1).max(80).default(20),
});
const answerSchema = z.object({ selectedOptionId: z.string().uuid() });

export class DiagnosticController {
  constructor(private readonly service = new DiagnosticService()) {}

  start = async (request: AuthenticatedRequest, response: Response) => {
    const { questionCount } = startSchema.parse(request.body);
    const attempt = await this.service.start(request.auth!.userId, questionCount);
    response.status(201).json({ id: attempt.id, totalQuestions: attempt.questoes.length, startedAt: attempt.iniciadoEm });
  };

  getQuestions = async (request: AuthenticatedRequest, response: Response) => {
    response.json({ questions: await this.service.getQuestions(this.pathParam(request, 'attemptId'), request.auth!.userId) });
  };

  answer = async (request: AuthenticatedRequest, response: Response) => {
    const { selectedOptionId } = answerSchema.parse(request.body);
    response.json(await this.service.answer(this.pathParam(request, 'attemptId'), request.auth!.userId, this.pathParam(request, 'questionId'), selectedOptionId));
  };

  finalize = async (request: AuthenticatedRequest, response: Response) => {
    const { attempt, result } = await this.service.finalize(this.pathParam(request, 'attemptId'), request.auth!.userId);
    response.json(this.resultResponse(attempt, result));
  };

  getResult = async (request: AuthenticatedRequest, response: Response) => {
    const { attempt, result } = await this.service.getResult(this.pathParam(request, 'attemptId'), request.auth!.userId);
    response.json(this.resultResponse(attempt, result));
  };

  getTrail = async (request: AuthenticatedRequest, response: Response) => {
    response.json({ trail: await this.service.getTrail(this.pathParam(request, 'attemptId'), request.auth!.userId) });
  };

  private resultResponse(attempt: { id: string; finalizadoEm: Date | null; desempenhosDiagnostico: unknown[]; trilhaAdaptativa: unknown }, result: { correctAnswers: number; totalQuestions: number; overallPercentage: number; level: string; weakestDiscipline: string; weakestTopic: string | null; recommendation: string }) {
    return {
      id: attempt.id, finalizedAt: attempt.finalizadoEm,
      correctAnswers: result.correctAnswers, totalQuestions: result.totalQuestions,
      overallPercentage: result.overallPercentage, level: result.level,
      weakestDiscipline: result.weakestDiscipline, weakestTopic: result.weakestTopic,
      recommendation: result.recommendation, performances: attempt.desempenhosDiagnostico,
      trail: attempt.trilhaAdaptativa,
    };
  }

  private pathParam(request: Request, name: string): string {
    return z.string().uuid().parse(request.params[name]);
  }
}
