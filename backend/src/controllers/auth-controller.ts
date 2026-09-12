import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth-service';
import type { AuthenticatedRequest } from '../middlewares/auth-middleware';

const email = z.string().trim().toLowerCase().email();
const registerSchema = z.object({ nome: z.string().trim().min(2).max(100), email, senha: z.string().min(8).max(72), confirmacaoSenha: z.string(), role: z.enum(['ADMIN', 'PROFESSOR', 'ALUNO']) }).refine(({ senha, confirmacaoSenha }) => senha === confirmacaoSenha, { path: ['confirmacaoSenha'], message: 'As senhas nao conferem.' });
const loginSchema = z.object({ email, senha: z.string().min(1).max(72) });

export class AuthController {
  constructor(private readonly service = new AuthService()) {}
  register = async (request: Request, response: Response) => { const body = registerSchema.parse(request.body); const user = await this.service.register(body.nome, body.email, body.senha, body.role); response.status(201).json({ message: 'Cadastro criado com sucesso.', user }); };
  login = async (request: Request, response: Response) => { const { email, senha } = loginSchema.parse(request.body); response.json(await this.service.login(email, senha)); };
  session = async (request: AuthenticatedRequest, response: Response) => response.json(await this.service.session(request.auth!.userId));
}
