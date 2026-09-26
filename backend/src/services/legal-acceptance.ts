import { z } from 'zod';
import versions from '../legal-versions.json';

export const acceptanceSchema = z.object({
  accepted: z.literal(true, { error: 'Aceite os Termos de Uso e a Política de Privacidade.' }),
  termsVersion: z.literal(versions.termsVersion),
  privacyVersion: z.literal(versions.privacyVersion),
});

// Explicit allowlist: never copy request bodies or credentials into audit records.
export function acceptanceData(input: unknown) {
  const acceptance = acceptanceSchema.parse(input);
  const acceptedAt = new Date();
  return {
    legalAcceptedAt: acceptedAt,
    termsVersion: acceptance.termsVersion,
    privacyVersion: acceptance.privacyVersion,
    auditLogs: { create: {
      action: 'ACEITE_TERMOS_E_PRIVACIDADE' as const,
      occurredAt: acceptedAt,
      termsVersion: acceptance.termsVersion,
      privacyVersion: acceptance.privacyVersion,
    } },
  };
}
