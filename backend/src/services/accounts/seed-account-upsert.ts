import type { Prisma, PrismaClient } from '@prisma/client';

/** Insere uma conta local de seed quando ausente; nunca reescreve uma conta existente. */
export function createSeedAccountIfMissing(
  client: Pick<PrismaClient, 'user'>,
  email: string,
  create: Prisma.UserCreateInput,
) {
  return client.user.upsert({ where: { email }, create, update: {} });
}
