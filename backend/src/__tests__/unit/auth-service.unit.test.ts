import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../errors/api-error';
import { GOOGLE_PASSWORD_SENTINEL } from '../../repositories/auth-repository';
import { AuthService } from '../../services/auth-service';
import versions from '../../legal-versions.json';

// Teste unitário: o repositório é substituído por um dublê (vi.fn),
// então nenhum teste aqui acessa o banco de dados.
const JWT_SECRET = 'segredo-de-teste-unitario-com-mais-de-32-caracteres';
const SENHA = 'senha-correta';
let senhaHash: string;

function usuario(role: 'ALUNO' | 'PROFESSOR' | 'ADMIN', hash = senhaHash) {
  return { id: `user-${role.toLowerCase()}`, nome: 'Usuário Teste', email: 'teste@jurissim.local', role, senhaHash: hash };
}

function criarRepositorioFalso(usuarioEncontrado: ReturnType<typeof usuario> | null) {
  return {
    findByEmail: vi.fn().mockResolvedValue(usuarioEncontrado),
    recordLogin: vi.fn().mockResolvedValue(undefined),
    createUser: vi.fn(),
  };
}

beforeAll(async () => {
  senhaHash = await bcrypt.hash(SENHA, 4);
});

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

describe('AuthService.login() - perfil escolhido na tela de login', () => {
  it('deveAutenticarProfessorPelaOpcaoProfessorERegistrarLoginSucesso', async () => {
    // Arrange
    const repositorio = criarRepositorioFalso(usuario('PROFESSOR'));
    const service = new AuthService(repositorio as never);

    // Act
    const resultado = await service.login('teste@jurissim.local', SENHA, 'PROFESSOR');

    // Assert
    const payload = jwt.verify(resultado.token, JWT_SECRET) as jwt.JwtPayload;
    expect(payload.role).toBe('PROFESSOR');
    expect(resultado.usuario.role).toBe('PROFESSOR');
    expect(repositorio.recordLogin).toHaveBeenCalledWith('LOGIN_SUCESSO', 'user-professor');
  });

  it('deveLancarApiError403QuandoAlunoTentaEntrarPelaOpcaoProfessor', async () => {
    // Arrange
    const repositorio = criarRepositorioFalso(usuario('ALUNO'));
    const service = new AuthService(repositorio as never);

    // Act
    const tentativa = service.login('teste@jurissim.local', SENHA, 'PROFESSOR');

    // Assert
    await expect(tentativa).rejects.toBeInstanceOf(ApiError);
    await expect(tentativa).rejects.toMatchObject({
      statusCode: 403,
      message: 'Esta conta é de aluno. Selecione "Aluno" para entrar.',
    });
    expect(repositorio.recordLogin).not.toHaveBeenCalledWith('LOGIN_SUCESSO', expect.anything());
  });

  it('deveRegistrarLoginFalhaENaoEmitirTokenQuandoSenhaEstaIncorreta', async () => {
    // Arrange
    const repositorio = criarRepositorioFalso(usuario('ALUNO'));
    const service = new AuthService(repositorio as never);

    // Act
    const tentativa = service.login('teste@jurissim.local', 'senha-errada', 'ALUNO');

    // Assert
    await expect(tentativa).rejects.toMatchObject({ statusCode: 401, message: 'E-mail ou senha inválidos.' });
    expect(repositorio.recordLogin).toHaveBeenCalledTimes(1);
    expect(repositorio.recordLogin).toHaveBeenCalledWith('LOGIN_FALHA', 'user-aluno');
  });

  it('devePermitirAdminEntrarPelaOpcaoProfessor', async () => {
    // Arrange - caso-limite: ADMIN não é PROFESSOR, mas a regra o aceita nessa opção
    const repositorio = criarRepositorioFalso(usuario('ADMIN'));
    const service = new AuthService(repositorio as never);

    // Act
    const resultado = await service.login('teste@jurissim.local', SENHA, 'PROFESSOR');

    // Assert
    expect(resultado.usuario.role).toBe('ADMIN');
    expect(repositorio.recordLogin).toHaveBeenCalledWith('LOGIN_SUCESSO', 'user-admin');
  });

  it('deveRecusarLoginPorSenhaQuandoContaFoiCriadaPeloGoogle', async () => {
    // Arrange - caso-limite: conta existe, mas não possui senha utilizável
    const repositorio = criarRepositorioFalso(usuario('ALUNO', GOOGLE_PASSWORD_SENTINEL));
    const service = new AuthService(repositorio as never);

    // Act
    const tentativa = service.login('teste@jurissim.local', GOOGLE_PASSWORD_SENTINEL, 'ALUNO');

    // Assert
    await expect(tentativa).rejects.toMatchObject({
      statusCode: 401,
      message: 'Esta conta usa login do Google. Entre com o Google.',
    });
    expect(repositorio.recordLogin).not.toHaveBeenCalled();
  });
});

describe('AuthService.register()', () => {
  it('deveLancarApiError409ENaoCriarUsuarioQuandoEmailJaEstaCadastrado', async () => {
    // Arrange
    const repositorio = criarRepositorioFalso(usuario('ALUNO'));
    const service = new AuthService(repositorio as never);
    const aceite = { accepted: true, termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion };

    // Act
    const tentativa = service.register('Ana', 'teste@jurissim.local', 'senha-segura', 'ALUNO', aceite);

    // Assert
    await expect(tentativa).rejects.toMatchObject({ statusCode: 409, message: 'E-mail já cadastrado.' });
    expect(repositorio.createUser).not.toHaveBeenCalled();
  });
});