import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from "../../src/errors/api-error";
import { QuestaoRepository } from "../../src/repositories/QuestaoRepository";
import { QuestaoService } from "../../src/services/questions/QuestaoService";

// Teste unitário: o QuestaoRepository (acesso ao banco via Prisma) é substituído por mocks.
vi.mock("../../src/repositories/QuestaoRepository", () => ({
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
    // Preparação
    const dados = dadosQuestao([
      { texto: 'A locação se extingue', correta: false },
      { texto: 'Prorroga-se por prazo indeterminado', correta: true },
      { texto: 'Renova-se por 30 meses', correta: false },
      { texto: 'O contrato é nulo', correta: false },
    ]);
    repositorio.criar.mockResolvedValue({ id: 'questao-1', ...dados } as never);

    // Execução
    const questao = await QuestaoService.criar(dados, PROFESSOR_ID, 'PROFESSOR');

    // Verificação
    expect(questao).toMatchObject({ id: 'questao-1', disciplina: 'Direito Civil' });
    expect(repositorio.criar).toHaveBeenCalledTimes(1);
    expect(repositorio.criar).toHaveBeenCalledWith(dados, PROFESSOR_ID, 'PROFESSOR');
  });

  it.each([
    ['nenhuma alternativa correta', [false, false, false, false]],
    ['duas alternativas corretas', [true, true, false, false]],
    ['todas as alternativas corretas', [true, true, true, true]],
  ])('deveRecusarQuestaoCom %s', async (_cenario, gabarito) => {
    // Preparação
    const dados = dadosQuestao(gabarito.map((correta, i) => ({ texto: `Alternativa ${i + 1}`, correta })));

    // Execução
    const tentativa = QuestaoService.criar(dados, PROFESSOR_ID, 'PROFESSOR');

    // Verificação
    await expect(tentativa).rejects.toBeInstanceOf(ApiError);
    await expect(tentativa).rejects.toMatchObject({
      statusCode: 400,
      message: 'A questão deve ter exatamente uma alternativa correta',
    });
    expect(repositorio.criar).not.toHaveBeenCalled();
  });

  it('deveRecusarQuestaoComDuasAlternativas', async () => {
    // O formato Certo/Errado não pertence ao contrato A–D do cadastro.
    const dados = dadosQuestao([
      { texto: 'Certo', correta: true },
      { texto: 'Errado', correta: false },
    ]);
    repositorio.criar.mockResolvedValue({ id: 'questao-2', ...dados } as never);

    // Execução
    await expect(QuestaoService.criar(dados, PROFESSOR_ID, 'PROFESSOR')).rejects.toMatchObject({ statusCode: 400, message: 'A questão deve ter exatamente quatro alternativas (A–D).' });

    // Verificação
    expect(repositorio.criar).not.toHaveBeenCalled();
  });

  it('deveRecusarQuestaoComApenasUmaAlternativaMesmoQueSejaCorreta', async () => {
    // Uma única alternativa também deve ser recusada.
    const dados = dadosQuestao([{ texto: 'Única alternativa', correta: true }]);

    // Execução
    const tentativa = QuestaoService.criar(dados, PROFESSOR_ID, 'PROFESSOR');

    // Verificação
    await expect(tentativa).rejects.toMatchObject({
      statusCode: 400,
      message: 'A questão deve ter exatamente quatro alternativas (A–D).',
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
    // Preparação
    repositorio.listar.mockResolvedValue([questaoDoBanco] as never);

    // Execução
    const [questao] = await QuestaoService.listar({}, 'ALUNO', 'aluno-1');

    // Verificação
    expect(questao.alternativas).toEqual([
      { id: 'alt-1', texto: 'Alternativa A' },
      { id: 'alt-2', texto: 'Alternativa B' },
    ]);
    expect(repositorio.listar).toHaveBeenCalledWith({}, 'aluno-1', 'ALUNO', false, undefined);
  });

  it('deveFiltrarSomenteAsQuestoesDoProfessorQuandoSolicitado', async () => {
    // Preparação
    repositorio.listar.mockResolvedValue([questaoDoBanco] as never);

    // Execução
    const [questao] = await QuestaoService.listar({ disciplina: 'Direito Civil' }, 'PROFESSOR', PROFESSOR_ID, true);

    // Verificação
    expect(questao.alternativas[0]).toHaveProperty('correta', true);
    expect(repositorio.listar).toHaveBeenCalledWith({ disciplina: 'Direito Civil' }, PROFESSOR_ID, 'PROFESSOR', true, undefined);
  });
});
