// A H4.24 é dividida em duas chaves, ambas independentes das flags de ambiente.
//
// A autoexclusão do aluno (perfil → "Excluir minha conta") está habilitada. Ela ainda
// exige EMAIL_REUSE_BLOCKS_ENABLED=true no ambiente em execução, então uma
// implantação sem as migrações de reuso de e-mail continua respondendo 503.
export const studentSelfDeletionEnabled = () => true;

// A exclusão administrativa, os bloqueios de e-mail e sua revogação permanecem desativados
// até que a integração com o banco seja revisada e aprovada separadamente.
export const accountDeletionEnabled = () => false;

export const accountDeletionUnavailableMessage = 'A exclusão de conta ainda não está disponível. Sua conta e seus dados permanecem preservados.';
