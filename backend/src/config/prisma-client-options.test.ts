import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRISMA_CLIENT_OPTIONS } from './prisma-client-options';

// In production each query crosses regions (~200 ms). Finalizing the initial
// diagnostic runs ~25 queries in one interactive transaction, which exceeded
// Prisma's default 5 s timeout and surfaced as HTTP 500 (P2028).
describe('Prisma client transaction options', () => {
  it('allows interactive transactions longer than the Prisma default of 5 s', () => {
    expect(PRISMA_CLIENT_OPTIONS.transactionOptions.timeout).toBeGreaterThanOrEqual(15_000);
  });

  it('waits for a pooled connection longer than the Prisma default of 2 s', () => {
    expect(PRISMA_CLIENT_OPTIONS.transactionOptions.maxWait).toBeGreaterThanOrEqual(5_000);
  });

  it.each(['lib/prisma.ts', 'config/prisma.ts'])('%s builds its client with the shared options', file => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    expect(source).toMatch(/new PrismaClient\(PRISMA_CLIENT_OPTIONS\)/);
  });
});
