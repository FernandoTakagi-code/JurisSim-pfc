import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { acceptanceSchema } from './legal-acceptance';
import { ApiError } from '../errors/api-error';
import { AuthRepository, GOOGLE_PASSWORD_SENTINEL } from '../repositories/auth-repository';
import versions from '../legal-versions.json';


const jwtPayloadSchema = z.object({
  id: z.string().trim().min(1),
  role: z.enum(['ALUNO', 'PROFESSOR', 'ADMIN']),
});

export class AuthService {
  constructor(private readonly repository = new AuthRepository()) {}

  async register(nome: string, email: string, senha: string, role: 'ALUNO' | 'PROFESSOR', acceptance?: unknown) {
    acceptanceSchema.parse(acceptance);
    if (await this.repository.findByEmail(email)) throw new ApiError(409, 'E-mail já cadastrado.');
    const senhaHash = await bcrypt.hash(senha, 10);
    const user = await this.repository.createUser(nome, email, senhaHash, role, acceptance);
    return this.loginResponse(user);
  }

  async login(email: string, senha: string) {
    const user = await this.repository.findByEmail(email);
    if (!user) {
      await this.repository.recordLogin('LOGIN_FALHA');
      throw new ApiError(401, 'E-mail ou senha inválidos.');
    }
    if (!user.senhaHash || user.senhaHash === GOOGLE_PASSWORD_SENTINEL) {
      throw new ApiError(401, 'Esta conta usa login do Google. Entre com o Google.');
    }
    if (!await bcrypt.compare(senha, user.senhaHash)) {
      await this.repository.recordLogin('LOGIN_FALHA', user.id);
      throw new ApiError(401, 'E-mail ou senha inválidos.');
    }
    const response = this.loginResponse(user);
    await this.repository.recordLogin('LOGIN_SUCESSO', user.id);
    return response;
  }

  recordLoginFailure() { return this.repository.recordLogin('LOGIN_FALHA'); }

  async loginWithGoogle(email: string, nomeSugerido: string, acceptance?: unknown) {
    const existing = await this.repository.findByEmail(email);
    if (existing?.senhaHash && existing.senhaHash !== GOOGLE_PASSWORD_SENTINEL) {
      throw new ApiError(409, 'Este e-mail já possui uma conta com senha. Entre com seu e-mail e senha.');
    }
    const parsedAcceptance = acceptance === undefined ? undefined : acceptanceSchema.safeParse(acceptance);
    if (parsedAcceptance && !parsedAcceptance.success) {
      throw new ApiError(400, 'Aceite os Termos de Uso e o Aviso de Privacidade nas versões atuais.');
    }
    const hasCurrentAcceptance = Boolean(
      existing?.legalAcceptedAt &&
      existing.termsVersion === versions.termsVersion &&
      existing.privacyVersion === versions.privacyVersion,
    );
    if (!hasCurrentAcceptance && !parsedAcceptance?.success) return { requiresAcceptance: true as const };

    let user: { id: string; nome: string; email: string; role: string };
    if (!existing) {
      user = await this.repository.createGoogleUser(nomeSugerido, email, parsedAcceptance!.data);
    } else {
      user = existing;
      if (!hasCurrentAcceptance) await this.repository.recordGoogleAcceptance(user.id, parsedAcceptance!.data);
    }
    const response = this.loginResponse(user);
    await this.repository.recordLogin('LOGIN_SUCESSO', user.id);
    return response;
  }

  async updateNome(userId: string, nome: string) {
    return this.repository.updateNome(userId, nome);
  }
  async deleteAccount(userId: string, senhaAtual?: string) {
    const user = await this.repository.findByIdWithSenha(userId);
    if (!user) throw new ApiError(404, 'Usuário não encontrado.');
    if (user.senhaHash && user.senhaHash !== GOOGLE_PASSWORD_SENTINEL) {
      if (!senhaAtual) throw new ApiError(400, 'Informe sua senha atual para confirmar a exclusão.');
      if (!await bcrypt.compare(senhaAtual, user.senhaHash)) throw new ApiError(401, 'Senha incorreta.');
    }
    await this.repository.anonymizeUser(userId);
    return { message: 'Conta excluída com sucesso.' };
  }

  async session(userId: string) {
    const user = await this.repository.findById(userId);
    if (!user) throw new ApiError(401, 'Sessão inválida.');
    return {
      user: { nome: user.nome, email: user.email },
      nextStep: await this.repository.hasCompletedDiagnostic(userId) ? 'DASHBOARD' : 'DIAGNOSTIC',
    };
  }

  verifyToken(token: string) {
    try {
      return jwtPayloadSchema.parse(jwt.verify(token, this.jwtSecret(), { algorithms: ['HS256'] }));
    } catch {
      throw new ApiError(401, 'Token inválido ou expirado.');
    }
  }

  private loginResponse(user: { id: string; nome: string; email: string; role: string }) {
    return {
      usuario: { id: user.id, nome: user.nome, email: user.email, role: user.role },
      token: jwt.sign({ id: user.id, role: user.role }, this.jwtSecret(), { algorithm: 'HS256', expiresIn: '8h' }),
    };
  }

  private jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.');
    return secret;
  }
}
