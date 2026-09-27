import type { Request, Response } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { acceptanceSchema } from '../services/legal-acceptance';
import { AuthService } from '../services/auth-service';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';
import { PasswordRecoveryService } from '../services/password-recovery-service';
import { ConsoleRecoveryEmailSender } from '../services/recovery-email-sender';

const deleteAccountSchema = z.object({ senhaAtual: z.string().optional() });

const registerSchema = z.object({
  nome: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  role: z.enum(['PROFESSOR', 'ALUNO']),
  acceptance: acceptanceSchema,
});
const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Senha é obrigatória'),
});
const googleSchema = z.object({
  credential: z.string().min(1, 'Credencial do Google não fornecida.'),
  acceptance: acceptanceSchema.optional(),
});
const nomeSchema = z.object({ nome: z.string().min(2, 'Nome muito curto') });
const recoveryRequestSchema = z.object({ email: z.string().email('E-mail inválido.') });
const recoveryResetSchema = z.object({
  token: z.string().min(20).max(512),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
  confirmacaoSenha: z.string().min(6, 'Confirme a nova senha.'),
}).refine(data => data.senha === data.confirmacaoSenha, {
  path: ['confirmacaoSenha'],
  message: 'As senhas não coincidem.',
});

export class AuthController {
  constructor(
    private readonly service = new AuthService(),
    private readonly passwordRecovery = new PasswordRecoveryService(undefined, new ConsoleRecoveryEmailSender()),
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
    const { nome, email, senha, role, acceptance } = parsed.data;
    response.status(201).json(await this.service.register(nome, email, senha, role, acceptance));
  };

  login = async (request: Request, response: Response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      await this.service.recordLoginFailure();
      response.status(400).json({ message: 'Dados inválidos.', erro: parsed.error.format() });
      return;
    }
    response.json(await this.service.login(parsed.data.email, parsed.data.senha));
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
    if (!payload?.email || payload.email_verified !== true) {
      response.status(401).json({ message: 'Não foi possível obter o e-mail da conta Google.' });
      return;
    }
    const nomeSugerido = payload.name ?? payload.given_name ?? payload.email.split('@')[0];
    response.json(await this.service.loginWithGoogle(payload.email, nomeSugerido, parsed.data.acceptance));
  };

  session = async (request: AuthenticatedRequest, response: Response) => {
    response.json(await this.service.session(request.auth!.userId));
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
}