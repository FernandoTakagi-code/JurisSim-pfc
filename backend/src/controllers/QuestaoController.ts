import { Response } from 'express';
import { z } from 'zod';
import { QuestaoService } from '../services/QuestaoService';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

const alternativaSchema = z.object({
  texto: z.string().min(1, 'Texto da alternativa é obrigatório'),
  correta: z.boolean(),
});

const criarQuestaoSchema = z.object({
  enunciado: z.string().min(10, 'Enunciado muito curto'),
  disciplina: z.string().min(1),
  assunto: z.string().min(1),
  nivel: z.enum(['BASICO', 'INTERMEDIARIO', 'AVANCADO']),
  fundamentacaoJuridica: z.string().min(1),
  publica: z.boolean(),
  turmaId: z.string().optional(),
  alternativas: z.array(alternativaSchema).min(2),
});

export class QuestaoController {
  static async criar(req: AuthenticatedRequest, res: Response) {
    const parsed = criarQuestaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ erro: parsed.error.format() });
    }

    try {
      const questao = await QuestaoService.criar({
        ...parsed.data,
        autorId: req.usuario!.id,
      });
      return res.status(201).json(questao);
    } catch (erro: any) {
      return res.status(400).json({ erro: erro.message });
    }
  }

  static async listar(req: AuthenticatedRequest, res: Response) {
    const { disciplina, assunto, nivel, turmaId } = req.query;

    const questoes = await QuestaoService.listar(
      {
        disciplina: disciplina as string | undefined,
        assunto: assunto as string | undefined,
        nivel: nivel as any,
        turmaId: turmaId as string | undefined,
      },
      req.usuario!.role
    );

    return res.status(200).json(questoes);
  }

  static async buscarPorId(req: AuthenticatedRequest, res: Response) {
    try {
      const questao = await QuestaoService.buscarPorId(req.params.id as string, req.usuario!.role);
      return res.status(200).json(questao);
    } catch (erro: any) {
      return res.status(404).json({ erro: erro.message });
    }
  }

  static async atualizar(req: AuthenticatedRequest, res: Response) {
    try {
      const questao = await QuestaoService.atualizar(req.params.id as string, req.body);
      return res.status(200).json(questao);
    } catch (erro: any) {
      return res.status(404).json({ erro: erro.message });
    }
  }

  static async remover(req: AuthenticatedRequest, res: Response) {
    try {
      await QuestaoService.remover(req.params.id as string);
      return res.status(204).send();
    } catch (erro: any) {
      return res.status(404).json({ erro: erro.message });
    }
  }
}