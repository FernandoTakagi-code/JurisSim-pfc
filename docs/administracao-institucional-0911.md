# Administração e instituições — entrega 09/11

## Ativação e compatibilidade

O módulo utiliza a migration aditiva `20261104000100_institutions_administration`.
Nenhuma migration foi aplicada ao Supabase e nenhum banco local substitui o
ambiente definitivo. Não executar reset, seed ou backfill automático.

`INSTITUTIONS_ENABLED` permanece **desligado por padrão**. Nesse estado a
autenticação e os recursos existentes continuam usando somente as tabelas
anteriores. As páginas administrativas informam indisponibilidade do módulo e
os endpoints novos respondem 503. Não há necessidade de alterar o `.env` da equipe
para consumir esta branch antes da autorização do banco.

Depois de autorização explícita, o operador deve revisar backup/ledger/SQL,
aplicar a migration pelo processo aprovado da equipe, gerar o Prisma Client e
conferir os privilégios do papel usado pelo backend. As tabelas novas têm RLS
habilitada sem políticas de browser e privilégios públicos revogados; o backend
precisa de papel confiável. Só então configurar `INSTITUTIONS_ENABLED=true` e
reiniciar o backend. A aplicação no Supabase e a validação real de persistência
continuam pendentes; os testes automatizados usam dependências simuladas.

## Perfis e páginas

- `/administracao`: administrador geral (`ADMIN` existente), indicadores, usuários,
  permissões, instituições, vínculo de turmas existentes, Logs e Auditoria.
- `/instituicoes`: solicitação, situação e notificações; responsáveis aprovados
  administram seus dados institucionais, convites, professores, turmas e logs.
- O administrador institucional é uma capacidade persistida em vínculo ativo com
  a instituição. Não recebe `ADMIN` no JWT nem acesso às APIs globais.
- Professores entram com sua identidade existente e aceitam o convite enviado
  ao mesmo e-mail confirmado. O cadastro público continua criando somente alunos.
- O link de convite usa token aleatório, hash SHA-256 em banco, validade de 48h e
  consumo condicional de uso único. O navegador remove o token da URL e o mantém
  somente na memória da aba; se recarregar a aba, reabrir o e-mail.
- O remetente/transporte é o Brevo já existente. A emissão exige configuração de
  e-mail e `APP_PUBLIC_URL` válida. Não houve envio real nesta implementação.
- Professores escolhem a instituição no seletor do painel. O cabeçalho de contexto
  é validado pelo servidor contra os vínculos atuais; não concede privilégios.
- O código da turma cria solicitação pendente. Só aprovação conecta o aluno à
  matrícula usada pelas consultas e pelos simulados. Remoção desconecta matrícula,
  preservando tentativas e histórico individual.
- Revogar vínculo desconecta o professor das turmas da instituição e revoga suas
  sessões. Outros vínculos institucionais são preservados. Instituições suspensas
  não conferem administração ou acesso acadêmico institucional; estudo individual
  permanece disponível à identidade sem vínculo docente ativo.
- Turmas anteriores não são movidas automaticamente. O administrador geral pode
  vinculá-las a uma instituição ativa depois de os professores existentes aceitarem
  seus convites. Essa operação preserva alunos, avaliações e histórico.

## Primeiro administrador geral

O responsável cria sua própria conta pelo cadastro normal, com senha escolhida
por ele ou identidade Google, e confirma seu e-mail. Um operador autorizado define
privadamente `ADMIN_PROVISION_USER_ID` com o identificador dessa conta e executa,
no backend, `node scripts/provision-first-admin.cjs --bootstrap-first-admin`.

O comando exige a migration aplicada, e-mail confirmado e ausência de outro
administrador, inclusive excluído, ou bootstrap anterior. Não depende de ativar
o módulo: manter `INSTITUTIONS_ENABLED=false`. Usa lock transacional, registra
a concessão e revoga sessões apenas no primeiro provisionamento.
Não cria conta, senha, credencial fixa ou endpoint público. Não foi executado.
Se já existe administrador, concessões e revogações ocorrem no painel autorizado,
com impedimento de autoalteração e de remoção do último administrador ativo.

A ativação futura é recusada pelo backend enquanto houver professores sem
e-mail confirmado, vínculo institucional ativo ou acesso às suas turmas antigas.
Procedimento e verificações em [seguranca-bootstrap-transicao-professores.md](seguranca-bootstrap-transicao-professores.md).

## Auditoria e retenção

Eventos administrativos são gravados transacionalmente com as respectivas
alterações. Autenticação mantém os registros antigos e acrescenta eventos
administrativos identificados quando possível. O middleware registra bloqueios e
falhas operacionais com campos mínimos, sem corpos, URLs, e-mails, tokens,
senhas, segredos ou stack traces. Logs técnicos permanecem separados.

O painel permite filtrar por período, evento, responsável, instituição e gravidade,
com paginação. Instituições consultam somente a rota vinculada à sua própria
capacidade administrativa. Não existe API de edição/remoção de eventos.
Triggers recusam UPDATE/TRUNCATE e DELETE fora da manutenção de retenção.

`AUDIT_RETENTION_DAYS` configura 30 a 3650 dias, padrão 180. Com autorização
operacional e após definir a finalidade/prazo, executar manualmente
`node scripts/retain-administrative-audit.cjs --apply-retention`. O comando abre
transação com cutoff privado, remove somente eventos expirados e registra a
manutenção. Não foi executado. Esse prazo técnico configurável não substitui a
definição institucional da política de retenção.

## Verificações

- Suíte backend: `npm test` (inclui testes de serviço/HTTP das permissões novas).
- Builds: `npm run build` em backend e frontend.
- Schema: `npx prisma validate` no backend; não conecta ao banco.
- Interface: `node scripts/test-administration.mjs` no frontend, usando Chrome
  headless e API simulada. Não comprova integração real com banco ou e-mail.
- Não foi executada a atividade de testes de integração do professor, publicação,
  migration compartilhada ou revisão completa de LGPD.
