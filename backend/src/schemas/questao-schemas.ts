import { z } from 'zod';

export const alternativaSchema = z.object({
  texto: z.string().min(1, 'Texto da alternativa é obrigatório'),
  correta: z.boolean(),
});

// Shared by the regular question CRUD and the CSV preview so the common
// question shape keeps one source of truth.
export const criarQuestaoSchema = z.object({
  enunciado: z.string().min(10, 'Enunciado muito curto'),
  disciplina: z.string().min(1),
  assunto: z.string().min(1),
  nivel: z.enum(['BASICO', 'INTERMEDIARIO', 'AVANCADO']),
  fundamentacaoJuridica: z.string().min(1),
  publica: z.boolean(),
  turmaId: z.string().trim().min(1).optional(),
  alternativas: z.array(alternativaSchema).min(2),
});
