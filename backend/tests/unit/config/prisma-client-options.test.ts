import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRISMA_CLIENT_OPTIONS } from "../../../src/config/prisma-client-options";

// Em produção, cada consulta atravessa regiões (~200 ms). Finalizar o diagnóstico
// inicial executa ~25 consultas em uma única transação interativa, o que ultrapassava
// o timeout padrão de 5 s do Prisma e aparecia como HTTP 500 (P2028).
describe('Prisma client transaction options', () => {
  it('allows interactive transactions longer than the Prisma default of 5 s', () => {
    expect(PRISMA_CLIENT_OPTIONS.transactionOptions.timeout).toBeGreaterThanOrEqual(15_000);
  });

  it('waits for a pooled connection longer than the Prisma default of 2 s', () => {
    expect(PRISMA_CLIENT_OPTIONS.transactionOptions.maxWait).toBeGreaterThanOrEqual(5_000);
  });

  it.each(['lib/prisma.ts', 'config/prisma.ts'])('%s builds its client with the shared options', file => {
    const source = readFileSync(join(__dirname, '../../../src', file), 'utf8');
    expect(source).toMatch(/new PrismaClient\(PRISMA_CLIENT_OPTIONS\)/);
  });
});
