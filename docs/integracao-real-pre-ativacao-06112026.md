# Integração real e evidências anteriores à ativação

06/11/2026, horário de Brasília. Branch `entrega0911`; commit-base preservado `ce536c5`. Esta etapa acrescenta testes reais e atualiza as evidências; não aplica DDL nem altera contas no Supabase compartilhado.

## Resultado por tipo de ambiente

| Ambiente | O que foi efetivamente executado |
| --- | --- |
| PostgreSQL descartável 17.11 | Histórico/upgrade com preservação das fixtures; 21 migrations via Prisma, segundo deploy sem pendências; comparação sem drift nos bancos histórico, novo e de integração |
| Express/Prisma/PostgreSQL reais | **51 testes de integração em 6 arquivos**, incluindo 6 novos cenários institucionais; nenhum repositório/banco foi mockado |
| Frontend real no Chrome | Login pelo formulário nos quatro perfis, token/sessão emitidos pelo backend real e navegação dos onze módulos contra Express e PostgreSQL descartável; não houve substituição de `fetch` ou sessão |
| Diagnóstico real isolado | Inventário de 30 questões elegíveis, exclusões, identidade/ordenação, rollback por FK inválida, concorrência convergente e persistência das 30 respostas, correção interna, métricas, trilha e nível |
| Migration de onboarding isolada | Baseline administrativa, preservação de linhas anteriores, DECLINED, relacionamentos, quatro FKs, RLS, uso dos modelos Prisma e dump/restauração de fixtures aprovados |
| Supabase compartilhado | Somente consultas de metadados, contagens e comparação de schema; backup via snapshot consistente. Não foram executadas operações funcionais que gravassem dados |
| Brevo real | Conexão SMTP, STARTTLS e autenticação aprovados; nenhum e-mail enviado |
| Google real | IDs frontend/backend presentes e correspondentes; login OAuth com usuário/provedor real ainda não executado |
| Mocks anteriores | Permanecem evidências distintas: 438 testes direcionados de backend considerando a consolidação anterior, 53 cenários Chrome com APIs simuladas, 15 verificações de renderização. Não são substitutos dos testes reais acima |

Build backend/TypeScript e build frontend/TypeScript aprovados após os acréscimos. Mantém-se o aviso de bundle frontend acima de 500 kB. O runtime de produção não foi redesenhado nem recebeu novos endpoints nesta etapa.

## Fluxos realmente exercitados com banco isolado

- Cadastro público ALUNO; tentativa de cadastro público PROFESSOR rejeitada.
- Confirmação de e-mail, senha persistida, login, sessão, recuperação, invalidação de tokens e logout. O transporte de mensagens desses fluxos é capturado em memória; tokens/provas e credenciais são reais apenas para as contas descartáveis.
- Conta sem instituição cria meta de estudo e mantém seu perfil pessoal. Diagnóstico e trilha são persistidos sem associação institucional.
- Solicitação institucional fica PENDENTE sem acesso administrativo; ADMIN aprova; responsável mantém papel ALUNO e recebe vínculo institucional legítimo no banco de teste.
- Consulta de resumo, notificações e auditoria; instituição alheia e administração global por responsável negadas.
- ADMIN não acessa turmas, avaliações, questões ou relatórios pedagógicos, mesmo quando autenticado.
- Convite com token, primeira prova de e-mail, definição de senha, confirmação e vínculo docente; reutilização rejeitada. Conta existente aceita sem troca de senha/e-mail/identificador. Recusa não cria vínculo.
- Instituição cria turma proprietária e atribui professor; professor autorizado cadastra questão; instituição cria/publica avaliação.
- Aluno pede entrada, não acessa avaliação enquanto pendente e recebe acesso após aprovação. Resposta e finalização geram resultado persistido.
- Retirada da atribuição elimina listagem/edição/relatório do professor; questões, avaliações, respostas, tentativas e autoria continuam presentes no banco isolado.
- A imutabilidade de auditoria permanece ativa: tentativa de exclusão é rejeitada e a sessão volta a `session_replication_role=origin` após a limpeza de fixtures.

As capturas do navegador com banco real estão apenas em `frontend/.artifacts/institution-real-db/`: `overview.png`, `institution.png`, `teachers.png`, `invitations.png`, `classes.png`, `students.png`, `performance.png`, `exams.png`, `reports.png`, `notifications.png`, `settings.png`, `admin-dashboard.png`, `professor-dashboard.png` e `aluno-dashboard.png`. Elas representam contas e instituição descartáveis recém-criadas, portanto alguns módulos estão legitimamente vazios. O aluno novo segue primeiro ao diagnóstico legado e depois usa a navegação pessoal “Início”, sem resultado ou sessão fabricados. As mutações com dados completos foram exercitadas pelos testes HTTP/serviço em cenários próprios. Não são imagens de contas do Supabase.

## Correções locais necessárias nos mecanismos de teste

1. Harness e setup antigo ainda exigiam que a última migration fosse a de outubro. A sequência revisada inclui explicitamente as migrations administrativa e de onboarding; futuras migrations continuam exigindo revisão do harness.
2. A limpeza antiga truncava a auditoria imutável. Agora, somente após prova de propriedade do cluster descartável, usa transação com `SET LOCAL session_replication_role=replica`, limpa as fixtures e restaura automaticamente a proteção ao concluir. Nenhum trigger ou política do schema da aplicação foi removido/desabilitado. Esse helper não é importado pelo servidor de produção.
3. Um teste de aluno esperava a mensagem antiga de autorização. Foi ajustado ao contrato atual, mantendo 403 e a comprovação de ausência de gravação.
4. O script antigo de diagnóstico esperava gabarito imediato. Agora confere que a resposta pública não revela correção/fundamentação durante a prova e consulta o banco isolado para verificar a correção persistida. A política de segurança da aplicação foi preservada.
5. As configurações de integração deixam explícitos transportes externos desconfigurados e flags false por padrão. Somente o arquivo institucional ativa flags em seu processo de teste, com banco descartável validado.

Não foi necessário alterar serviços de produção para os cenários aprovados. Os erros encontrados eram incompatibilidades dos mecanismos de integração antigos com as regras já existentes.

## Estado remoto confirmado em leitura

Consulta de 06/11/2026, aproximadamente 18h51:

- Projeto configurado confere com o fingerprint do projeto previamente aprovado; DATABASE_URL e DIRECT_URL pertencem ao mesmo destino.
- TLS do cliente confirmado em `verify-full` com CA existente, e consultas em transação somente leitura.
- PostgreSQL remoto 17.6; extensões `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1` e `uuid-ossp 1.1`.
- **20 migrations aplicadas e somente `20261105000100_teacher_invitation_onboarding` pendente.** Nenhuma desconhecida ou incompleta.
- Checksums compatíveis considerando LF/CRLF; nenhum arquivo de migration histórico foi alterado para produzir esse resultado.
- Comparação Prisma do schema público apresenta apenas a coluna `TeacherInvitation.invitedName`, as duas tabelas de onboarding/designação, índices e quatro FKs previstas. A comparação Prisma não cobre sozinha CHECK/RLS/grants; esses itens foram revisados no SQL e no ensaio isolado.
- As duas tabelas e a coluna ainda não existem no compartilhado.
- Nove professores existentes continuam sem confirmação de e-mail e sem vínculo institucional ativo. Nenhuma dessas contas foi alterada.

O `pg_stat_ssl` do servidor, visto através do pooler, informa o trecho interno servidor/pooler e não representa o TLS verificado do cliente. A conexão cliente foi validada pelo `psql` com `verify-full` e informação de SSL; não foi relaxada a verificação de certificado.

## Backup atualizado e recuperação

Dump novo: `C:\Users\Joaozinho\Downloads\JurisSim-backups\2026-11-06T21-53-14-529Z\supabase-complete.dump` (geração aproximadamente 18h53 de Brasília). Pasta privada com ACL restrita, fora do Git. Backups anteriores preservados.

- Snapshot consistente, arquivo descomprimido integralmente e cobertura de todas as entradas de dados esperadas.
- **600.162 bytes**, SHA-256 `3e467dfe1b7f9faa544c0b83b9ecc18d231e193a9b376dc51501df139166db05`.
- **85 tabelas e 2.707 registros** inventariados, incluindo schemas public, auth, storage, realtime, jurissim_test e vault.
- A primeira restauração em PostgreSQL Windows reproduziu 84 tabelas/2.707 registros sem diferenças, mas identificou a ausência do Vault.
- A restauração final utilizou o runtime oficial Supabase previamente preparado (`supabase/slim-services postgres-17.6.1.178-r0`), PostgreSQL 17.6 e Vault 0.3.1, em Ubuntu WSL com `bwrap --unshare-net`, sem listener TCP e com socket Unix privado.
- **Restauração integral sem filtro de schema**, em transação única: 85 tabelas, 2.707 registros, contagens e hashes idênticos; nenhum índice inválido.
- `vault.secrets` existe como membro real da extensão, vazia como na origem; view `vault.decrypted_secrets` e rotinas foram conferidas. Não foi criada tabela substituta para fingir a extensão.
- Cluster isolado encerrado com sucesso. Evidências privadas na mesma pasta: `validation.json`, `full-recovery-validation.json`, `source-snapshot.private.json`, TOC e logs de restauração.

A recuperação foi comprovada em modo dono local/roles NOLOGIN e `--no-owner --no-privileges`; o dump original conserva ACLs. Senhas de roles globais, credenciais de infraestrutura Supabase, configuração de provedores e disponibilidade do serviço hospedado não são restauradas por esse ensaio. O plano operacional deve provisionar esses itens por canais seguros. Não foi afirmado que um novo projeto hospedado foi restaurado integralmente como serviço.

O backup é recuperável no escopo lógico de estrutura e dados comprovado acima. Antes de aplicar DDL em outra janela, é necessário conferir sua integridade e a atividade posterior; havendo alterações relevantes, renovar a salvaguarda consistente. Não tratar o arquivo como eternamente atualizado.

## Flags, professores históricos e bloqueios restantes

### Bloqueio adicional confirmado no acervo real

A execução de `check-question-inventory.ts` em transação somente leitura encontrou **zero questões elegíveis para o novo diagnóstico e para a prática personalizada** em Direito Constitucional, Civil, Penal, Administrativo e do Trabalho. A composição de 30 questões não pode ser atendida; também faltam assuntos com pelo menos cinco questões elegíveis para prática. O comando encerrou com código 1 por insuficiência de inventário, não por falha de conexão.

Isso não significa que a tabela Questao esteja vazia: os filtros exigem acervo público/global, origem, revisão jurídica/pedagógica, liberação e direitos, além de alternativas válidas. As questões históricas não foram automaticamente homologadas. O diagnóstico real isolado passou porque usa 30 fixtures que atendem aos critérios do teste; esse resultado não valida o acervo compartilhado.

O novo diagnóstico/prática não podem ser apresentados como operacionais no Supabase atual só por aplicar onboarding. São necessários revisão/importação legítimas e preenchimento autorizado dos metadados de elegibilidade, com validação do inventário antes de habilitar as flags acadêmicas. Não afrouxar filtros nem marcar revisão/direitos automaticamente para contornar esse bloqueio.

As flags locais `INITIAL_DIAGNOSTIC_REQUIRED`, `INITIAL_DIAGNOSTIC_API_ENABLED`, `QUESTION_PRACTICE_SCHEMA_ENABLED`, `QUESTION_PRACTICE_API_ENABLED` e suas flags de UI estavam ausentes; permanecem nos padrões desativados. Os fluxos legados e os novos fluxos condicionados a essas capacidades não devem ser confundidos na demonstração.

O arquivo privado permanece com `INSTITUTIONS_ENABLED=false`; os opt-ins de administração/cadastro continuam false por padrão. Os exemplos não habilitam recursos automaticamente.

A regularização dos nove professores exige confirmação normal de e-mail, instituições legítimas e autorização individual de vínculo/propriedade das turmas. Há uma restrição operacional: os convites completos dependem do módulo ativo, mas o guard bloqueia startup com professores históricos pendentes. Portanto não basta “ligar a flag e mandar convites”. A sequência de transição deve ser aprovada separadamente, com manutenção e mapeamento legítimo operado por procedimento interno autorizado, ou futura implementação específica de transição. Não alterar contas/vínculos diretamente nem retirar o guard por conveniência nesta etapa. Essa pendência impede ativação completa, mas não exige alterar professores para aplicar a migration aditiva.

Brevo SMTP foi autenticado sem envio. Entrega real em caixa de entrada e links em origem de homologação ainda precisam de destinatários e autorização. Login Google real exige interação com conta autorizada e conferência das origens no console; os IDs coerentes e testes locais não comprovam esse fluxo externo.

As lacunas de contrato identificadas antes continuam explícitas: evolução global institucional por período/metas/variações, última atividade docente, exportações CSV/PDF e notificações separadas por instituição. Também não existe um novo LMS docente de conteúdos/atividades independentes. Não foi adicionado dado fictício para preencher essas lacunas.

## Próxima ação exata e plano de recuperação

Pode-se solicitar autorização **somente para aplicar `20261105000100_teacher_invitation_onboarding`**, mantendo flags false e todas as contas intactas. A migration é aditiva em dados; substitui a CHECK de status por um superset, acrescenta coluna nullable e cria duas tabelas, índices, FKs/RLS. Nenhuma linha antiga é migrada ou removida.

Riscos concretos: locks breves sobre convites/tabelas referenciadas, falha por atividade concorrente ou drift após a consulta, timeouts e privilégios do papel de execução. O SQL usa BEGIN/COMMIT. A existência do backup não elimina esses riscos.

Após autorização, antes de executar: reconfirmar fingerprint/TLS, histórico sem falhas, **única pendente**, checksum, atividade/timeouts e backup atual. Aplicar pelo Prisma `migrate deploy` somente se essa pré-condição continuar verdadeira. Se outra migration aparecer, não aplicar todas indiscriminadamente. Conferir histórico/objetos/grants e comparar dados anteriores depois. O roteiro detalhado continua em `supabase-fases-b-c-ativacao.md`.

Em falha: manter flags false, interromper novas tentativas e inspecionar estado da transação e `_prisma_migrations`. Não usar reset, db push, apagar histórico ou resolve automático. Correção aditiva revisada é preferível; restauração do backup exige autorização própria e avaliação das alterações legítimas posteriores. Não restaurar sobre o compartilhado como “teste”.

Nenhuma autorização de migration deve ser interpretada como autorização para ativar o módulo, regularizar professores, enviar mensagens ou fazer deploy.

## Reproduzir os testes reais

Com Node, dependências já instaladas, Chrome e PostgreSQL 17 disponíveis, em `backend`:

```powershell
node scripts/test-invitation-migration-local.cjs
node scripts/test-migrations-local.cjs "C:\Program Files\PostgreSQL\17\bin" --functional-suite
```

O harness cria seu próprio cluster, gera prova de identidade e recusa URLs externas ou bancos existentes. O segundo comando executa migrações somente nessa instalação descartável, diagnóstico, testes de integração e navegador real. Não preencher `.env` com uma cópia do Supabase para esses testes. Para conferência SMTP sem envio: `npm run email:verify`, somente com autorização de conexão ao provedor.
