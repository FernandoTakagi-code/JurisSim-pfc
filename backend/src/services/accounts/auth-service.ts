import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { acceptanceSchema, acceptanceData, assertCurrentAcceptance, isCurrentAcceptance } from './legal-acceptance';
import { currentLegalVersions } from './terms-of-use';
import { ApiError } from '../../errors/api-error';
import { AuthRepository, GOOGLE_PASSWORD_SENTINEL } from '../../repositories/auth-repository';
import { assertValidPassword } from './password-policy';
import { isInitialDiagnosticRequired } from '../../config/initial-diagnostic-feature';
import { localEmailVerificationCapture } from '../email/local-email-capture';
import { currentAccess, institutionalTransaction, InstitutionService } from '../institutions/institution-service';
import { institutionAccountRegistrationSchema } from '../institutions/institution-account-registration';
import { institutionRegistrationEnabled } from '../../config/institution-feature';
import { assertEmailReusable, AccountDeletionService } from './account-deletion';


export type PerfilAcesso = 'ALUNO' | 'PROFESSOR';
export type AuthSessionResult = {
  user:{id:string;nome:string;email:string;role:'ALUNO'|'PROFESSOR'|'ADMIN';emailVerificado:boolean};
  registrationIntent?:'INSTITUTION'|'TEACHER_INVITATION';
  institutionalStatus?:string;
  nextStep:'PROFESSOR'|'DASHBOARD'|'DIAGNOSTIC'|'INITIAL_DIAGNOSTIC'|'INVITATION';
  administration?:Awaited<ReturnType<typeof currentAccess>>;
  localDiagnosticDemoAvailable?:boolean;
  localDiagnosticDemoActive?:boolean;
  legalUpdateRequired:boolean;
  legalVersions:{termsVersion:string;privacyVersion:string};
};

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
  // JWTs legados continuam válidos apenas enquanto a conta ainda estiver na versão zero.
  sessionVersion: sessionVersionSchema.default(0),
});

export class AuthService {
  constructor(private readonly repository = new AuthRepository()) {}

  async registerInstitutionalApplication(input: unknown) {
    if(!institutionRegistrationEnabled()) throw new ApiError(503,'Cadastro institucional indisponível.');
    const data=institutionAccountRegistrationSchema.parse(input);
    await assertCurrentAcceptance(data.acceptance);
    await assertEmailReusable(data.email);
    this.jwtSecret();
    const senhaHash=await bcrypt.hash(data.senha,10);
    const result=await institutionalTransaction(async tx=>{
      if(await tx.user.findUnique({where:{email:data.email},select:{id:true}})) throw new ApiError(409,'E-mail já cadastrado. Entre com sua conta para completar a solicitação institucional.');
      const user=await tx.user.create({data:{nome:data.institution.responsibleName,email:data.email,senhaHash,role:'ALUNO',registrationIntent:'INSTITUTION',...acceptanceData(data.acceptance)},select:{id:true,nome:true,email:true,role:true,sessionVersion:true}});
      const institution=await new InstitutionService().requestForNewAccountInTransaction(tx,user.id,data.institution);
      await tx.auditLog.create({data:{action:'USUARIO_CADASTRADO',userId:user.id}});
      return {user,institution};
    });
    return {...this.loginResponse(result.user),institution:{id:result.institution.id,status:result.institution.status}};
  }

  async register(nome: string, email: string, senha: string, acceptance?: unknown, registrationIntent?: 'INSTITUTION') {
    await assertEmailReusable(email);
    assertValidPassword(senha);
    await assertCurrentAcceptance(acceptance);
    if (await this.repository.findByEmail(email)) throw new ApiError(409, 'E-mail já cadastrado.');
    const senhaHash = await bcrypt.hash(senha, 10);
    try {
      const user = await this.repository.createUser(nome, email, senhaHash, acceptance, registrationIntent);
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
    await currentAccess(user.id, user.role);
    const response = this.loginResponse(user);
    await this.repository.recordLogin('LOGIN_SUCESSO', user.id);
    return response;
  }

  recordLoginFailure() { return this.repository.recordLogin('LOGIN_FALHA'); }

  async loginWithGoogle(email: string, nomeSugerido: string, acceptance?: unknown, perfil?: PerfilAcesso, registrationIntent?: 'INSTITUTION', existingAccountOnly = false) {
    const matches = await this.repository.findGoogleAccountsByEmail(email);
    if (matches.length > 1) throw new ApiError(409, 'Há mais de uma conta com este e-mail. Procure o suporte para evitar vinculação incorreta.');
    const existing = matches[0] ?? null;
    if(existingAccountOnly&&!existing)throw new ApiError(409,'Esta conta Google ainda não está cadastrada. Volte ao convite e escolha Primeiro acesso para criar sua conta.');
    if (existing?.deletedAt) throw new ApiError(401, 'Conta indisponível.');
    if (existing) await currentAccess(existing.id, existing.role);
    if (existing) verificarPerfil(existing.role, perfil);
    // Contas Google novas são sempre de aluno; professor se cadastra com e-mail e senha.
    if (!existing && perfil === 'PROFESSOR') {
      throw new ApiError(403, 'Entre como aluno com o e-mail convidado e aceite o convite institucional para se tornar professor.');
    }
    if (existing?.senhaHash && existing.senhaHash !== GOOGLE_PASSWORD_SENTINEL && !existing.emailVerifiedAt) {
      throw new ApiError(409, 'Confirme o e-mail da conta pelo fluxo tradicional antes de entrar com o Google.');
    }
    const parsedAcceptance = acceptance === undefined ? undefined : acceptanceSchema.safeParse(acceptance);
    const current = await currentLegalVersions();
    if (parsedAcceptance && (!parsedAcceptance.success || !isCurrentAcceptance(parsedAcceptance.data, current))) {
      throw new ApiError(400, 'Aceite os Termos de Uso e o Aviso de Privacidade nas versões atuais.');
    }
    const hasCurrentAcceptance = Boolean(existing?.legalAcceptedAt && isCurrentAcceptance(existing, current));
    if (!hasCurrentAcceptance && !parsedAcceptance?.success) return { requiresAcceptance: true as const };

    let user: { id: string; nome: string; email: string; role: string; sessionVersion: number };
    if (!existing) {
      await assertEmailReusable(email);
      user = registrationIntent
        ? await this.repository.createGoogleUser(nomeSugerido, email, parsedAcceptance!.data, registrationIntent)
        : await this.repository.createGoogleUser(nomeSugerido, email, parsedAcceptance!.data);
    } else {
      // Um ID token do Google assinado com email_verified=true foi validado pelo
      // controller. Associa esse endereço verificado a uma única conta existente sem
      // alterar o hash da senha nem o papel; variantes ambíguas de maiúsculas/minúsculas falham de forma segura.
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
    const result = await this.repository.revokeSessions(userId);
    if (result.count !== 1) throw new ApiError(401, 'Conta indisponível para encerrar sessões. Entre novamente.');
    return { message: 'Sessões encerradas. Entre novamente para acessar sua conta.' };
  }
  async deleteAccount(userId: string, senhaAtual?: string) {
    return new AccountDeletionService().self(userId, { senhaAtual });
  }

  async deactivateAccount(userId: string, senhaAtual: string) {
    const user = await this.repository.findByIdWithSenha(userId);
    if (!user) throw new ApiError(404, 'Usuário não encontrado.');
    if (!user.senhaHash || user.senhaHash === GOOGLE_PASSWORD_SENTINEL)
      throw new ApiError(409, 'Contas Google exigem um fluxo de reautenticação específico para desativação. Procure o suporte.');
    if (!await bcrypt.compare(senhaAtual, user.senhaHash)) throw new ApiError(400, 'Senha atual incorreta.');
    await this.repository.deactivateUser(userId, user.senhaHash);
    return { message: 'Conta desativada e sessões revogadas. Os registros foram preservados; a reativação depende de atendimento.' };
  }

  exportData(userId: string, page: number) {
    return this.repository.exportData(userId, page);
  }

  /** Novo aceite de quem já tem conta. Versões desatualizadas respondem 409 para a tela recarregar o texto. */
  async acceptLegalTerms(userId: string, input: unknown) {
    const acceptance = await assertCurrentAcceptance(input, 409);
    await this.repository.recordLegalAcceptance(userId, { accepted: true, ...acceptance });
  }

  async session(userId: string, localDemoRequested = false, institutionalReadOnly = false):Promise<AuthSessionResult> {
    const user = await this.repository.findById(userId);
    if (!user || user.deletedAt) throw new ApiError(401, 'Sessão inválida.');
    const administration = await currentAccess(userId, user.role, user.registrationIntent === 'INSTITUTION' || institutionalReadOnly);
    if (administration) user.role = administration.effectiveRole as typeof user.role;
    const emailVerificado = Boolean(user.emailVerifiedAt);
    const legalVersions = await currentLegalVersions();
    const legal = { legalUpdateRequired: !isCurrentAcceptance(user, legalVersions), legalVersions };
    if (user.role === 'ALUNO' && user.registrationIntent === 'TEACHER_INVITATION') return {
      user: {id:user.id,nome:user.nome,email:user.email,role:user.role,emailVerificado},
      registrationIntent:'TEACHER_INVITATION' as const,nextStep:'INVITATION' as const,
      ...(administration?{administration}:{}),
      ...legal,
    };
    if (user.role === 'ALUNO' && user.registrationIntent === 'INSTITUTION') {
      const institutionalStatus = await this.repository.ownInstitutionStatus(userId);
      return {
        user: {id:user.id,nome:user.nome,email:user.email,role:user.role,emailVerificado},
        registrationIntent:'INSTITUTION' as const,nextStep:'DASHBOARD' as const,
        ...(institutionalStatus ? { institutionalStatus } : {}),
        ...(administration?{administration}:{}),
        ...legal,
      };
    }
    const diagnosticRequired = isInitialDiagnosticRequired() && user.registrationIntent!=='INSTITUTION';
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
      ...(user.registrationIntent === 'INSTITUTION' ? { registrationIntent: 'INSTITUTION' as const } : {}),
      nextStep,
      ...(administration ? { administration } : {}),
      ...(localDemoRuntimeEnabled ? {
        localDiagnosticDemoAvailable: Boolean(demoAvailable),
        localDiagnosticDemoActive: demoActive,
      } : {}),
      ...legal,
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
