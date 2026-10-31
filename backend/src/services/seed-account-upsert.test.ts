import { describe, expect, it, vi } from 'vitest';
import { createSeedAccountIfMissing } from './seed-account-upsert';

describe('createSeedAccountIfMissing', () => {
  it('preserves an existing account and its password hash when a seed is rerun', async () => {
    const existing = { id: 'existing-user', senhaHash: 'existing-hash-fingerprint' };
    const upsert = vi.fn(async ({ update }: { update: Record<string, never> }) => {
      expect(update).toEqual({});
      return existing;
    });
    const client = { user: { upsert } } as never;

    const result = await createSeedAccountIfMissing(client, 'aluno.teste@jurissim.local', {
      id: 'seed-user', email: 'aluno.teste@jurissim.local', nome: 'Aluno de Teste Local',
      senhaHash: 'replacement-value', role: 'ALUNO',
    });

    expect(upsert).toHaveBeenCalledOnce();
    expect(result).toBe(existing);
    expect(existing.senhaHash).toBe('existing-hash-fingerprint');
  });
});
