import { Response } from 'express';
import { QuestaoService } from '../services/QuestaoService';
import { AuthenticatedRequest } from '../middlewares/auth-middleware';
import { criarQuestaoSchema } from '../schemas/questao-schemas';
import { z } from 'zod';
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

    const questao = await QuestaoService.criar({
      ...parsed.data,
      autorId: req.auth!.userId,
    }, req.auth!.userId, req.auth!.role);
    return res.status(201).json(questao);
  }

  static async listar(req: AuthenticatedRequest, res: Response) {
    const { minhas, ...filtros } = filtrosSchema.parse(req.query);

    const questoes = await QuestaoService.listar(
      filtros,
      req.auth!.role,
      req.auth!.userId,
      minhas === 'true',
    );

    return res.status(200).json(questoes);
  }

  static async buscarPorId(req: AuthenticatedRequest, res: Response) {
    const questao = await QuestaoService.buscarPorId(req.params.id as string, req.auth!.role, req.auth!.userId);
    return res.status(200).json(questao);
  }

  static async atualizar(req: AuthenticatedRequest, res: Response) {
    const parsed = atualizarQuestaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: parsed.error.format() });
    const questao = await QuestaoService.atualizar(req.params.id as string, parsed.data, req.auth!.userId, req.auth!.role);
    return res.status(200).json(questao);
  }

  static async remover(req: AuthenticatedRequest, res: Response) {
    await QuestaoService.remover(req.params.id as string, req.auth!.userId, req.auth!.role);
    return res.status(204).send();
  }
}
