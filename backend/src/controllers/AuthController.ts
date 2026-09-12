import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/AuthService';
import { UserRepository } from '../repositories/UserRepository';

const registerSchema = z.object({
  nome: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  role: z.enum(['ADMIN', 'PROFESSOR', 'ALUNO']),
});

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Senha é obrigatória'),
});

export class AuthController {
  static async register(req: Request, res: Response) {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ erro: parsed.error.format() });
    }

    const { nome, email, senha, role } = parsed.data;

    const usuarioExistente = await UserRepository.buscarPorEmail(email);
    if (usuarioExistente) {
      return res.status(409).json({ erro: 'E-mail já cadastrado' });
    }

    const senhaHash = await AuthService.gerarHash(senha);
    const usuario = await UserRepository.criar({ nome, email, senhaHash, role });

    const token = AuthService.gerarToken({ id: usuario.id, role: usuario.role });

    return res.status(201).json({
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
      token,
    });
  }

  static async login(req: Request, res: Response) {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ erro: parsed.error.format() });
    }

    const { email, senha } = parsed.data;

    const usuario = await UserRepository.buscarPorEmail(email);
    if (!usuario) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const senhaValida = await AuthService.compararSenha(senha, usuario.senhaHash);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const token = AuthService.gerarToken({ id: usuario.id, role: usuario.role });

    return res.status(200).json({
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
      token,
    });
  }
}