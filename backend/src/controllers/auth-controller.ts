import type { Request, Response } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { acceptanceSchema } from '../services/legal-acceptance';
import { AuthService } from '../services/auth-service';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';
import { PasswordRecoveryService } from '../services/password-recovery-service';
import { BrevoRecoveryEmailSender } from '../services/recovery-email-sender';
import { EmailVerificationService } from '../services/email-verification-service';
import { BrevoEmailVerificationSender } from '../services/email-verification-sender';
import { isLocalEmailCaptureRequested, localEmailVerificationCapture } from '../services/local-email-capture';
import type { LocalEmailVerificationCapture } from '../services/local-email-capture';
import { passwordSchema } from '../services/password-policy';
import { ApiError } from '../errors/api-error';

const deleteAccountSchema = z.object({ senhaAtual: z.string().optional() });
const emailSchema = z.string().trim().email('E-mail inválido').max(254);
const perfilSchema = z.enum(['ALUNO', 'PROFESSOR']).optional();

const registerSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120),
  email: emailSchema,
  senha: passwordSchema,
  confirmacaoSenha: z.string().optional(),
  // The public registration endpoint may only request a student account.
  // The repository assigns ALUNO itself and does not trust this field.
  role: z.literal('ALUNO').optional(),
  acceptance: acceptanceSchema,
}).refine(data => data.confirmacaoSenha === undefined || data.senha === data.confirmacaoSenha, { message: 'As senhas não coincidem.', path: ['confirmacaoSenha'] });
const loginSchema = z.object({
  email: emailSchema,
  senha: z.string().min(1, 'Senha é obrigatória').max(1024),
  perfil: perfilSchema,
});
const googleSchema = z.object({
  credential: z.string().min(1, 'Credencial do Google não fornecida.'),
  acceptance: acceptanceSchema.optional(),
  perfil: perfilSchema,
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
});
const nomeSchema = z.object({ nome: z.string().min(2, 'Nome muito curto') });
const recoveryRequestSchema = z.object({ email: emailSchema });
const recoveryResetSchema = z.object({
  token: z.string().min(20).max(512),
  senha: passwordSchema,
  confirmacaoSenha: z.string().min(1, 'Confirme a nova senha.'),
}).refine(data => data.senha === data.confirmacaoSenha, {
  path: ['confirmacaoSenha'],
  message: 'As senhas não coincidem.',
});
const confirmEmailSchema = z.object({ token: z.string().min(20).max(512) });

export class AuthController {
  constructor(
    private readonly service = new AuthService(),
    private readonly passwordRecovery = new PasswordRecoveryService(undefined, new BrevoRecoveryEmailSender()),
    private readonly emailVerification = new EmailVerificationService(undefined,
      isLocalEmailCaptureRequested() ? localEmailVerificationCapture : new BrevoEmailVerificationSender()),
    private readonly localEmailCapture: LocalEmailVerificationCapture = localEmailVerificationCapture,
  ) {}

  solicitarRecuperacaoSenha = async (request: Request, response: Response) => {
    const parsed = recoveryRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Informe um e-mail válido.' });
      return;
    }
    const message = await this.passwordRecovery.requestRecovery(parsed.data.email);
    response.status(202).json({ message });
  };

  redefinirSenha = async (request: Request, response: Response) => {
    const parsed = recoveryResetSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' });
      return;
    }
    response.json(await this.passwordRecovery.resetPassword(parsed.data.token, parsed.data.senha, parsed.data.confirmacaoSenha));
  };

  register = async (request: Request, response: Response) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Verifique os dados e aceite as versões atuais dos Termos de Uso e da Política de Privacidade.', erro: parsed.error.format() });
      return;
    }
    const { nome, email, senha, acceptance } = parsed.data;
    const resultado = await this.service.register(nome, email, senha, acceptance);
    let emailVerification;
    try {
      const verification = await this.emailVerification.requestVerification(resultado.usuario.id);
      emailVerification = isLocalEmailCaptureRequested()
        ? { status: 'captured', message: 'Conta criada. Entre e use “Reenviar e-mail de confirmação” para obter o link local.' }
        : { status: 'accepted', message: verification.message };
    } catch (error) {
      console.error('Não foi possível enviar a confirmação de e-mail após o cadastro.');
      const deliveryUnknown = error instanceof ApiError && error.message.includes('O provedor não confirmou');
      emailVerification = {
        status: 'unavailable',
        message: deliveryUnknown
          ? 'Conta criada. O recebimento do e-mail não foi confirmado; confira a caixa de entrada e o spam antes de pedir outro link.'
          : 'Conta criada, mas não foi possível enviar a confirmação de e-mail. Entre e solicite o reenvio.',
      };
    }
    response.status(201).json({ ...resultado, emailVerification });
  };

  login = async (request: Request, response: Response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      await this.service.recordLoginFailure();
      response.status(400).json({ message: 'Dados inválidos.', erro: parsed.error.format() });
      return;
    }
    response.json(await this.service.login(parsed.data.email, parsed.data.senha, parsed.data.perfil));
  };

  google = async (request: Request, response: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      response.status(503).json({ message: 'Login Google indisponível: configure GOOGLE_CLIENT_ID no backend.' });
      return;
    }
    const parsed = googleSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Envie uma credencial Google válida e, quando solicitado, o aceite legal atual.' });
      return;
    }
    let payload;
    try {
      const ticket = await new OAuth2Client(clientId).verifyIdToken({
        idToken: parsed.data.credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      response.status(401).json({ message: 'Token do Google inválido.' });
      return;
    }
    if (!payload?.email || payload.email_verified !== true || payload.nonce !== parsed.data.nonce) {
      response.status(401).json({ message: 'Não foi possível obter o e-mail da conta Google.' });
      return;
    }
    const emailVerificado = payload.email.trim().toLowerCase();
    const nomeSugerido = payload.name ?? payload.given_name ?? emailVerificado.split('@')[0];
    response.json(await this.service.loginWithGoogle(emailVerificado, nomeSugerido, parsed.data.acceptance, parsed.data.perfil));
  };

  logout = async (request: AuthenticatedRequest, response: Response) => {
    response.json(await this.service.logout(request.auth!.userId));
  };

  session = async (request: AuthenticatedRequest, response: Response) => {
    response.json(await this.service.session(request.auth!.userId, request.get('x-jurissim-local-demo') === 'true'));
  };

  atualizarNome = async (request: AuthenticatedRequest, response: Response) => {
    const parsed = nomeSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Nome inválido.', erro: parsed.error.format() });
      return;
    }
    const usuario = await this.service.updateNome(request.auth!.userId, parsed.data.nome);
    response.json({ usuario });
  };

  excluirConta = async (request: AuthenticatedRequest, response: Response) => {
    const parsed = deleteAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Dados inválidos.', erro: parsed.error.format() });
      return;
    }
    response.json(await this.service.deleteAccount(request.auth!.userId, parsed.data.senhaAtual));
  };

  solicitarConfirmacaoEmail = async (request: AuthenticatedRequest, response: Response) => {
    const userId = request.auth!.userId;
    let result: { message: string };
    try {
      result = await this.emailVerification.requestVerification(userId);
    } catch (error) {
      const pendingLocalLink = isLocalEmailCaptureRequested() && error instanceof ApiError && error.statusCode === 429
        ? this.localEmailCapture.takeVerificationLink(userId)
        : undefined;
      if (pendingLocalLink) {
        response.status(202).json({ message: 'Link de confirmacao local disponivel para esta conta.', localVerificationUrl: pendingLocalLink });
        return;
      }
      throw error;
    }
    const localVerificationUrl = this.localEmailCapture.takeVerificationLink(userId);
    response.status(202).json(localVerificationUrl
      ? { message: 'Link de confirmação local disponível para esta conta.', localVerificationUrl }
      : result);
  };

  confirmarEmail = async (request: Request, response: Response) => {
    const parsed = confirmEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Token inválido.' });
      return;
    }
    response.json(await this.emailVerification.confirm(parsed.data.token));
  };
}
