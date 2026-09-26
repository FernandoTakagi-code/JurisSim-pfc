import type { Request, Response } from 'express';
import { z } from 'zod';
import { TrailService } from '../services/trail-service';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';

const answerSchema = z.object({ selectedOptionId: z.string().uuid() });

export class TrailController {
  constructor(private readonly service = new TrailService()) {}

  generate = async (request: AuthenticatedRequest, response: Response) => {
    const attempt = await this.service.generate(this.pathParam(request, 'trilhaId'), request.auth!.userId);
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
    response.json(await this.service.finalize(this.pathParam(request, 'attemptId'), request.auth!.userId));
  };

  private pathParam(request: Request, name: string): string {
    return z.string().uuid().parse(request.params[name]);
  }
}
