import type { EmailVerificationEmail, EmailVerificationSender } from './email-verification-sender';

const EXPECTED = Object.freeze({
  systemIdentifier: '7700224927711935537',
  host: '127.0.0.1',
  port: 5433,
  database: 'jurissim_teste_local',
  username: 'jurissim_tester',
  appOrigin: 'http://127.0.0.1:5174',
  backendPort: '3334',
});

type DatabaseIdentity = {
  database: string;
  username: string;
  address: string;
  port: number;
  systemIdentifier: string;
  versionMajor: number;
};

type CapturedLink = { url: string; expiresAt: number };

export function isLocalDiagnosticDemoRequested(environment: NodeJS.ProcessEnv = process.env) {
  return environment.LOCAL_DIAGNOSTIC_DEMO_MODE === 'true';
}

export function isLocalEmailCaptureRequested() {
  return process.env.LOCAL_EMAIL_CAPTURE_ENABLED === 'true';
}

export class LocalEmailVerificationCapture implements EmailVerificationSender {
  private databaseValidated = false;
  private demoDatabaseValidated = false;
  private readonly links = new Map<string, CapturedLink>();

  get isConfigured() { return this.databaseValidated; }
  get isLocalDiagnosticDemoEnabled() {
    return this.demoDatabaseValidated && isLocalDiagnosticDemoRequested();
  }

  assertLocalDiagnosticDemoConfiguration() {
    this.assertLocalConfiguration();
    if (!isLocalDiagnosticDemoRequested() || process.env.JURISSIM_TEST_TARGET !== 'WSL_LOCAL' ||
      process.env.INITIAL_DIAGNOSTIC_REQUIRED !== 'true' ||
      process.env.INITIAL_DIAGNOSTIC_API_ENABLED !== 'false' ||
      process.env.QUESTION_PRACTICE_SCHEMA_ENABLED !== 'false' ||
      process.env.QUESTION_PRACTICE_API_ENABLED !== 'false') {
      throw new Error('Local diagnostic demo requires the isolated, loopback-only, diagnostic-required development runtime.');
    }
  }

  assertLocalConfiguration() {
    if (process.env.NODE_ENV !== 'development' || !isLocalEmailCaptureRequested() ||
      process.env.JURISSIM_LOCAL_DB_SYSTEM_IDENTIFIER !== EXPECTED.systemIdentifier ||
      process.env.HOST !== '127.0.0.1' || process.env.PORT !== EXPECTED.backendPort ||
      process.env.APP_PUBLIC_URL !== EXPECTED.appOrigin ||
      process.env.CORS_ORIGINS !== 'http://127.0.0.1:5174,http://localhost:5174') {
      throw new Error('Local email capture requires the explicitly validated JurisSim development runtime.');
    }

    const urls = ['DATABASE_URL', 'DIRECT_URL', 'SHADOW_DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL']
      .map(key => process.env[key]);
    if (urls.some(value => !value)) throw new Error('Local email capture requires all database URLs to be explicit.');
    let credentials: { username: string; password: string } | undefined;
    for (const value of urls) {
      const url = new URL(value!);
      const targetIsLocal = ['postgres:', 'postgresql:'].includes(url.protocol) &&
        url.hostname === EXPECTED.host && url.port === String(EXPECTED.port) &&
        url.pathname === `/${EXPECTED.database}` && url.searchParams.get('schema') === 'public' &&
        decodeURIComponent(url.username) === EXPECTED.username && Boolean(url.password);
      if (!targetIsLocal) throw new Error('Local email capture database URL is not the approved local target.');
      const current = { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
      if (credentials && (credentials.username !== current.username || credentials.password !== current.password)) {
        throw new Error('Local email capture database URLs do not share one local credential.');
      }
      credentials = current;
    }
    if (process.env.PGHOST !== EXPECTED.host || process.env.PGHOSTADDR !== EXPECTED.host ||
      process.env.PGPORT !== String(EXPECTED.port) || process.env.PGDATABASE !== EXPECTED.database ||
      process.env.PGUSER !== EXPECTED.username || !process.env.PGPASSWORD ||
      process.env.PGPASSWORD !== credentials?.password ||
      process.env.PGPASSFILE !== '' || process.env.PGSERVICE !== '' || process.env.PGSERVICEFILE !== '' ||
      process.env.PGOPTIONS !== '' || process.env.PGSSLMODE !== 'disable') {
      throw new Error('Inherited libpq settings do not match the approved local target.');
    }
  }

  validateDatabaseIdentity(identity: DatabaseIdentity) {
    this.assertLocalConfiguration();
    const address = identity.address === '127.0.0.1/32' ? '127.0.0.1' : identity.address;
    if (identity.database !== EXPECTED.database || identity.username !== EXPECTED.username ||
      address !== EXPECTED.host || Number(identity.port) !== EXPECTED.port ||
      identity.systemIdentifier !== EXPECTED.systemIdentifier || identity.versionMajor !== 18) {
      throw new Error('Connected PostgreSQL identity does not match the approved local test cluster.');
    }
    this.databaseValidated = true;
    this.demoDatabaseValidated = isLocalDiagnosticDemoRequested() &&
      process.env.INITIAL_DIAGNOSTIC_REQUIRED === 'true' &&
      process.env.INITIAL_DIAGNOSTIC_API_ENABLED === 'false' &&
      process.env.QUESTION_PRACTICE_SCHEMA_ENABLED === 'false' &&
      process.env.QUESTION_PRACTICE_API_ENABLED === 'false' &&
      process.env.JURISSIM_TEST_TARGET === 'WSL_LOCAL';
  }

  async sendEmailVerification({ userId, verifyUrl, expiresInMinutes }: EmailVerificationEmail) {
    if (!this.databaseValidated || !userId || !Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0) {
      throw new Error('Local email capture is not enabled for a validated database.');
    }
    const link = new URL(verifyUrl);
    if (link.origin !== EXPECTED.appOrigin || !link.hash.startsWith('#/verificar-email?token=')) {
      throw new Error('Verification link is outside the local application.');
    }
    const now = Date.now();
    for (const [key, value] of this.links) if (value.expiresAt <= now) this.links.delete(key);
    if (!this.links.has(userId) && this.links.size >= 100) this.links.delete(this.links.keys().next().value!);
    this.links.set(userId, { url: link.href, expiresAt: now + expiresInMinutes * 60_000 });
  }

  takeVerificationLink(userId: string) {
    if (!this.databaseValidated) return undefined;
    const capture = this.links.get(userId);
    this.links.delete(userId);
    return capture && capture.expiresAt > Date.now() ? capture.url : undefined;
  }
}

export const localEmailVerificationCapture = new LocalEmailVerificationCapture();
