import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../errors/api-error';
import versions from '../../legal-versions.json';
import initialTerms from '../../terms-of-use/initial-terms.json';

export type TermsSection = { title: string; body: string };
export type TermsOfUse = { version: string; publishedAt: Date; sections: TermsSection[] };

const CACHE_MS = 60_000;
const PUBLISH_ATTEMPTS = 3;
const noMarkup = (value: string) => !/[<>]/.test(value);

export const sectionsSchema = z.array(z.object({
  title: z.string().trim().min(1).max(120).refine(noMarkup),
  body: z.string().trim().min(1).max(5000).refine(noMarkup),
}).strict()).min(1).max(40);

let cache: { terms: TermsOfUse; expiresAt: number } | null = null;

/** Apenas para testes: descarta a versão guardada em memória. */
export function resetTermsCache() { cache = null; }

const isMissingTable = (error: unknown) => (error as { code?: string })?.code === 'P2021';
// Enquanto a migração não for aplicada, vale a versão inicial empacotada (a mesma que a migração insere).
const bundledTerms: TermsOfUse = { version: versions.termsVersion, publishedAt: new Date('2026-11-13T03:00:00.000Z'), sections: initialTerms };

/** Versão em vigor dos Termos (a publicada mais recentemente), com cache curto em memória. */
export async function currentTermsOfUse({ fresh = false }: { fresh?: boolean } = {}): Promise<TermsOfUse> {
  if (!fresh && cache && cache.expiresAt > Date.now()) return cache.terms;
  let value: TermsOfUse;
  try {
    const terms = await prisma.termsOfUseVersion.findFirst({
      orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
      select: { version: true, publishedAt: true, sections: true },
    });
    if (!terms) throw new ApiError(503, 'Os Termos de Uso estão indisponíveis no momento. Tente novamente mais tarde.');
    value = terms as unknown as TermsOfUse;
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    value = bundledTerms;
  }
  cache = { terms: value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

/**
 * Versões que uma conta precisa ter aceitado: Termos do banco e Aviso de Privacidade do código.
 * `fresh` ignora o cache (usado ao gravar um aceite, para nunca registrar uma versão já substituída).
 */
export async function currentLegalVersions(options: { fresh?: boolean } = {}) {
  const terms = await currentTermsOfUse(options);
  return { termsVersion: terms.version, privacyVersion: versions.privacyVersion };
}

/** Compara seções pelo conteúdo, independente da ordem das chaves que o JSONB devolve. */
const sameSections = (a: unknown, b: TermsSection[]) =>
  JSON.stringify((a as TermsSection[]).map(({ title, body }) => [title, body])) === JSON.stringify(b.map(({ title, body }) => [title, body]));

function saoPauloDay(instant: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Próximo número AAAA-MM-DD.N, a partir das versões já publicadas no mesmo dia. */
export function nextTermsVersion(existingToday: string[], now: Date): string {
  const last = Math.max(0, ...existingToday.map(version => Number(version.split('.').pop()) || 0));
  return `${saoPauloDay(now)}.${last + 1}`;
}

const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === 'P2002';

/** Publica uma nova versão. Na mesma transação registra o evento administrativo e o aceite de quem publicou. */
export async function publishTermsOfUse(adminId: string, input: unknown): Promise<{ version: string }> {
  const parsed = sectionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, 'Revise as seções: de 1 a 40, título com até 120 caracteres, texto com até 5.000 e sem os caracteres < ou >.');
  }
  const sections: TermsSection[] = parsed.data;
  for (let attempt = 1; ; attempt++) {
    try {
      const published = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const current = await tx.termsOfUseVersion.findFirst({ orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }], select: { sections: true } });
        if (current && sameSections(current.sections, sections)) {
          throw new ApiError(409, 'O texto é igual ao da versão em vigor. Altere alguma seção antes de publicar.');
        }
        const today = await tx.termsOfUseVersion.findMany({ where: { version: { startsWith: `${saoPauloDay(now)}.` } }, select: { version: true } });
        const version = nextTermsVersion(today.map(item => item.version), now);
        await tx.termsOfUseVersion.create({ data: { version, sections, publishedById: adminId } });
        await tx.administrativeEvent.create({ data: { event: 'TERMS_OF_USE_PUBLISHED', actorId: adminId, resourceId: version, result: 'SUCCESS' } });
        // Quem publica escreveu o texto: o aceite dele é registrado junto, no mesmo formato do aceite normal.
        await tx.user.update({
          where: { id: adminId },
          data: {
            legalAcceptedAt: now, termsVersion: version, privacyVersion: versions.privacyVersion,
            auditLogs: { create: { action: 'ACEITE_TERMOS_E_PRIVACIDADE', occurredAt: now, termsVersion: version, privacyVersion: versions.privacyVersion } },
          },
        });
        return { version };
      });
      resetTermsCache();
      return published;
    } catch (error) {
      if (isUniqueViolation(error) && attempt < PUBLISH_ATTEMPTS) continue;
      if (isMissingTable(error)) throw new ApiError(503, 'A publicação de novas versões aguarda a aplicação da migração dos Termos de Uso no banco.');
      throw error;
    }
  }
}

/** Visão do ADMIN: versão em vigor, histórico de publicações e adesão à versão atual. */
export async function termsOfUseOverview() {
  const current = await currentTermsOfUse();
  const [history, acceptedCount, activeAccounts] = await Promise.all([
    prisma.termsOfUseVersion.findMany({
      orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
      select: { version: true, publishedAt: true, publishedBy: { select: { nome: true } } },
    }),
    prisma.user.count({ where: { deletedAt: null, termsVersion: current.version } }),
    prisma.user.count({ where: { deletedAt: null } }),
  ]);
  return {
    current,
    history: history.map(item => ({ version: item.version, publishedAt: item.publishedAt, publishedBy: item.publishedBy?.nome ?? null })),
    acceptedCount,
    activeAccounts,
  };
}

/** Uma versão publicada (somente leitura), para consulta do histórico. */
export async function termsOfUseVersion(version: string): Promise<TermsOfUse> {
  const found = await prisma.termsOfUseVersion.findUnique({ where: { version }, select: { version: true, publishedAt: true, sections: true } });
  if (!found) throw new ApiError(404, 'Versão dos Termos de Uso não encontrada.');
  return found as unknown as TermsOfUse;
}
