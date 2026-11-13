import { AuditAction, AuthTokenType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { acceptanceData } from '../services/legal-acceptance';
import { ApiError } from '../errors/api-error';
import { institutionsEnabled, institutionRegistrationEnabled, administrationEnabled } from '../config/institution-feature';

export const GOOGLE_PASSWORD_SENTINEL = '!GOOGLE_OAUTH_ACCOUNT!';

export class AuthRepository {
  async findByEmail(email: string) {
    const matches = await prisma.user.findMany({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      take: 2,
      select: {
        id: true, nome: true, email: true, senhaHash: true, role: true, sessionVersion: true,
        legalAcceptedAt: true, termsVersion: true, privacyVersion: true,
        deletedAt: true,
      },
    });
    if (matches.length > 1) throw new ApiError(409, 'Há mais de uma conta com este e-mail. Procure o suporte para evitar vinculação incorreta.');
    return matches[0] ?? null;
  }

  findGoogleAccountsByEmail(email: string) {
    return prisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: {
        id: true, nome: true, email: true, senhaHash: true, role: true, sessionVersion: true,
        legalAcceptedAt: true, termsVersion: true, privacyVersion: true, deletedAt: true, emailVerifiedAt: true,
      },
      take: 2,
    });
  }
  async findById(id: string) {
    const select = {
      id: true,
      nome: true,
      email: true,
      role: true,
      emailVerifiedAt: true,
      deletedAt: true,
    } as const;

    // The registration intent was introduced with the optional institutional
    // schema. A regular session must keep working while that module remains
    // disabled on a database that has not received its additive migration.
    if (!institutionRegistrationEnabled() && !administrationEnabled()) {
      const user = await prisma.user.findUnique({ where: { id }, select });
      return user && { ...user, registrationIntent: null };
    }

    return prisma.user.findUnique({
      where: { id },
      select: { ...select, registrationIntent: true },
    });
  }
  findByIdForAuth(id: string) { return prisma.user.findUnique({ where: { id }, select: { id: true, role: true, registrationIntent:true, deletedAt: true, emailVerifiedAt: true, sessionVersion: true } }); }
  findByIdWithSenha(id: string) { return prisma.user.findUnique({ where: { id }, select: { id: true, senhaHash: true } }); }

  createUser(nome: string, email: string, senhaHash: string, acceptance: unknown, registrationIntent?: 'INSTITUTION') {
    const legal = acceptanceData(acceptance);
    return prisma.user.create({
      data: {
        nome, email, senhaHash, role: 'ALUNO', ...legal,
        ...(registrationIntent === 'INSTITUTION' ? { registrationIntent } : {}),
        auditLogs: { create: [
          legal.auditLogs.create,
          { action: 'USUARIO_CADASTRADO' as AuditAction, occurredAt: legal.legalAcceptedAt },
        ] },
      },
      select: { id: true, nome: true, email: true, role: true, sessionVersion: true },
    });
  }

  createGoogleUser(nome: string, email: string, acceptance: unknown, registrationIntent?: 'INSTITUTION') {
    const legal = acceptanceData(acceptance);
    return prisma.user.create({
      data: {
        nome, email, role: 'ALUNO', senhaHash: GOOGLE_PASSWORD_SENTINEL, emailVerifiedAt: new Date(), ...legal,
        ...(registrationIntent === 'INSTITUTION' ? { registrationIntent } : {}),
        auditLogs: { create: [
          legal.auditLogs.create,
          { action: 'USUARIO_CADASTRADO' as AuditAction, occurredAt: legal.legalAcceptedAt },
        ] },
      },
      select: {
        id: true, nome: true, email: true, role: true, senhaHash: true, sessionVersion: true,
        legalAcceptedAt: true, termsVersion: true, privacyVersion: true,
      },
    });
  }

  recordGoogleAcceptance(userId: string, acceptance: unknown) {
    const legal = acceptanceData(acceptance);
    return prisma.user.update({
      where: { id: userId },
      data: { ...legal, auditLogs: { create: legal.auditLogs.create } },
      select: { id: true, nome: true, email: true, role: true },
    });
  }

  updateNome(id: string, nome: string) {
    return prisma.user.update({ where: { id }, data: { nome }, select: { id: true, nome: true, email: true, role: true } });
  }
  recordLogin(action: 'LOGIN_SUCESSO' | 'LOGIN_FALHA', userId?: string) {
    if (institutionsEnabled()) return prisma.$transaction(async tx => {
      const result = await tx.auditLog.create({ data: { action: action as AuditAction, userId } });
      await tx.administrativeEvent.create({ data: { event: action === 'LOGIN_SUCESSO' ? 'AUTHENTICATION_SUCCEEDED' : 'AUTHENTICATION_FAILED', actorId: userId,
        result: action === 'LOGIN_SUCESSO' ? 'SUCCESS' : 'FAILED', severity: action === 'LOGIN_SUCESSO' ? 'INFO' : 'WARN' } });
      return result;
    });
    return prisma.auditLog.create({ data: { action: action as AuditAction, userId } });
  }
  async hasCompletedDiagnostic(usuarioId: string) { return Boolean(await prisma.simulado.findFirst({ where: { alunoId: usuarioId, tipo: 'DIAGNOSTICO', finalizadoEm: { not: null }}, select: { id: true } })); }
  async hasCompletedInitialDiagnostic(usuarioId: string) {
    return Boolean(await prisma.diagnosticoInicial.findFirst({
      where: { alunoId: usuarioId, simulado: { is: { finalizadoEm: { not: null } } } },
      select: { id: true },
    }));
  }

  createToken(userId: string, type: AuthTokenType, tokenHash: string, expiresAt: Date) {
    if (type !== 'EMAIL_VERIFICATION') return prisma.authToken.create({ data: { userId, type, tokenHash, expiresAt } });
    return prisma.$transaction(async tx => {
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} AND "deletedAt" IS NULL AND "emailVerifiedAt" IS NULL FOR UPDATE`;
      if (!owners.length) throw new ApiError(409, 'Conta indisponível para reenvio. Atualize a sessão.');
      const now = new Date();
      const recent = await tx.authToken.findMany({ where: { userId, type, createdAt: { gt: new Date(now.getTime() - 3600000) } }, select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3 });
      const wait = Math.max(recent[0] ? 60000 - (now.getTime() - recent[0].createdAt.getTime()) : 0, recent.length >= 3 ? 3600000 - (now.getTime() - recent[2].createdAt.getTime()) : 0);
      if (wait > 0) throw new ApiError(429, 'Aguarde antes de solicitar outro e-mail de confirmação. Limite de três por hora.', Math.ceil(wait / 1000));
      await tx.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: now } });
      return tx.authToken.create({ data: { userId, type, tokenHash, expiresAt, createdAt: now } });
    });
  }
  revokeSessions(id: string) {
    return prisma.user.updateMany({ where: { id, deletedAt: null }, data: { sessionVersion: { increment: 1 } } });
  }
  markTokenUsed(id: string) {
    return prisma.authToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
  }
  consumeEmailVerification(tokenHash: string, now: Date) {
    return prisma.$transaction(async tx => {
      const token = await tx.authToken.findFirst({
        where: { tokenHash, type: 'EMAIL_VERIFICATION', usedAt: null, expiresAt: { gt: now }, user: { deletedAt: null } },
        select: { id: true, userId: true },
      });
      if (!token) return false;
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${token.userId} AND "deletedAt" IS NULL AND "emailVerifiedAt" IS NULL FOR UPDATE`;
      if (!owners.length) return false;
      const claimed = await tx.authToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      await tx.user.update({
        where: { id: token.userId, deletedAt: null },
        data: {
          emailVerifiedAt: now,
          auditLogs: { create: { action: 'EMAIL_CONFIRMADO' as AuditAction, occurredAt: now } },
        },
        select: { id: true },
      });
      if (institutionRegistrationEnabled() || administrationEnabled()) await tx.institution.updateMany({ where: { ownerId: token.userId, status: 'EMAIL_PENDING' }, data: { status: 'PENDING' } });
      return true;
    });
  }

  deactivateUser(id: string, expectedPasswordHash: string) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id }, select: { role: true, deletedAt: true, senhaHash: true } });
      if (!user || user.deletedAt || user.senhaHash !== expectedPasswordHash)
        throw new ApiError(409, 'Conta ou credenciais alteradas. Entre novamente antes de desativar.');
      if (user.role === 'ADMIN') throw new ApiError(409, 'A desativação de administrador geral exige transferência de responsabilidade pelo suporte.');
      // Ownership still matters while institutional feature flags are off.
      if (await tx.institution.findFirst({ where: { ownerId: id }, select: { id: true } }))
        throw new ApiError(409, 'Transfira a responsabilidade institucional antes de desativar sua conta.');
      if (await tx.institutionalMembership.findFirst({ where: { userId: id, role: 'INSTITUTION_ADMIN', active: true }, select: { id: true } }))
        throw new ApiError(409, 'Regularize a administração institucional antes de desativar sua conta.');
      await tx.institutionalMembership.updateMany({ where: { userId: id, active: true }, data: { active: false } });
      const now = new Date();
      await tx.authToken.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: now } });
      await tx.passwordRecoveryToken.updateMany({ where: { userId: id, consumedAt: null }, data: { consumedAt: now } });
      await tx.user.update({ where: { id }, data: { deletedAt: now, sessionVersion: { increment: 1 } } });
      await tx.administrativeEvent.create({ data: { event: 'ACCOUNT_DEACTIVATED', actorId: id, result: 'SUCCESS' } });
    }, { isolationLevel: 'Serializable' }).catch(error => {
      if ((error as { code?: string }).code === 'P2021')
        throw new ApiError(503, 'Desativação indisponível até validar a estrutura de vínculos. Nenhuma alteração foi aplicada.');
      throw error;
    });
  }

  anonymizeUser(id: string) {
    return prisma.$transaction(async tx => {
      // Same lock order as photo replacement, so concurrent uploads cannot
      // restore personal image bytes after the account has been anonymized.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      return tx.user.update({
        where: { id },
        data: {
          nome: 'Usuário removido',
          email: `deleted-${id}@jurissim.invalid`,
          senhaHash: null,
          deletedAt: new Date(),
          profilePhotos: { deleteMany: {} },
          auditLogs: { create: { action: 'CONTA_EXCLUIDA' as AuditAction } },
        },
      });
    });
  }

  async exportData(id: string, page: number) {
    const skip = (page - 1) * 100;
    // Explicit projections: never export password hashes, reset tokens, answer keys,
    // another student's identity, or internal administrative security records.
    const [profile, attempts, goals, reviews, audit] = await prisma.$transaction([
      prisma.user.findUnique({ where: { id, deletedAt: null }, select: {
        id: true, nome: true, email: true, role: true, createdAt: true,
        nivelAtual: true, legalAcceptedAt: true, termsVersion: true,
        privacyVersion: true, emailVerifiedAt: true,
      } }),
      prisma.simulado.findMany({ where: { alunoId: id }, skip, take: 101,
        orderBy: [{ iniciadoEm: 'asc' }, { id: 'asc' }], select: {
          id: true, tipo: true, iniciadoEm: true, finalizadoEm: true,
          respostas: { select: { questaoId: true, alternativaEscolhidaId: true, correta: true, respondidoEm: true, tempoRespostaSegundos: true } },
          desempenhosDiagnostico: { select: { tipo: true, disciplina: true, assunto: true, nivel: true, acertos: true, totalQuestoes: true, percentual: true } },
          trilhaAdaptativa: { select: { disciplinaPrioritaria: true, assuntoPrioritario: true, nivelRecomendado: true, justificativa: true } },
        } }),
      prisma.metaDiaria.findMany({ where: { alunoId: id }, skip, take: 101,
        orderBy: [{ data: 'asc' }, { id: 'asc' }], select: { data: true, metaQuestoes: true, questoesResolvidas: true, cumprida: true } }),
      prisma.sessaoRevisaoQuestao.findMany({ where: { alunoId: id }, skip, take: 101,
        orderBy: [{ criadaEm: 'asc' }, { id: 'asc' }], select: { id: true, disciplina: true, assunto: true, filtro: true, respostas: true, criadaEm: true, finalizadaEm: true } }),
      prisma.auditLog.findMany({ where: { userId: id }, skip, take: 101,
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], select: { action: true, occurredAt: true, termsVersion: true, privacyVersion: true } }),
    ]);
    if (!profile) throw new ApiError(404, 'Conta indisponível.');
    const collections = [attempts, goals, reviews, audit];
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), page,
      nextPage: collections.some(items => items.length > 100) ? page + 1 : null,
      scope: 'Perfil, respostas, resultados, trilhas, metas, revisões e eventos pessoais de auditoria. Solicite outros dados pelo canal de privacidade. Não é uma cópia integral do banco.',
      profile, attempts: attempts.slice(0, 100).map(({ respostas, ...attempt }) => ({
        ...attempt, respostas: respostas.map(({ correta, ...answer }) => attempt.finalizadoEm ? { ...answer, correta } : answer),
      })), goals: goals.slice(0, 100), reviews: reviews.slice(0, 100), audit: audit.slice(0, 100),
    };
  }
}
