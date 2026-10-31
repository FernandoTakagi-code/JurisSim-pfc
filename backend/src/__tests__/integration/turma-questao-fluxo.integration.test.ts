import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encerrar, iniciarServidor, limparBanco, loginPelaApi, questaoValida, requisicao } from './helpers';

// Fluxo que cruza dois recursos relacionados: Turma (classRoutes) e Questão (QuestaoController).
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

describe('Fluxo turma -> questão privada da turma -> aluno matriculado', () => {
  it('questaoDaTurma_aposAlunoIngressarPeloConvite_deveFicarVisivelSomenteParaEle', async () => {
    // Arrange - professor cria a turma e uma questão privada vinculada a ela
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const matriculado = await loginPelaApi(baseUrl, 'ALUNO');
    const deFora = await loginPelaApi(baseUrl, 'ALUNO');
    const criacaoTurma = await requisicao(baseUrl, 'POST', '/turmas', { token: professor.token, corpo: { nome: 'Turma Ética Profissional' } });
    const turmaId = criacaoTurma.corpo.turma.id;
    const criacaoQuestao = await requisicao(baseUrl, 'POST', '/questoes', {
      token: professor.token,
      corpo: questaoValida({ publica: false, turmaId, disciplina: 'Ética', assunto: 'Estatuto da OAB' }),
    });
    expect(criacaoQuestao.status).toBe(201);
    expect(criacaoQuestao.corpo.turmaId).toBe(turmaId);
    const antesDeIngressar = await requisicao(baseUrl, 'GET', '/questoes', { token: matriculado.token });

    // Act - aluno entra pelo código de convite e consulta as questões da turma
    const ingresso = await requisicao(baseUrl, 'POST', '/turmas/join', { token: matriculado.token, corpo: { code: criacaoTurma.corpo.inviteCode } });
    const questoesDaTurma = await requisicao(baseUrl, 'GET', `/questoes?turmaId=${turmaId}`, { token: matriculado.token });
    const visaoDeFora = await requisicao(baseUrl, 'GET', '/questoes', { token: deFora.token });
    const filtroDeFora = await requisicao(baseUrl, 'GET', `/questoes?turmaId=${turmaId}`, { token: deFora.token });

    // Assert
    expect(antesDeIngressar.corpo).toEqual([]);
    expect(ingresso.corpo.joined).toBe(true);
    expect(questoesDaTurma.status).toBe(200);
    expect(questoesDaTurma.corpo).toHaveLength(1);
    expect(questoesDaTurma.corpo[0]).toMatchObject({ id: criacaoQuestao.corpo.id, turmaId, assunto: 'Estatuto da OAB' });
    expect(questoesDaTurma.corpo[0].alternativas[0]).not.toHaveProperty('correta');
    expect(visaoDeFora.corpo).toEqual([]);
    expect(filtroDeFora.status).toBe(403);
    expect(filtroDeFora.corpo).toEqual({ message: 'Turma indisponível para esta conta.' });
  });
});
