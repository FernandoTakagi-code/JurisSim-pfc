import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const SALT_ROUNDS = 10;

export class AuthService {
  static async gerarHash(senha: string): Promise<string> {
    return bcrypt.hash(senha, SALT_ROUNDS);
  }

  static async compararSenha(senha: string, hash: string): Promise<boolean> {
    return bcrypt.compare(senha, hash);
  }

  static gerarToken(payload: { id: string; role: string }): string {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '8h' });
  }

  static verificarToken(token: string): { id: string; role: string } {
    return jwt.verify(token, env.JWT_SECRET) as { id: string; role: string };
  }
}
