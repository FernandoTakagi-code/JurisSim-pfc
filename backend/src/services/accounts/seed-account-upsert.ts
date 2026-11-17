import type { Prisma, PrismaClient } from '@prisma/client';

/** Insert a local seed account when absent; never rewrite an existing account. */
export function createSeedAccountIfMissing(
  client: Pick<PrismaClient, 'user'>,
  email: string,
  create: Prisma.UserCreateInput,
) {
  return client.user.upsert({ where: { email }, create, update: {} });
}
