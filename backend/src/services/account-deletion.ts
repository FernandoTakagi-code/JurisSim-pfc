import { confirmAccountIdentity, type AccountIdentityProof } from './account-identity';
import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';
import { emailReuseBlocksEnabled, normalizeReusableEmail } from './email-reuse-policy';
import { institutionalTransaction, requireGlobal, type InstitutionActor } from './institution-service';
import { accountDeletionEnabled, accountDeletionUnavailableMessage } from '../account-deletion-availability';

export function assertAccountDeletionEnabled() {
  if (!accountDeletionEnabled()) throw new ApiError(503, accountDeletionUnavailableMessage);
}

export async function assertEmailReusable(email: string) {
  if (!accountDeletionEnabled() || !emailReuseBlocksEnabled()) return;
  if (await prisma.emailReuseBlock.findFirst({ where: { emailNormalized: normalizeReusableEmail(email), revokedAt: null } }))
    throw new ApiError(409, 'Não foi possível concluir o cadastro com este e-mail.');
}

export class AccountDeletionService {
  async self(userId: string, identity: { senhaAtual?: string; googleCredential?: string }) {
    assertAccountDeletionEnabled();
    if (!emailReuseBlocksEnabled()) throw new ApiError(503, 'Exclusão de conta ainda não habilitada neste ambiente.');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new ApiError(401, 'Conta indisponível.');
    if (user.role !== 'ALUNO') throw new ApiError(403, 'A exclusão pelo perfil está disponível para Aluno.');
    await confirmAccountIdentity(user, identity);
    return this.remove({ userId, role: user.role }, userId, false, undefined, user.senhaHash, user.sessionVersion);
  }

  async admin(actor: InstitutionActor, userId: string, blockEmail: boolean, reason: string, identity: AccountIdentityProof = {}) {
    requireGlobal(actor);
    assertAccountDeletionEnabled();
    if (actor.userId === userId) throw new ApiError(409, 'Use outra administração para excluir esta conta.');
    if (reason.trim().length < 3 || reason.length > 500) throw new ApiError(400, 'Justificativa obrigatória (3 a 500 caracteres).');
    const admin = await prisma.user.findUnique({ where: { id: actor.userId } });
    if (!admin || admin.deletedAt || admin.role !== 'ADMIN' || !admin.emailVerifiedAt) throw new ApiError(403, 'Administração indisponível.');
    await confirmAccountIdentity(admin, identity);
    return this.remove(actor, userId, blockEmail, reason.trim(), admin.senhaHash, admin.sessionVersion);
  }

  private async remove(actor: InstitutionActor, userId: string, blockEmail: boolean, reason?: string, expectedHash?: string | null, expectedVersion?: number) {
    if (!emailReuseBlocksEnabled()) throw new ApiError(503, 'Exclusão de conta ainda não habilitada neste ambiente.');
    await institutionalTransaction(async tx => {
      // Same lock as suspension/permission changes, including last-admin checks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(710911)`;
      // Lock actor and target in stable order; recheck authority inside the transaction.
      for (const id of [...new Set([actor.userId, userId])].sort()) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      const currentActor = await tx.user.findUnique({ where: { id: actor.userId } });
      if (!currentActor || currentActor.deletedAt || (await tx.accountControl.findUnique({ where: { userId: actor.userId } }))?.suspended) throw new ApiError(403, 'Acesso revogado.');
      if (currentActor.senhaHash !== expectedHash || currentActor.sessionVersion !== expectedVersion) throw new ApiError(409, 'Credenciais ou sessão alteradas. Confirme sua identidade novamente.');
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.deletedAt) throw new ApiError(409, 'Conta já excluída ou indisponível.');
      if (actor.userId !== userId) {
        if (currentActor.role !== 'ADMIN' || !currentActor.emailVerifiedAt) throw new ApiError(403, 'Administração global obrigatória.');
        if (user.role === 'ADMIN' && !await tx.user.count({ where: { id: { not: userId }, role: 'ADMIN', deletedAt: null, emailVerifiedAt: { not: null }, OR: [{ accountControl: { is: null } }, { accountControl: { is: { suspended: false } } }] } })) throw new ApiError(409, 'É necessário manter um administrador geral ativo.');
      } else if (user.role !== 'ALUNO' || user.senhaHash !== expectedHash || user.sessionVersion !== expectedVersion) throw new ApiError(409, 'Conta alterada. Confirme sua identidade novamente.');
      if (await tx.institution.findFirst({ where: { ownerId: userId } }) || await tx.institutionalMembership.findFirst({ where: { userId, role: 'INSTITUTION_ADMIN', active: true } })) throw new ApiError(409, 'Transfira as responsabilidades institucionais antes da exclusão.');
      const emailNormalized = normalizeReusableEmail(user.email), now = new Date();
      if (blockEmail) await tx.emailReuseBlock.upsert({ where: { emailNormalized }, create: { emailNormalized, createdById: actor.userId, reason }, update: { revokedAt: null, revokedById: null, createdAt: now, createdById: actor.userId, reason } });
      else await tx.emailReuseBlock.updateMany({ where: { emailNormalized, revokedAt: null }, data: { revokedAt: now, revokedById: actor.userId } });
      await tx.authToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
      await tx.passwordRecoveryToken.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: now } });
      await tx.institutionalMembership.updateMany({ where: { userId, active: true }, data: { active: false } });
      await tx.user.update({ where: { id: userId }, data: { nome: 'Usuário removido', email: `deleted-${userId}@jurissim.invalid`, senhaHash: null, deletedAt: now, sessionVersion: { increment: 1 }, profilePhotos: { deleteMany: {} }, turmasComoAluno: { set: [] }, turmasComoProfessor: { set: [] }, auditLogs: { create: { action: 'CONTA_EXCLUIDA', resourceId: userId } } } });
      await tx.administrativeEvent.create({ data: { event: blockEmail ? 'ACCOUNT_DELETED_EMAIL_BLOCKED' : 'ACCOUNT_DELETED_EMAIL_RELEASED', actorId: actor.userId, resourceId: userId, result: reason ? JSON.stringify({ status: 'SUCCESS', reason }) : 'SUCCESS' } });
    });
    return { message: 'Conta excluída, identidade anonimizada e sessões revogadas. Históricos acadêmicos e auditoria preservados.' };
  }

  async revoke(actor: InstitutionActor, email: string, reason: string) {
    requireGlobal(actor);
    assertAccountDeletionEnabled();
    if (!emailReuseBlocksEnabled()) throw new ApiError(503, 'Política indisponível.');
    return institutionalTransaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
      const admin = await tx.user.findUnique({ where: { id: actor.userId } });
      if (!admin || admin.deletedAt || admin.role !== 'ADMIN' || (await tx.accountControl.findUnique({ where: { userId: actor.userId } }))?.suspended) throw new ApiError(403, 'Administração revogada.');
      const block = await tx.emailReuseBlock.findUnique({ where: { emailNormalized: normalizeReusableEmail(email) } });
      if (!block || block.revokedAt) throw new ApiError(404, 'Bloqueio ativo não encontrado.');
      await tx.emailReuseBlock.update({ where: { id: block.id }, data: { revokedAt: new Date(), revokedById: actor.userId } });
      await tx.administrativeEvent.create({ data: { event: 'EMAIL_REUSE_BLOCK_REVOKED', actorId: actor.userId, resourceId: block.id, result: 'SUCCESS' } });
      return { message: 'Bloqueio de reutilização revogado.' };
    });
  }
}
