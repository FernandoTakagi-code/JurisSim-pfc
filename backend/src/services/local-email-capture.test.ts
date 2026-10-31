import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalEmailVerificationCapture } from './local-email-capture';
import { AuthController } from '../controllers/auth-controller';
import { ApiError } from '../errors/api-error';

const password = 'local-test-password';
const databaseUrl = `postgresql://jurissim_tester:${password}@127.0.0.1:5433/jurissim_teste_local?schema=public`;
const identity = {
  database: 'jurissim_teste_local', username: 'jurissim_tester', address: '127.0.0.1/32',
  port: 5433, systemIdentifier: '7700224927711935537', versionMajor: 18,
};

function configure(environment: Record<string, string> = {}) {
  vi.stubEnv('NODE_ENV', environment.NODE_ENV ?? 'development');
  vi.stubEnv('LOCAL_EMAIL_CAPTURE_ENABLED', environment.LOCAL_EMAIL_CAPTURE_ENABLED ?? 'true');
  vi.stubEnv('LOCAL_DIAGNOSTIC_DEMO_MODE', environment.LOCAL_DIAGNOSTIC_DEMO_MODE ?? 'false');
  vi.stubEnv('JURISSIM_TEST_TARGET', environment.JURISSIM_TEST_TARGET ?? 'WSL_LOCAL');
  vi.stubEnv('INITIAL_DIAGNOSTIC_REQUIRED', environment.INITIAL_DIAGNOSTIC_REQUIRED ?? 'true');
  vi.stubEnv('INITIAL_DIAGNOSTIC_API_ENABLED', environment.INITIAL_DIAGNOSTIC_API_ENABLED ?? 'false');
  vi.stubEnv('QUESTION_PRACTICE_SCHEMA_ENABLED', environment.QUESTION_PRACTICE_SCHEMA_ENABLED ?? 'false');
  vi.stubEnv('QUESTION_PRACTICE_API_ENABLED', environment.QUESTION_PRACTICE_API_ENABLED ?? 'false');
  vi.stubEnv('JURISSIM_LOCAL_DB_SYSTEM_IDENTIFIER', environment.JURISSIM_LOCAL_DB_SYSTEM_IDENTIFIER ?? '7700224927711935537');
  vi.stubEnv('HOST', environment.HOST ?? '127.0.0.1');
  vi.stubEnv('PORT', environment.PORT ?? '3334');
  vi.stubEnv('APP_PUBLIC_URL', environment.APP_PUBLIC_URL ?? 'http://127.0.0.1:5174');
  vi.stubEnv('CORS_ORIGINS', environment.CORS_ORIGINS ?? 'http://127.0.0.1:5174,http://localhost:5174');
  for (const name of ['DATABASE_URL', 'DIRECT_URL', 'SHADOW_DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL']) {
    vi.stubEnv(name, environment[name] ?? databaseUrl);
  }
  vi.stubEnv('PGHOST', environment.PGHOST ?? '127.0.0.1');
  vi.stubEnv('PGHOSTADDR', environment.PGHOSTADDR ?? '127.0.0.1');
  vi.stubEnv('PGPORT', environment.PGPORT ?? '5433');
  vi.stubEnv('PGDATABASE', environment.PGDATABASE ?? 'jurissim_teste_local');
  vi.stubEnv('PGUSER', environment.PGUSER ?? 'jurissim_tester');
  vi.stubEnv('PGPASSWORD', environment.PGPASSWORD ?? password);
  vi.stubEnv('PGPASSFILE', environment.PGPASSFILE ?? '');
  vi.stubEnv('PGSERVICE', environment.PGSERVICE ?? '');
  vi.stubEnv('PGSERVICEFILE', environment.PGSERVICEFILE ?? '');
  vi.stubEnv('PGOPTIONS', environment.PGOPTIONS ?? '');
  vi.stubEnv('PGSSLMODE', environment.PGSSLMODE ?? 'disable');
}

afterEach(() => vi.unstubAllEnvs());

describe('captura local de confirmações', () => {
  it('só habilita após verificar configuração e identidade exata do PostgreSQL local', () => {
    configure();
    const capture = new LocalEmailVerificationCapture();
    expect(capture.isConfigured).toBe(false);
    capture.assertLocalConfiguration();
    capture.validateDatabaseIdentity(identity);
    expect(capture.isConfigured).toBe(true);
  });

  it('enables demo access only after exact local cluster validation and with both APIs disabled', () => {
    configure({ LOCAL_DIAGNOSTIC_DEMO_MODE: 'true' });
    const capture = new LocalEmailVerificationCapture();
    capture.assertLocalDiagnosticDemoConfiguration();
    expect(capture.isLocalDiagnosticDemoEnabled).toBe(false);
    capture.validateDatabaseIdentity(identity);
    expect(capture.isLocalDiagnosticDemoEnabled).toBe(true);
  });

  it.each([
    { NODE_ENV: 'production' },
    { HOST: '0.0.0.0' },
    { INITIAL_DIAGNOSTIC_REQUIRED: 'false' },
    { INITIAL_DIAGNOSTIC_API_ENABLED: 'true' },
    { QUESTION_PRACTICE_API_ENABLED: 'true' },
    { JURISSIM_TEST_TARGET: 'SUPABASE' },
  ])('refuses unsafe local-demo configuration', config => {
    configure({ LOCAL_DIAGNOSTIC_DEMO_MODE: 'true', ...config } as unknown as Record<string, string>);
    const capture = new LocalEmailVerificationCapture();
    expect(() => capture.assertLocalDiagnosticDemoConfiguration()).toThrow();
    expect(capture.isLocalDiagnosticDemoEnabled).toBe(false);
  });

  it.each([
    { NODE_ENV: 'production' },
    { LOCAL_EMAIL_CAPTURE_ENABLED: 'false' },
    { DATABASE_URL: 'postgresql://user:pass@remote.example/db?schema=public' },
    { DIRECT_URL: 'postgresql://jurissim_tester:other@127.0.0.1:5433/jurissim_teste_local?schema=public' },
    { PGHOSTADDR: '203.0.113.8' },
  ])('recusa configuração que não seja o runtime local autorizado', config => {
    configure(config as unknown as Record<string, string>);
    expect(() => new LocalEmailVerificationCapture().assertLocalConfiguration()).toThrow();
  });

  it('recusa cluster, versão, usuário ou database divergente', () => {
    configure();
    const capture = new LocalEmailVerificationCapture();
    capture.assertLocalConfiguration();
    expect(() => capture.validateDatabaseIdentity({ ...identity, systemIdentifier: '999999999' })).toThrow(/identity/);
    expect(capture.isConfigured).toBe(false);
  });

  it('captura o link em memória, entrega uma vez apenas à conta autenticada e nunca registra o token', async () => {
    configure();
    const capture = new LocalEmailVerificationCapture();
    capture.assertLocalConfiguration();
    capture.validateDatabaseIdentity(identity);
    const token = 'a'.repeat(64);
    const verifyUrl = `http://127.0.0.1:5174/#/verificar-email?token=${token}`;
    const log = vi.spyOn(console, 'log');
    await capture.sendEmailVerification({ userId: 'user-test', to: 'synthetic@example.invalid', verifyUrl, expiresInMinutes: 30 });
    expect(capture.takeVerificationLink('other-user')).toBeUndefined();
    expect(capture.takeVerificationLink('user-test')).toBe(verifyUrl);
    expect(capture.takeVerificationLink('user-test')).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it('recusa links fora da origem local mesmo depois de validar o cluster', async () => {
    configure();
    const capture = new LocalEmailVerificationCapture();
    capture.assertLocalConfiguration();
    capture.validateDatabaseIdentity(identity);
    await expect(capture.sendEmailVerification({
      userId: 'user-test', to: 'synthetic@example.invalid',
      verifyUrl: 'https://external.example/#/verificar-email?token=secret', expiresInMinutes: 30,
    })).rejects.toThrow(/outside the local application/);
  });

  it('devolve link pendente da mesma conta quando o reenvio está sob rate limit', async () => {
    configure();
    const capture = new LocalEmailVerificationCapture();
    capture.assertLocalConfiguration();
    capture.validateDatabaseIdentity(identity);
    const verifyUrl = `http://127.0.0.1:5174/#/verificar-email?token=${'b'.repeat(64)}`;
    await capture.sendEmailVerification({ userId: 'user-test', to: 'synthetic@example.invalid', verifyUrl, expiresInMinutes: 30 });
    const emailVerification = { requestVerification: vi.fn().mockRejectedValue(new ApiError(429, 'rate limited', 60)) };
    const controller = new AuthController({} as never, {} as never, emailVerification as never, capture);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await controller.solicitarConfirmacaoEmail({ auth: { userId: 'user-test', role: 'ALUNO' } } as never, response as never);

    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Link de confirmacao local disponivel para esta conta.', localVerificationUrl: verifyUrl,
    });
    expect(capture.takeVerificationLink('user-test')).toBeUndefined();
  });
});
