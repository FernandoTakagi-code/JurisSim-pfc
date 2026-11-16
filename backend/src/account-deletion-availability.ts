// H4.24 is split in two switches, both independent of environment flags.
//
// Student self-deletion (profile → "Excluir minha conta") is enabled. It still
// requires EMAIL_REUSE_BLOCKS_ENABLED=true in the running environment, so a
// deployment without the email-reuse migrations keeps answering 503.
export const studentSelfDeletionEnabled = () => true;

// Administrative deletion, email blocks and their revocation stay disabled until
// their database integration is reviewed and approved separately.
export const accountDeletionEnabled = () => false;

export const accountDeletionUnavailableMessage = 'A exclusão de conta ainda não está disponível. Sua conta e seus dados permanecem preservados.';
