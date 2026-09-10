import { Prisma } from '@prisma/client';
import { ApiError } from '../errors/api-error';
import { DiagnosticRepository } from '../repositories/diagnostic-repository';
import type { AnsweredQuestion } from '../types/diagnostic';
import { analyzeDiagnostic } from './adaptive-engine';

type Attempt = Prisma.SimuladoGetPayload<{
  include: {
    questoes: { include: { questao: { include: { alternativas: true } }; resposta: true } };
    desempenhosDiagnostico: true;
    trilhaAdaptativa: true;
  };
}>;

export class DiagnosticService {
  constructor(private readonly repository = new DiagnosticRepository()) {}

  async start(studentId: string, quantity: number) {
    const student = await this.repository.findStudent(studentId);
    if (!student) throw new ApiError(404, 'Aluno nao encontrado.');
    const questions = await this.repository.findQuestionsForDiagnostic(quantity);
    if (questions.length === 0) throw new ApiError(409, 'Nao ha questoes publicas cadastradas para iniciar o diagnostico.');
    return this.repository.createAttempt(studentId, questions.map((question) => question.id));
  }

  async getQuestions(attemptId: string) {
    const attempt = await this.getAttemptOrFail(attemptId);
    return attempt.questoes.map(({ posicao, questao, resposta }) => ({
      id: questao.id, position: posicao, statement: questao.enunciado, discipline: questao.disciplina,
      topic: questao.assunto, difficulty: questao.nivel,
      alternatives: questao.alternativas.map((alternative) => ({ id: alternative.id, text: alternative.texto })),
      selectedOptionId: resposta?.alternativaEscolhidaId ?? null,
    }));
  }

  async answer(attemptId: string, questionId: string, selectedOptionId: string) {
    const attempt = await this.getAttemptOrFail(attemptId);
    if (attempt.finalizadoEm) throw new ApiError(409, 'Esta tentativa de diagnostico ja foi finalizada.');
    const attemptQuestion = attempt.questoes.find((item) => item.questaoId === questionId);
    if (!attemptQuestion) throw new ApiError(404, 'A questao nao pertence a este diagnostico.');
    if (attemptQuestion.resposta) throw new ApiError(409, 'Esta questao ja foi respondida neste diagnostico.');
    const alternative = attemptQuestion.questao.alternativas.find((item) => item.id === selectedOptionId);
    if (!alternative) throw new ApiError(422, 'A alternativa informada nao pertence a esta questao.');
    try {
      await this.repository.saveAnswer(attempt.id, questionId, attemptQuestion.id, alternative.id, alternative.correta);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(409, 'Esta questao ja foi respondida neste diagnostico.');
      }
      throw error;
    }
    return { message: 'Resposta registrada.' };
  }

  async finalize(attemptId: string) {
    const attempt = await this.getAttemptOrFail(attemptId);
    if (attempt.finalizadoEm) throw new ApiError(409, 'Esta tentativa de diagnostico ja foi finalizada.');
    if (!attempt.questoes.some((question) => question.resposta)) throw new ApiError(422, 'Nao e possivel finalizar um diagnostico sem respostas.');
    const result = analyzeDiagnostic(this.answeredQuestions(attempt));
    const finalizedAttempt = await this.repository.finalize(attemptId, result);
    if (!finalizedAttempt) throw new ApiError(409, 'Esta tentativa de diagnostico ja foi finalizada.');
    return { attempt: finalizedAttempt, result };
  }

  async getResult(attemptId: string) {
    const attempt = await this.getAttemptOrFail(attemptId);
    if (!attempt.finalizadoEm) throw new ApiError(409, 'Finalize o diagnostico antes de consultar o resultado.');
    return { attempt, result: analyzeDiagnostic(this.answeredQuestions(attempt)) };
  }

  async getTrail(attemptId: string) {
    const { attempt } = await this.getResult(attemptId);
    if (!attempt.trilhaAdaptativa) throw new ApiError(404, 'A trilha desta tentativa nao foi encontrada.');
    return attempt.trilhaAdaptativa;
  }

  private answeredQuestions(attempt: Attempt): AnsweredQuestion[] {
    return attempt.questoes.map(({ questao, resposta }) => ({
      discipline: questao.disciplina,
      topic: questao.assunto,
      difficulty: questao.nivel,
      isCorrect: resposta?.correta ?? false,
    }));
  }

  private async getAttemptOrFail(attemptId: string) {
    const attempt = await this.repository.findAttempt(attemptId);
    if (!attempt) throw new ApiError(404, 'Diagnostico nao encontrado.');
    return attempt;
  }
}
