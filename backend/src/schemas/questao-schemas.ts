import { z } from 'zod';
import { questionAlternativesError } from '../question-alternatives';

export const alternativaSchema = z.object({
  texto: z.string().trim().min(1, 'Texto da alternativa é obrigatório'),
  correta: z.boolean(),
});

// Shared by the regular question CRUD and the CSV preview so the common
// question shape keeps one source of truth.
export const criarQuestaoSchema = z.object({
  enunciado: z.string().trim().min(10, 'Enunciado muito curto'),
  disciplina: z.string().trim().min(1),
  assunto: z.string().trim().min(1),
  nivel: z.enum(['BASICO', 'INTERMEDIARIO', 'AVANCADO']),
  fundamentacaoJuridica: z.string().trim().min(1),
  publica: z.boolean(),
  turmaId: z.string().trim().min(1).optional(),
  alternativas: z.array(alternativaSchema).superRefine((alternatives, context) => {
    const error = questionAlternativesError(alternatives);
    if (error) context.addIssue({ code: 'custom', message: error });
  }),
});
