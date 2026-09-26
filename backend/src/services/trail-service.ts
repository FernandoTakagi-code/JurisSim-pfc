import { Prisma } from '@prisma/client';
import { ApiError } from '../errors/api-error';
import { TrailRepository } from '../repositories/trail-repository';
import { StudentRepository } from '../repositories/student-repository';
import { analyzeDiagnostic, buildTrailFilters } from './adaptive-engine';
import type { AnsweredQuestion } from '../types/diagnostic';

type Attempt = Prisma.SimuladoGetPayload<{
  include: { questoes: { include: { questao: { include: { alternativas: true } }; resposta: true } } };
}>;

export class TrailService {
  constructor(
    private readonly repository = new TrailRepository(),
    private readonly students = new StudentRepository(),
  ) {}

  async generate(trilhaId: string, userId: string) {
    const trilha = await this.repository.findTrilha(trilhaId);
    if (!trilha) throw new ApiError(404, 'Trilha adaptativa nao encontrada.');
    this.requireOwner(trilha.simulado.alunoId, userId);
    if (trilha.simuladoGeradoId) throw new ApiError(409, 'Esta trilha ja gerou uma sessao de exercicios.');

    const filters = buildTrailFilters(trilha.disciplinaPrioritaria, trilha.assuntoPrioritario, trilha.nivelRecomendado);
    const questions = await this.repository.findQuestionsForTrail(filters, trilha.quantidadeRecomendada);
    if (questions.length === 0) throw new ApiError(409, 'Nao ha questoes disponiveis para gerar esta trilha.');

    return this.repository.createTrailAttempt(trilha.simulado.alunoId, trilha.id, questions.map((question) => question.id));
  }

  async getQuestions(attemptId: string, userId: string) {
    const attempt = await this.getAttemptOrFail(attemptId, userId);
    return attempt.questoes.map(({ posicao, questao, resposta }) => ({
      id: questao.id, position: posicao, statement: questao.enunciado, discipline: questao.disciplina,
      topic: questao.assunto, difficulty: questao.nivel,
      alternatives: questao.alternativas.map((alternative) => ({ id: alternative.id, text: alternative.texto })),
      selectedOptionId: resposta?.alternativaEscolhidaId ?? null,
    }));
  }

  async answer(attemptId: string, userId: string, questionId: string, selectedOptionId: string) {
    const attempt = await this.getAttemptOrFail(attemptId, userId);
    if (attempt.finalizadoEm) throw new ApiError(409, 'Esta trilha de exercicios ja foi finalizada.');
    const attemptQuestion = attempt.questoes.find((item) => item.questaoId === questionId);
    if (!attemptQuestion) throw new ApiError(404, 'A questao nao pertence a esta trilha.');
    if (attemptQuestion.resposta) throw new ApiError(409, 'Esta questao ja foi respondida.');
    const alternative = attemptQuestion.questao.alternativas.find((item) => item.id === selectedOptionId);
    if (!alternative) throw new ApiError(422, 'A alternativa informada nao pertence a esta questao.');
    await this.repository.saveAnswer(attempt.id, questionId, attemptQuestion.id, alternative.id, alternative.correta);
    return { message: 'Resposta registrada.' };
  }

  async finalize(attemptId: string, userId: string) {
    const attempt = await this.getAttemptOrFail(attemptId, userId);
    if (attempt.finalizadoEm) throw new ApiError(409, 'Esta trilha de exercicios ja foi finalizada.');
    if (!attempt.questoes.some((question) => question.resposta)) throw new ApiError(422, 'Responda ao menos uma questao antes de finalizar.');

    const result = analyzeDiagnostic(this.answeredQuestions(attempt));
    const finalized = await this.repository.finalize(attemptId);
    if (!finalized) throw new ApiError(409, 'Esta trilha de exercicios ja foi finalizada.');

    await this.students.updateLevel(attempt.alunoId, result.level);
    return { level: result.level, overallPercentage: result.overallPercentage, recommendation: result.recommendation };
  }

  private answeredQuestions(attempt: Attempt): AnsweredQuestion[] {
    return attempt.questoes.map(({ questao, resposta }) => ({
      discipline: questao.disciplina, topic: questao.assunto, difficulty: questao.nivel, isCorrect: resposta?.correta ?? false,
    }));
  }

  private requireOwner(ownerId: string, userId: string) {
    if (!userId || ownerId !== userId) throw new ApiError(403, 'Acesso negado a trilha de outro usuario.');
  }

  private async getAttemptOrFail(attemptId: string, userId: string) {
    const attempt = await this.repository.findAttempt(attemptId);
    if (!attempt) throw new ApiError(404, 'Sessao de exercicios nao encontrada.');
    this.requireOwner(attempt.alunoId, userId);
    return attempt;
  }
}
