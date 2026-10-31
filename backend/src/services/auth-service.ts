import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { acceptanceSchema } from './legal-acceptance';
import { ApiError } from '../errors/api-error';
import { AuthRepository, GOOGLE_PASSWORD_SENTINEL } from '../repositories/auth-repository';
import versions from '../legal-versions.json';
import { assertValidPassword } from './password-policy';
import { isInitialDiagnosticRequired } from '../config/initial-diagnostic-feature';
import { localEmailVerificationCapture } from './local-email-capture';


export type PerfilAcesso = 'ALUNO' | 'PROFESSOR';

// Garante que o usuário entrou pela opção correta da tela de login.
// ADMIN pode entrar pela área do professor.
function verificarPerfil(role: string, perfil?: PerfilAcesso) {
  if (!perfil) return;
  const podeEntrar = perfil === 'PROFESSOR' ? role === 'PROFESSOR' || role === 'ADMIN': role === 'ALUNO';
  if (!podeEntrar) {
    throw new ApiError(403, perfil === 'PROFESSOR'
      ? 'Esta conta é de aluno. Selecione "Aluno" para entrar.'
      : 'Esta conta é de professor. Selecione "Professor" para entrar.');
  }
}

const sessionVersionSchema = z.number().int().min(0).max(2147483647);
const jwtPayloadSchema = z.object({
  id: z.string().trim().min(1),
  role: z.enum(['ALUNO', 'PROFESSOR', 'ADMIN']),
  exp: z.number().int().positive(),
  // Legacy JWTs remain valid only while the account is still at version zero.
  sessionVersion: sessionVersionSchema.default(0),
});

export class AuthService {
  constructor(private readonly repository = new AuthRepository()) {}

  async register(nome: string, email: string, senha: string, acceptance?: unknown) {
    assertValidPassword(senha);
    acceptanceSchema.parse(acceptance);
    if (await this.repository.findByEmail(email)) throw new ApiError(409, 'E-mail já cadastrado.');
    const senhaHash = await bcrypt.hash(senha, 10);
    try {
      const user = await this.repository.createUser(nome, email, senhaHash, acceptance);
      return this.loginResponse(user);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ApiError(409, 'E-mail já cadastrado.');
      throw error;
    }
  }

  async login(email: string, senha: string, perfil?: PerfilAcesso) {
    const user = await this.repository.findByEmail(email);
    if (!user || user.deletedAt) {
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
    verificarPerfil(user.role, perfil);
    const response = this.loginResponse(user);
    await this.repository.recordLogin('LOGIN_SUCESSO', user.id);
    return response;
  }

  recordLoginFailure() { return this.repository.recordLogin('LOGIN_FALHA'); }

  async loginWithGoogle(email: string, nomeSugerido: string, acceptance?: unknown, perfil?: PerfilAcesso) {
    const matches = await this.repository.findGoogleAccountsByEmail(email);
    if (matches.length > 1) throw new ApiError(409, 'Há mais de uma conta com este e-mail. Procure o suporte para evitar vinculação incorreta.');
    const existing = matches[0] ?? null;
    if (existing?.deletedAt) throw new ApiError(401, 'Conta indisponível.');
    if (existing) verificarPerfil(existing.role, perfil);
    // Contas Google novas são sempre de aluno; professor se cadastra com e-mail e senha.
    if (!existing && perfil === 'PROFESSOR') {
      throw new ApiError(403, 'Não há conta de professor com este e-mail. Cadastre-se como professor usando e-mail e senha.');
    }
    if (existing?.senhaHash && existing.senhaHash !== GOOGLE_PASSWORD_SENTINEL && !existing.emailVerifiedAt) {
      throw new ApiError(409, 'Confirme o e-mail da conta pelo fluxo tradicional antes de entrar com o Google.');
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

    let user: { id: string; nome: string; email: string; role: string; sessionVersion: number };
    if (!existing) {
      user = await this.repository.createGoogleUser(nomeSugerido, email, parsedAcceptance!.data);
    } else {
      // A signed Google ID token with email_verified=true was validated by the
      // controller. Match that verified address to one existing account without
      // changing its password hash or role; ambiguous case variants fail closed.
      user = existing;
      if (!hasCurrentAcceptance) await this.repository.recordGoogleAcceptance(user.id,parsedAcceptance!.data);
    }
    const response = this.loginResponse(user);
    await this.repository.recordLogin('LOGIN_SUCESSO', user.id);
    return response;
  }

  async updateNome(userId: string, nome: string) {
    return this.repository.updateNome(userId, nome);
  }
  async logout(userId: string) {
    await this.repository.revokeSessions(userId);
    return { message: 'Sessões encerradas. Entre novamente para acessar sua conta.' };
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

  async session(userId: string, localDemoRequested = false) {
    const user = await this.repository.findById(userId);
    if (!user || user.deletedAt) throw new ApiError(401, 'Sessão inválida.');
    const emailVerificado = Boolean(user.emailVerifiedAt);
    const diagnosticRequired = isInitialDiagnosticRequired();
    const localDemoRuntimeEnabled = localEmailVerificationCapture.isLocalDiagnosticDemoEnabled;
    const initialDiagnosticCompleted = user.role === 'ALUNO' && diagnosticRequired
      ? await this.repository.hasCompletedInitialDiagnostic(userId)
      : undefined;
    const demoAvailable = user.role === 'ALUNO' && diagnosticRequired &&
      initialDiagnosticCompleted === false && localDemoRuntimeEnabled;
    const demoActive = Boolean(demoAvailable && localDemoRequested);
    const nextStep = user.role !== 'ALUNO'
      ? 'PROFESSOR'
      : diagnosticRequired
        ? demoActive || initialDiagnosticCompleted ? 'DASHBOARD' : 'INITIAL_DIAGNOSTIC'
        : await this.repository.hasCompletedDiagnostic(userId) ? 'DASHBOARD' : 'DIAGNOSTIC';
    return {
      user: { id: user.id, nome: user.nome, email: user.email, role: user.role, emailVerificado },
      nextStep,
      ...(localDemoRuntimeEnabled ? {
        localDiagnosticDemoAvailable: Boolean(demoAvailable),
        localDiagnosticDemoActive: demoActive,
      } : {}),
    };
  }

  verifyToken(token: string) {
    try {
      return jwtPayloadSchema.parse(jwt.verify(token, this.jwtSecret(), { algorithms: ['HS256'] }));
    } catch {
      throw new ApiError(401, 'Token inválido ou expirado.');
    }
  }

  private loginResponse(user: { id: string; nome: string; email: string; role: string; sessionVersion: number }) {
    return {
      usuario: { id: user.id, nome: user.nome, email: user.email, role: user.role },
      token: jwt.sign({ id: user.id, role: user.role, sessionVersion: sessionVersionSchema.parse(user.sessionVersion) }, this.jwtSecret(), { algorithm:'HS256', expiresIn: '8h' }),
    };
  }

  private jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.');
    return secret;
  }
}
