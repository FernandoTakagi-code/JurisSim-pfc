import crypto from 'node:crypto';
import { ApiError } from '../../errors/api-error';
import { AuthRepository } from '../../repositories/auth-repository';
import { EmailVerificationSender, UnconfiguredEmailVerificationSender } from '../email/email-verification-sender';
import { isValidAppUrl } from '../email/app-url';
import { EMAIL_VERIFICATION_TOKEN_TTL_MINUTES } from './auth-token-policy';
import { classifyEmailDeliveryFailure } from '../email/email-delivery-failure';
import { emailFrontendUrl } from '../email/email-frontend';
import { emailAccepted, emailFailed } from '../email/transactional-email-log';

export const PENDING_DELIVERY_MESSAGE = 'O envio está demorando para ser confirmado. O e-mail pode levar alguns minutos para chegar; confira a caixa de entrada e o spam antes de pedir outro link.';

export class EmailVerificationService {
  constructor(
    private readonly repository = new AuthRepository(),
    private readonly emailSender: EmailVerificationSender = new UnconfiguredEmailVerificationSender(),
    private readonly publicAppUrl = process.env.APP_PUBLIC_URL,
  ) {}

  async requestVerification(userId: string) {
    const publicAppUrl=emailFrontendUrl(this.publicAppUrl);
    if (!this.emailSender.isConfigured || !isValidAppUrl(publicAppUrl)) {
      throw new ApiError(503, 'A confirmação de e-mail está temporariamente indisponível.');
    }
    const user = await this.repository.findById(userId);
    if (!user || user.deletedAt) throw new ApiError(404, 'Usuário não encontrado.');
    if (user.emailVerifiedAt) return { message: 'E-mail já confirmado.' };

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);
    const record = await this.repository.createToken(userId, 'EMAIL_VERIFICATION', tokenHash, expiresAt);

    const verifyUrl = `${publicAppUrl}/#/verificar-email?token=${encodeURIComponent(token)}`;
    try {
      await this.emailSender.sendEmailVerification({
        userId,
        to: user.email,
        verifyUrl,
        expiresInMinutes: EMAIL_VERIFICATION_TOKEN_TTL_MINUTES,
      });
      emailAccepted('email_verification',record.id);
    } catch (error) {
      emailFailed('email_verification',record.id,error);
      const indeterminate = classifyEmailDeliveryFailure(error).outcome==='indeterminate';
      console.error('Falha no envio do e-mail de confirmação.');
      // Sem confirmação do provedor, o e-mail costuma chegar mesmo assim: o link continua válido e não é exibido erro.
      if (indeterminate) return { delivery: 'pending' as const, message: PENDING_DELIVERY_MESSAGE };
      await this.repository.markTokenUsed(record.id);
      throw new ApiError(503, 'A confirmação de e-mail está temporariamente indisponível.');
    }

    return { message: 'O provedor aceitou o envio do link de confirmação. A entrega na caixa de entrada pode levar alguns minutos.' };
  }

  async confirm(token: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (!await this.repository.consumeEmailVerification(tokenHash, new Date())) {
      throw new ApiError(400, 'Link inválido, expirado ou já utilizado.');
    }

    return { message: 'E-mail confirmado com sucesso!' };
  }
}
