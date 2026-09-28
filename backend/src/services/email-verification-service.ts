import crypto from 'crypto';
import { ApiError } from '../errors/api-error';
import { AuthRepository } from '../repositories/auth-repository';
import { EmailVerificationSender, UnconfiguredEmailVerificationSender } from './email-verification-sender';

const EMAIL_VERIFICATION_TOKEN_TTL_MINUTES = 60;

function isValidAppUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    return process.env.NODE_ENV === 'production' ? parsed.protocol === 'https:' : (parsed.protocol === 'http:' || parsed.protocol === 'https:');
  } catch {
    return false;
  }
}

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
    if (!user) throw new ApiError(404, 'Usuário não encontrado.');

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);
    await this.repository.createToken(userId, 'EMAIL_VERIFICATION', tokenHash, expiresAt);

    const verifyUrl = `${this.publicAppUrl}/#/verificar-email?token=${encodeURIComponent(token)}`;
    await this.emailSender.sendEmailVerification({
      to: user.email,
      verifyUrl,
      expiresInMinutes: EMAIL_VERIFICATION_TOKEN_TTL_MINUTES,
    });

    return { message: 'Enviamos um link de confirmação para o seu e-mail.' };
  }

  async confirm(token: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = await this.repository.findValidToken(tokenHash, 'EMAIL_VERIFICATION');
    if (!record) throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');

    await this.repository.markTokenUsed(record.id);
    await this.repository.markEmailVerified(record.userId);

    return { message: 'E-mail confirmado com sucesso!' };
  }
}