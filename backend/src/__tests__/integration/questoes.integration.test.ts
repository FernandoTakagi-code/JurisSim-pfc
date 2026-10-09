import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { QuestaoRepository } from '../../repositories/QuestaoRepository';
import {
  criarUsuario, encerrar, iniciarServidor, limparBanco, prisma, questaoValida, requisicao, tokenPara,
} from './helpers';

// Testes de integração: rotas Express reais + controllers + services + repositories
// + PostgreSQL de TESTE (recriado pelo global-setup e limpo antes de cada teste).
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

describe('POST /questoes (Controller + Service + Repository + BD)', () => {
  it('deveRetornar201EAQuestaoCriadaQuandoProfessorCadastra', async () => {
    // Arrange
    const professor = await criarUsuario('PROFESSOR');

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/questoes', { token: tokenPara(professor), corpo: questaoValida() });

    // Assert - status e corpo da resposta
    expect(resposta.status).toBe(201);
    expect(resposta.corpo.id).toEqual(expect.any(String));
    expect(resposta.corpo).toMatchObject({ disciplina: 'Direito Civil', assunto: 'Locação', autorId: professor.id });
    expect(resposta.corpo.alternativas).toHaveLength(4);
    expect(resposta.corpo.alternativas.filter((a: { correta: boolean }) => a.correta)).toHaveLength(1);
    // Assert - persistido de fato no banco
    expect(await prisma.questao.count()).toBe(1);
  });

  it('deveRetornar403ENaoGravarNadaQuandoAlunoTentaCadastrarQuestao', async () => {
    // Arrange
    const aluno = await criarUsuario('ALUNO');

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/questoes', { token: tokenPara(aluno), corpo: questaoValida() });

    // Assert
    expect(resposta.status).toBe(403);
    expect(resposta.corpo).toEqual({ message: 'Acesso negado para este papel.' });
    expect(await prisma.questao.count()).toBe(0);
  });

  it('deveRetornar400ComODetalheDoErroQuandoEnunciadoECurto', async () => {
    // Arrange
    const professor = await criarUsuario('PROFESSOR');

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/questoes', {
      token: tokenPara(professor),
      corpo: questaoValida({ enunciado: 'Curto' }),
    });

    // Assert
    expect(resposta.status).toBe(400);
    expect(resposta.corpo.erro).toHaveProperty('enunciado');
    expect(JSON.stringify(resposta.corpo.erro.enunciado)).toContain('Enunciado muito curto');
    expect(await prisma.questao.count()).toBe(0);
  });

  it('deveRetornar401QuandoRequisicaoNaoTemToken', async () => {
    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/questoes', { corpo: questaoValida() });

    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.corpo).toEqual({ message: 'Autenticacao obrigatoria.' });
  });
});

describe('QuestaoRepository (persistência com PostgreSQL de teste)', () => {
  it('deveSalvarQuestaoComAlternativasERegistrarLogDeAuditoriaNaMesmaTransacao', async () => {
    // Arrange
    const professor = await criarUsuario('PROFESSOR');
    const { alternativas, ...dados } = questaoValida();

    // Act
    const criada = await QuestaoRepository.criar(
      { ...dados, nivel: 'INTERMEDIARIO', autorId: professor.id, alternativas },
      professor.id,
    );
    const recuperada = await QuestaoRepository.buscarPorId(criada.id);

    // Assert
    expect(recuperada).not.toBeNull();
    expect(recuperada!.enunciado).toBe(dados.enunciado);
    expect(recuperada!.alternativas).toHaveLength(4);
    const logs = await prisma.auditLog.findMany({ where: { resourceId: criada.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'QUESTAO_CRIADA', userId: professor.id });
  });

  it('deveListarApenasQuestoesPublicasQuandoNaoHaAutorInformado', async () => {
    // Arrange - uma questão pública (prof. A) e uma privada (prof. B)
    const professorA = await criarUsuario('PROFESSOR');
    const professorB = await criarUsuario('PROFESSOR');
    const { alternativas, ...dados } = questaoValida();
    await QuestaoRepository.criar({ ...dados, nivel: 'BASICO', publica: true, autorId: professorA.id, alternativas }, professorA.id);
    await QuestaoRepository.criar({ ...dados, nivel: 'BASICO', publica: false, autorId: professorB.id, alternativas }, professorB.id);

    // Act
    const visaoPublica = await QuestaoRepository.listar({});
    const visaoDoProfessorB = await QuestaoRepository.listar({ autorId: professorB.id });

    // Assert
    expect(visaoPublica).toHaveLength(1);
    expect(visaoPublica[0].autorId).toBe(professorA.id);
    expect(visaoDoProfessorB).toHaveLength(2);
  });
});

describe('Fluxo completo: login -> cadastro de questão -> consulta (API + Service + BD)', () => {
  it('deveLogarComoProfessorCadastrarQuestaoEOAlunoConsultarSemGabarito', async () => {
    // Arrange
    const professor = await criarUsuario('PROFESSOR', 'senha-do-professor');
    const aluno = await criarUsuario('ALUNO');

    // Act 1 - login pela API (opção Professor)
    const login = await requisicao(baseUrl, 'POST', '/auth/login', {
      corpo: { email: professor.email, senha: 'senha-do-professor', perfil: 'PROFESSOR' },
    });
    // Act 2 - cadastro com o token emitido pelo login
    const criacao = await requisicao(baseUrl, 'POST', '/questoes', { token: login.corpo.token, corpo: questaoValida() });
    // Act 3 - consultas
    const minhas = await requisicao(baseUrl, 'GET', '/questoes?minhas=true', { token: login.corpo.token });
    const visaoAluno = await requisicao(baseUrl, 'GET', '/questoes', { token: tokenPara(aluno) });

    // Assert
    expect(login.status).toBe(200);
    expect(login.corpo.usuario).toMatchObject({ id: professor.id, role: 'PROFESSOR' });
    expect(criacao.status).toBe(201);
    expect(minhas.status).toBe(200);
    expect(minhas.corpo.map((q: { id: string }) => q.id)).toEqual([criacao.corpo.id]);
    expect(visaoAluno.status).toBe(200);
    expect(visaoAluno.corpo).toHaveLength(1);
    expect(visaoAluno.corpo[0].alternativas[0]).not.toHaveProperty('correta');
    const acoes = (await prisma.auditLog.findMany({ where: { userId: professor.id } })).map((log) => log.action);
    expect(acoes).toEqual(expect.arrayContaining(['LOGIN_SUCESSO', 'QUESTAO_CRIADA']));
  });

  it('deveRetornar403QuandoAlunoTentaEntrarPelaOpcaoProfessor', async () => {
    // Arrange
    const aluno = await criarUsuario('ALUNO', 'senha-do-aluno');

    // Act
    const login = await requisicao(baseUrl, 'POST', '/auth/login', {
      corpo: { email: aluno.email, senha: 'senha-do-aluno', perfil: 'PROFESSOR' },
    });

    // Assert
    expect(login.status).toBe(403);
    expect(login.corpo).toEqual({ message: 'Esta conta é de aluno. Selecione "Aluno" para entrar.' });
    expect(await prisma.auditLog.count({ where: { userId: aluno.id, action: 'LOGIN_SUCESSO' } })).toBe(0);
  });
});