import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  encerrar, iniciarServidor, limparBanco, loginPelaApi, prisma, questaoValida, requisicao,
} from './helpers';

// QuestaoController de ponta a ponta: HTTP real (porta aleatória) -> requireAuth/requireRoles
// -> QuestaoController -> QuestaoService -> QuestaoRepository -> PostgreSQL descartável.
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  ({ server, baseUrl } = await iniciarServidor());
});

afterAll(async () => {
  await encerrar(server);
});

beforeEach(async () => {
  await limparBanco();
});

// Enunciado único por chamada: o banco rejeita questões com o mesmo conteúdo (fingerprint).
function questaoUnica(sobrescrever: Record<string, unknown> = {}) {
  return questaoValida({ enunciado: `${questaoValida().enunciado} Caso ${randomUUID()}.`, ...sobrescrever });
}

async function criarQuestao(token: string, sobrescrever: Record<string, unknown> = {}) {
  const resposta = await requisicao(baseUrl, 'POST', '/questoes', { token, corpo: questaoUnica(sobrescrever) });
  expect(resposta.status).toBe(201);
  return resposta.corpo as { id: string; enunciado: string };
}

describe('GET /questoes', () => {
  it('listar_comQuestaoCadastrada_deveRetornar200ComAQuestaoNaLista', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const criada = await criarQuestao(professor.token, { assunto: 'Despejo' });

    // Act
    const resposta = await requisicao(baseUrl, 'GET', '/questoes', { token: professor.token });

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toHaveLength(1);
    expect(resposta.corpo[0]).toMatchObject({ id: criada.id, assunto: 'Despejo', autorId: professor.usuario.id });
  });

  it('listar_comoAluno_deveRetornar200SemOGabaritoDasAlternativas', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const aluno = await loginPelaApi(baseUrl, 'ALUNO');
    const criada = await criarQuestao(professor.token);

    // Act
    const resposta = await requisicao(baseUrl, 'GET', '/questoes', { token: aluno.token });

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.corpo.map((q: { id: string }) => q.id)).toEqual([criada.id]);
    expect(resposta.corpo[0].alternativas).toHaveLength(4);
    for (const alternativa of resposta.corpo[0].alternativas) expect(alternativa).not.toHaveProperty('correta');
  });

  it('listar_comNivelInexistenteNoFiltro_deveRetornar422ComIssues', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');

    // Act
    const resposta = await requisicao(baseUrl, 'GET', '/questoes?nivel=IMPOSSIVEL', { token: professor.token });

    // Assert
    expect(resposta.status).toBe(422);
    expect(resposta.corpo.message).toBe('Dados invalidos.');
    expect(resposta.corpo.issues[0].path).toEqual(['nivel']);
  });
});

describe('GET /questoes/:id', () => {
  it('buscarPorId_comIdExistente_deveRetornar200ComTodosOsCampos', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const criada = await criarQuestao(professor.token);

    // Act
    const resposta = await requisicao(baseUrl, 'GET', `/questoes/${criada.id}`, { token: professor.token });

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toMatchObject({
      id: criada.id,
      enunciado: criada.enunciado,
      disciplina: 'Direito Civil',
      assunto: 'Locação',
      nivel: 'INTERMEDIARIO',
      fundamentacaoJuridica: 'Art. 46, §1º, da Lei 8.245/91',
      publica: true,
      autorId: professor.usuario.id,
    });
    expect(resposta.corpo.alternativas).toHaveLength(4);
    expect(resposta.corpo.alternativas.find((a: { correta: boolean }) => a.correta).texto)
      .toBe('Presume-se prorrogada por prazo indeterminado.');
  });

  it('buscarPorId_comIdInexistente_deveRetornar404ComMensagem', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');

    // Act
    const resposta = await requisicao(baseUrl, 'GET', `/questoes/${randomUUID()}`, { token: professor.token });

    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.corpo).toEqual({ message: 'Questão não encontrada' });
  });
});

describe('POST /questoes', () => {
  it('criar_comoProfessorAutenticado_deveRetornar201EPersistirQuestaoComAlternativas', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const corpo = questaoUnica({ nivel: 'AVANCADO' });

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/questoes', { token: professor.token, corpo });

    // Assert - resposta
    expect(resposta.status).toBe(201);
    expect(resposta.corpo.id).toEqual(expect.any(String));
    expect(resposta.corpo).toMatchObject({ enunciado: corpo.enunciado, nivel: 'AVANCADO', autorId: professor.usuario.id });
    // Assert - persistido no banco com as 4 alternativas e o log de auditoria
    const noBanco = await prisma.questao.findUnique({ where: { id: resposta.corpo.id }, include: { alternativas: true } });
    expect(noBanco?.enunciado).toBe(corpo.enunciado);
    expect(noBanco?.alternativas).toHaveLength(4);
    expect(await prisma.auditLog.count({ where: { resourceId: resposta.corpo.id, action: 'QUESTAO_CRIADA' } })).toBe(1);
  });

  it('criar_semToken_deveRetornar401ENaoGravar', async () => {
    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/questoes', { corpo: questaoUnica() });

    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.corpo).toEqual({ message: 'Autenticacao obrigatoria.' });
    expect(await prisma.questao.count()).toBe(0);
  });

  it('criar_comoAluno_deveRetornar403ENaoGravar', async () => {
    // Arrange
    const aluno = await loginPelaApi(baseUrl, 'ALUNO');

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/questoes', { token: aluno.token, corpo: questaoUnica() });

    // Assert
    expect(resposta.status).toBe(403);
    expect(resposta.corpo).toEqual({ message: 'Acesso negado para este papel.' });
    expect(await prisma.questao.count()).toBe(0);
  });

  it('criar_comDuasAlternativasCorretas_deveRetornar400ComMensagem', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const corpo = questaoUnica({
      alternativas: [
        { texto: 'Primeira correta.', correta: true },
        { texto: 'Segunda correta.', correta: true },
        { texto: 'Incorreta.', correta: false },
      ],
    });

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/questoes', { token: professor.token, corpo });

    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.corpo).toEqual({ message: 'A questão deve ter exatamente uma alternativa correta' });
    expect(await prisma.questao.count()).toBe(0);
  });

  it('criar_comConteudoDuplicado_deveRetornar409EManterApenasAOriginal', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const corpo = questaoUnica();
    await requisicao(baseUrl, 'POST', '/questoes', { token: professor.token, corpo });

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/questoes', { token: professor.token, corpo });

    // Assert
    expect(resposta.status).toBe(409);
    expect(resposta.corpo).toEqual({ message: 'Já existe uma questão com este conteúdo.' });
    expect(await prisma.questao.count()).toBe(1);
  });
});

describe('PUT /questoes/:id', () => {
  it('atualizar_comNovoAssunto_deveRetornar200EGravarAlteracao', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const criada = await criarQuestao(professor.token);

    // Act
    const resposta = await requisicao(baseUrl, 'PUT', `/questoes/${criada.id}`, {
      token: professor.token,
      corpo: { assunto: 'Ação renovatória' },
    });

    // Assert - resposta
    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toMatchObject({ id: criada.id, assunto: 'Ação renovatória', enunciado: criada.enunciado });
    // Assert - efeito observável pela própria API
    const consulta = await requisicao(baseUrl, 'GET', `/questoes/${criada.id}`, { token: professor.token });
    expect(consulta.corpo.assunto).toBe('Ação renovatória');
  });

  it('atualizar_comIdInexistente_deveRetornar404ComMensagem', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');

    // Act
    const resposta = await requisicao(baseUrl, 'PUT', `/questoes/${randomUUID()}`, {
      token: professor.token,
      corpo: { assunto: 'Qualquer' },
    });

    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.corpo).toEqual({ message: 'Questão não encontrada' });
  });

  it('atualizar_questaoDeOutroProfessor_deveRetornar403EManterOriginal', async () => {
    // Arrange
    const autor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const outroProfessor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const criada = await criarQuestao(autor.token);

    // Act
    const resposta = await requisicao(baseUrl, 'PUT', `/questoes/${criada.id}`, {
      token: outroProfessor.token,
      corpo: { assunto: 'Invasão' },
    });

    // Assert
    expect(resposta.status).toBe(403);
    expect(resposta.corpo).toEqual({ message: 'Você não pode alterar esta questão.' });
    expect((await prisma.questao.findUnique({ where: { id: criada.id } }))?.assunto).toBe('Locação');
  });

  it('atualizar_comCorpoVazio_deveRetornar400ComMensagem', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const criada = await criarQuestao(professor.token);

    // Act
    const resposta = await requisicao(baseUrl, 'PUT', `/questoes/${criada.id}`, { token: professor.token, corpo: {} });

    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.corpo.erro._errors).toContain('Informe ao menos um campo para atualizar.');
  });
});

describe('DELETE /questoes/:id', () => {
  it('remover_comIdExistente_deveRetornar204EQuestaoDeixaDeExistir', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const criada = await criarQuestao(professor.token);

    // Act
    const resposta = await requisicao(baseUrl, 'DELETE', `/questoes/${criada.id}`, { token: professor.token });

    // Assert
    expect(resposta.status).toBe(204);
    expect(resposta.corpo).toBeNull();
    const consulta = await requisicao(baseUrl, 'GET', `/questoes/${criada.id}`, { token: professor.token });
    expect(consulta.status).toBe(404);
    expect(await prisma.alternativa.count({ where: { questaoId: criada.id } })).toBe(0);
  });

  it('remover_comIdInexistente_deveRetornar404ComMensagem', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');

    // Act
    const resposta = await requisicao(baseUrl, 'DELETE', `/questoes/${randomUUID()}`, { token: professor.token });

    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.corpo).toEqual({ message: 'Questão não encontrada' });
  });
});
