import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT_OPTIONS } from '../config/prisma-client-options';

export const prisma = new PrismaClient(PRISMA_CLIENT_OPTIONS);
