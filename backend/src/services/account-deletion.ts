import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';
import { emailReuseBlocksEnabled, normalizeReusableEmail } from './email-reuse-policy';
import { accountDeletionEnabled } from '../account-deletion-availability';

export async function assertEmailReusable(email: string) {
  if (!accountDeletionEnabled() || !emailReuseBlocksEnabled()) return;
  if (await prisma.emailReuseBlock.findFirst({ where: { emailNormalized: normalizeReusableEmail(email), revokedAt: null } }))
    throw new ApiError(409, 'Não foi possível concluir o cadastro com este e-mail.');
}
