# Integração do dashboard institucional — 06/11/2026

Branch: `entrega0911`. Implementação local, sem commit, push, deploy, migrations, envio real de e-mails ou acesso ao Supabase compartilhado. Alterações anteriores das Fases B/C preservadas. `INSTITUTIONS_ENABLED=false` mantido.

## Fonte visual e arquitetura

O arquivo encontrado foi `Downloads/dash instituição.zip` (não havia outro arquivo com o sufixo `(1)`). Os 14 arquivos originais foram extraídos para `referencia-dashboard-institucional-v0/`, sem sobrescrever a referência administrativa. Foram examinados `page.tsx`, `globals.css`, `layout.tsx`, `package.json` e os componentes.

A composição original foi adaptada para React/TypeScript/Vite: sidebar com os três grupos e onze seções, cabeçalho, cartões, painéis, tabelas e diálogos. Não foram instalados Next.js, Tailwind, shadcn, lucide ou outras dependências. Metadados Next e Analytics não são executados. Os ícones usam o componente SVG local e a marca usa `/brand/jurissim-logo.png`. Todos os seletores do novo CSS estão sob `.institution-workspace`; estilos pessoais e administrativos não foram redesenhados.

O painel utiliza `/instituicoes?instituicao=<id>&secao=<modulo>`, separado de `/administracao`. Subconsultas preservam `turma` e `aluno` na URL. Navegação entre parâmetros, retorno ao acompanhamento e seleção de outra instituição foram corrigidos sem alterar as permissões das rotas.

## Onze módulos

“Operacional” nesta tabela significa conectado aos contratos reais do código e validado localmente com dependências isoladas; não significa executado no Supabase nem liberado pela flag.

| Módulo | Recursos conectados | Limites explícitos |
| --- | --- | --- |
| Visão geral | Indicadores de alunos únicos, professores ativos, turmas ativas e convites pendentes; atividade institucional; consulta por disciplina de uma turma; atalhos reais | Sem evolução global por período, meta institucional ou variação percentual inventada. Série temporal global identificada como indisponível |
| Minha instituição | Dados do cadastro, responsável, telefone, CNPJ quando existente, status e edição autorizada de nome/telefone/descrição | Não permite alterar aprovação, privilégios ou transferir responsabilidade pelo painel institucional |
| Professores | Vínculos paginados, pesquisa identificada como local à página e desvinculação com confirmação | Última atividade não fornecida pela API. Atribuição de turmas fica em Turmas |
| Convites | Nome/e-mail, turma inicial opcional, listagem paginada, filtro de estado, envio, reenvio e cancelamento confirmado | Envio real exige provedor, URL e habilitação autorizados; nenhuma mensagem real enviada nesta etapa. Sem campo fictício de mensagem personalizada |
| Turmas | Cadastro/edição/arquivamento, códigos de entrada, matrículas, solicitações e designação/retirada de professores vinculados | A instituição concede delegação diretamente; professor não solicita permissão. Histórico é preservado |
| Alunos | Lista paginada de alunos autorizados e retorno ao contexto institucional | Não consulta todos os alunos da plataforma nem usa alunos pendentes como membros aprovados |
| Desempenho acadêmico | Seleção de turma, resultados reais, métricas por disciplina e relatório individual autorizado | Não extrapola resultados para uma média global sem contrato |
| Simulados | Listagem, criação e edição de rascunhos, seleção de questões e turmas autorizadas, publicação | Contexto institucional não concede autoria de questões nem realização de provas como aluno. Sem catálogo fictício |
| Relatórios | Relatórios por turma, avaliações e aluno, com paginação existente | Não oferece exportação CSV/PDF sem implementação correspondente |
| Notificações | Lista paginada de mensagens destinadas ao usuário autenticado | API atual não informa instituição; interface informa expressamente que a lista pertence à conta, não exclusivamente à instituição selecionada. Sem leitura/contadores simulados |
| Configurações | Perfil, foto, preferências pessoais e consulta à auditoria restrita da instituição | Não oferece configurações globais, alterações de segurança ou permissões sem endpoint autorizado |

Não foram mantidos os números, nomes, tendências e sucessos simulados da exportação na aplicação real. Estados de carregamento, vazio, falha, tentativa novamente e acesso negado usam as respostas efetivas dos serviços.

## Endpoints reutilizados

Todos já existiam. IDs são validados pelo backend e não são fonte de autorização.

- Sessão e capacidades: `GET /auth/session`, `GET /institutions/availability`, `GET /institutions/mine`.
- Instituição: `GET /institutions/:id/summary?page`, `PATCH /institutions/:id`.
- Professores: resumo institucional paginado e `DELETE /institutions/:id/teachers/:userId`.
- Convites: `GET /institutions/:id/invitations?page&status`, `POST /institutions/:id/invitations`, `POST /institutions/:id/invitations/:invitationId/resend`, `DELETE /institutions/:id/invitations/:invitationId`.
- Turmas: `GET/POST /turmas`, `PATCH /turmas/:id`, `POST/DELETE /turmas/:id/invite`, `PUT /turmas/:id/teachers/:teacherId`.
- Alunos: `GET /turmas/students`, `GET/POST /turmas/:id/students`, `DELETE /turmas/:id/students/:studentId`, `GET /turmas/:id/requests`, `PATCH /turmas/:id/requests/:requestId`.
- Avaliações e catálogo: `GET/POST /avaliacoes`, `PUT /avaliacoes/:id`, `POST /avaliacoes/:id/publish`, `GET /questoes`.
- Relatórios: `GET /reports/classes?page`, `GET /reports/classes/:id?page&examPage`, `GET /reports/classes/:id/students/:studentId?page`.
- Auditoria e notificações: `GET /institutions/:id/logs?page&event&actorId&severity&from&to`, `GET /institutions/notifications?page`.
- Perfil/foto: os mesmos contratos usados pelo componente compartilhado `ProfileSettings`/`PhotoProvider`; não foram criados substitutos institucionais.

Complementos dos contratos existentes: resumo fornece contagens reais de professores ativos/convites pendentes/turmas ativas, convite inclui o nome já armazenado e turma inclui identificadores/nomes dos professores designados. Não houve criação de endpoint, tabela ou migration nesta integração.

## Autorização e componentes compartilhados

O responsável mantém seu papel pessoal ALUNO ou PROFESSOR. O painel exige e-mail confirmado, capacidade habilitada e vínculo `INSTITUTION_ADMIN` da instituição selecionada obtido pela sessão. ADMIN global permanece no seu painel; associação apenas docente não abre gestão institucional.

Consultas acadêmicas institucionais enviam `X-Institution-Id` e `X-Institution-Context: administration`. O backend valida o vínculo ativo e o escopo; não há promoção de papel por query string, armazenamento local ou seleção visual. Ao retornar ao estudo pessoal, as chamadas deixam de enviar contexto administrativo. A leitura do catálogo verifica o vínculo e permite somente acervo público e questões das turmas da instituição; autoria continua restrita ao contexto docente autorizado. A dispensa do diagnóstico pessoal aplica-se apenas às operações institucionais autenticadas, preservando o requisito no estudo independente.

Reutilizados: `ClassesPage`, `ClassStudents`, `ClassMembershipManager`, `ExamsPage`, `TeacherReports`, `StudentClassReport`, `AuditPanel`, `ProfileSettings`, `AuthorizedContext`, `PhotoProvider`, `ProfileAvatar`, cliente de API, sessão e estados/paginação/mutações existentes. `Icon` foi extraído sem dependências externas. Propriedades opcionais de navegação/gestão preservam os comportamentos padrão de aluno e professor.

## Validação executada

- Backend: build TypeScript aprovado; 386 testes direcionados em 18 arquivos aprovados (delegações, catálogo, instituição, sessão, Google, convites, bootstrap, ativação, diagnóstico e rotas). Dependências de dados/e-mail simuladas; não foi executada a suíte geral nem teste contra banco compartilhado.
- Frontend: `npm.cmd run build` aprovado, incluindo `tsc -b` e Vite. Aviso de bundle principal acima de 500 kB; não é erro de compilação e não foi introduzida dependência para contorná-lo.
- `node scripts/test-administration.cjs`: 15 verificações de renderização aprovadas.
- `node scripts/test-admin-routing.cjs`: aprovado.
- `node scripts/test-institution-navigation.cjs`: aprovado; onze módulos, autorização por vínculo, contexto pessoal, URLs e CSS integralmente delimitado.
- `node scripts/test-administration.mjs`: 51 cenários Chrome aprovados, com API simulada. Incluem os onze módulos, atribuição/retirada de professor, criação/publicação de simulado, edição da instituição, relatório individual, regressão ADMIN/aluno/professor, 403, rede, sessão revogada/401, instituição alheia e flag desativada sem consultas protegidas.
- Larguras de 1440, 768, 720, 390 e 320 px sem transbordamento horizontal nas seções representativas; alternância de tema e recolhimento/expansão de menu verificados. A comparação visual da captura não substitui a revisão da responsável.
- `git diff --check`: sem erros de whitespace; apenas avisos de normalização LF/CRLF de arquivos locais existentes.

O navegador usa perfil temporário, endereço de API inacessível e bloqueio de rede fora do Vite local. Identidades e respostas de teste são injetadas exclusivamente pelo script externo à aplicação, não são fallback de autenticação nem dados de produção. Uma tentativa intermediária falhou na inicialização do cenário; a execução final completa foi aprovada.

## Arquivos desta integração

Novos: `frontend/src/institution-area.tsx`, `institution-dashboard.tsx`, `institution-dashboard.css`, `institution-navigation.ts`, `ui-icon.tsx`; `frontend/scripts/test-institution-navigation.cjs`; esta nota e a referência original extraída.

Adaptados no frontend: `main.tsx`, `administration.tsx` (reuso de helpers e retirada da implementação institucional privada substituída), `integration-shell.tsx` (exports e contexto compacto), `api.ts`, `navigation.ts`, `class-exams.tsx`, `goals-reports.tsx`, `scripts/test-administration.mjs`.

Adaptados no backend: `src/controllers/QuestaoController.ts`, `src/repositories/QuestaoRepository.ts`, `src/services/QuestaoService.ts`, `src/services/class-exam-service.ts`, `src/services/institution-service.ts`, `src/middlewares/initial-diagnostic-required.ts`; testes em `routes/questao-crud.test.ts`, `services/institution-service.test.ts` e `middlewares/initial-diagnostic-required.test.ts`.

A lista não atribui a esta etapa os demais arquivos já alterados das Fases B/C. Bootstrap, contas e transição dos nove professores não foram executados/modificados por esta integração.

## Visualização local e pendências

Para compilar e repetir a validação isolada, a partir de `frontend`:

```powershell
npm.cmd run build
node scripts/test-institution-navigation.cjs
node scripts/test-administration.mjs
```

O último comando abre Chrome headless e Vite temporário em `127.0.0.1:5186`, testa a aplicação real com contratos simulados e encerra os processos. A captura `frontend/.artifacts/institution-overview-desktop-test.png` é exclusivamente de dados de teste e permite conferir localmente o resultado sem serviços externos.

Para iniciar somente o frontend:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Endereço: `http://127.0.0.1:5173/instituicoes`. O acesso real exige backend isolado autorizado e conta confirmada com vínculo administrativo legítimo; escolha “Administrar instituição” para abrir `?instituicao=<id>&secao=overview`. Sem essas condições ou com a flag desativada, a tela bloqueada é o comportamento correto. Não foi iniciado backend conectado ao Supabase para oferecer uma visualização artificialmente liberada.

A integração está implementada e validada localmente para os onze módulos dentro dos contratos disponíveis. Operação real continua dependente de autorização própria de ativação, regularização legítima dos vínculos e preparação do ambiente. A migration de onboarding `20261105000100_teacher_invitation_onboarding` já existente na Fase B não foi aplicada nem reavaliada nesta etapa; sua disponibilidade no ambiente deve ser confirmada no procedimento autorizado de ativação. Provedor de e-mail e `APP_PUBLIC_URL` precisam estar configurados antes de convites reais. Não houve mudança dessas configurações aqui.
