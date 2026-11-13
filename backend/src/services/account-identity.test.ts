import bcrypt from 'bcrypt';
import { afterEach, expect, it, vi } from 'vitest';
const google = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({ OAuth2Client: class { verifyIdToken = google; } }));
import { confirmAccountIdentity } from './account-identity';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('requires the current stored password rather than a password from another account', async () => {
  const user = { email: 'admin@example.invalid', senhaHash: await bcrypt.hash('Admin-fixture1!', 4) };
  await expect(confirmAccountIdentity(user, {})).rejects.toMatchObject({ statusCode: 400 });
  await expect(confirmAccountIdentity(user, { senhaAtual: 'Target-fixture1!' })).rejects.toMatchObject({ statusCode: 400 });
  await expect(confirmAccountIdentity(user, { senhaAtual: 'Admin-fixture1!' })).resolves.toBeUndefined();
  expect(google).not.toHaveBeenCalled();
});
it.each(['mismatch', 'unverified', 'expired', 'future', 'invalid'])('rejects %s Google reauthentication', async scenario => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture-client');
  const now = Math.floor(Date.now() / 1000);
  const payload = { email: scenario === 'mismatch' ? 'target@example.invalid' : 'admin@example.invalid', email_verified: scenario !== 'unverified', iat: scenario === 'expired' ? now - 301 : scenario === 'future' ? now + 31 : now };
  if (scenario === 'invalid') google.mockRejectedValue(new Error('Invalid signature')); else google.mockResolvedValue({ getPayload: () => payload });
  await expect(confirmAccountIdentity({ email: 'admin@example.invalid', senhaHash: '!GOOGLE_OAUTH_ACCOUNT!' }, { googleCredential: 'fixture-only' })).rejects.toMatchObject({ statusCode: 401 });
});
it('checks the configured audience and a fresh verified email for Google accounts', async () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture-client');
  google.mockResolvedValue({ getPayload: () => ({ email: 'ADMIN@example.invalid', email_verified: true, iat: Math.floor(Date.now() / 1000) }) });
  await expect(confirmAccountIdentity({ email: 'admin@example.invalid', senhaHash: null }, { googleCredential: 'fixture-only' })).resolves.toBeUndefined();
  expect(google).toHaveBeenCalledWith({ idToken: 'fixture-only', audience: 'fixture-client' });
});
