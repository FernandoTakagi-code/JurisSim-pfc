import { ApiError } from '../errors/api-error';
import { PRACTICE_DISCIPLINES } from './question-practice-service';
import type { DiagnosticQuestionSnapshot } from './diagnostic-question-snapshot';

export const INDIVIDUAL_EXAM_PER_DISCIPLINE = 6;
export type ExamCandidate = { id: string; discipline: string };
export type IndividualExamAttempt = {
  id: string; completed: boolean;
  questions: { id: string; position: number; snapshot: DiagnosticQuestionSnapshot; selectedOptionId: string | null }[];
};
export interface IndividualExamRepository {
  available(studentId: string): Promise<ExamCandidate[]>;
  active(studentId: string): Promise<IndividualExamAttempt | null>;
  find(studentId: string, id: string): Promise<IndividualExamAttempt | null>;
  create(studentId: string, candidates: ExamCandidate[]): Promise<IndividualExamAttempt>;
  answer(studentId: string, id: string, questionId: string, alternativeId: string): Promise<void>;
  finalize(studentId: string, id: string): Promise<IndividualExamAttempt>;
}

export class IndividualExamService {
  constructor(private readonly repo: IndividualExamRepository, private readonly random = Math.random) {}
  async availability(studentId: string) {
    const [pool, active] = await Promise.all([this.repo.available(studentId), this.repo.active(studentId)]);
    const disciplines = PRACTICE_DISCIPLINES.map(discipline => {
      const available = new Set(pool.filter(q => q.discipline === discipline).map(q => q.id)).size;
      return { discipline, available, required: 6, missing: Math.max(0, 6 - available) };
    });
    return { quantity: 30, disciplines, canStart: disciplines.every(d => d.missing === 0), activeAttemptId: active?.id ?? null };
  }
  async start(studentId: string) {
    const active = await this.repo.active(studentId);
    if (active) return { resumed: true, attempt: this.publicAttempt(active) };
    const pool = [...new Map((await this.repo.available(studentId)).map(q => [q.id, q])).values()];
    const selected: ExamCandidate[] = [];
    for (const discipline of PRACTICE_DISCIPLINES) {
      const candidates = pool.filter(q => q.discipline === discipline);
      if (candidates.length < 6) throw new ApiError(409, `Faltam questões inéditas liberadas em ${discipline}. São necessárias seis por disciplina.`);
      this.shuffle(candidates);
      selected.push(...candidates.slice(0, 6));
    }
    this.shuffle(selected);
    return { resumed: false, attempt: this.publicAttempt(await this.repo.create(studentId, selected)) };
  }
  async get(studentId: string, id: string) { return this.publicAttempt(await this.require(studentId, id)); }
  async answer(studentId: string, id: string, questionId: string, alternativeId: string) {
    const attempt = await this.require(studentId, id);
    if (attempt.completed) throw new ApiError(409, 'Este simulado já foi entregue.');
    const item = attempt.questions.find(q => q.id === questionId);
    if (!item) throw new ApiError(404, 'A questão não pertence a este simulado.');
    if (!item.snapshot.alternatives.some(a => a.id === alternativeId)) throw new ApiError(422, 'A alternativa não pertence à questão.');
    await this.repo.answer(studentId, id, questionId, alternativeId);
    return { saved: true, selectedOptionId: alternativeId };
  }
  async finalize(studentId: string, id: string) {
    const attempt = await this.require(studentId, id);
    if (!attempt.completed && attempt.questions.some(q => !q.selectedOptionId)) throw new ApiError(409, 'Responda todas as 30 questões antes de entregar.');
    return this.result(attempt.completed ? attempt : await this.repo.finalize(studentId, id));
  }
  async getResult(studentId: string, id: string) {
    const attempt = await this.require(studentId, id);
    if (!attempt.completed) throw new ApiError(409, 'Entregue o simulado para consultar a correção.');
    return this.result(attempt);
  }
  private async require(studentId: string, id: string) {
    const attempt = await this.repo.find(studentId, id);
    if (!attempt) throw new ApiError(404, 'Simulado individual não encontrado.');
    return attempt;
  }
  private publicAttempt(attempt: IndividualExamAttempt) {
    return { id: attempt.id, state: attempt.completed ? 'COMPLETED' : 'IN_PROGRESS', quantity: attempt.questions.length,
      questions: attempt.questions.map(q => ({ id: q.id, position: q.position, statement: q.snapshot.statement, discipline: q.snapshot.discipline, topic: q.snapshot.topic, selectedOptionId: q.selectedOptionId,
        alternatives: q.snapshot.alternatives.map(({ id, letter, text }) => ({ id, letter, text })) })) };
  }
  private result(attempt: IndividualExamAttempt) {
    const answers = attempt.questions.map(q => ({ id: q.id, statement: q.snapshot.statement, discipline: q.snapshot.discipline,
      selectedOptionId: q.selectedOptionId, correctOptionId: q.snapshot.alternatives.find(a => a.correct)!.id,
      correct: q.snapshot.alternatives.some(a => a.id === q.selectedOptionId && a.correct), explanation: q.snapshot.explanation,
      alternatives: q.snapshot.alternatives.map(({ id, letter, text }) => ({ id, letter, text })) }));
    const correct = answers.filter(a => a.correct).length;
    return { total: answers.length, correct, percentage: Number((100 * correct / answers.length).toFixed(2)),
      disciplines: PRACTICE_DISCIPLINES.map(discipline => ({ discipline, total: answers.filter(a => a.discipline === discipline).length, correct: answers.filter(a => a.discipline === discipline && a.correct).length })), answers };
  }
  private shuffle<T>(items: T[]) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.max(0, Math.min(i, Math.floor(this.random() * (i + 1))));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
}
