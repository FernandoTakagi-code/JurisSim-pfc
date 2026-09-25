import { QuestaoRepository } from '../repositories/QuestaoRepository';
import { Nivel } from '@prisma/client';
import { ApiError } from '../errors/api-error';

interface DadosCriarQuestao {
  enunciado: string;
  disciplina: string;
  assunto: string;
  nivel: Nivel;
  fundamentacaoJuridica: string;
  publica: boolean;
  autorId: string;
  turmaId?: string;
  alternativas: { texto: string; correta: boolean }[];
}

export class QuestaoService {
  static async criar(dados: DadosCriarQuestao, actorId: string) {
    this.validarAlternativas(dados.alternativas);
    return QuestaoRepository.criar(dados, actorId);
  }

  private static validarAlternativas(alternativas: DadosCriarQuestao['alternativas']) {
    const corretas = alternativas.filter((a) => a.correta);
    if (corretas.length !== 1) {
      throw new ApiError(400, 'A questão deve ter exatamente uma alternativa correta');
    }

    if (alternativas.length < 2) {
      throw new ApiError(400, 'A questão deve ter pelo menos duas alternativas');
    }
  }

  static async listar(
    filtros: { disciplina?: string; assunto?: string; nivel?: Nivel; turmaId?: string },
    papelUsuario: string
  ) {
    const questoes = await QuestaoRepository.listar(filtros);

    if (papelUsuario === 'ALUNO') {
      return questoes.map((questao) => ({
        ...questao,
        alternativas: questao.alternativas.map((alt) => ({
          id: alt.id,
          texto: alt.texto,
        })),
      }));
    }

    return questoes;
  }

  static async buscarPorId(id: string, papelUsuario: string) {
    const questao = await QuestaoRepository.buscarPorId(id);

    if (!questao) {
      throw new ApiError(404, 'Questão não encontrada');
    }

    if (papelUsuario === 'ALUNO') {
      return {
        ...questao,
        alternativas: questao.alternativas.map((alt) => ({
          id: alt.id,
          texto: alt.texto,
        })),
      };
    }

    return questao;
  }

  static async atualizar(id: string, dados: Partial<Omit<DadosCriarQuestao, 'autorId'>>, actorId: string) {
    if (dados.alternativas) this.validarAlternativas(dados.alternativas);
    return QuestaoRepository.atualizar(id, dados, actorId);
  }

  static async remover(id: string, actorId: string) {
    return QuestaoRepository.remover(id, actorId);
  }
}
