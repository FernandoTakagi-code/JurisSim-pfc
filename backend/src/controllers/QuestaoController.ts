import { Response } from 'express';
import { z } from 'zod';
import { QuestaoService } from '../services/QuestaoService';
import { AuthenticatedRequest } from '../middlewares/auth-middleware';

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
const atualizarQuestaoSchema = criarQuestaoSchema.partial().strict().refine(
  (dados) => Object.keys(dados).length > 0,
  { message: 'Informe ao menos um campo para atualizar.' },
);

export class QuestaoController {
  static async criar(req: AuthenticatedRequest, res: Response) {
    const parsed = criarQuestaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ erro: parsed.error.format() });
    }

    const questao = await QuestaoService.criar({
      ...parsed.data,
      autorId: req.auth!.userId,
    }, req.auth!.userId);
    return res.status(201).json(questao);
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
      req.auth!.role
    );

    return res.status(200).json(questoes);
  }

  static async buscarPorId(req: AuthenticatedRequest, res: Response) {
    const questao = await QuestaoService.buscarPorId(req.params.id as string, req.auth!.role);
    return res.status(200).json(questao);
  }

  static async atualizar(req: AuthenticatedRequest, res: Response) {
    const parsed = atualizarQuestaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: parsed.error.format() });
    const questao = await QuestaoService.atualizar(req.params.id as string, parsed.data, req.auth!.userId);
    return res.status(200).json(questao);
  }

  static async remover(req: AuthenticatedRequest, res: Response) {
    await QuestaoService.remover(req.params.id as string, req.auth!.userId);
    return res.status(204).send();
  }
}
