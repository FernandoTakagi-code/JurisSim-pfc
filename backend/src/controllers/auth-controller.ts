import type { Request, Response } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { acceptanceSchema } from '../services/legal-acceptance';
import { AuthService } from '../services/auth-service';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Preserve the public registration/login contract of the previously active router.
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
const nomeSchema = z.object({ nome: z.string().min(2, 'Nome muito curto') });

export class AuthController {
  constructor(private readonly service = new AuthService()) {}

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
    const { credential } = request.body;
    if (!credential) {
      response.status(400).json({ message: 'Credencial do Google não fornecida.' });
      return;
    }
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      response.status(401).json({ message: 'Token do Google inválido.' });
      return;
    }
    if (!payload?.email) {
      response.status(401).json({ message: 'Não foi possível obter o e-mail da conta Google.' });
      return;
    }
    const nomeSugerido = payload.name ?? payload.given_name ?? payload.email.split('@')[0];
    response.json(await this.service.loginWithGoogle(payload.email, nomeSugerido));
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
}