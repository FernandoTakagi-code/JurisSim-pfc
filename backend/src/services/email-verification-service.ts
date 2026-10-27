import crypto from 'crypto';
import { ApiError } from '../errors/api-error';
import { AuthRepository } from '../repositories/auth-repository';
import { EmailVerificationSender, UnconfiguredEmailVerificationSender } from './email-verification-sender';
import { isValidAppUrl } from './app-url';
import { EMAIL_VERIFICATION_TOKEN_TTL_MINUTES } from './auth-token-policy';

export class EmailVerificationService {
  constructor(
    private readonly repository = new AuthRepository(),
    private readonly emailSender: EmailVerificationSender = new UnconfiguredEmailVerificationSender(),
    private readonly publicAppUrl = process.env.APP_PUBLIC_URL,
  ) {}

  async requestVerification(userId: string) {
    if (!this.emailSender.isConfigured || !isValidAppUrl(this.publicAppUrl)) {
      throw new ApiError(503, 'A confirmação de e-mail está temporariamente indisponível.');
    }
    const user = await this.repository.findById(userId);
    if (!user || user.deletedAt) throw new ApiError(404, 'Usuário não encontrado.');
    if (user.emailVerifiedAt) return { message: 'E-mail já confirmado.' };

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);
    const record = await this.repository.createToken(userId, 'EMAIL_VERIFICATION', tokenHash, expiresAt);

    const verifyUrl = `${new URL(this.publicAppUrl).toString().replace(/\/$/, '')}/#/verificar-email?token=${encodeURIComponent(token)}`;
    try {
      await this.emailSender.sendEmailVerification({
        userId,
        to: user.email,
        verifyUrl,
        expiresInMinutes: EMAIL_VERIFICATION_TOKEN_TTL_MINUTES,
      });
    } catch {
      await this.repository.markTokenUsed(record.id);
      console.error('Falha no envio do e-mail de confirmação.');
      throw new ApiError(503, 'A confirmação de e-mail está temporariamente indisponível.');
    }

    return { message: 'Enviamos um link de confirmação para o seu e-mail.' };
  }

  async confirm(token: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (!await this.repository.consumeEmailVerification(tokenHash, new Date())) {
      throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');
    }

    return { message: 'E-mail confirmado com sucesso!' };
  }
}
