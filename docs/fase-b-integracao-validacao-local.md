# Fase B — implementação local e limites de ativação

Branch: `entrega0911`. Sem commit, push, deploy, alteração de credenciais ou acesso ao Supabase. As alterações anteriores de bootstrap e transição foram preservadas. Nenhuma conta real foi modificada e nenhum e-mail real foi enviado pelos testes.

## Fluxos incorporados

- Login único por senha e Google, usando o OAuth existente, sem escolha de papel. O papel vem de `/auth/session`; ADMIN permanece em `/administracao`.
- Cadastro público individual como aluno ou responsável, sem concessão de privilégios. Professor novo entra por convite, não por cadastro público de professor.
- Solicitação institucional exige e-mail confirmado no backend e no formulário; acompanhamento permanece acessível antes da confirmação. Aprovação/rejeição existente foi reutilizada.
- ADMIN consulta instituições e identidades administrativas, edita dados e troca o responsável por uma conta individual confirmada. A troca revoga apenas a administração institucional anterior e as sessões das duas contas; preserva senhas, identidade e dados acadêmicos.
- Convite admite nome, e-mail e turmas opcionais da instituição. Aceite de conta existente exige sessão e e-mail confirmado correspondente, sem substituir credenciais.
- Primeiro acesso usa uma segunda prova enviada ao e-mail convidado. Só após essa prova permite definir senha e ativar o vínculo. Não cria sessão automaticamente. Recusa com prova não ativa vínculo.
- Tokens/provas aleatórios têm somente hash no banco, expiração, uso único, cancelamento e limites de tentativas. Links são removidos da URL e mantidos apenas em memória. Reabrir o e-mail após recarregar uma página limpa.
- Reenvio da prova tem intervalo mínimo de um minuto, até três tentativas por convite; um convite substituto retoma um primeiro acesso inacabado sem duplicar a identidade nem substituir senha existente.
- Responsável institucional cria, renomeia e arquiva turmas da própria instituição, designa professores com vínculo ativo, vincula alunos já confirmados e consulta indicadores da turma. A instituição mantém a propriedade.
- O diagnóstico de aluno não impede a gestão de turmas e relatórios quando o backend confirmou um vínculo de administrador institucional no contexto selecionado. O estudo pessoal desse responsável continua sujeito ao diagnóstico normal.
- A gestão de matrícula já existente também permite ao professor vincular alunos confirmados às suas turmas; não cria ou exclui contas pessoais.
- Professor histórico sem vínculo recebe uma mensagem explícita de regularização, com confirmação de e-mail pelo fluxo normal. A verificação anterior continua impedindo ativação quando a transição estiver pendente; as nove contas não foram consultadas ou alteradas nesta etapa.

## Contratos e autorização

| Contrato | Classificação | Autorização e escopo |
| --- | --- | --- |
| `/auth/login`, `/auth/google`, `/auth/session`, recuperação e confirmação | Reutilizar | Identidade real; cadastro não concede PROFESSOR ou ADMIN |
| `POST /institutions/requests` | Restringir | Conta individual confirmada; sem vínculo prévio |
| `GET /institutions/mine` | Manter | Própria identidade; autenticação limitada permite acompanhamento |
| `/institutions/admin/institutions` e decisões | Reutilizar | ADMIN; dados institucionais administrativos |
| `PUT /institutions/admin/institutions/:id/details` | Criar | ADMIN; dados permitidos, justificativa e responsável confirmado |
| `/institutions/admin/users` | Restringir | Diretório administrativo; não lista alunos individuais sem relação administrativa |
| `/institutions/admin/classes` | Restringir | Compatibilidade de URL preservada; gestão pedagógica global negada |
| `POST /institutions/invitations/inspect` | Criar | Token válido; somente metadados mínimos e e-mail mascarado |
| `POST /institutions/invitations/onboarding` | Criar | Token válido e aceite legal; resposta neutra sobre existência de conta |
| `POST /institutions/invitations/complete` | Criar | Convite e prova de e-mail válidos; somente conta nova ainda inacabada |
| `POST /institutions/invitations/decline-proof` | Criar | Prova de e-mail válida; não concede vínculo |
| `POST /institutions/invitations/accept` e `/decline` | Reutilizar/criar | Destinatário autenticado e confirmado; aceite não habilita ADMIN pedagogicamente |
| `/institutions/:id/invitations`, reenvio e cancelamento | Reutilizar | Responsável ativo da instituição aprovada; quotas, expiração e auditoria |
| `PUT /turmas/:id/teachers/:teacherId` | Criar | Somente administrador da instituição proprietária; professor ativo na mesma instituição |
| `POST /turmas/:id/students` | Criar | Professor delegado ou administrador institucional; aluno já existente e confirmado |
| `/turmas`, `/avaliacoes`, `/reports`, questões e estudo | Restringir/reutilizar | ADMIN global negado; escopo acadêmico continua validado no backend |
| `/audit-logs` | Manter | Auditoria global autorizada, independente da ativação institucional |
| `/institutions/:id/logs` e relatórios | Reutilizar | Somente instituição própria e vínculo autorizado |

Não foi removido nenhum endpoint. Foram eliminadas somente apresentações antigas que já não tinham consumidores, evitando duplicar o aceite e a gestão global de turmas.

## Flags e migration pendente

Nenhuma flag foi ativada ou arquivo `.env` alterado. `INSTITUTIONS_ENABLED=false` deve permanecer assim no ambiente compartilhado.

- `ADMINISTRATION_ENABLED`: controles globais administrativos.
- `INSTITUTION_REGISTRATION_ENABLED`: solicitação e acompanhamento institucional.
- `INSTITUTIONS_ENABLED`: vínculos, convites e operações institucionais completas, sujeitos à verificação de transição dos professores.
- Nenhuma combinação de flags concede acesso pedagógico ao ADMIN global.

Nova migration, **somente arquivo, não aplicada ao Supabase**:
`20261105000100_teacher_invitation_onboarding`.

Adiciona `TeacherInvitation.invitedName`, `TeacherInvitationClass` e `InvitationOnboarding`, índices, quatro chaves estrangeiras e RLS. Amplia a constraint de estados de convite para incluir `DECLINED`, mantendo válidos todos os estados anteriores. Não altera registros existentes. Exige autorização separada antes de aplicar ao banco compartilhado; a ativação institucional depende dessa aplicação e da regularização legítima dos professores.

O teste `backend/scripts/test-invitation-migration-local.cjs` cria seu próprio PostgreSQL em loopback, sem ler `.env` nem aceitar URLs externas. Verifica a migration administrativa anterior e a nova, preservação de registros de fixture, novo estado, relacionamentos, RLS e dump/restauração. Isso não constitui validação do Supabase ou de seu backup.

## Execução e evidências locais

Frontend, em `frontend`:

```powershell
npm.cmd run build
node scripts/test-admin-routing.cjs
node scripts/test-administration.cjs
node scripts/test-administration.mjs
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Os testes de navegador iniciam Vite isolado em `127.0.0.1:5186`, interceptam APIs e bloqueiam rede externa. Dados são exclusivamente fixtures de teste. Não utilizar suas sessões demonstrativas na aplicação real.

Com serviços locais explicitamente configurados para um banco isolado, os endereços da aplicação são:

- `http://127.0.0.1:5173/`: login único, cadastro individual e Google existente.
- `/administracao`: ADMIN autenticado.
- `/instituicoes`: solicitação, acompanhamento e administração institucional autorizada.
- `/professor`: professor autorizado.
- `/dashboard`: aluno, respeitando o diagnóstico inicial existente.
- Convite: abrir o link seguro recebido no ambiente de e-mail isolado; não copiar tokens para documentação ou logs.

Não iniciar o backend usando inadvertidamente a configuração do Supabase compartilhado. O envio real depende do transporte Brevo já implementado, remetente autorizado e `APP_PUBLIC_URL` correta. Credenciais e OAuth não foram modificados ou testados contra serviços externos.

## Limites e referência visual

Não há exportação independente do dashboard institucional do v0 no workspace: `referencia-dashboard-v0/page.tsx` é a referência administrativa; `.local-admin-preview/institutional-flow.tsx` é a prévia aprovada do fluxo. Foi reaproveitado o painel institucional existente, sem inventar outro dashboard.

Para integrar a exportação institucional exata ainda são necessários seu `page.tsx`, `globals.css`, componentes e recursos locais, por exemplo em `referencia-dashboard-institucional-v0/`. A prévia e suas evidências foram preservadas e continuam fora das rotas reais/build.

Estados de validação: código implementado; testes com mocks e PostgreSQL descartável; migration compartilhada pendente; ativação pendente; entrega de e-mail real e validação com banco real não realizadas.

## Arquivos desta implementação

- Frontend: `auth-gate.tsx`, `main.tsx`, `auth-session.ts`, `invitation-token.ts`, `administration.tsx` e o novo `invitation-onboarding.tsx`.
- Backend: `server.ts`, `middlewares/auth-middleware.ts`, novo `middlewares/academic-access.ts`, `config/institution-feature.ts`, rotas `institution-routes.ts`, `class-exam-routes.ts` e `goals-reports-routes.ts`; serviços `institution-service.ts`, `class-exam-service.ts`, `class-report-service.ts`, novos `invitation-onboarding.ts` e `email-html.ts`.
- Banco: `prisma/schema.prisma` e o arquivo da migration nova indicado acima.
- Testes: casos direcionados de autenticação, autorização institucional e serviços existentes; novo `invitation-onboarding.test.ts`, `scripts/test-invitation-migration-local.cjs` e cenários frontend de administração/roteamento.
- Arquivos anteriores de bootstrap, transição, prévia, marca e estilos aprovados foram preservados. README e documentação acadêmica não foram alterados nesta etapa.

## Resultado das verificações

- Backend: 292 testes em 13 arquivos direcionados aprovados, incluindo Google com verificador simulado, recuperação, bootstrap, transição, convites e permissões; mais 11 testes do guard de diagnóstico aprovados após ajustar o contexto institucional. Total de 303 casos distintos; não foi repetida a suíte geral.
- Frontend: TypeScript e build Vite aprovados; 15 verificações de renderização e verificação de roteamento aprovadas.
- Navegador local: 39 cenários aprovados com APIs interceptadas e rede externa bloqueada, incluindo primeiro acesso, recusa, dez seções, desktop/celular, tema escuro e regressão dos dashboards existentes.
- PostgreSQL descartável: migrations administrativa anterior e de onboarding, preservação dos registros de fixture, estado `DECLINED`, relacionamentos, RLS, consultas dos dois modelos pelo cliente Prisma e dump/restauração aprovados. Cluster encerrado.
- `INSTITUTIONS_ENABLED=false` confirmado no arquivo local, sem alteração de `.env`.
- Build mantém aviso de tamanho de bundle; Vitest mantém aviso de configuração CommonJS/ESM. Nenhum dos dois impediu compilação ou testes.
- Supabase, envio real de e-mail, OAuth real e transição das contas históricas não foram exercitados nesta validação.
