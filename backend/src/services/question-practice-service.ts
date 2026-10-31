import { ApiError } from '../errors/api-error';
import { analyzeDiagnostic } from './adaptive-engine';
import type { Level } from '../types/diagnostic';

export const PRACTICE_DISCIPLINES = [
  'Direito Constitucional', 'Direito Civil', 'Direito Penal',
  'Direito Administrativo', 'Direito do Trabalho',
] as const;
export const PRACTICE_QUANTITIES = [5, 10, 20] as const;

export type PracticeQuestion = {
  id: string; discipline: string; topic: string; level: string; statement: string;
  alternatives: { id: string; letter: string; text: string; correct: boolean }[];
  explanation: string;
};
export type PracticeAttempt = {
  id: string; state: 'IN_PROGRESS' | 'COMPLETED'; discipline: string;
  topic?: string | null;
  performances?: { discipline: string; topic: string; correct: number; total: number }[];
  questions: { position: number; question: PracticeQuestion; selectedOptionId: string | null }[];
};
export type PracticeResult = {
  total: number; correct: number; incorrect: number; percentage: number;
  consistency: number | null; recommendation: string;
  answers: {
    questionId: string; statement: string; discipline: string; selectedOptionId: string | null;
    correctOptionId: string | null; correct: boolean; explanation: string;
    alternatives: { id: string; letter: string; text: string }[];
  }[];
};
export type PracticeAnswerFeedback = { correct: boolean; explanation: string; selectedOptionId: string; answeredCount: number; totalQuestions: number; consistency: number | null; recommendation: string };
export interface QuestionPracticeRepository {
  findAttempt(studentId: string, attemptId: string): Promise<PracticeAttempt | null>;
  findActiveAttempt(studentId: string, discipline: string, topic?: string | null): Promise<PracticeAttempt | null>;
  listEligibleQuestions(discipline: string, topic?: string | null): Promise<PracticeQuestion[]>;
  listAnsweredQuestionIds(studentId: string, discipline: string, topic?: string | null): Promise<ReadonlySet<string>>;
  createAttempt(studentId: string, discipline: string, topic: string | null, questions: PracticeQuestion[]): Promise<PracticeAttempt>;
  saveAnswer(studentId: string, attemptId: string, questionId: string, alternativeId: string): Promise<{ correct: boolean; explanation: string; selectedOptionId: string; answeredCount: number; totalQuestions: number; consistency: number | null; recommendation: string }>;
  finalize(studentId: string, attemptId: string): Promise<PracticeAttempt>;
  updateLevel(studentId: string, level: Level): Promise<void>;
}

export class QuestionPracticeService {
  constructor(
    private readonly repository: QuestionPracticeRepository,
    private readonly random: () => number = Math.random,
  ) {}

  async topics(discipline: string) {
    if (!PRACTICE_DISCIPLINES.includes(discipline as typeof PRACTICE_DISCIPLINES[number])) throw new ApiError(422, 'Selecione uma disciplina válida.');
    return [...new Set((await this.repository.listEligibleQuestions(discipline)).map(question => question.topic))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  async start(studentId: string, discipline: string, topic: string | null, quantity: number) {
    if (!PRACTICE_DISCIPLINES.includes(discipline as typeof PRACTICE_DISCIPLINES[number])) {
      throw new ApiError(422, 'Selecione uma disciplina válida.');
    }
    if (!PRACTICE_QUANTITIES.includes(quantity as typeof PRACTICE_QUANTITIES[number])) {
      throw new ApiError(422, 'Selecione 5, 10 ou 20 questões.');
    }
    const active = await this.repository.findActiveAttempt(studentId, discipline, topic);
    if (active) return { attempt: this.publicAttempt(active), resumed: true };

    const pool = await this.repository.listEligibleQuestions(discipline, topic);
    const answered = await this.repository.listAnsweredQuestionIds(studentId, discipline, topic);
    const unseen = pool.filter(question => !answered.has(question.id));
    if (unseen.length < quantity) {
      throw new ApiError(409, 'Ainda não há questões elegíveis e inéditas suficientes para esta prática.',);
    }
    const selected = [...unseen];
    for (let index = selected.length - 1; index > 0; index--) {
      const swapIndex = Math.min(index, Math.max(0, Math.floor(this.random() * (index + 1))));
      [selected[index], selected[swapIndex]] = [selected[swapIndex], selected[index]];
    }
    return { attempt: this.publicAttempt(await this.repository.createAttempt(studentId, discipline, topic, selected.slice(0, quantity))), resumed: false };
  }

  async get(studentId: string, attemptId: string) {
    return this.publicAttempt(await this.requireAttempt(studentId, attemptId));
  }

  async answer(studentId: string, attemptId: string, questionId: string, alternativeId: string) {
    const attempt = await this.requireAttempt(studentId, attemptId);
    if (attempt.state !== 'IN_PROGRESS') throw new ApiError(409, 'Esta prática já foi finalizada.');
    const item = attempt.questions.find(row => row.question.id === questionId);
    if (!item) throw new ApiError(404, 'A questão não pertence a esta prática.');
    if (!item.question.alternatives.some(option => option.id === alternativeId)) {
      throw new ApiError(422, 'A alternativa informada não pertence à questão.');
    }
    const feedback = await this.repository.saveAnswer(studentId, attemptId, questionId, alternativeId);
    return { saved: true, ...feedback };
  }

  async finalize(studentId: string, attemptId: string) {
    const attempt = await this.requireAttempt(studentId, attemptId);
    if (attempt.state === 'COMPLETED') return this.result(attempt);
    if (attempt.questions.some(question => !question.selectedOptionId)) {
      throw new ApiError(409, 'Responda todas as questões antes de finalizar a prática.');
    }
    const completed = await this.repository.finalize(studentId, attemptId);
    const analysis = analyzeDiagnostic(completed.questions.map(({ question, selectedOptionId }) => ({
      discipline: question.discipline, topic: question.topic, difficulty: question.level as Level,
      isCorrect: Boolean(question.alternatives.find(option => option.id === selectedOptionId)?.correct),
    })));
    await this.repository.updateLevel(studentId, analysis.level);
    return this.result(completed);
  }

  async getResult(studentId: string, attemptId: string) {
    const attempt = await this.requireAttempt(studentId, attemptId);
    if (attempt.state !== 'COMPLETED') throw new ApiError(409, 'Finalize a prática antes de consultar o resultado.');
    return this.result(attempt);
  }

  private async requireAttempt(studentId: string, attemptId: string) {
    const attempt = await this.repository.findAttempt(studentId, attemptId);
    if (!attempt) throw new ApiError(404, 'Prática não encontrada.');
    return attempt;
  }

  private publicAttempt(attempt: PracticeAttempt) {
    const completed = attempt.state === 'COMPLETED';
    return {
      id: attempt.id, state: attempt.state, discipline: attempt.discipline, topic: attempt.topic ?? null,
      questions: attempt.questions.map(({ position, question, selectedOptionId }) => ({
        id: question.id, position, statement: question.statement, discipline: question.discipline,
        topic: question.topic, level: question.level, selectedOptionId,
        alternatives: question.alternatives.map(({ id, letter, text }) => ({ id, letter, text })),
        ...(completed ? { explanation: question.explanation } : {}),
      })),
    };
  }

  private result(attempt: PracticeAttempt): PracticeResult {
    const answers = attempt.questions.map(({ question, selectedOptionId }) => {
      const selected = question.alternatives.find(option => option.id === selectedOptionId);
      const correctOption = question.alternatives.find(option => option.correct);
      const correct = Boolean(selected?.correct);
      return {
        questionId: question.id, statement: question.statement, discipline: question.discipline,
        selectedOptionId, correctOptionId: correctOption?.id ?? null, correct,
        explanation: question.explanation,
        alternatives: question.alternatives.map(({ id, letter, text }) => ({ id, letter, text })),
      };
    });
    const correct = answers.filter(answer => answer.correct).length;
    const groups = new Map<string, { discipline: string; topic: string; correct: number; total: number }>();
    for (const answer of answers) {
      const question = attempt.questions.find(item => item.question.id === answer.questionId)!.question;
      const key = `${question.discipline}\u0000${question.topic}`;
      const group = groups.get(key) ?? { discipline: question.discipline, topic: question.topic, correct: 0, total: 0 };
      group.total++; if (answer.correct) group.correct++;
      groups.set(key, group);
    }
    const weakest = [...groups.values()].sort((a, b) => a.correct / a.total - b.correct / b.total)[0];
    return { total: answers.length, correct, incorrect: answers.length - correct, percentage: answers.length ? Math.round(correct / answers.length * 100) : 0,
      answers, consistency: answers.length < 3 ? null : Number((100 * Math.max(correct, answers.length - correct) / answers.length).toFixed(2)),
      recommendation: weakest ? `Próximo foco: ${weakest.topic} (${weakest.discipline}), com ${Number(100 * weakest.correct / weakest.total).toFixed(2)}% de acerto nesta prática.` : 'Responda mais questões para receber uma recomendação.' };
  }
}
