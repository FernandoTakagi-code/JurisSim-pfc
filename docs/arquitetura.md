# Arquitetura e responsabilidades

## Componentes

- Frontend: React, TypeScript e Vite. A navegação escolhe o painel conforme a sessão devolvida pelo servidor.
- Backend: Node.js, Express, TypeScript, Zod e Prisma. As rotas aplicam autenticação e autorização; controllers recebem requisições; services executam regras e transações; repositories encapsulam parte do acesso ao banco. Há serviços que consultam Prisma diretamente.
- Banco: PostgreSQL, com o modelo completo em `backend/prisma/schema.prisma`. As migrations representam a evolução do schema e devem permanecer versionadas.

Algumas validações puras são compartilhadas por imports do frontend para arquivos do backend, como senha, alternativas A–D e cadastro institucional. Mover esses arquivos exige atualizar imports e verificar os dois builds.

## Camadas do backend

| Camada | Responsabilidade | Onde localizar |
| --- | --- | --- |
| Rotas e middlewares | Caminhos HTTP, autenticação, autorização de entrada e encaminhamento | `backend/src/routes` e `backend/src/middlewares` |
| Controllers | Leitura/validação da requisição, chamada do caso de uso e resposta HTTP | `backend/src/controllers` |
| Services | Casos de uso, decisões do domínio, composição de avaliações e coordenação de transações | `backend/src/services`, agrupado por assunto |
| Repositories | Consultas, persistência e concorrência dos fluxos que possuem essa abstração | `backend/src/repositories` |
| Schemas e configuração | Validação de formatos, configuração e disponibilidade dos módulos | `backend/src/schemas` e `backend/src/config` |

O projeto não impõe essa sequência por completo a todos os fluxos: algumas rotas chamam services diretamente, alguns services acessam o Prisma e existem verificações de acesso também em controllers e repositories. A organização em pastas não altera essas responsabilidades nem remove as proteções existentes. Separar o restante do acesso ao banco exigiria uma refatoração própria, além desta reorganização.

### Organização dos services

Os 63 arquivos foram distribuídos em sete pastas, preservando nomes de classes, funções e regras:

```text
backend/src/services/
  accounts/       Autenticação, identidade, conta, privacidade e recuperação
  institutions/   Cadastro, decisões institucionais, vínculos e convites
  questions/      Cadastro, elegibilidade, importação, prática e revisão
  diagnostics/    Composição, resolução e análise do diagnóstico
  assessments/    Turmas, atividades, simulados e relatórios acadêmicos
  study/          Trilhas adaptativas, metas e justificativas
  email/          Interfaces de envio, adaptadores de e-mail e auxiliares
```

`email/` reúne infraestrutura de comunicação usada pelos casos de uso; nem todos os arquivos dentro de `services/` são regras de negócio. Por exemplo, o transporte SMTP é um adaptador, enquanto a decisão de quando enviar a confirmação pertence ao fluxo da conta. Os testes permanecem separados em `backend/tests`.

### Mapa de funções para a apresentação

| Pergunta / fluxo | Arquivo de referência | Funções principais |
| --- | --- | --- |
| Onde a conta é cadastrada e autenticada? | [AuthService](../backend/src/services/accounts/auth-service.ts) | `register`, `login`, `loginWithGoogle`, `session` |
| Onde ocorre a exclusão da própria conta? | [AccountDeletionService](../backend/src/services/accounts/account-deletion.ts) | `self`; inclui as regras de exclusão habilitadas para aluno e professor |
| Onde são validadas e cadastradas as questões? | [QuestaoService](../backend/src/services/questions/QuestaoService.ts) | `validarAlternativas`, `criar`, `atualizar`, `remover` |
| Onde uma prática é iniciada e corrigida? | [QuestionPracticeService](../backend/src/services/questions/question-practice-service.ts) | `start`, `answer`, `finalize`, `getResult` |
| Onde está a revisão dos erros? | [QuestionReviewService](../backend/src/services/questions/question-review-service.ts) | `start`, `answer`, `finalize`, `getResult` |
| Onde são revisadas e liberadas questões do acervo? | [QuestionEditorialService](../backend/src/services/questions/question-editorial-service.ts) | `metadata`, `review`, `release`; auxiliares `editorialIssues` e `editorialDigest` |
| Onde o diagnóstico inicial é criado ou retomado? | [InitialDiagnosticService](../backend/src/services/diagnostics/initial-diagnostic-service.ts) | `getOrCreate` |
| Onde as respostas e o resultado do diagnóstico são tratados? | [InitialDiagnosticResolutionService](../backend/src/services/diagnostics/initial-diagnostic-resolution-service.ts) | `getQuestions`, `saveAnswer`, `finalize`, `getResult` |
| Onde são calculados nível e focos recomendados? | [Motor adaptativo](../backend/src/services/diagnostics/adaptive-engine.ts) | `getLevel`, `analyzeDiagnostic`, `buildTrailFilters` |
| Onde o professor prepara e publica atividades? | [ClassActivityService](../backend/src/services/assessments/class-activity-service.ts) | `questions`, `save`, `publish`, `end` |
| Onde são gerenciadas turmas e simulados? | [ClassExamService](../backend/src/services/assessments/class-exam-service.ts) | `createClass`, `saveExam`, `publish`, `start`, `answer`, `finalize` |
| Onde o desempenho da turma é agregado? | [ClassReportService](../backend/src/services/assessments/class-report-service.ts) | `overview`, `report`, `individual` |
| Onde o ADMIN decide solicitações e a instituição convida professores? | [InstitutionService](../backend/src/services/institutions/institution-service.ts) | `request`, `decide`, `invite`, `cancelInvitation`, `unlink` |
| Onde o professor aceita o convite? | [InvitationOnboardingService](../backend/src/services/institutions/invitation-onboarding.ts) | `inspect`, `register`, `start`, `complete` |
| Onde estão metas e trilhas de estudo? | [StudyGoalService](../backend/src/services/study/study-goal-service.ts) e [TrailService](../backend/src/services/study/trail-service.ts) | Metas: `dashboard`, `create`, `update`, `complete`; trilha: `generate`, `answer`, `finalize` |

Exemplo para percorrer o código: a rota de questões encaminha a requisição ao [QuestaoController](../backend/src/controllers/QuestaoController.ts); `criar` valida a entrada e chama `QuestaoService.criar`; o service valida as alternativas e delega a gravação ao [QuestaoRepository](../backend/src/repositories/QuestaoRepository.ts). Há verificações complementares de escopo institucional e de autoria nessas camadas. Essa distribuição deve ser explicada como está implementada, sem afirmar que toda regra esteja exclusivamente no service.

## Organização do painel institucional

`frontend/src/institution-dashboard.tsx` coordena a sessão, a navegação e as capacidades do painel. Os componentes de visão geral, dados institucionais, professores, convites, turmas, notificações e modais ficam em `frontend/src/institution/`, com tipos e formatação compartilhados. Essa separação mantém as regras de acesso e os contratos da API existentes.

## Organização dos testes

`backend/src` contém somente a aplicação. A estrutura de testes é:

```text
backend/tests/
  unit/          Testes isolados, incluindo rotas com dependências simuladas
    config/
    middlewares/
    repositories/
    routes/
    services/
  integration/   Testes com PostgreSQL descartável e seus auxiliares
  fixtures/      Dados de teste compartilhados
  setup/         Preparação e bloqueio de persistência para testes sem banco
frontend/tests/  Verificações de interface e navegação
```

O build do backend limpa `dist` e compila somente `src`. A checagem `npm --prefix backend run check:tests` valida os tipos dos testes sem gerar arquivos. Os testes de integração mantêm a validação do banco descartável antes da execução; reorganizar pastas não autoriza usar o banco real.

Capturas geradas pelos testes visuais ficam em `frontend/.artifacts/evidence`, ignoradas pelo Git. Scripts de manutenção e ferramentas de provisionamento dos ambientes de teste continuam em `backend/scripts`.

## Perfis

| Perfil | Responsabilidade |
| --- | --- |
| ADMIN global | Administração de contas, instituições e auditoria; não recebe acesso pedagógico rotineiro |
| Responsável institucional | Gestão da instituição autorizada, seus vínculos, turmas e avaliações |
| Professor | Questões, atividades, simulados e desempenho das turmas autorizadas |
| Aluno | Diagnóstico, prática, avaliações e acompanhamento pessoal |

A responsabilidade institucional é representada por vínculo; não equivale a receber o papel global de ADMIN. A autorização depende de papel, instituição, vínculo ativo e turma. Ocultar um botão não substitui essas verificações no backend.

## Fluxos acadêmicos

- Diagnóstico inicial: estabelece o ponto de partida e orienta a trilha de estudo.
- Prática e simulado individual: usam os critérios próprios de elegibilidade e configuração.
- Atividade de turma: lista de questões, pontuação e prazo opcional para iniciar, sem cronômetro.
- Simulado de turma: avaliação publicada para turmas, com duração quando configurada.
- Desempenho da turma: agrega atividades e simulados publicados para aquela turma; resultados concluídos alimentam médias e métricas. Não reúne indiscriminadamente todo o histórico pessoal do aluno.

Tentativas e resultados existentes precisam ser preservados durante mudanças no acervo e na configuração.

## Configuração

`GET /institutions/availability` informa as capacidades disponíveis no processo. Flags independentes podem liberar somente parte da administração institucional.

`INSTITUTIONS_ENABLED=true` exige que a verificação de ativação não encontre professores sem e-mail confirmado, vínculo ativo ou instituição autorizada para suas turmas. Não remova essa verificação para contornar cadastro inconsistente.

Consulte [variáveis de ambiente](variaveis-de-ambiente.md), [segurança](seguranca-e-privacidade.md) e [acervo](acervo.md). Esta visão do código não substitui os diagramas da monografia.
