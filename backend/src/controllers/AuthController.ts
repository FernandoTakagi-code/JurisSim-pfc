import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/AuthService';
import { UserRepository } from '../repositories/UserRepository';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
    
    if (!usuario.senhaHash) {
      return res.status(401).json({ erro: 'Esta conta usa login do Google. Entre com o Google.' });
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

static async google(req: Request, res: Response) {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ erro: 'Credencial do Google nao fornecida' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ erro: 'Token do Google invalido' });
  }

  if (!payload?.email) {
    return res.status(401).json({ erro: 'Nao foi possivel obter o e-mail da conta Google' });
  }

  let usuario = await UserRepository.buscarPorEmail(payload.email);

  if (!usuario) {
    const nomeSugerido = payload.name ?? payload.given_name ?? payload.email.split('@')[0];
  usuario = await UserRepository.criar({
  nome: nomeSugerido,
  email: payload.email,
  role: 'ALUNO',
});
  }

  const token = AuthService.gerarToken({ id: usuario.id, role: usuario.role });

  return res.status(200).json({
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
    token,
  });
}

  static async session(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  const [scheme, token] = authHeader?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token nao fornecido' });
  }

  try {
    const payload = AuthService.verificarToken(token);
    const usuario = await UserRepository.buscarPorId(payload.id);

    if (!usuario) {
      return res.status(401).json({ erro: 'Usuario nao encontrado' });
    }

    return res.status(200).json({
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
    });
  } catch {
    return res.status(401).json({ erro: 'Token invalido ou expirado' });
  }
}
static async atualizarNome(req: Request, res: Response) {
  const schema = z.object({ nome: z.string().min(2, 'Nome muito curto') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.format() });
  }

  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token nao fornecido' });
  }

  try {
    const payload = AuthService.verificarToken(token);
    const usuario = await UserRepository.atualizarNome(payload.id, parsed.data.nome);
    return res.status(200).json({
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
    });
  } catch {
    return res.status(401).json({ erro: 'Token invalido ou expirado' });
  }
}
}

