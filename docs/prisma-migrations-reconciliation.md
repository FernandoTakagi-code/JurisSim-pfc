# Reconciliação das migrations Prisma — etapa 1

Data: 15/10/2026. Branch: `entrega2809`.

## Escopo e comparação completa

Foram comparadas as seis migrations existentes com todo o `backend/prisma/schema.prisma`.
Nenhuma migration histórica foi editada. Não houve conexão ao Supabase, leitura de
dados reais, alteração de `.env`, envio de e-mails ou alteração de código da aplicação.

| Migration histórica | Estruturas comparadas | Resultado |
| --- | --- | --- |
| `20260909213003_init` | `Role`, `Nivel`, `TipoSimulado`; `User`, `Turma`, `Questao`, `Alternativa`, `Simulado`, `Resposta`, `MetaDiaria` e as duas tabelas de associação; PKs, índices, defaults e FKs | `User.senhaHash` ainda era obrigatório no histórico; o schema atual permite `NULL`. Demais estruturas reconciliadas pelas migrations seguintes. |
| `20260911000000_add_diagnostic_adaptive_trail` | `TipoMetricaDiagnostico`, `QuestaoSimulado`, `DesempenhoDiagnostico`, `TrilhaAdaptativa`, `Resposta.questaoSimuladoId`, índices e FKs | Compatível. |
| `20260912174140_trilha_gera_exercicios` | `User.nivelAtual`, `TrilhaAdaptativa.simuladoGeradoId`, índice único e FK | Compatível. |
| `20260925000000_legal_acceptance` | Campos de aceite em `User`, `AuditAction`, `AuditLog`, índice e FK | Compatível após a extensão da migration seguinte. |
| `20260925010000_general_audit` | Oito eventos de auditoria, campos opcionais de `AuditLog` e `resourceId` | Compatível. |
| `20260927110000_password_recovery` | `PasswordRecoveryToken`, índices, FK e dois eventos antigos de auditoria | Tabela compatível; os eventos em inglês estavam ausentes do schema atual. |

Estruturas ausentes no histórico acumulado:

- `User.emailVerifiedAt` e `User.deletedAt`, opcionais, `TIMESTAMP(3)`.
- Enum `AuthTokenType`: `EMAIL_VERIFICATION` e `PASSWORD_RESET`.
- Tabela `AuthToken`, sua chave primária, FK para `User` e índices
  `AuthToken_userId_type_idx` e `AuthToken_tokenHash_idx`.
- Eventos `EMAIL_CONFIRMADO`, `SENHA_REDEFINIDA`, `CONTA_EXCLUIDA` e
  `RECUPERACAO_SENHA_SOLICITADA` em `AuditAction`.
- Alteração de nulabilidade de `User.senhaHash`.

Os eventos `PASSWORD_RECOVERY_REQUESTED` e `PASSWORD_RECOVERY_COMPLETED` já foram
introduzidos pela migration histórica. Foram acrescentados ao schema como valores
legados, sem renomeá-los nem remover possíveis registros existentes. Os eventos
atuais em português permanecem distintos. Não foi feita conversão de dados.

## Arquivos desta etapa

- `backend/prisma/migrations/20261015120000_reconcile_auth_schema/migration.sql`:
  migration incremental com as estruturas acima.
- `backend/prisma/schema.prisma`: somente inclusão dos dois eventos legados.
- `backend/scripts/test-migrations-local.cjs`: teste reproduzível em cluster próprio.
- Este relatório.

## Segurança da migration

O SQL não remove tabelas, colunas, enums ou linhas e não executa `UPDATE`/`DELETE`.
As novas datas ficam `NULL`: nenhuma conta passa a ser confirmada ou excluída
automaticamente. Senhas existentes, aceites, auditoria e relações são preservados.
Os defaults de `uuid()`/`cuid()` continuam sendo responsabilidade do Prisma;
não foram acrescentados defaults SQL diferentes do schema.

A migration usa uma transação explícita, `lock_timeout` de 5 segundos e
`statement_timeout` de 60 segundos. Exige PostgreSQL 12 ou superior por adicionar
valores a enum dentro de transação; os novos valores só são usados após o commit.
A validação efetiva desta etapa foi feita no PostgreSQL 17.11.

O SQL assume o estado produzido pelas seis migrations históricas. Intencionalmente
não usa `IF NOT EXISTS` para esconder estruturas divergentes preexistentes. Se um
ambiente tiver recebido mudanças manuais, é necessário compará-lo antes de aplicar
a migration. Uma repetição direta do arquivo SQL não é suportada: o controle de
execução única é feito pelo histórico do Prisma.

## Validação local executada

Comando, executado dentro de `backend`:

```powershell
node scripts/test-migrations-local.cjs 'C:\Program Files\PostgreSQL\17\bin'
```

O teste cria um novo cluster em diretório temporário e escolhe uma porta livre em
`127.0.0.1`. Não aceita URL de banco como argumento. As conexões são explícitas e
as variáveis `DATABASE_URL`, `DIRECT_URL` e `SHADOW_DATABASE_URL` dos subprocessos
Prisma apontam exclusivamente para os bancos descartáveis. Não há importação dos
serviços da aplicação nem execução de seeds.

Resultados aprovados:

1. Replay integral das seis migrations históricas em `jurissim_history`.
2. Inserção de dados fictícios em todas as 14 tabelas históricas, incluindo as
   associações e os dois eventos de auditoria legados.
3. Aplicação incremental do novo SQL nesse banco populado.
4. Contagens e hashes de todas as colunas históricas preservados nas 14 tabelas;
   as novas datas de `User` permaneceram `NULL`.
5. `prisma migrate diff --exit-code` entre esse banco e o schema: código 0,
   `No difference detected.` Comparação cobre tabelas, colunas, enums, índices,
   defaults e FKs suportados pelo Prisma.
6. Inserções fictícias aceitas para senha nula, ambos os tipos de `AuthToken` e
   os quatro novos eventos de auditoria.
7. `prisma validate` aprovado.
8. `prisma migrate deploy` aplicou as sete migrations em `jurissim_fresh`, vazio.
9. Comparação desse segundo banco com o schema: código 0, sem divergências.
10. Segundo deploy: nenhuma migration pendente; sete registros finalizados no
    histórico `_prisma_migrations`.
11. Checksums dos seis arquivos de migrations históricas inalterados.

O cluster foi encerrado ao final. Os artefatos foram mantidos, sem apagar dados:
`C:\Users\JOAOZI~1\AppData\Local\Temp\jurissim-migrations-OQzrpq`.
Esse diretório contém o cluster descartável, `postgres.log` e `before-diff.txt`.
Tentativas preliminares também deixaram diretórios temporários; nenhum servidor
de teste permaneceu ativo. O Windows exigiu execução autorizada fora do sandbox
para iniciar/encerrar os processos do PostgreSQL. A restrição foi do ambiente de
execução, não das migrations.

## Riscos e próximos passos sujeitos a autorização

- O estado do Supabase continua desconhecido. A validação local não comprova que
  seu schema, versão do PostgreSQL ou `_prisma_migrations` correspondam ao histórico.
- Antes de qualquer aplicação em ambiente compartilhado, autorizar separadamente
  uma inspeção somente de leitura do schema e do histórico, sem expor credenciais.
- Permissões, RLS, triggers e extensões adicionados fora das migrations não são
  cobertos por este teste. Carga e contenção reais também não foram simuladas.
- O `ALTER TABLE User` precisa adquirir lock. Sob contenção, a migration deve
  falhar pelo timeout em vez de aguardar indefinidamente; uma falha exige avaliar
  o estado registrado pelo Prisma antes de qualquer nova tentativa.
- Qualquer aplicação futura no Supabase exige autorização explícita adicional,
  revisão do drift e preparação de backup/janela apropriada. Não está autorizada
  por esta etapa.
- Mudanças de autenticação, confirmação obrigatória, sessões, SMTP, frontend e
  dashboards continuam fora do escopo e dependem de nova autorização.

O teste pode ser repetido localmente com o comando acima; ele sempre cria outro
cluster e não conecta aos clusters existentes. Nenhum commit, push ou merge foi feito.
