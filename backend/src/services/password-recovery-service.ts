import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { ApiError } from '../errors/api-error';
import { GOOGLE_PASSWORD_SENTINEL } from '../repositories/auth-repository';
import { PasswordRecoveryRepository } from '../repositories/password-recovery-repository';
import type { RecoveryEmailSender } from './recovery-email-sender';
import { isValidAppUrl } from './app-url';
import { PASSWORD_RECOVERY_TOKEN_TTL_MINUTES } from './auth-token-policy';
import { assertValidPassword } from './password-policy';
import { performance } from 'node:perf_hooks';
import { isIndeterminateEmailDelivery } from './email-delivery-failure';

export { PASSWORD_RECOVERY_TOKEN_TTL_MINUTES } from './auth-token-policy';
const NEUTRAL_RESPONSE = 'Se existir uma conta associada a este e-mail, voce recebera instrucoes caso o envio seja concluido. Se nao receber a mensagem, tente novamente mais tarde.';

export class PasswordRecoveryService {
  constructor(
    private readonly repository = new PasswordRecoveryRepository(),
    private readonly emailSender?: RecoveryEmailSender,
    private readonly publicAppUrl = process.env.APP_PUBLIC_URL,
  ) {}

  async requestRecovery(email: string) {
    if (!this.emailSender?.isConfigured || !isValidAppUrl(this.publicAppUrl)) {
      throw new ApiError(503, 'A recuperação de senha está temporariamente indisponível.');
    }

    const account = await this.repository.findAccount(email);
    if (!account?.senhaHash || account.deletedAt || account.senhaHash === GOOGLE_PASSWORD_SENTINEL) return NEUTRAL_RESPONSE;

    const generationStartedAt = performance.now();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    console.info('email.token.generated', { flow: 'password_recovery', elapsedMs: Math.round(performance.now() - generationStartedAt) });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASSWORD_RECOVERY_TOKEN_TTL_MINUTES * 60 * 1000);
    const persistenceStartedAt = performance.now();
    const tokenId = await this.repository.createToken(account.id, tokenHash, now, expiresAt);
    console.info('email.token.persisted', { flow: 'password_recovery', elapsedMs: Math.round(performance.now() - persistenceStartedAt) });
    if (!tokenId) return NEUTRAL_RESPONSE;

    const resetUrl = `${new URL(this.publicAppUrl!).toString().replace(/\/$/, '')}/#/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await this.emailSender.sendPasswordRecovery({
        to: email,
        resetUrl,
        expiresInMinutes: PASSWORD_RECOVERY_TOKEN_TTL_MINUTES,
      });
    } catch (error) {
      if (isIndeterminateEmailDelivery(error)) {
        console.warn('Resultado do envio de recuperacao indeterminado; token preservado.');
      } else {
        await this.repository.invalidateToken(tokenId, new Date());
        console.error('Falha no envio do e-mail de recupera\u00e7\u00e3o de senha.');
      }
    }
    return NEUTRAL_RESPONSE;
  }

  async resetPassword(token: string, senha: string, confirmacaoSenha: string) {
    if (senha !== confirmacaoSenha) throw new ApiError(400, 'As senhas não coincidem.');
    assertValidPassword(senha);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const currentPasswordHash = await this.repository.getUsablePasswordHash(tokenHash, now);
    if (!currentPasswordHash) {
      throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');
    }
    if (await bcrypt.compare(senha, currentPasswordHash)) {
      throw new ApiError(400, 'Por segurança, sua nova senha deve ser diferente da senha atual.');
    }
    const senhaHash = await bcrypt.hash(senha, 10);
    const completed = await this.repository.consumeAndReset(tokenHash, senhaHash, new Date(), currentPasswordHash);
    if (!completed) throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');
    return { message: 'Senha redefinida. Você já pode entrar com sua nova senha.' };
  }
}
