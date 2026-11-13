import { afterEach, expect, it, vi } from 'vitest';
import { isValidAppUrl } from './app-url';

afterEach(() => vi.unstubAllEnvs());

it('rejects every C0, DEL and C1 control character before URL normalization', () => {
  vi.stubEnv('NODE_ENV', 'test');
  for (const code of [...Array.from({ length: 32 }, (_, index) => index), ...Array.from({ length: 33 }, (_, index) => 127 + index)]) {
    expect(isValidAppUrl(`https://example.invalid/a${String.fromCharCode(code)}b`), `code ${code}`).toBe(false);
  }
});

it.each([' ', '\\', '<', '>', '"', "'", '\u00a0', '\u2028'])('rejects forbidden raw characters: %j', character => {
  expect(isValidAppUrl(`https://example.invalid/a${character}b`)).toBe(false);
});

it('preserves HTTPS, environment, credentials, query and fragment protections', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(isValidAppUrl('https://example.invalid/app')).toBe(true);
  for (const url of ['http://example.invalid', 'https://user:password@example.invalid', 'https://example.invalid/?a=b', 'https://example.invalid/#token', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'javascript:alert(1)', 'invalid']) expect(isValidAppUrl(url)).toBe(false);
  vi.stubEnv('NODE_ENV', 'test');
  expect(isValidAppUrl('http://127.0.0.1:5173')).toBe(true);
});
