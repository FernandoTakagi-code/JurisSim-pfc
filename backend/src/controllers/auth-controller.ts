import type { Request, Response } from 'express';
import { z } from 'zod';
import { acceptanceSchema } from '../services/legal-acceptance';
import { AuthService } from '../services/auth-service';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';

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

  session = async (request: AuthenticatedRequest, response: Response) => {
    response.json(await this.service.session(request.auth!.userId));
  };
}
