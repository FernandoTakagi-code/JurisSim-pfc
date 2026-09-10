import type { Request, Response } from 'express';
import { z } from 'zod';
import { DiagnosticService } from '../services/diagnostic-service';

const startSchema = z.object({
  studentId: z.string().uuid(),
  questionCount: z.number().int().min(1).max(80).default(20),
});
const answerSchema = z.object({ selectedOptionId: z.string().uuid() });

export class DiagnosticController {
  constructor(private readonly service = new DiagnosticService()) {}

  start = async (request: Request, response: Response) => {
    const { studentId, questionCount } = startSchema.parse(request.body);
    const attempt = await this.service.start(studentId, questionCount);
    response.status(201).json({ id: attempt.id, totalQuestions: attempt.questoes.length, startedAt: attempt.iniciadoEm });
  };

  getQuestions = async (request: Request, response: Response) => {
    response.json({ questions: await this.service.getQuestions(this.pathParam(request, 'attemptId')) });
  };

  answer = async (request: Request, response: Response) => {
    const { selectedOptionId } = answerSchema.parse(request.body);
    response.json(await this.service.answer(this.pathParam(request, 'attemptId'), this.pathParam(request, 'questionId'), selectedOptionId));
  };

  finalize = async (request: Request, response: Response) => {
    const { attempt, result } = await this.service.finalize(this.pathParam(request, 'attemptId'));
    response.json(this.resultResponse(attempt, result));
  };

  getResult = async (request: Request, response: Response) => {
    const { attempt, result } = await this.service.getResult(this.pathParam(request, 'attemptId'));
    response.json(this.resultResponse(attempt, result));
  };

  getTrail = async (request: Request, response: Response) => {
    response.json({ trail: await this.service.getTrail(this.pathParam(request, 'attemptId')) });
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
