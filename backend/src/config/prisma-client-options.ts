import type { Prisma } from '@prisma/client';

// As transações interativas do Prisma usam por padrão maxWait de 2 s / timeout de 5 s.
// Em produção, a API (Render) e o banco (Supabase, sa-east-1) ficam em regiões
// diferentes, então cada consulta custa ~200 ms. Finalizar o diagnóstico inicial
// exige ~25 consultas em uma única transação, que estava sendo abortada pelo
// padrão de 5 s (P2028) e retornava HTTP 500. Opções explícitas por chamada continuam prevalecendo.
export const PRISMA_CLIENT_OPTIONS = {
  transactionOptions: { maxWait: 10_000, timeout: 20_000 },
} satisfies Prisma.PrismaClientOptions;
