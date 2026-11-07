# Integração real e evidências anteriores à ativação

## Estado atual após a reinicialização autorizada

Atualização em 06/11/2026 (Brasília). Esta seção prevalece sobre os retratos históricos registrados abaixo. Os commits `ce536c5` e `06cbe35` foram preservados; a branch permanece `entrega0911`, sem reescrita do histórico ou publicação adicional nesta auditoria.

- As migrations administrativa e de onboarding já estão aplicadas e compatíveis com o schema local. Consulta somente de leitura e `migrate diff` não encontraram pendências, migrations incompletas, checksums divergentes ou operações de drift. Nenhuma migration foi executada nesta revisão.
- A reinicialização previamente autorizada manteve uma conta ADMIN ativa e 30 registros históricos desativados. Os e-mails originais foram liberados, senhas dos alvos removidas, versões de sessão incrementadas e 20 tokens dos alvos excluídos. A auditoria atual não repetiu essa operação nem alterou contas.
- O backup posterior à reinicialização foi restaurado integralmente em cópia sem rede, com runtime oficial Supabase/PostgreSQL 17.6 e Vault 0.3.1: 87 tabelas e 2.688 registros, sem diferenças de conteúdo e sem índices inválidos. A restauração valida estrutura/dados e extensões, usando proprietário local e roles NOLOGIN; não reproduz senhas globais ou toda a infraestrutura hospedada do Supabase.
- A conta ADMIN foi comparada integralmente ao estado protegido. As 87 tabelas atuais corresponderam ao backup pós-limpeza. A verificação referencial anterior passou sem órfãos. Backups históricos foram preservados fora do Git.

## Investigação das sete questões e do diagnóstico

As questões foram cadastradas entre 12 e 27/09/2026. Existem duas de Direito Constitucional (básica/intermediária), duas de Direito Civil (intermediária/avançada), uma de Direito Penal (básica) e duas de Direito Administrativo (básicas); nenhuma de Direito do Trabalho. Todas são públicas e sem turma, têm quatro alternativas e uma correta. Todas têm origem nula e nenhum registro de revisão jurídica, pedagógica ou liberação para o novo acervo. Não se infere sua origem ou aprovação a partir do texto, da publicidade ou da idade do cadastro.

Cada uma das sete aparece em tentativas diagnósticas e em registros ligados a `DiagnosticoInicial`. Há 99 simulados `DIAGNOSTICO`, sendo 71 finalizados; 25 `PERSONALIZADO`, sendo 24 finalizados; dez registros de identidade inicial; 71 trilhas, 369 respostas e 1.038 métricas. As dez identidades iniciais incluem tentativas com uma, cinco, seis ou sete questões. Portanto, existir uma identidade inicial histórica não prova composição de 30 itens. Há tentativas e conclusões persistidas, mas essa consulta não reconstrói todas as experiências de navegador anteriores nem explica a decisão humana de cadastrar exatamente sete itens.

O legado (`DiagnosticRepository.findQuestionsForDiagnostic`) seleciona questões públicas ordenadas por criação, com `take` da quantidade pedida, sem exigir a quantidade integral. `DiagnosticService.start` rejeita apenas seleção vazia; o controller aceita de uma a 80, com padrão 20. Não exige origem/revisão/liberação nem a composição nova. A finalização calcula resultados, métricas e trilha por meio do motor adaptativo existente. O motor determinístico e o feedback opcional externo são mecanismos distintos; não se trata de comprovação de eficácia pedagógica.

O novo (`PrismaInitialDiagnosticRepository`, `InitialDiagnosticService` e `initial-diagnostic-composition`) exige publicação/liberação, dados completos e revisões; usa IA/OAB oficial, com critérios adicionais de fonte, validade e direitos para a OAB. Para cada uma das cinco disciplinas: duas IA básicas, uma IA intermediária, uma OAB intermediária e duas OAB avançadas. São 30 slots, 15 IA e 15 oficiais. Nenhuma das sete questões entra no inventário: não faltam somente 23 novas, faltam **30 posições elegíveis** no estado atual. Se algumas existentes forem legitimamente verificadas e aprovadas posteriormente, poderão contar conforme disciplina, origem e dificuldade; isso não pode ser feito por simples preenchimento artificial de metadados.

A quantidade e distribuição já aparecem no commit `b83e0af` de 27/10/2026, anterior às Fases B/C. Documentos técnicos descrevem essa composição, mas não foi localizada evidência independente de aprovação formal da regra pedagógica nos materiais examinados. O código comprova quando ela foi introduzida, não a intenção ou aprovação de quem a solicitou. A exigência não foi alterada nesta auditoria. Não foi demonstrada uma regressão das Fases B/C que impedisse o legado de selecionar as sete questões.

**Prova atual em banco isolado:** restaurado o schema público do backup em PostgreSQL descartável, o serviço real legado solicitou 20 questões, selecionou as sete existentes, registrou sete respostas, finalizou e persistiu trilha/correção. Em seguida, o serviço novo retornou `INSUFFICIENT`, com 30 posições em falta e sem criar tentativa inicial parcial. Os registros anteriores de usuários, questões, alternativas, simulados, respostas, vínculos de questões, identidades iniciais, trilhas e métricas mantiveram seus hashes. Nenhuma questão foi criada ou alterada. O cluster foi encerrado; não houve chamadas externas. O primeiro ensaio foi interrompido pela proteção contra configuração externa herdada; o mecanismo local passou a zerar explicitamente essas configurações antes da repetição aprovada.

**Solução adotada no fechamento:** conservar o legado com suas flags atuais, sem declarar equivalência à composição nova nem sobrescrever a linha de base histórica. A entrada do aluno deixou de prometer seis matérias e 30 questões autorais; identifica o legado e explica a quantidade variável, exibida pelo contador da resolução a partir da resposta da API. O endpoint de primeiro acesso continua `/diagnostics`; solicitar até 30 não passa a exigir ou prometer 30. O novo diagnóstico e a prática personalizada permanecem desativados até haver acervo suficiente e decisão explícita sobre a política. A importação legítima deve seguir `preparacao-acervo-homologacao.md`, o modelo JSON existente e a validação offline do importador: conteúdo e alternativas revisados, fundamentação, autoria/fonte, autorização de reprodução quando necessária, revisão jurídica/pedagógica e liberação identificáveis. Só então autorizar importação e conferir o inventário, sem migrar schema ou duplicar questões para completar quantidade. Não foi feita avaliação jurídica do conteúdo das sete questões nesta auditoria.

## Quatro dashboards, contratos e limites atuais

| Perfil/contexto | Recursos implementados e auditados | Limite da comprovação atual |
|---|---|---|
| ADMIN | Login único por sessão efetiva; nove seções atuais; instituições/solicitações, usuários/professores, auditoria, segurança, notificações e configurações | A antiga rota de gestão global de turmas é negada. Não há acesso pedagógico por ser ADMIN. Login real no Supabase não executado nesta revisão |
| Instituição | Onze módulos: visão geral, minha instituição, professores, convites, turmas, alunos, desempenho, simulados, relatórios, notificações e configurações | Vínculo administrativo legítimo em instituição aprovada; não é um novo papel global nem substitui a conta pessoal. Validado agora com mocks; etapa compartilhada ainda desligada |
| Professor | Convite/primeiro acesso, contexto institucional, turmas autorizadas, questões, avaliações e relatórios | A instituição atribui/retira docentes; não há solicitação docente para obter turma. Revogação é verificada no backend; testes atuais de serviços usam mocks e a etapa PostgreSQL anterior é evidência separada |
| Aluno | Cadastro ALUNO, confirmação, login, diagnóstico legado, trilha, estudo pessoal, metas e históricos; entrada em turma por solicitação | Estudo independente preservado. Diagnóstico novo/prática exigem acervo elegível; novos cadastros compartilhados não foram executados |

Os onze módulos institucionais mantêm componentes compartilhados de turmas, alunos, simulados, relatórios, configurações e auditoria. As seções de desempenho e relatórios reutilizam os mesmos contratos por turma/aluno, sem duplicar APIs. O design v0 e os dashboards existentes não foram alterados. Persistem lacunas explícitas: série temporal global institucional e filtro por período sem contrato; metas globais ausentes; notificações são mensagens pessoais, sem identificação institucional no contrato. Exportações ou marcação de leitura não são apresentadas como operações existentes.

## Homologação local e fronteira de autorização

Backend local: `http://127.0.0.1:3334`. Frontend: `http://localhost:5175`, servido em loopback. As configurações privadas originais permanecem idênticas. Um inicializador local não versionado injeta as flags e um segredo JWT próprio em memória; não publica arquivos ou modifica o ambiente hospedado.

| Etapa | ADMINISTRATION_ENABLED | INSTITUTIONS_ENABLED | INSTITUTION_REGISTRATION_ENABLED |
|---|---|---|---|
| A, processo local iniciado | true | false | false |
| B, aguardando aprovação | true | false | true |
| C, aguardando aprovação | true | true | true |

`INSTITUTIONS_ENABLED=true` habilita implicitamente administração e cadastro, mesmo se as flags secundárias forem false. Para retirar todas as capacidades é necessário desativar a flag principal e as secundárias e reiniciar somente o processo correspondente. Desligar flags não desfaz cadastros ou decisões já persistidos. O guard de ativação examina apenas professores com `deletedAt=null`; as nove contas docentes históricas desativadas não são vínculos ativos nem impedem a verificação atual.

Saúde, disponibilidade, preflight CORS, frontend, rota SPA administrativa e endereço da API foram conferidos com respostas bem-sucedidas. A disponibilidade retornou administração ativa e cadastro/operações institucionais desativados. Essa verificação não equivale a login ADMIN autorizado: servir a SPA não dispensa a sessão e os guards do backend.

Não foram enviados tokens fabricados ou reutilizadas sessões reais. O login real, inclusive login bem-sucedido e tentativas rejeitadas, cria registros de auditoria; chamadas negadas também podem gerar eventos. Como o prompt exige aprovação antes de criar registros compartilhados, não foram executadas essas chamadas para testar permissões no Supabase. A comprovação de autenticação/autorização desta revisão é a dos testes locais, não uma homologação real da conta ADMIN. Logout incrementa a versão de sessão no banco e não deve ser usado no ADMIN nesta etapa; sair do perfil de navegador de homologação não exige alterar suas sessões.

SMTP passou em conexão, STARTTLS e autenticação sem envio antes da inicialização. O transporte de mensagens está explicitamente desabilitado no processo local da etapa A, inclusive para recuperação/confirmacão acidental. Google tem IDs correspondentes e validação backend de audience, e-mail verificado e nonce; Console/origem autorizada e OAuth real permanecem sem comprovação. Não foram utilizados terceiros ou enviados e-mails.

Após autorização específica, a sequência real será: cadastro/confirmacão de aluno e responsável em destinatários autorizados; solicitação pendente; aprovação pelo ADMIN; ativação local completa; convite/onboarding docente; criação de turma pela instituição e atribuição direta; matrícula pendente/aprovação; retirada de docente e negação imediata com token anterior; comparação de históricos e isolamento entre instituições. Cada escrita, mensagem e conta deve ser identificada no roteiro, com salvaguarda conferida antes do início. As etapas B/C, criação de registros e mensagens não estão autorizadas por este relatório. Não será executada limpeza automática posterior.

## Validação executada nesta revisão

| Categoria | Resultado | Natureza |
|---|---|---|
| Backend direcionado | 423 testes, 22 arquivos, aprovados | Dependências simuladas; autenticação, Google, e-mail, bootstrap, sessões, instituições, convites, atribuição, diagnóstico, trilhas, motor e relatórios |
| Navegador | 55 cenários aprovados | APIs simuladas, quatro perfis, onze módulos, desktop/celular/temas, 401/403/rede, revogação e resolução de sete itens do legado |
| Renderização e estrutura | 15 verificações SSR, navegação ADMIN/institucional e 13 comparações CSS aprovadas | Sem rede ou banco; não são novos casos PostgreSQL |
| Sete questões em cópia | Legado completo e novo insuficiente comprovados | PostgreSQL local com dados restaurados, sem novas questões ou alterações compartilhadas |
| Integração PostgreSQL repetida no fechamento | 51 testes em seis arquivos aprovados | Cluster novo, schema público restaurado, sem migrations; frontend/API/login reais isolados e quatro perfis/onze módulos |
| Backup pós-limpeza | 87 tabelas/2.688 registros restaurados integralmente | Supabase/PostgreSQL isolado sem rede, incluindo Vault |
| Supabase | Integridade, conta protegida e correspondência ao backup conferidas | Somente leitura nesta revisão |
| Compilação | Backend `tsc`, frontend `tsc -b`/Vite e `prisma validate` aprovados | Sem migrations ou deploy |

O primeiro build frontend foi bloqueado pelo sandbox; o mesmo comando passou com a permissão de filesystem necessária. Os builds foram novamente aprovados após a alteração de texto. Mantêm-se os avisos existentes de bundle principal acima de 500 kB e configuração CommonJS/ESM do Vitest. Os 251 testes da rodada anterior são subconjunto dos 423, e os 53 cenários de navegador anteriores estão contidos nos 55: não são somados como casos distintos. As 51 verificações PostgreSQL foram repetidas e permanecem 51, não 102. Os artefatos locais privados e os backups não devem ser versionados. Não se comprovou ainda o ciclo completo no Supabase com novos usuários.

O novo executor `backend/scripts/test-restored-backup-local.cjs` permite repetir a suíte a partir de um dump customizado com SHA-256 conferido, sem `.env`, URL externa ou migrations. Cria seu próprio cluster temporário em loopback, banco aleatório, segredo exclusivo e manifesto de propriedade; os guards existentes conferem identidade antes da limpeza das fixtures. Restaura somente o schema público para os testes da aplicação, sem se apresentar como prova de restauração integral do Supabase (essa prova é separada, com Vault). Transporte externo fica desconfigurado. Credenciais e logs de falha permanecem em diretório privado local; o cluster é encerrado ao terminar. Uso: `node scripts/test-restored-backup-local.cjs <PG-bin> <dump-fora-do-Git> <sha256-validado>`.

Dois ajustes foram feitos nesse executor antes da execução aprovada: banco de manutenção explícito e remoção de variáveis de serviço libpq vazias nos subprocessos PostgreSQL. A rodada ampliada também identificou teste JWT desatualizado que esperava 201 para criação de questão por ADMIN: agora exige 403 e ausência de chamada ao serviço, conforme a regra pedagógica já implementada. O backend de produção não foi alterado para satisfazer esse teste. O novo cenário de navegador foi ajustado para selecionar os controles do legado, além dos controles administrativos existentes.

## Prioridades antes da liberação integral

1. Autorizar separadamente o login real do ADMIN e a auditoria inerente, preservando seus campos, senha, permissões e sessões anteriores.
2. Aprovar as contas/destinatários de homologação e as escritas das etapas B/C; comprovar e-mail e Google com participantes autorizados.
3. Confirmar a política do diagnóstico e preparar conteúdo elegível e legítimo, sem reclassificação artificial ou alteração da linha de base histórica.
4. Executar o ciclo institucional completo e validar estudo independente, simulados, matrícula e revogação com dados novos autorizados.
5. Resolver contratos ainda ausentes apenas se fizerem parte do escopo aprovado; manter estados explícitos enquanto isso.
6. Publicar apenas as correções e evidências verificadas na `entrega0911`, conforme autorização expressa de fechamento, após conferir remoto, diff e segredos; sem merge ou force push. Mudanças funcionais se limitam à apresentação verdadeira do diagnóstico legado; os demais ajustes são testes e documentação. O resultado e os hashes da publicação devem ser conferidos no remoto e informados no relatório de entrega, sem confundir push com deploy.

---

## Evidência histórica anterior à reinicialização

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
