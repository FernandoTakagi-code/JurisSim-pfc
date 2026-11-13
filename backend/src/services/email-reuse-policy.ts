
export const normalizeReusableEmail = (email: string) => email.trim().toLowerCase();

// The schema is intentionally opt-in. Until the additive migration has been
// applied to an isolated database, no runtime path may query EmailReuseBlock.
export const emailReuseBlocksEnabled = (environment = process.env) =>
  environment.EMAIL_REUSE_BLOCKS_ENABLED === 'true';
