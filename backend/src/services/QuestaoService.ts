import { QuestaoRepository } from '../repositories/QuestaoRepository';
import { Nivel } from '@prisma/client';

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
  static async criar(dados: DadosCriarQuestao) {
    const corretas = dados.alternativas.filter((a) => a.correta);
    if (corretas.length !== 1) {
      throw new Error('A questão deve ter exatamente uma alternativa correta');
    }

    if (dados.alternativas.length < 2) {
      throw new Error('A questão deve ter pelo menos duas alternativas');
    }

    return QuestaoRepository.criar(dados);
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
      throw new Error('Questão não encontrada');
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

  static async atualizar(id: string, dados: Partial<DadosCriarQuestao>) {
    const questaoExistente = await QuestaoRepository.buscarPorId(id);
    if (!questaoExistente) {
      throw new Error('Questão não encontrada');
    }
    return QuestaoRepository.atualizar(id, dados);
  }

  static async remover(id: string) {
    const questaoExistente = await QuestaoRepository.buscarPorId(id);
    if (!questaoExistente) {
      throw new Error('Questão não encontrada');
    }
    return QuestaoRepository.remover(id);
  }
}