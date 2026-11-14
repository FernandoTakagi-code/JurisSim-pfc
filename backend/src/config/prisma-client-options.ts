import type { Prisma } from '@prisma/client';

// Prisma's interactive transactions default to maxWait 2 s / timeout 5 s.
// In production the API (Render) and the database (Supabase, sa-east-1) are in
// different regions, so each query costs ~200 ms. Finalizing the initial
// diagnostic needs ~25 queries in one transaction and was being aborted by the
// 5 s default (P2028), returning HTTP 500. Explicit per-call options still win.
export const PRISMA_CLIENT_OPTIONS = {
  transactionOptions: { maxWait: 10_000, timeout: 20_000 },
} satisfies Prisma.PrismaClientOptions;
