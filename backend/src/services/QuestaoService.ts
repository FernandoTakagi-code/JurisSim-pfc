import { QuestaoRepository } from '../repositories/QuestaoRepository';
import { Nivel } from '@prisma/client';
import { ApiError } from '../errors/api-error';
import { questionAlternativesError } from '../question-alternatives';

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
  static async criar(dados: DadosCriarQuestao, actorId: string, actorRole: string) {
    this.validarAlternativas(dados.alternativas);
    return QuestaoRepository.criar(dados, actorId, actorRole);
  }

  static validarAlternativas(alternativas: DadosCriarQuestao['alternativas']) {
    const error = questionAlternativesError(alternativas);
    if (error) throw new ApiError(400, error);
  }

  static async listar(
    filtros: { disciplina?: string; assunto?: string; nivel?: Nivel; turmaId?: string },
    papelUsuario: string,
    usuarioId: string,
    somenteMinhas = false,
    institutionId?:string,
  ) {
    const questoes = await QuestaoRepository.listar(filtros, usuarioId, papelUsuario, somenteMinhas,institutionId);

    if (papelUsuario === 'ALUNO'&&!institutionId) {
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

  static async buscarPorId(id: string, papelUsuario: string, usuarioId: string,institutionId?:string) {
    const questao = await QuestaoRepository.buscarPorId(id, usuarioId, papelUsuario,institutionId);

    if (!questao) {
      throw new ApiError(404, 'Questão não encontrada');
    }

    if (papelUsuario === 'ALUNO'&&!institutionId) {
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

  static async atualizar(id: string, dados: Partial<Omit<DadosCriarQuestao, 'autorId'>>, actorId: string, actorRole: string) {
    if (dados.alternativas) this.validarAlternativas(dados.alternativas);
    return QuestaoRepository.atualizar(id, dados, actorId, actorRole);
  }

  static async remover(id: string, actorId: string, actorRole: string) {
    return QuestaoRepository.remover(id, actorId, actorRole);
  }
}
