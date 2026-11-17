# Consolidação local do JurisSim — 16/11/2026

## Base, recuperação e branches

- Branch oficial: `entrega-16-11`, atualizada por fast-forward para `6fead5d`.
- Dois fetches confirmaram `origin/entrega-16-11` em `6fead5d`; não havia commit posterior nessa referência.
- A árvore inicial estava limpa e o merge anterior já estava concluído.
- Recuperação: bundle de todas as referências em `%TEMP%/jurissim-consolidacao-6fead5d.bundle`. Não contém arquivos ignorados do ambiente.
- `entrega1611` permanece em `6fead5d`. Nenhum merge em `main`, push ou deploy foi realizado.
- Foram examinadas as referências locais/remotas, incluindo `origin/main`, `origin/entrega0911`, `origin/fix/exclusao-conta-aluno`, `origin/fernando/correcao-sessao-institucional`, `origin/feature/trilha-b-inteligencia-adaptativa` e `origin/entrega-dia-14-09`.
- Os commits `e1860f1`, `c629de6`, `7a731be` e `f8b18d4` foram considerados na revisão do painel. O merge oficial preserva as revisões administrativas posteriores, inclusive consolidação de menus e auditoria independente.
- Alguns commits de outras branches não aparecem como ancestrais: isso não implica funcionalidade ausente. A exclusão do aluno de `880563f` já está incorporada ao conteúdo do merge, com testes. A intenção institucional de `c1518b4` é preservada pela implementação atual, inclusive fallback restrito de schema e testes de sessão. Não foi substituída por uma implementação antiga.
- As branches antigas de autenticação e trilha contêm versões anteriores dos mesmos módulos. Não foram mescladas indiscriminadamente sobre guards e motor atuais. Diagnóstico, trilha e autenticação foram validados pelas suítes consolidadas.

## Integração da cópia isolada

A origem foi a cópia de `6e201fc` em `%TEMP%/jurissim-migration-audit-a10c374ed2654a51856f4967b6acb0b8/source` e seu relatório `docs/integracao-sete-falhas-isolada.md`.

Antes de transportar cada arquivo, o conteúdo consolidado foi comparado à base. Arquivos idênticos receberam a versão validada; arquivos com alterações posteriores receberam somente ajustes pontuais. O middleware já continha a capacidade independente de simulados; o harness consolidado já possuía prazo total de Vitest ampliado. Ambos foram preservados. O teste de questões dos colaboradores foi mantido, e o cenário privado por tentativa de simulado foi acrescentado separadamente.

## Schema e migrations

Foram restaurados os SQLs originais, preservando os bytes CRLF autenticados na consulta somente leitura da investigação anterior:

| Migration | SHA-256 |
|---|---|
| `20261113200000_teacher_academic_activities` | `28dc7107aed1de7145f675174c82e306576ffad1d46f11a2e0176c71b8e0a9fa` |
| `20261113210000_class_materials_announcements` | `d203b2d9383cd553b381a120550e2124fda36716154258c7fd4dc55260a3bfa4` |
| `20261113220000_teacher_questions_in_exams` | `55593191731bca43d4645fdb756f642849aae60ddc59d3ed00b38ac82a9f5323` |

Nenhuma nova consulta remota foi necessária nesta consolidação. A evidência de checksum remoto pertence à investigação anterior; não equivale a uma inspeção atual de todo o banco real.

As três migrations têm atributos Git `-text` específicos para preservar os bytes CRLF em todas as plataformas. O aviso de linha vazia final em uma migration histórica é intencionalmente preservado: corrigir formatação alteraria seu checksum autenticado. Os demais diffs foram verificados sem erros de whitespace.

Modelos recuperados: `QuestaoDocente`, `AlternativaDocente`, `QuestaoDocenteTurma`, `MaterialTurma`, `AvisoTurma`, `Atividade`, `AtividadeTurma`, `AtividadeQuestao`, `EntregaAtividade`, `RespostaAtividade`, `AvaliacaoQuestaoDocente`, `QuestaoSimuladoDocente` e `RespostaSimuladoDocente`, com relações inversas e `AvaliacaoQuestao.conteudoSnapshot`.

`Atividade` e `ClassActivity` permanecem independentes. `ClassLifecycle`, `ClassActivity`, `ClassExamSettings` e as migrations `20261115193000_class_lifecycle` e `20261115203000_class_activities` foram preservadas. A restauração dos modelos não importa automaticamente endpoints antigos de outro checkout nem unifica contratos.

## Correções

- Convites restritos não rejeitam a capacidade concedida pelo próprio escopo; flags conflitantes continuam recusadas.
- O tratamento de indisponibilidade do Prisma tolera propriedade `code` malformada, mantendo resposta sanitizada.
- Testes de recuperação foram alinhados ao HTTP 503 existente, sem ocultar a exceção original.
- Testes de primeiro acesso verificam Professor, vínculo atômico, reaproveitamento da identidade e aceite autenticado idempotente.
- Consulta de sessão usa GET; testes verificam status e JSON.
- Fixtures docentes usam turma autorizada e conteúdo privado. O fluxo do aluno confirma acervo privado invisível e acesso autorizado pela tentativa publicada, sem campos de gabarito.
- As listas de migrations do harness e do setup incluem as três migrations recuperadas e continuam comparando o histórico completo.
- Testes de homologação declaram explicitamente o modo restrito e desligam a flag independente conflitante, evitando herdar configuração local.
- A revisão visual ADMIN usa o menu atual, bloqueio de autoalteração e auditoria independente. A fixture de disponibilidade declara as capacidades docentes atuais.

## Resultados no código consolidado

| Verificação | Resultado |
|---|---|
| Backend / TypeScript | Aprovado |
| Frontend / TypeScript / Vite | Aprovado (`--configLoader runner`) |
| Prisma validate e generate | Aprovados |
| Unitários | 1.478 aprovados, zero falhas, 106 arquivos |
| Integração PostgreSQL | 174 aprovados, zero falhas, 9 ignorados; 19 arquivos aprovados e 1 ignorado |
| Migrations | 32 aplicadas em base vazia; segundo deploy sem pendências |
| Upgrade representativo | Dados sintéticos históricos preservados; checksums inalterados |
| Drift | Ausente nas bases histórica, vazia e de integração |
| Frontend estático | Suíte `test:delivery-static` aprovada |
| Navegador ADMIN | Modo `ADMIN_REFINEMENT_ONLY`: 4 verificações aprovadas, pesquisa, confirmação e desktop/celular sem overflow; API capturada |
| Navegador com banco | Cenário institucional aprovado com frontend, backend, sessão real e PostgreSQL descartável, sem substituição de sessão/fetch |
| Backend local | Reiniciado após regeneração do Client; `/health` respondeu OK |

Os nove ignorados são oito cenários administrativos de exclusão H4.24 aguardando ativação e um envio real de e-mail condicionado a autorização/configuração. Não foram ativados para aumentar a contagem. Os testes de e-mail restantes capturam o transporte; não comprovam entrega Brevo real.

O roteiro visual exaustivo legado `test-administration.mjs`, fora do modo de revisão ADMIN, ainda contém etapas do modal antigo (nome e paginação de turmas no formulário) e do primeiro acesso antigo. Sua execução suplementar expôs contratos de fixture desatualizados. Não constitui evidência de falha da API: a integração real e os modos direcionados passaram. A migração completa desse roteiro permanece uma pendência de automação documentada; não foi removido nem declarado aprovado.

Logs locais ignorados: `backend/consolidation-unit.log`, `backend/consolidation-integration.log`, `frontend/consolidation-admin-browser.log` e `frontend/consolidation-browser.log`. Artefatos do PostgreSQL descartável foram retidos em TEMP; o cluster do harness foi encerrado. As capturas versionadas alteradas pelo teste foram restauradas ao conteúdo inicial.

## Situação do ADMIN e ativação

O painel está implementado e validado em PostgreSQL isolado com `ADMINISTRATION_ENABLED=true` e `INSTITUTIONS_ENABLED=false`. O teste compara indicadores com contagens reais, permite ADMIN e bloqueia aluno, professor e anônimo.

No ambiente conectado, nenhuma flag foi alterada. A ausência de `ADMINISTRATION_ENABLED=true` explica a capacidade administrativa desativada; não é autorização para ativá-la silenciosamente. O `.env` real, credenciais, permissões e dados Supabase permaneceram intactos. Não foi comprovado login ADMIN no ambiente real durante esta etapa.

Antes da ativação real: confirmar novamente histórico/checksums e schema do mesmo projeto; obter backup atualizado; restaurá-lo em banco isolado; validar as duas migrations pendentes nessa restauração; revisar constraints, papéis e locks; obter autorização específica para aplicação e flags. Não usar reset, db push ou resolve para contornar diferenças. `migrate deploy` aplica todas as pendentes, portanto não deve ser executado sem inventário completo.

Recuperação: desligar a capacidade operacional afetada, preservar estruturas aditivas e investigar; restauração somente por plano revisado e autorização, pois pode reverter dados posteriores ao backup. Não apagar tabelas docentes para eliminar drift.

## Entrega Git

Commits locais: `dbcd436` (schema e histórico), `d0072cb` (atributos de preservação), `6046a25` (segurança e testes) e `1a4c025` (blobs SQL com bytes originais), seguidos do commit deste relatório. Os blobs finais dos três SQLs foram comparados byte a byte com os arquivos autenticados e os SHA-256 acima. O push exige aprovação posterior. Nenhum backup, `.env`, token, log, `node_modules`, `dist` ou banco descartável integra os commits. O estado combinado deve ser revisado antes de qualquer aplicação compartilhada.
