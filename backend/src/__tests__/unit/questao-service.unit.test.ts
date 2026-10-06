import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../errors/api-error';
import { QuestaoRepository } from '../../repositories/QuestaoRepository';
import { QuestaoService } from '../../services/QuestaoService';

// Teste unitário: o QuestaoRepository (acesso ao banco via Prisma) é substituído por mocks.
vi.mock('../../repositories/QuestaoRepository', () => ({
  QuestaoRepository: {
    criar: vi.fn(),
    listar: vi.fn(),
    buscarPorId: vi.fn(),
    atualizar: vi.fn(),
    remover: vi.fn(),
  },
}));

const repositorio = vi.mocked(QuestaoRepository);
const PROFESSOR_ID = 'professor-1';

function dadosQuestao(alternativas: { texto: string; correta: boolean }[]) {
  return {
    enunciado: 'João celebrou contrato de locação residencial por 30 meses.',
    disciplina: 'Direito Civil',
    assunto: 'Locação',
    nivel: 'INTERMEDIARIO' as const,
    fundamentacaoJuridica: 'Art. 46 da Lei 8.245/91',
    publica: true,
    autorId: PROFESSOR_ID,
    alternativas,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('QuestaoService.criar() - regra de alternativas', () => {
  it('deveCriarQuestaoQuandoHaExatamenteUmaAlternativaCorreta', async () => {
    // Arrange
    const dados = dadosQuestao([
      { texto: 'A locação se extingue', correta: false },
      { texto: 'Prorroga-se por prazo indeterminado', correta: true },
      { texto: 'Renova-se por 30 meses', correta: false },
      { texto: 'O contrato é nulo', correta: false },
    ]);
    repositorio.criar.mockResolvedValue({ id: 'questao-1', ...dados } as never);

    // Act
    const questao = await QuestaoService.criar(dados, PROFESSOR_ID);

    // Assert
    expect(questao).toMatchObject({ id: 'questao-1', disciplina: 'Direito Civil' });
    expect(repositorio.criar).toHaveBeenCalledTimes(1);
    expect(repositorio.criar).toHaveBeenCalledWith(dados, PROFESSOR_ID);
  });

  it.each([
    ['nenhuma alternativa correta', [false, false, false, false]],
    ['duas alternativas corretas', [true, true, false, false]],
    ['todas as alternativas corretas', [true, true, true, true]],
  ])('deveRecusarQuestaoCom %s', async (_cenario, gabarito) => {
    // Arrange
    const dados = dadosQuestao(gabarito.map((correta, i) => ({ texto: `Alternativa ${i + 1}`, correta })));

    // Act
    const tentativa = QuestaoService.criar(dados, PROFESSOR_ID);

    // Assert
    await expect(tentativa).rejects.toBeInstanceOf(ApiError);
    await expect(tentativa).rejects.toMatchObject({
      statusCode: 400,
      message: 'A questão deve ter exatamente uma alternativa correta',
    });
    expect(repositorio.criar).not.toHaveBeenCalled();
  });

  it('deveAceitarQuestaoComOMinimoDeDuasAlternativas', async () => {
    // Arrange - caso-limite: exatamente o mínimo permitido
    const dados = dadosQuestao([
      { texto: 'Certo', correta: true },
      { texto: 'Errado', correta: false },
    ]);
    repositorio.criar.mockResolvedValue({ id: 'questao-2', ...dados } as never);

    // Act
    await QuestaoService.criar(dados, PROFESSOR_ID);

    // Assert
    expect(repositorio.criar).toHaveBeenCalledWith(expect.objectContaining({ alternativas: dados.alternativas }), PROFESSOR_ID);
  });

  it('deveRecusarQuestaoComApenasUmaAlternativaMesmoQueSejaCorreta', async () => {
    // Arrange - caso-limite: uma abaixo do mínimo
    const dados = dadosQuestao([{ texto: 'Única alternativa', correta: true }]);

    // Act
    const tentativa = QuestaoService.criar(dados, PROFESSOR_ID);

    // Assert
    await expect(tentativa).rejects.toMatchObject({
      statusCode: 400,
      message: 'A questão deve ter pelo menos duas alternativas',
    });
    expect(repositorio.criar).not.toHaveBeenCalled();
  });
});

describe('QuestaoService.listar() - visibilidade por perfil', () => {
  const questaoDoBanco = {
    id: 'questao-1',
    enunciado: 'Enunciado da questão de teste',
    alternativas: [
      { id: 'alt-1', texto: 'Alternativa A', correta: true, questaoId: 'questao-1' },
      { id: 'alt-2', texto: 'Alternativa B', correta: false, questaoId: 'questao-1' },
    ],
  };

  it('deveOcultarOGabaritoQuandoQuemListaEAluno', async () => {
    // Arrange
    repositorio.listar.mockResolvedValue([questaoDoBanco] as never);

    // Act
    const [questao] = await QuestaoService.listar({}, 'ALUNO', 'aluno-1');

    // Assert
    expect(questao.alternativas).toEqual([
      { id: 'alt-1', texto: 'Alternativa A' },
      { id: 'alt-2', texto: 'Alternativa B' },
    ]);
    expect(repositorio.listar).toHaveBeenCalledWith(
      expect.objectContaining({ autorId: undefined, somenteDoAutor: false }),
    );
  });

  it('deveFiltrarSomenteAsQuestoesDoProfessorQuandoSolicitado', async () => {
    // Arrange
    repositorio.listar.mockResolvedValue([questaoDoBanco] as never);

    // Act
    const [questao] = await QuestaoService.listar({ disciplina: 'Direito Civil' }, 'PROFESSOR', PROFESSOR_ID, true);

    // Assert
    expect(questao.alternativas[0]).toHaveProperty('correta', true);
    expect(repositorio.listar).toHaveBeenCalledWith({
      disciplina: 'Direito Civil',
      autorId: PROFESSOR_ID,
      somenteDoAutor: true,
    });
  });
});