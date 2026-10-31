import { z } from 'zod';

const snapshotSchema = z.object({
  version: z.literal(1),
  statement: z.string(),
  discipline: z.string(),
  topic: z.string(),
  difficulty: z.string(),
  explanation: z.string(),
  alternatives: z.array(z.object({
    id: z.string(),
    letter: z.enum(['A', 'B', 'C', 'D']).nullable(),
    text: z.string(),
    correct: z.boolean(),
}).strict()).length(4),
}).strict().refine(snapshot => {
  const letters = snapshot.alternatives.map(alternative => alternative.letter);
  return new Set(letters).size === 4 && ['A', 'B', 'C', 'D'].every(letter => letters.includes(letter as 'A' | 'B' | 'C' | 'D'))
    && snapshot.alternatives.filter(alternative => alternative.correct).length === 1;
});

export type DiagnosticQuestionSnapshot = z.infer<typeof snapshotSchema>;

export function createDiagnosticQuestionSnapshot(question: {
  enunciado: string;
  disciplina: string;
  assunto: string;
  nivel: string;
  fundamentacaoJuridica: string;
  alternativas: readonly { id: string; letra: string | null; texto: string; correta: boolean }[];
}): DiagnosticQuestionSnapshot {
  const alternatives = question.alternativas.map(alternative => ({
    id: alternative.id,
    letter: alternative.letra && ['A', 'B', 'C', 'D'].includes(alternative.letra) ? alternative.letra as 'A' | 'B' | 'C' | 'D' : null,
    text: alternative.texto,
    correct: alternative.correta,
  }));
  return snapshotSchema.parse({
    version: 1,
    statement: question.enunciado,
    discipline: question.disciplina,
    topic: question.assunto,
    difficulty: question.nivel,
    explanation: question.fundamentacaoJuridica,
    alternatives,
  });
}

export function readDiagnosticQuestionSnapshot(value: unknown): DiagnosticQuestionSnapshot | null {
  const result = snapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}
