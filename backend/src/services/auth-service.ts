import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ApiError } from '../errors/api-error';
import { AuthRepository } from '../repositories/auth-repository';

export class AuthService {
  constructor(private readonly repository = new AuthRepository()) {}

  async register(nome: string, email: string, senha: string) {
    if (await this.repository.findByEmail(email)) throw new ApiError(409, 'Nao foi possivel concluir o cadastro.');
    const user = await this.repository.createStudent(nome, email, await bcrypt.hash(senha, 12));
    return { id: user.id, email: user.email };
  }

  async login(email: string, senha: string) {
    const user = await this.repository.findByEmail(email);
    if (!user || !await bcrypt.compare(senha, user.senhaHash)) throw new ApiError(401, 'E-mail ou senha invalidos.');
    return { token: this.signToken(user.id, user.role), user: { nome: user.nome, email: user.email } };
  }

  async session(userId: string) {
    const user = await this.repository.findById(userId);
    if (!user) throw new ApiError(401, 'Sessao invalida.');
    return { user: { nome: user.nome, email: user.email }, nextStep: await this.repository.hasCompletedDiagnostic(userId) ? 'DASHBOARD' : 'DIAGNOSTIC' };
  }

  verifyToken(token: string) {
    try { return jwt.verify(token, this.jwtSecret()) as { sub: string; role: string }; }
    catch { throw new ApiError(401, 'Token invalido ou expirado.'); }
  }

  private signToken(userId: string, role: string) { return jwt.sign({ role }, this.jwtSecret(), { subject: userId, expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as jwt.SignOptions['expiresIn'] }); }
  private jwtSecret() { const secret = process.env.JWT_SECRET; if (!secret || secret.length < 32) throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.'); return secret; }
}
