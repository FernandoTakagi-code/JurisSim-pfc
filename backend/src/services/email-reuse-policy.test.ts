import { describe, expect, it, vi } from 'vitest';
import { EmailReusePolicy, normalizeReusableEmail } from './email-reuse-policy';

describe('EmailReusePolicy', () => {
  const store = () => ({ active: vi.fn().mockResolvedValue(false), block: vi.fn(), revoke: vi.fn().mockResolvedValue(true) });
  it('normalizes e-mail and never exposes a prior-account decision', async () => {
    const repository = store(), policy = new EmailReusePolicy(repository, true);
    await policy.assertRegistrationAllowed(' User@Example.Test ');
    expect(repository.active).toHaveBeenCalledWith('user@example.test');
    repository.active.mockResolvedValueOnce(true);
    await expect(policy.assertRegistrationAllowed('USER@example.test')).rejects.toMatchObject({ statusCode: 409 });
  });
  it('refuses all table-backed operations until the isolated migration is enabled', async () => {
    const repository = store(), policy = new EmailReusePolicy(repository, false);
    await expect(policy.assertRegistrationAllowed('user@example.test')).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.active).not.toHaveBeenCalled();
  });
  it('normalizes administrative block and revocation inputs', async () => {
    const repository = store(), policy = new EmailReusePolicy(repository, true);
    await policy.block(' User@Example.Test ', 'admin', 'retention');
    await policy.revoke('USER@example.test', 'admin');
    expect(repository.block).toHaveBeenCalledWith('user@example.test', 'admin', 'retention');
    expect(repository.revoke).toHaveBeenCalledWith('user@example.test', 'admin');
    expect(normalizeReusableEmail(' A@B.TEST ')).toBe('a@b.test');
  });
});
