import { z } from 'zod';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';
import type { QuestionPracticeService } from '../services/question-practice-service';

const uuid = z.uuid();
const startSchema = z.object({ discipline: z.string().trim().min(1).max(100), topic: z.string().trim().min(1).max(150).nullable().optional(), quantity: z.number().int() }).strict();
const answerSchema = z.object({ alternativeId: z.uuid() }).strict();
const param = (request: AuthenticatedRequest, key: string) => uuid.parse(request.params[key]);

export class QuestionPracticeController {
  constructor(private readonly service: QuestionPracticeService) {}
  topics = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    const discipline = z.string().trim().min(1).max(100).parse(request.params.discipline);
    response.json({ topics: await this.service.topics(decodeURIComponent(discipline)) });
  };
  start = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    const body = startSchema.parse(request.body);
    const result = await this.service.start(request.auth!.userId, body.discipline, body.topic ?? null, body.quantity);
    response.status(result.resumed ? 200 : 201).json({ attempt: result.attempt, resumed: result.resumed });
  };
  get = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ attempt: await this.service.get(request.auth!.userId, param(request, 'attemptId')) });
  };
  answer = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    const body = answerSchema.parse(request.body);
    response.json(await this.service.answer(request.auth!.userId, param(request, 'attemptId'), param(request, 'questionId'), body.alternativeId));
  };
  finalize = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ result: await this.service.finalize(request.auth!.userId, param(request, 'attemptId')) });
  };
  result = async (request: AuthenticatedRequest, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ result: await this.service.getResult(request.auth!.userId, param(request, 'attemptId')) });
  };
}
