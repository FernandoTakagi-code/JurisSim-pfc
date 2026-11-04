import { Response } from 'express';
import { QuestaoService } from '../services/QuestaoService';
import { AuthenticatedRequest } from '../middlewares/auth-middleware';
import { criarQuestaoSchema } from '../schemas/questao-schemas';
import { z } from 'zod';
import { ApiError } from '../errors/api-error';
import { prisma } from '../lib/prisma';
async function enforceQuestionInstitution(req: AuthenticatedRequest, questionId?: string, requestedClassId?: string) {
  if (req.auth?.role !== 'PROFESSOR' || !req.auth.allowedClassIds) return;
  if (requestedClassId && !req.auth.allowedClassIds.includes(requestedClassId)) throw new ApiError(403, 'Turma fora da instituição selecionada.');
  if (questionId) {
    const question = await prisma.questao.findUnique({ where: { id: questionId }, select: { turmaId: true, publica: true } });
    if (question?.turmaId && !req.auth.allowedClassIds.includes(question.turmaId) && (req.method !== 'GET' || !question.publica)) throw new ApiError(404, 'Questão indisponível nesta instituição.');
  }
}
const atualizarQuestaoSchema = criarQuestaoSchema.partial().strict().refine(
  (dados) => Object.keys(dados).length > 0,
  { message: 'Informe ao menos um campo para atualizar.' },
);
const filtrosSchema = z.object({
  disciplina: z.string().optional(), assunto: z.string().optional(),
  nivel: z.enum(['BASICO', 'INTERMEDIARIO', 'AVANCADO']).optional(),
  turmaId: z.string().trim().min(1).optional(), minhas: z.enum(['true', 'false']).optional(),
});

export class QuestaoController {
  static async criar(req: AuthenticatedRequest, res: Response) {
    const parsed = criarQuestaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ erro: parsed.error.format() });
    }
    await enforceQuestionInstitution(req, undefined, parsed.data.turmaId);

    const questao = await QuestaoService.criar({
      ...parsed.data,
      autorId: req.auth!.userId,
    }, req.auth!.userId, req.auth!.role);
    return res.status(201).json(questao);
  }

  static async listar(req: AuthenticatedRequest, res: Response) {
    const { minhas, ...filtros } = filtrosSchema.parse(req.query);
    await enforceQuestionInstitution(req, undefined, filtros.turmaId);

    const questoes = await QuestaoService.listar(
      filtros,
      req.auth!.role,
      req.auth!.userId,
      minhas === 'true',
    );

    return res.status(200).json(req.auth!.role === 'PROFESSOR' && req.auth!.allowedClassIds
      ? questoes.filter(q => q.publica || !q.turmaId || req.auth!.allowedClassIds!.includes(q.turmaId)) : questoes);
  }

  static async buscarPorId(req: AuthenticatedRequest, res: Response) {
    await enforceQuestionInstitution(req, req.params.id as string);
    const questao = await QuestaoService.buscarPorId(req.params.id as string, req.auth!.role, req.auth!.userId);
    return res.status(200).json(questao);
  }

  static async atualizar(req: AuthenticatedRequest, res: Response) {
    const parsed = atualizarQuestaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: parsed.error.format() });
    await enforceQuestionInstitution(req, req.params.id as string, parsed.data.turmaId);
    const questao = await QuestaoService.atualizar(req.params.id as string, parsed.data, req.auth!.userId, req.auth!.role);
    return res.status(200).json(questao);
  }

  static async remover(req: AuthenticatedRequest, res: Response) {
    await enforceQuestionInstitution(req, req.params.id as string);
    await QuestaoService.remover(req.params.id as string, req.auth!.userId, req.auth!.role);
    return res.status(204).send();
  }
}
