import { describe, expect, it } from 'vitest';
import { diagnoseInventoryCheckError } from './inventory-check-error';

const sensitiveFixture = 'postgresql://private-user:private-password@private.host/private-db?sslmode=require';

describe('diagnoseInventoryCheckError', () => {
  it.each([
    [{ code: 'P1001', message: `Can't reach database server at ${sensitiveFixture}` }, 'CONNECTION'],
    [{ code: '28P01', message: `password authentication failed for ${sensitiveFixture}` }, 'AUTHENTICATION'],
    [{ code: '42501', message: `permission denied at ${sensitiveFixture}` }, 'PERMISSION'],
    [{ code: 'P2021', message: `relation "private table" does not exist ${sensitiveFixture}` }, 'MIGRATIONS_OR_SCHEMA'],
    [{ code: 'P2024', message: `Timed out connecting with ${sensitiveFixture}` }, 'TIMEOUT'],
    [{ code: 'P2010', meta: { code: '42601', query: sensitiveFixture }, message: `syntax error ${sensitiveFixture}` }, 'QUERY'],
  ] as const)('classifies %s without returning private details', (error, category) => {
    const result = diagnoseInventoryCheckError(error);
    expect(result.category).toBe(category);
    expect(result.message).not.toContain(sensitiveFixture);
    expect(result.message).not.toMatch(/private-password|private-user|private\.host|private-db|sslmode/i);
  });

  it('classifies nested database errors and never includes their raw message', () => {
    const result = diagnoseInventoryCheckError({
      code: 'P2010',
      message: `Raw wrapper containing ${sensitiveFixture}`,
      cause: { code: '42501', message: `permission denied for ${sensitiveFixture}` },
    });
    expect(result).toEqual({
      category: 'PERMISSION',
      message: 'O usuário não tem permissões de leitura necessárias.',
    });
  });
});
