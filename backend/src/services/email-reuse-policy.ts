import { ApiError } from '../errors/api-error';

export const normalizeReusableEmail = (email: string) => email.trim().toLowerCase();

// The schema is intentionally opt-in. Until the additive migration has been
// applied to an isolated database, no runtime path may query EmailReuseBlock.
export const emailReuseBlocksEnabled = (environment = process.env) =>
  environment.EMAIL_REUSE_BLOCKS_ENABLED === 'true';

export interface EmailReuseBlockStore {
  active(emailNormalized: string): Promise<boolean>;
  block(emailNormalized: string, actorId: string, reason?: string): Promise<void>;
  revoke(emailNormalized: string, actorId: string): Promise<boolean>;
}

export class EmailReusePolicy {
  constructor(private readonly store: EmailReuseBlockStore, private readonly enabled = emailReuseBlocksEnabled()) {}
  assertAvailable() {
    if (!this.enabled) throw new ApiError(503, 'A política de reutilização de e-mail ainda não está disponível neste ambiente.');
  }
  async assertRegistrationAllowed(email: string) {
    this.assertAvailable();
    if (await this.store.active(normalizeReusableEmail(email)))
      throw new ApiError(409, 'Não foi possível concluir o cadastro com este e-mail.');
  }
  async block(email: string, actorId: string, reason?: string) { this.assertAvailable(); await this.store.block(normalizeReusableEmail(email), actorId, reason); }
  async revoke(email: string, actorId: string) { this.assertAvailable(); return this.store.revoke(normalizeReusableEmail(email), actorId); }
}
