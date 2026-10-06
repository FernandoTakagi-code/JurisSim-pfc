import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../errors/api-error';
import { GOOGLE_PASSWORD_SENTINEL } from '../../repositories/auth-repository';
import { PasswordRecoveryService, PASSWORD_RECOVERY_TOKEN_TTL_MINUTES } from '../../services/password-recovery-service';

// Teste unitário: repositório e envio de e-mail são dublês injetados pelo construtor.
const APP_URL = 'http://localhost:5173';
const RESPOSTA_NEUTRA = 'Se existir uma conta associada a este e-mail, enviaremos as instruções de recuperação.';

function criarDependencias(conta: { id: string; senhaHash: string | null } | null) {
  const repositorio = {
    findAccount: vi.fn().mockResolvedValue(conta),
    createToken: vi.fn().mockResolvedValue('token-id-1'),
    invalidateToken: vi.fn().mockResolvedValue(undefined),
    isTokenUsable: vi.fn().mockResolvedValue(true),
    consumeAndReset: vi.fn().mockResolvedValue(true),
  };
  const emailSender = {
    isConfigured: true,
    sendPasswordRecovery: vi.fn().mockResolvedValue(undefined),
  };
  return { repositorio, emailSender };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PasswordRecoveryService.requestRecovery()', () => {
  it('deveGerarTokenEEnviarEmailComLinkQuandoContaPossuiSenha', async () => {
    // Arrange
    const { repositorio, emailSender } = criarDependencias({ id: 'user-1', senhaHash: 'hash-bcrypt' });
    const service = new PasswordRecoveryService(repositorio as never, emailSender, APP_URL);

    // Act
    const resposta = await service.requestRecovery('ana@jurissim.local');

    // Assert
    expect(resposta).toBe(RESPOSTA_NEUTRA);
    expect(repositorio.createToken).toHaveBeenCalledWith('user-1', expect.any(String), expect.any(Date), expect.any(Date));
    expect(emailSender.sendPasswordRecovery).toHaveBeenCalledTimes(1);
    const email = emailSender.sendPasswordRecovery.mock.calls[0][0];
    expect(email.to).toBe('ana@jurissim.local');
    expect(email.resetUrl).toMatch(/^http:\/\/localhost:5173\/#\/reset-password\?token=.+/);
    expect(email.expiresInMinutes).toBe(PASSWORD_RECOVERY_TOKEN_TTL_MINUTES);
  });

  it('deveResponderDeFormaNeutraSemEnviarEmailQuandoEmailNaoExiste', async () => {
    // Arrange
    const { repositorio, emailSender } = criarDependencias(null);
    const service = new PasswordRecoveryService(repositorio as never, emailSender, APP_URL);

    // Act
    const resposta = await service.requestRecovery('inexistente@jurissim.local');

    // Assert - mesma resposta para não revelar quais e-mails existem
    expect(resposta).toBe(RESPOSTA_NEUTRA);
    expect(repositorio.createToken).not.toHaveBeenCalled();
    expect(emailSender.sendPasswordRecovery).not.toHaveBeenCalled();
  });

  it('naoDeveEnviarEmailQuandoContaFoiCriadaPeloGoogle', async () => {
    // Arrange - caso-limite: conta existe, mas não tem senha para recuperar
    const { repositorio, emailSender } = criarDependencias({ id: 'user-2', senhaHash: GOOGLE_PASSWORD_SENTINEL });
    const service = new PasswordRecoveryService(repositorio as never, emailSender, APP_URL);

    // Act
    const resposta = await service.requestRecovery('google@jurissim.local');

    // Assert
    expect(resposta).toBe(RESPOSTA_NEUTRA);
    expect(emailSender.sendPasswordRecovery).not.toHaveBeenCalled();
  });

  it('deveLancarApiError503QuandoEnvioDeEmailNaoEstaConfigurado', async () => {
    // Arrange
    const { repositorio, emailSender } = criarDependencias({ id: 'user-1', senhaHash: 'hash-bcrypt' });
    const service = new PasswordRecoveryService(repositorio as never, { ...emailSender, isConfigured: false }, APP_URL);

    // Act
    const tentativa = service.requestRecovery('ana@jurissim.local');

    // Assert
    await expect(tentativa).rejects.toBeInstanceOf(ApiError);
    await expect(tentativa).rejects.toMatchObject({
      statusCode: 503,
      message: 'A recuperação de senha está temporariamente indisponível.',
    });
    expect(repositorio.findAccount).not.toHaveBeenCalled();
  });

  it('deveInvalidarOTokenQuandoOEnvioDoEmailFalha', async () => {
    // Arrange
    const { repositorio, emailSender } = criarDependencias({ id: 'user-1', senhaHash: 'hash-bcrypt' });
    emailSender.sendPasswordRecovery.mockRejectedValue(new Error('SMTP indisponível'));
    const service = new PasswordRecoveryService(repositorio as never, emailSender, APP_URL);

    // Act
    const resposta = await service.requestRecovery('ana@jurissim.local');

    // Assert
    expect(resposta).toBe(RESPOSTA_NEUTRA);
    expect(repositorio.invalidateToken).toHaveBeenCalledWith('token-id-1', expect.any(Date));
  });
});

describe('PasswordRecoveryService.resetPassword()', () => {
  it('deveRecusarQuandoSenhaEConfirmacaoNaoCoincidem', async () => {
    // Arrange
    const { repositorio, emailSender } = criarDependencias(null);
    const service = new PasswordRecoveryService(repositorio as never, emailSender, APP_URL);

    // Act
    const tentativa = service.resetPassword('token-qualquer', 'nova-senha-1', 'nova-senha-2');

    // Assert
    await expect(tentativa).rejects.toMatchObject({ statusCode: 400, message: 'As senhas não coincidem.' });
    expect(repositorio.isTokenUsable).not.toHaveBeenCalled();
    expect(repositorio.consumeAndReset).not.toHaveBeenCalled();
  });

  it('deveRecusarTokenExpiradoOuJaUtilizado', async () => {
    // Arrange
    const { repositorio, emailSender } = criarDependencias(null);
    repositorio.isTokenUsable.mockResolvedValue(false);
    const service = new PasswordRecoveryService(repositorio as never, emailSender, APP_URL);

    // Act
    const tentativa = service.resetPassword('token-expirado', 'nova-senha', 'nova-senha');

    // Assert
    await expect(tentativa).rejects.toMatchObject({ statusCode: 400, message: 'Link inválido, expirado ou já utilizado.' });
    expect(repositorio.consumeAndReset).not.toHaveBeenCalled();
  });
});