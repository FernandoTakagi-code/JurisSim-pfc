import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encerrar, iniciarServidor, limparBanco, loginPelaApi, prisma, requisicao } from './helpers';

// Rotas de turma (classRoutes) de ponta a ponta: HTTP real (porta aleatória) -> requireAuth/requireRoles
// -> handlers de /turmas -> ClassExamService -> Prisma -> PostgreSQL descartável.
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

async function criarTurma(token: string, nome = `Turma OAB ${randomUUID().slice(0, 8)}`) {
  const resposta = await requisicao(baseUrl, 'POST', '/turmas', { token, corpo: { nome } });
  expect(resposta.status).toBe(201);
  return resposta.corpo as { turma: { id: string; nome: string }; inviteCode: string };
}

describe('POST /turmas', () => {
  it('criar_comNomeValido_deveRetornar201ComTurmaECodigoDeConvite', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/turmas', { token: professor.token, corpo: { nome: 'Turma Noturna 2026' } });

    // Assert - resposta
    expect(resposta.status).toBe(201);
    expect(resposta.corpo.turma).toMatchObject({ id: expect.any(String), nome: 'Turma Noturna 2026', archivedAt: null, _count: { alunos: 0 } });
    expect(resposta.corpo.inviteCode).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(new Date(resposta.corpo.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // Assert - persistida e vinculada ao professor, guardando só o hash do convite
    const noBanco = await prisma.turma.findUnique({ where: { id: resposta.corpo.turma.id }, include: { professores: true } });
    expect(noBanco?.professores.map((p) => p.id)).toEqual([professor.usuario.id]);
    expect(noBanco?.codigoConvite).not.toBe(resposta.corpo.inviteCode);
  });

  it('criar_comNomeDeUmCaractere_deveRetornar422ComIssues', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/turmas', { token: professor.token, corpo: { nome: 'A' } });

    // Assert
    expect(resposta.status).toBe(422);
    expect(resposta.corpo.message).toBe('Dados invalidos.');
    expect(resposta.corpo.issues[0].path).toEqual(['nome']);
    expect(await prisma.turma.count()).toBe(0);
  });

  it('criar_comoAluno_deveRetornar403ENaoGravar', async () => {
    // Arrange
    const aluno = await loginPelaApi(baseUrl, 'ALUNO');

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/turmas', { token: aluno.token, corpo: { nome: 'Turma Pirata' } });

    // Assert
    expect(resposta.status).toBe(403);
    expect(resposta.corpo).toEqual({ message: 'Acesso negado para este papel.' });
    expect(await prisma.turma.count()).toBe(0);
  });
});

describe('GET /turmas', () => {
  it('listar_comoProfessor_deveRetornar200ApenasComSuasTurmasEHeaderNoStore', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const outroProfessor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const minha = await criarTurma(professor.token, 'Turma do Professor');
    await criarTurma(outroProfessor.token, 'Turma de Outro Professor');

    // Act
    const resposta = await requisicao(baseUrl, 'GET', '/turmas', { token: professor.token });

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('cache-control')).toBe('no-store');
    expect(resposta.corpo).toMatchObject({ page: 1, hasMore: false });
    expect(resposta.corpo.items).toHaveLength(1);
    expect(resposta.corpo.items[0]).toMatchObject({ id: minha.turma.id, nome: 'Turma do Professor' });
  });

  it('listar_semToken_deveRetornar401', async () => {
    // Act
    const resposta = await requisicao(baseUrl, 'GET', '/turmas');

    // Assert
    expect(resposta.status).toBe(401);
    expect(resposta.corpo).toEqual({ message: 'Autenticacao obrigatoria.' });
  });
});

describe('POST /turmas/join', () => {
  it('ingressar_comCodigoValido_deveRetornar200EMatricularAluno', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const aluno = await loginPelaApi(baseUrl, 'ALUNO');
    const { turma, inviteCode } = await criarTurma(professor.token);

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/turmas/join', { token: aluno.token, corpo: { code: inviteCode } });

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toEqual({ joined: true, message: 'Matrícula realizada.' });
    const alunos = await prisma.turma.findUnique({ where: { id: turma.id } }).alunos();
    expect(alunos?.map((a) => a.id)).toEqual([aluno.usuario.id]);
  });

  it('ingressar_quandoJaMatriculado_deveRetornar200ComJoinedFalseSemDuplicar', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const aluno = await loginPelaApi(baseUrl, 'ALUNO');
    const { turma, inviteCode } = await criarTurma(professor.token);
    await requisicao(baseUrl, 'POST', '/turmas/join', { token: aluno.token, corpo: { code: inviteCode } });

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/turmas/join', { token: aluno.token, corpo: { code: inviteCode } });

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toEqual({ joined: false, message: 'Você já está matriculado nesta turma.' });
    expect(await prisma.user.count({ where: { turmasComoAluno: { some: { id: turma.id } } } })).toBe(1);
  });

  it('ingressar_comCodigoInexistente_deveRetornar404ComMensagem', async () => {
    // Arrange
    const aluno = await loginPelaApi(baseUrl, 'ALUNO');

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/turmas/join', { token: aluno.token, corpo: { code: 'x'.repeat(32) } });

    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.corpo).toEqual({ message: 'Convite inválido, expirado ou turma indisponível.' });
  });

  it('ingressar_comoProfessor_deveRetornar403', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const { inviteCode } = await criarTurma(professor.token);

    // Act
    const resposta = await requisicao(baseUrl, 'POST', '/turmas/join', { token: professor.token, corpo: { code: inviteCode } });

    // Assert
    expect(resposta.status).toBe(403);
    expect(resposta.corpo).toEqual({ message: 'Acesso negado para este papel.' });
  });
});

describe('GET /turmas/students e GET /turmas/:id/students', () => {
  it('listarAlunos_comoProfessor_deveRetornar200ComAlunosDeTodasAsSuasTurmas', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const aluno = await loginPelaApi(baseUrl, 'ALUNO');
    const { inviteCode } = await criarTurma(professor.token);
    await requisicao(baseUrl, 'POST', '/turmas/join', { token: aluno.token, corpo: { code: inviteCode } });

    // Act
    const resposta = await requisicao(baseUrl, 'GET', '/turmas/students', { token: professor.token });

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toEqual({
      items: [{ id: aluno.usuario.id, nome: aluno.usuario.nome, email: aluno.usuario.email }],
      page: 1,
      hasMore: false,
    });
  });

  it('listarAlunosDaTurma_comTurmaPropria_deveRetornar200ApenasComAlunosDaquelaTurma', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const alunoA = await loginPelaApi(baseUrl, 'ALUNO');
    const alunoB = await loginPelaApi(baseUrl, 'ALUNO');
    const turmaA = await criarTurma(professor.token, 'Turma A');
    const turmaB = await criarTurma(professor.token, 'Turma B');
    await requisicao(baseUrl, 'POST', '/turmas/join', { token: alunoA.token, corpo: { code: turmaA.inviteCode } });
    await requisicao(baseUrl, 'POST', '/turmas/join', { token: alunoB.token, corpo: { code: turmaB.inviteCode } });

    // Act
    const resposta = await requisicao(baseUrl, 'GET', `/turmas/${turmaA.turma.id}/students`, { token: professor.token });

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.corpo.items.map((a: { id: string }) => a.id)).toEqual([alunoA.usuario.id]);
  });

  it('listarAlunosDaTurma_deTurmaDeOutroProfessor_deveRetornar404ComMensagem', async () => {
    // Arrange
    const dono = await loginPelaApi(baseUrl, 'PROFESSOR');
    const intruso = await loginPelaApi(baseUrl, 'PROFESSOR');
    const { turma } = await criarTurma(dono.token);

    // Act
    const resposta = await requisicao(baseUrl, 'GET', `/turmas/${turma.id}/students`, { token: intruso.token });

    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.corpo).toEqual({ message: 'Turma indisponível para esta conta.' });
  });
});

describe('PATCH /turmas/:id', () => {
  it('atualizar_comNovoNome_deveRetornar200EGravarNome', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const { turma } = await criarTurma(professor.token, 'Nome Antigo');

    // Act
    const resposta = await requisicao(baseUrl, 'PATCH', `/turmas/${turma.id}`, { token: professor.token, corpo: { nome: 'Nome Novo' } });

    // Assert
    expect(resposta.status).toBe(200);
    expect(resposta.corpo).toMatchObject({ id: turma.id, nome: 'Nome Novo', archivedAt: null });
    const lista = await requisicao(baseUrl, 'GET', '/turmas', { token: professor.token });
    expect(lista.corpo.items[0].nome).toBe('Nome Novo');
  });

  it('atualizar_turmaJaArquivada_deveRetornar409EManterNome', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const { turma } = await criarTurma(professor.token, 'Turma Encerrada');
    const arquivamento = await requisicao(baseUrl, 'PATCH', `/turmas/${turma.id}`, { token: professor.token, corpo: { archived: true } });
    expect(arquivamento.corpo.archivedAt).toEqual(expect.any(String));

    // Act
    const resposta = await requisicao(baseUrl, 'PATCH', `/turmas/${turma.id}`, { token: professor.token, corpo: { nome: 'Tentativa' } });

    // Assert
    expect(resposta.status).toBe(409);
    expect(resposta.corpo).toEqual({ message: 'A turma está arquivada e permanece somente para consulta.' });
    expect((await prisma.turma.findUnique({ where: { id: turma.id } }))?.nome).toBe('Turma Encerrada');
  });

  it('atualizar_comIdInexistente_deveRetornar404ComMensagem', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');

    // Act
    const resposta = await requisicao(baseUrl, 'PATCH', `/turmas/${randomUUID()}`, { token: professor.token, corpo: { nome: 'Fantasma' } });

    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.corpo).toEqual({ message: 'Turma indisponível para esta conta.' });
  });
});

describe('POST /turmas/:id/invite', () => {
  it('renovarConvite_deTurmaAtiva_deveRetornar200ComNovoCodigoEInvalidarOAntigo', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const aluno = await loginPelaApi(baseUrl, 'ALUNO');
    const { turma, inviteCode: codigoAntigo } = await criarTurma(professor.token);

    // Act
    const resposta = await requisicao(baseUrl, 'POST', `/turmas/${turma.id}/invite`, { token: professor.token });

    // Assert - resposta
    expect(resposta.status).toBe(200);
    expect(resposta.corpo.inviteCode).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(resposta.corpo.inviteCode).not.toBe(codigoAntigo);
    // Assert - efeito: o código antigo deixou de funcionar e o novo matricula
    const comAntigo = await requisicao(baseUrl, 'POST', '/turmas/join', { token: aluno.token, corpo: { code: codigoAntigo } });
    const comNovo = await requisicao(baseUrl, 'POST', '/turmas/join', { token: aluno.token, corpo: { code: resposta.corpo.inviteCode } });
    expect(comAntigo.status).toBe(404);
    expect(comNovo.corpo).toEqual({ joined: true, message: 'Matrícula realizada.' });
  });

  it('renovarConvite_deTurmaArquivada_deveRetornar404ComMensagem', async () => {
    // Arrange
    const professor = await loginPelaApi(baseUrl, 'PROFESSOR');
    const { turma } = await criarTurma(professor.token);
    await requisicao(baseUrl, 'PATCH', `/turmas/${turma.id}`, { token: professor.token, corpo: { archived: true } });

    // Act
    const resposta = await requisicao(baseUrl, 'POST', `/turmas/${turma.id}/invite`, { token: professor.token });

    // Assert
    expect(resposta.status).toBe(404);
    expect(resposta.corpo).toEqual({ message: 'Turma ativa indisponível para esta conta.' });
  });
});
