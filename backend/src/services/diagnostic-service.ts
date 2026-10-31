import { Prisma } from '@prisma/client';
import { ApiError } from '../errors/api-error';
import { diagnosticAttemptSelect, DiagnosticRepository } from '../repositories/diagnostic-repository';
import type { AnsweredQuestion } from '../types/diagnostic';
import { analyzeDiagnostic } from './adaptive-engine';
import { gerarJustificativaComIA } from './feedback-service';
import { readDiagnosticQuestionSnapshot } from './diagnostic-question-snapshot';

type Attempt = Prisma.SimuladoGetPayload<{ select: typeof diagnosticAttemptSelect }>;

export class DiagnosticService {
  constructor(private readonly repository = new DiagnosticRepository()) {}

  async start(studentId: string, quantity: number) {
    const student = await this.repository.findStudent(studentId);
    if (!student) throw new ApiError(404, 'Aluno nao encontrado.');
    const questions = await this.repository.findQuestionsForDiagnostic(quantity);
    if (questions.length === 0) throw new ApiError(409, 'Nao ha questoes publicas cadastradas para iniciar o diagnostico.');
    return this.repository.createAttempt(studentId, questions.map((question) => question.id));
  }

  async getQuestions(attemptId: string, studentId: string) {
    const attempt = await this.getAttemptOrFail(attemptId, studentId);
    return attempt.questoes.map(({ posicao, questao, resposta }) => ({
      id: questao.id, position: posicao, statement: questao.enunciado, discipline: questao.disciplina,
      topic: questao.assunto, difficulty: questao.nivel,
      alternatives: questao.alternativas.map((alternative) => ({ id: alternative.id, text: alternative.texto })),
      selectedOptionId: resposta?.alternativaEscolhidaId ?? null,
    }));
  }

  async answer(attemptId: string, studentId: string, questionId: string, selectedOptionId: string) {
    const attempt = await this.getAttemptOrFail(attemptId, studentId);
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

  async finalize(attemptId: string, studentId: string) {
    const attempt = await this.getAttemptOrFail(attemptId, studentId);
    if (attempt.finalizadoEm) throw new ApiError(409, 'Esta tentativa de diagnostico ja foi finalizada.');
    if (!attempt.questoes.some((question) => question.resposta)) throw new ApiError(422, 'Nao e possivel finalizar um diagnostico sem respostas.');
    const result = analyzeDiagnostic(this.answeredQuestions(attempt));

    const textoEnriquecido = await gerarJustificativaComIA(result.trail);
    if (textoEnriquecido) {
      result.trail.reason = textoEnriquecido;
      result.recommendation = textoEnriquecido;
    }

    const finalizedAttempt = await this.repository.finalize(attemptId, studentId, result);
    if (!finalizedAttempt) throw new ApiError(409, 'Esta tentativa de diagnostico ja foi finalizada.');
    return { attempt: finalizedAttempt, result };
  }

  async getResult(attemptId: string, studentId: string) {
    const attempt = await this.getResultAttemptOrFail(attemptId, studentId);
    if (!attempt.finalizadoEm) throw new ApiError(409, 'Finalize o diagnostico antes de consultar o resultado.');
    if (attempt.questoes.length === 0) {
      throw new ApiError(409, 'O resultado nao pode ser calculado porque esta tentativa nao possui questoes.');
    }
    const result = analyzeDiagnostic(this.answeredQuestions(attempt));
    if (attempt.trilhaAdaptativa?.justificativa) {
      result.trail.reason = attempt.trilhaAdaptativa.justificativa;
      result.recommendation = attempt.trilhaAdaptativa.justificativa;
    }
    return { attempt, result };
  }

  async getTrail(attemptId: string, studentId: string) {
    const { attempt } = await this.getResult(attemptId, studentId);
    if (!attempt.trilhaAdaptativa) throw new ApiError(404, 'A trilha desta tentativa nao foi encontrada.');
    return attempt.trilhaAdaptativa;
  }

  async getReview(attemptId: string, studentId: string) {
    const attempt = await this.getAttemptOrFail(attemptId, studentId);
    if (!attempt.finalizadoEm) throw new ApiError(409, 'Finalize o diagnóstico antes de consultar a correção.');
    if (attempt.questoes.length === 0) throw new ApiError(409, 'A correção não está disponível para esta tentativa.');

    const questions = attempt.questoes.map(link => {
      const snapshot = readDiagnosticQuestionSnapshot(link.conteudoSnapshot);
      const content = snapshot ?? {
        statement: link.questao.enunciado,
        discipline: link.questao.disciplina,
        topic: link.questao.assunto,
        difficulty: link.questao.nivel,
        explanation: link.questao.fundamentacaoJuridica,
        alternatives: link.questao.alternativas.map(alternative => ({
          id: alternative.id,
          letter: alternative.letra,
          text: alternative.texto,
          correct: alternative.correta,
        })),
      };
      const selectedAlternativeId = link.resposta?.alternativaEscolhidaId ?? null;
      return {
        questionId: link.questaoId,
        position: link.posicao,
        statement: content.statement,
        discipline: content.discipline,
        topic: content.topic,
        difficulty: content.difficulty,
        alternatives: content.alternatives.slice().sort((a, b) => (a.letter ?? '').localeCompare(b.letter ?? '')),
        selectedAlternativeId,
        correct: selectedAlternativeId === null ? null : (link.resposta?.correta ?? false),
        explanation: content.explanation.trim() ? content.explanation : null,
        snapshotAvailable: snapshot !== null,
      };
    });
    const correct = questions.filter(question => question.correct === true).length;
    const incorrect = questions.filter(question => question.correct === false).length;
    return { attemptId: attempt.id, total: questions.length, correct, incorrect,
      unanswered: questions.length - correct - incorrect, questions };
  }

  private answeredQuestions(attempt: {
    questoes: {
      conteudoSnapshot?: unknown;
      questao: { disciplina: string; assunto: string; nivel: AnsweredQuestion['difficulty'] };
      resposta: { correta: boolean } | null;
    }[];
  }): AnsweredQuestion[] {
    return attempt.questoes.map(({ conteudoSnapshot, questao, resposta }) => {
      const snapshot = readDiagnosticQuestionSnapshot(conteudoSnapshot);
      return {
        discipline: snapshot?.discipline ?? questao.disciplina,
        topic: snapshot?.topic ?? questao.assunto,
        difficulty: (snapshot?.difficulty as AnsweredQuestion['difficulty'] | undefined) ?? questao.nivel,
        isCorrect: resposta?.correta ?? false,
      };
    });
  }

  private async getResultAttemptOrFail(attemptId: string, studentId: string): Promise<Attempt> {
    const attempt = await this.repository.findAttempt(attemptId, studentId);
    if (!attempt) throw new ApiError(404, 'Diagnostico nao encontrado.');
    return attempt;
  }

  private async getAttemptOrFail(attemptId: string, studentId: string) {
    const attempt = await this.repository.findAttempt(attemptId, studentId);
    if (!attempt) throw new ApiError(404, 'Diagnostico nao encontrado.');
    return attempt;
  }
}
