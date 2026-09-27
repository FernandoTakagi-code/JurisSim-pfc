import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { ApiError } from '../errors/api-error';
import { GOOGLE_PASSWORD_SENTINEL } from '../repositories/auth-repository';
import { PasswordRecoveryRepository } from '../repositories/password-recovery-repository';
import type { RecoveryEmailSender } from './recovery-email-sender';

export const PASSWORD_RECOVERY_TOKEN_TTL_MINUTES = 30;
const NEUTRAL_RESPONSE = 'Se existir uma conta associada a este e-mail, enviaremos as instruções de recuperação.';

export class PasswordRecoveryService {
  constructor(
    private readonly repository = new PasswordRecoveryRepository(),
    private readonly emailSender?: RecoveryEmailSender,
    private readonly publicAppUrl = process.env.APP_PUBLIC_URL,
  ) {}

  async requestRecovery(email: string) {
    if (!this.emailSender?.isConfigured || !this.isValidAppUrl(this.publicAppUrl)) {
      throw new ApiError(503, 'A recuperação de senha está temporariamente indisponível.');
    }

    const account = await this.repository.findAccount(email);
    if (!account?.senhaHash || account.senhaHash === GOOGLE_PASSWORD_SENTINEL) return NEUTRAL_RESPONSE;

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASSWORD_RECOVERY_TOKEN_TTL_MINUTES * 60 * 1000);
    const tokenId = await this.repository.createToken(account.id, tokenHash, now, expiresAt);
    if (!tokenId) return NEUTRAL_RESPONSE;

    const resetUrl = `${this.publicAppUrl!.replace(/\/$/, '')}/#/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await this.emailSender.sendPasswordRecovery({
        to: email,
        resetUrl,
        expiresInMinutes: PASSWORD_RECOVERY_TOKEN_TTL_MINUTES,
      });
    } catch {
      await this.repository.invalidateToken(tokenId, new Date());
      console.error('Falha no envio do e-mail de recuperação de senha.');
    }
    return NEUTRAL_RESPONSE;
  }

  async resetPassword(token: string, senha: string, confirmacaoSenha: string) {
    if (senha !== confirmacaoSenha) throw new ApiError(400, 'As senhas não coincidem.');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    if (!await this.repository.isTokenUsable(tokenHash, now)) {
      throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');
    }
    const senhaHash = await bcrypt.hash(senha, 10);
    const completed = await this.repository.consumeAndReset(tokenHash, senhaHash, now);
    if (!completed) throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');
    return { message: 'Senha redefinida. Você já pode entrar com sua nova senha.' };
  }

  private isValidAppUrl(value?: string): boolean {
    if (!value) return false;
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) && !url.username && !url.password;
    } catch {
      return false;
    }
  }
}
