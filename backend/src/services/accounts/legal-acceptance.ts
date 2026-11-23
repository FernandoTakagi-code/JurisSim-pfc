import { z } from 'zod';
import { ApiError } from '../../errors/api-error';
import { currentLegalVersions } from './terms-of-use';

export const OUTDATED_ACCEPTANCE_MESSAGE = 'Os Termos de Uso foram atualizados. Recarregue a página e aceite a versão atual.';

// Só valida a forma; as versões são conferidas contra as em vigor por assertCurrentAcceptance.
export const acceptanceSchema = z.object({
  accepted: z.literal(true, { error: 'Aceite os Termos de Uso e a Política de Privacidade.' }),
  termsVersion: z.string().min(1).max(40),
  privacyVersion: z.string().min(1).max(40),
});

export type LegalVersions = { termsVersion: string; privacyVersion: string };

export const isCurrentAcceptance = (user: { termsVersion?: string | null; privacyVersion?: string | null } | null | undefined, current: LegalVersions) =>
  Boolean(user && user.termsVersion === current.termsVersion && user.privacyVersion === current.privacyVersion);

/** Valida o aceite e exige as versões em vigor. Lança 400 com instrução de recarregar se estiverem desatualizadas. */
export async function assertCurrentAcceptance(input: unknown, status = 400): Promise<LegalVersions> {
  const parsed = acceptanceSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, 'Aceite os Termos de Uso e o Aviso de Privacidade para continuar.');
  const current = await currentLegalVersions({ fresh: true });
  if (!isCurrentAcceptance(parsed.data, current)) throw new ApiError(status, OUTDATED_ACCEPTANCE_MESSAGE);
  return { termsVersion: parsed.data.termsVersion, privacyVersion: parsed.data.privacyVersion };
}

// Lista explícita de permitidos: nunca copiar bodies de requisição ou credenciais para os registros de auditoria.
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
