import { vi } from 'vitest';

// File-specific Prisma doubles override this default. Forgotten dependencies
// fail before an engine or database socket can be opened.
vi.mock('../lib/prisma', () => {
  const unavailable = () => { throw new Error('NO_DATABASE_TEST: persistence must be explicitly mocked'); };
  const delegate = new Proxy(unavailable, { get: () => unavailable });
  return { prisma: new Proxy({}, { get: (_target, property) => property === '$disconnect' ? async () => {} : delegate }) };
});
