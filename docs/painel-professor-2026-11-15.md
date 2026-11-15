# ReorganizaÃ§Ã£o do painel do professor â€” 15/11/2026

ImplementaÃ§Ã£o local em `JurisSim_Vercel`. Nenhum commit, push, deploy ou escrita no Supabase foi realizado nesta reorganizaÃ§Ã£o. As alteraÃ§Ãµes anteriores do projeto foram preservadas.

## Causas e reaproveitamento

- A navegaÃ§Ã£o ainda oferecia cadastro sem contexto de turma. O formulÃ¡rio existente (`QuestaoForm`, em `ProfessorArea.tsx`) comeÃ§ava com `publica: true` e oferecia publicaÃ§Ã£o no banco pÃºblico.
- O repositÃ³rio verificava a delegaÃ§Ã£o quando recebia `turmaId`, mas nÃ£o exigia o vÃ­nculo no cadastro nem impedia publicaÃ§Ã£o global pelo professor. TambÃ©m nÃ£o verificava arquivamento no cadastro.
- A consulta genÃ©rica de questÃµes entregava conteÃºdo privado a alunos vinculados Ã  turma. Agora, alunos recebem esse conteÃºdo somente pelos fluxos de avaliaÃ§Ãµes autorizadas.
- O modelo `Questao.turmaId`, as relaÃ§Ãµes com avaliaÃ§Ãµes e as verificaÃ§Ãµes de isolamento no `ClassExamService` jÃ¡ existiam. Foram reaproveitados, sem alteraÃ§Ã£o de esquema ou migraÃ§Ã£o.
- A integridade de questÃµes usadas jÃ¡ era protegida pelo repositÃ³rio. Essa proteÃ§Ã£o foi mantida e testada com avaliaÃ§Ã£o finalizada, respostas e resultado.

## Comportamento final

- O menu docente nÃ£o oferece â€œInstituiÃ§Ãµes e solicitaÃ§Ãµesâ€ nem â€œCadastrar questÃ£oâ€. O acesso docente a `/instituicoes`, inclusive com vÃ­nculo administrativo, redireciona para `/professor`. O backend institucional permanece intacto.
- O card docente de cada turma oferece â€œCadastrar questÃµesâ€, ao lado de atividades. Em turmas arquivadas, o botÃ£o fica desabilitado.
- A rota `/professor/turmas/:id/questoes/nova` reutiliza o Ãºnico formulÃ¡rio existente. Antes de mostrÃ¡-lo, consulta `GET /questoes/turmas/:turmaId/contexto`, que exige autenticaÃ§Ã£o, papel docente, delegaÃ§Ã£o atual e turma ativa. O nome autorizado da turma aparece no cabeÃ§alho.
- O POST `/questoes` continua sendo o endpoint de persistÃªncia. Ele exige turma ativa autorizada e `publica: false`, mesmo quando chamado diretamente. O autor vem da sessÃ£o. NÃ£o aceita cadastro sem turma nem publicaÃ§Ã£o global.
- A ediÃ§Ã£o nÃ£o permite publicar ou transferir questÃµes entre turmas. QuestÃµes pÃºblicas ou sem turma jÃ¡ existentes permanecem preservadas e nÃ£o sÃ£o administradas por esse CRUD docente.
- ApÃ³s salvar, aparecem â€œCadastrar outra questÃ£oâ€ e â€œVoltar para turmasâ€. A rota antiga de cadastro sem turma conduz Ã  lista de turmas.
- O banco de questÃµes existente continua permitindo ao autor autorizado consultar e gerenciar questÃµes privadas das suas turmas. QuestÃµes usadas em avaliaÃ§Ãµes nÃ£o podem ser editadas nem excluÃ­das.
- O serviÃ§o existente de simulados recusa questÃµes privadas de outra turma. O aluno acessa questÃµes privadas pelo simulado publicado, com matrÃ­cula e permissÃµes verificadas, e nÃ£o pelo catÃ¡logo genÃ©rico.
- NÃ£o houve alteraÃ§Ã£o visual no dashboard do aluno nesta reorganizaÃ§Ã£o.

## Arquivos desta reorganizaÃ§Ã£o

Frontend:

- `frontend/src/integration-shell.tsx`
- `frontend/src/auth-routing.ts`
- `frontend/src/teacher-dashboard.tsx`
- `frontend/src/teacher-workspace.tsx`
- `frontend/src/class-exams.tsx`
- `frontend/src/ProfessorArea.tsx`
- `frontend/scripts/test-teacher-navigation.mjs`
- `frontend/scripts/test-question-form.mjs`

Backend e testes:

- `backend/src/routes/questaoRoutes.ts`
- `backend/src/controllers/QuestaoController.ts`
- `backend/src/repositories/QuestaoRepository.ts`
- `backend/src/routes/questao-crud.test.ts`
- `backend/tests/auth-routing.test.ts`
- `backend/src/__tests__/integration/teacher-class-questions.integration.test.ts`
- `backend/src/__tests__/integration/questao-controller.integration.test.ts`
- `backend/src/__tests__/integration/turma-questao-fluxo.integration.test.ts`
- `backend/scripts/test-migrations-local.cjs`

EvidÃªncias visuais: `docs/evidence/teacher-questions/class-question-{1440,768,390}.png`.

## ValidaÃ§Ã£o executada

| ValidaÃ§Ã£o | Resultado |
| --- | --- |
| Backend: `npm.cmd run build` | Aprovado |
| Frontend: `npm.cmd run build` | Aprovado; permanecem avisos do Rollup sobre comentÃ¡rios do Zod e chunk principal acima de 500 kB |
| Backend: `npm.cmd run test:no-db` | 103 arquivos, 1.438 testes aprovados |
| VerificaÃ§Ã£o final de CRUD e rotas por perfil | 2 arquivos, 72 testes aprovados |
| IntegraÃ§Ã£o: `node scripts/test-migrations-local.cjs 'C:/Program Files/PostgreSQL/17/bin' --teacher-questions-only` | 4 arquivos, 30 testes aprovados; PostgreSQL temporÃ¡rio em loopback, encerrado ao final; sem divergÃªncia de esquema |
| Frontend: `npm.cmd run test:delivery-static` | Aprovado |
| Chrome: `node scripts/test-teacher-navigation.mjs` | 3 cenÃ¡rios aprovados: redirecionamento, sete destinos docentes e vÃ­nculo pendente |
| Chrome: `node scripts/test-question-form.mjs` | 12 verificaÃ§Ãµes aprovadas: navegaÃ§Ã£o desde a turma, arquivamento, campos Aâ€“D, validaÃ§Ãµes, vÃ­nculo enviado, sucesso, novo cadastro, retorno, ediÃ§Ã£o, legado, bloqueios e responsividade |
| `git diff --check` | Sem erros de whitespace |

A integraÃ§Ã£o verifica: professor responsÃ¡vel, professor de outra turma, aluno, autoria forjada, publicaÃ§Ã£o global, ausÃªncia de turma, arquivamento, isolamento de catÃ¡logo, transferÃªncia mesmo entre turmas gerenciadas, uso indevido em outro simulado e integridade das alternativas, respostas e resultado de uma avaliaÃ§Ã£o concluÃ­da.

## Limites reais da validaÃ§Ã£o

- Os testes de navegador usam a aplicaÃ§Ã£o real com respostas de API isoladas; a persistÃªncia e autorizaÃ§Ã£o foram verificadas separadamente contra PostgreSQL descartÃ¡vel. Nenhuma questÃ£o foi cadastrada na turma real â€œTeste 1â€ e nenhuma sessÃ£o real foi usada para escrever em produÃ§Ã£o.
- NÃ£o Ã© necessÃ¡ria migraÃ§Ã£o ou configuraÃ§Ã£o nova para o vÃ­nculo, pois o campo e os relacionamentos jÃ¡ existem.
- A tela de Atividades preserva sua disponibilidade anterior. Esta tarefa nÃ£o cria um mÃ³dulo de atividades independente; o reaproveitamento e o teste de utilizaÃ§Ã£o das questÃµes ocorreram pelo serviÃ§o existente de simulados de turma.


## Atualização — ciclo de vida de turmas e atividades

Foram adicionadas migrations aditivas `20261115193000_class_lifecycle` e `20261115203000_class_activities`, além dos modelos `ClassLifecycle`, `ClassActivity` e `ClassExamSettings`. As rotas implementam exclusão lógica com prova de autoria, preservação de tentativas e resultados, bloqueio de novas operações, rascunhos/publicação/encerramento de atividades, respostas de alunos, pontuação e resultados. Questões permitidas são privadas da turma selecionada ou questões globais que passem pela elegibilidade editorial existente.

Validação inicial: build do backend e frontend aprovado; `test:no-db` aprovado com 104 arquivos/1.443 testes; contrato HTTP de simulados 51 testes aprovado; navegação Chrome 9 checks aprovados. A tentativa inicial de integração foi bloqueada pelo sandbox. A validação PostgreSQL concluída posteriormente está registrada na seção final abaixo.

O build Vite no sandbox falhou por bloqueio de leitura no diretório irmão usado pelo import compartilhado; o mesmo build foi executado fora do sandbox e passou. O frontend reporta o aviso existente de chunk principal >500 kB. A seção final registra a validação posterior com PostgreSQL instalado fora do PATH e banco descartável. Não foram utilizados os registros reais “Teste 1” ou “teste”.

## Validação final do PostgreSQL isolado e estado de produção

- O PostgreSQL 17 estava instalado em `C:\Program Files\PostgreSQL\17\bin`, fora do `PATH`. O harness local criou clusters temporários em loopback e os encerrou ao final.
- As 29 migrations locais passaram em banco fresh, novo deploy sem pendências, checksums históricos iguais e sem drift de schema. As duas migrations novas também foram aplicadas em clone restaurado do schema `public` do banco configurado; as contagens de `Turma`, `User`, `Simulado`, `Resposta` e `Questao` não mudaram, e `ClassLifecycle`, `ClassActivity` e `ClassExamSettings` ficaram com RLS habilitado.
- Backup recuperável de `public` criado e restaurado com sucesso: `%TEMP%\jurissim-public-backup-XLCtp5\jurissim-public-2026-11-15T23-37-59-309Z.dump` (555.752 bytes, 49 tabelas na restauração antes das migrations novas).
- Suíte de gestão docente: 6 arquivos, 46 testes aprovados, com backend autenticado, PostgreSQL descartável e Chrome real; inclui matrícula, exclusão física/logical conforme dependências, atividade, respostas/resultados, simulado em rascunho, edição, publicação, respostas e bloqueio entre professores.
- Build backend, build frontend e 104 arquivos/1.443 testes sem banco aprovados.
- **Não apliquei migrations no Supabase.** O `prisma migrate status` em leitura identificou três migrations aplicadas no banco que não existem no repositório (`20261113200000_teacher_academic_activities`, `20261113210000_class_materials_announcements`, `20261113220000_teacher_questions_in_exams`). É necessário recuperar/conferir seus arquivos e checksums originais e reconciliar o histórico antes de `migrate deploy`; não foi criada equivalência artificial. A aplicação das duas migrations novas permanece pendente.
