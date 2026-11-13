import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ApiError } from '../errors/api-error';
import type { Prisma } from '@prisma/client';

const id = z.string().uuid();
export const homologationManifestSchema = z.object({
  version: z.literal(1), projectRef: z.string().regex(/^[a-z0-9]{20}$/), runId: id, institutionId: id, ownerId: id,
  adminIds: z.array(id).min(1).max(5), participantIds: z.array(id).min(1).max(30),
}).strict().refine(m => m.participantIds.includes(m.ownerId) && !m.participantIds.some(i => m.adminIds.includes(i)) && new Set(m.participantIds).size === m.participantIds.length && new Set(m.adminIds).size === m.adminIds.length);
export type HomologationManifest = z.infer<typeof homologationManifestSchema>;
type RequestScope = { userId: string; institutionId: string; operational: boolean };
export const institutionRequestScope = new AsyncLocalStorage<RequestScope>();
const privateManifestFile = path.resolve(__dirname, '../../.local/institution-homologation.json');

/** No client values, public flags, or email addresses resolve this manifest. */
export function homologationManifest(environment: NodeJS.ProcessEnv = process.env): HomologationManifest | null {
  if (environment.NODE_ENV === 'production' || environment.INSTITUTION_HOMOLOGATION_ENABLED !== 'true') return null;
  try {
    const file = privateManifestFile;
    if (fs.lstatSync(file).isSymbolicLink() || fs.realpathSync(file) !== file || fs.statSync(file).size > 16_384) return null;
    const parsed = homologationManifestSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
    if(!parsed.success || environment.HOST !== '127.0.0.1') return null;
    for(const key of ['DATABASE_URL','DIRECT_URL']) {
      const url=new URL(environment[key] ?? '');
      const direct=/^db\.([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
      const pooler=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
      const ref=direct?.[1] ?? (pooler ? /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username))?.[1] : undefined);
      if(ref!==parsed.data.projectRef || !['postgresql:','postgres:'].includes(url.protocol) || url.pathname!=='/postgres' || !url.password || url.hash) return null;
      if(!['5432','6543'].includes(url.port) || (key==='DIRECT_URL' && url.port!=='5432')) return null;
      if(url.searchParams.get('sslmode')!=='require' || url.searchParams.get('sslaccept')!=='strict') return null;
      if(url.searchParams.has('schema') && url.searchParams.get('schema')!=='public') return null;
      if(url.port==='6543' && url.searchParams.get('pgbouncer')!=='true') return null;
      const parameters=['schema','sslmode','sslaccept','sslcert','pgbouncer','connection_limit','pool_timeout','connect_timeout','statement_cache_size'];
      if([...url.searchParams.keys()].some(key=>!parameters.includes(key)) || new Set(url.searchParams.keys()).size!==[...url.searchParams.keys()].length) return null;
    }
    return parsed.data;
  } catch { return null; } // Invalid/missing private configuration grants nothing.
}
export function homologationParticipant(userId: string) {
  const manifest = homologationManifest();
  return manifest?.participantIds.includes(userId) ? manifest : null;
}
export function restrictedInstitutionId() {
  const scope = institutionRequestScope.getStore();
  const manifest = scope && homologationParticipant(scope.userId);
  return manifest && scope.institutionId === manifest.institutionId ? manifest.institutionId : undefined;
}
export function restrictedOperationsEnabled() {
  return !!institutionRequestScope.getStore()?.operational && !!restrictedInstitutionId();
}
export function assertRestrictedInstitution(institutionId: string) {
  const allowed = restrictedInstitutionId();
  if (institutionRequestScope.getStore() && !allowed) throw new ApiError(403, 'Escopo de homologação revogado.');
  if (allowed && institutionId !== allowed) throw new ApiError(403, 'Instituição fora do escopo autorizado.');
}
export function assertRestrictedParticipant(userId: string) {
  if (institutionRequestScope.getStore() && !restrictedInstitutionId()) throw new ApiError(403, 'Escopo de homologação revogado.');
  if (restrictedInstitutionId() && !homologationParticipant(userId)) throw new ApiError(403, 'Conta fora do escopo autorizado.');
}
export function homologationClassBoundary(): Prisma.TurmaWhereInput | undefined {
  const manifest = homologationManifest();
  if(institutionRequestScope.getStore() && !restrictedInstitutionId()) throw new ApiError(403,'Escopo de homologação revogado.');
  // A disabled/broken configured runtime must not fall back to legacy access
  // to previously provisioned fixture classes. Keep the private registry until
  // the audited test closure has removed its active memberships and classes.
  if(!manifest && process.env.INSTITUTION_HOMOLOGATION_ENABLED!=='true' && !fs.existsSync(privateManifestFile)) return undefined;
  const scoped = restrictedInstitutionId();
  return scoped ? {institutionalClass:{institutionId:scoped,institution:{status:'ACTIVE'}}} : {OR:[{institutionalClass:null},{institutionalClass:{institution:{events:{none:{event:'HOMOLOGATION_FIXTURE_PROVISIONED'}}}}}]};
}
export function fixtureApprovalAllowed(actor: {userId: string; role: string}, institution: {id: string; ownerId?: string; registrationNumber?: string | null}) {
  const manifest = homologationManifest();
  return !!manifest && actor.role === 'ADMIN' && manifest.adminIds.includes(actor.userId) && institution.id === manifest.institutionId && institution.ownerId === manifest.ownerId && institution.registrationNumber === null;
}
