# Supabase — preparação das Fases B/C (não executada)

> Atualização de 06/11: a inspeção somente leitura e a recuperação do backup novo foram executadas; a aplicação de migration continua NÃO executada. O relatório `integracao-real-pre-ativacao-06112026.md` confirma a única migration pendente, a restauração integral e os bloqueios de professores/acervo. As etapas de aplicação abaixo continuam exigindo autorização explícita e nova conferência no momento da execução.

06/11/2026. Este é um procedimento para execução futura, com autorização específica. A publicação do código na `entrega0911` não aplica migrations, não ativa flags e não autoriza operações no banco compartilhado.

## Estado conhecido e compatibilidade

O histórico local contém 21 migrations. A administrativa `20261104000100_institutions_administration` foi informada como aplicada anteriormente. A única migration nova no conjunto de mudanças desta entrega é `20261105000100_teacher_invitation_onboarding`. Não houve consulta ao `_prisma_migrations` remoto nesta consolidação; a lista efetivamente pendente e eventuais drifts/checksums permanecem por confirmar.

O novo SQL usa `BEGIN/COMMIT`, acrescenta `TeacherInvitation.invitedName` opcional, cria `TeacherInvitationClass` e `InvitationOnboarding`, índices e quatro chaves estrangeiras com `ON DELETE RESTRICT`, habilita RLS e revoga acesso de PUBLIC/anon/authenticated quando essas roles existem. O schema Prisma acompanha os modelos e relações.

Há um `DROP CONSTRAINT` deliberado: substitui `TeacherInvitation_status_check` por versão que mantém PENDING/ACCEPTED/CANCELLED e acrescenta DECLINED. Não é remoção de dados. A tabela precisa existir com a constraint esperada; drift nessa premissa deve interromper a execução. Não existem DELETE, TRUNCATE, DROP TABLE, UPDATE de contas, redefinição de senha, confirmação automática ou conversão de professores no SQL novo.

As novas tabelas começam vazias; a coluna é nullable. Usuários, matrículas, questões, avaliações, tentativas e históricos não recebem backfill. Os relacionamentos novos não alteram propriedade de turmas. A ampliação/validação da constraint exige locks na tabela de convites; use janela de menor atividade, lock timeout e manutenção controlada. RLS/revogações exigem conferir que o papel de conexão do backend tem os privilégios autorizados e não depende de acesso direto via browser.

O teste descartável `backend/scripts/test-invitation-migration-local.cjs` documentado na Fase B verifica baseline administrativo, novos objetos, linhas históricas de fixture, quatro FKs, RLS e dump/restauração em PostgreSQL de loopback. Não foi repetido nesta consolidação nem substitui restauração Supabase completa, especialmente extensão Vault.

## Configurações antes de qualquer ativação

| Configuração | Condição |
| --- | --- |
| `DATABASE_URL` | Runtime privado, schema/projeto corretos e TLS seguro. Não publicar URL |
| `DIRECT_URL` | Conexão apropriada a migrations, direta ou pooler em modo sessão suportado; não usar pooler transacional para DDL/locks Prisma |
| TLS | Usar CA/cadeia já validada, hostname correto e verificação de certificado; não usar `rejectUnauthorized=false` ou `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `INSTITUTIONS_ENABLED` | Manter false até schema, vínculos e guard de ativação estarem prontos |
| `ADMINISTRATION_ENABLED` | Opt-in independente false por padrão; não ativa pedagógico global. Conferir schema antes de habilitar |
| `INSTITUTION_REGISTRATION_ENABLED` | Opt-in independente false por padrão; não libera professores/convites completos |
| Google | `GOOGLE_CLIENT_ID` backend = `VITE_GOOGLE_CLIENT_ID` frontend; origens exatas cadastradas no console OAuth, nonce/audience validados; sem segredo OAuth no frontend |
| Brevo API | `BREVO_EMAIL_TRANSPORT=api` e `BREVO_API_KEY` privada; remetente autorizado |
| Brevo SMTP | Alternativa explícita `BREVO_EMAIL_TRANSPORT=smtp`, `BREVO_SMTP_USER` e `BREVO_SMTP_KEY` privados; presença de chave não comprova entrega |
| URLs | `APP_PUBLIC_URL` aponta ao frontend correto; `VITE_API_URL` ao backend; `CORS_ORIGINS` contém origens exatas, inclusive distinção localhost/127.0.0.1 |
| Sessões | `JWT_SECRET` privado de pelo menos 32 caracteres, política de expiração, versão e logout existentes preservados |

A inspeção local confirmou IDs Google presentes/correspondentes, campos SMTP presentes, URL pública e CORS presentes; não exibiu valores privados, não enviou mensagens nem verificou o console externo. API Brevo não estava configurada localmente. `INSTITUTIONS_ENABLED=false`; os dois opt-ins novos estavam ausentes, portanto efetivamente false. O ambiente compartilhado não foi inspecionado.

## Procedimento controlado futuro

Os comandos abaixo **não foram executados contra o Supabase nesta entrega**. Executar na branch `entrega0911`, em `backend`, somente após autorização, usando variáveis privadas carregadas sem exibir valores.

### 1. Estado remoto e pré-condições

- Confirmar identidade do projeto/host/database/schema com a proprietária; inspecionar migrações e checksums, ausência de falhas e drift. Não imprimir strings de conexão.
- Com as flags false, colocar operações institucionais em manutenção; confirmar menor atividade e timeouts efetivos de conexão/statement/lock. Usar papel apropriado e uma única operação de schema.
- Consultar o histórico Prisma e guardar o resultado em local privado, nunca em logs públicos:

```powershell
npx.cmd --no-install prisma validate
npx.cmd --no-install prisma migrate status
```

Consulta de revisão, via cliente PostgreSQL com conexão TLS configurada por canal seguro:

```sql
SHOW statement_timeout;
SHOW lock_timeout;
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations" ORDER BY started_at;
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid='"TeacherInvitation"'::regclass;
```

Somente prosseguir se a única pendente for a migration de onboarding, a baseline administrativa estiver íntegra e nenhuma migration estiver incompleta. Se houver outra pendente, drift ou checksum alterado, não executar `deploy`, pois ele aplica todas as pendentes.

### 2. Backup recuperável e baseline

- Confirmar backup atualizado e restauração integral comprovada em Supabase isolado compatível com versões/extensões, incluindo `supabase_vault`. Um dump íntegro ou listagem de TOC isoladamente não prova recuperação integral.
- Carregar `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, autenticação segura e TLS/CA no processo por mecanismo privado. Nunca inserir senha ou URL na linha de comando. Usar pasta fora do repositório, ACL restrita e nome novo. Com `PGSSLMODE=verify-full` e `PGSSLROOTCERT` apropriados para o endpoint, comandos de exemplo:

```powershell
$backupPath = Read-Host 'Caminho absoluto novo fora do Git para o dump'
if (Test-Path -LiteralPath $backupPath) { throw 'Destino já existe; preserve o backup anterior.' }
pg_dump --format=custom --file=$backupPath
if ($LASTEXITCODE -ne 0) { throw 'Backup falhou; não prosseguir.' }
pg_restore --list $backupPath
if ($LASTEXITCODE -ne 0) { throw 'Arquivo de backup inválido; não prosseguir.' }
Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath
```

- Conferir cobertura de schemas/tabelas/dados, roles, owners, grants, RLS e dependências de extensão; documentar recuperação dessas dependências. Não assumir que `pg_dump` inclui roles globais ou todos os schemas gerenciados do Supabase.
- Restaurar em destino isolado explicitamente confirmado e verificar contagens/hashes por tabela, constraints e funcionalidades. Não restaurar sobre o compartilhado para testar. Não usar `--clean` contra projeto existente.
- Registrar baseline privado dos dados preexistentes imediatamente antes de aplicar; se houver atividade relevante após o backup, renovar salvaguarda/snapshot consistente. Não confundir o backup histórico de 20/10 ou o de 04/11 com backup atualizado da janela atual.

### 3. Aplicação (somente com autorização específica)

Confirmadas as condições anteriores e a única pendência esperada:

```powershell
npx.cmd --no-install prisma migrate deploy
npx.cmd --no-install prisma migrate status
```

Não usar `db push`, `migrate reset`, seed ou `migrate dev` no compartilhado. Não ativar flags no mesmo procedimento. `migrate deploy` usa a URL de migrations definida em `DIRECT_URL` no schema; o operador deve verificar conexão/timeouts antes, sem registrar credenciais. Se ocorrer timeout/falha, interromper e inspecionar transação/histórico antes de qualquer nova tentativa.

### 4. Verificação posterior

- Confirmar a migration registrada sem falha e ausência de outras incompletas.
- Conferir coluna nullable, novos objetos/índices, quatro FKs, constraint ampliada, RLS e revogações. Conferir acesso do papel do backend.
- Comparar baseline de usuários, professores, instituições, turmas, matrículas, questões, simulados, tentativas e históricos; nenhuma alteração de linhas antigas é esperada, além do registro no histórico Prisma e coluna nova nula.
- Confirmar login pessoal/Google, sessão e recuperação em homologação autorizada, sem mensagens para terceiros. No compartilhado, qualquer operação real exige escopo aprovado.
- Manter flags false e não modificar os nove professores ou provisionar ADMIN como parte da migration.

### 5. Falha e recuperação

Uma falha durante a transação SQL deve ser tratada com revisão do estado real, sem assumir rollback completo apenas pela mensagem do cliente. Não marcar migration resolvida artificialmente. `prisma migrate resolve` exige diagnóstico e autorização próprios; não executar como correção automática.

Se houver impacto após commit do DDL, interromper ativação, manter flags false e usar a versão compatível do aplicativo conforme procedimento aprovado. Preferir correção aditiva revisada. Uma restauração só pode ocorrer após autorização explícita e plano para preservar alterações legítimas feitas depois do backup. Não apagar tabelas, dados ou histórico Prisma para “voltar”. Preservar o dump anterior e os relatórios fora do Git.

## Transição dos nove professores

Sem recriar usuários ou trocar identificadores/senhas: confirmar e-mail pelo fluxo normal; responsável aprovado envia convite legítimo; conta existente autentica/aceita; instituição designa turmas e propriedade legítimas sob autorização. Manter autoria e históricos. Não confirmar automaticamente, fabricar instituição ou associar todos por script.

Após autorização de inspeção remota, `npx.cmd --no-install tsx scripts/check-institution-activation.ts` executa a verificação somente leitura e devolve contagens, não muda flags nem aprova transição. Guard `assertInstitutionActivationReady` bloqueia startup com módulo ativo se faltarem confirmações, vínculos ou propriedade institucional das turmas. Não remover esse bloqueio para demonstrar.

## Publicação não é ativação

O código é publicável com os opt-ins false. Novos modelos ficam atrás das capacidades autorizadas; as funcionalidades pessoais preservam os contratos anteriores. A aplicação real da migration e o estado remoto permanecem pendências documentadas, não justificam habilitar o módulo automaticamente ao baixar a branch.
