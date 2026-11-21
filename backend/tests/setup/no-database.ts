import { vi } from 'vitest';

// Os dublês de Prisma específicos de cada arquivo substituem este padrão. Dependências
// esquecidas falham antes que um engine ou socket de banco possa ser aberto.
// Versões legais "em dia" para as suítes que não tratam dos Termos: a de legal-versions.json.
// Os testes dos Termos substituem este dublê ou usam o módulo real (vi.unmock).
vi.mock("../../src/services/accounts/terms-of-use", async (importOriginal) => {
  const versions = (await import("../../src/legal-versions.json")).default;
  return {
    ...(await importOriginal<object>()),
    currentLegalVersions: vi.fn(async () => ({ termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion })),
  };
});

vi.mock("../../src/lib/prisma", () => {
  const unavailable = () => { throw new Error('NO_DATABASE_TEST: persistence must be explicitly mocked'); };
  const delegate = new Proxy(unavailable, { get: () => unavailable });
  return { prisma: new Proxy({}, { get: (_target, property) => property === '$disconnect' ? async () => {} : delegate }) };
});
