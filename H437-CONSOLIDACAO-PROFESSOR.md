# H4.37 — Consolidação da área do Professor

> Registro histórico da respectiva etapa. Testes, configurações, autorizações e impedimentos referem-se àquela execução; não comprovam o estado atual nem autorizam operações reais. Consulte também o [README](README.md) para as orientações consolidadas.

Branch: `entrega0911`. Alterações anteriores preservadas. Nenhum acesso adicional ao banco, envio de e-mail, aceite, recusa, cadastro, publicação real ou migration foi executado nesta etapa.

## Diagnóstico e correções

O formulário de simulados consultava `GET /questoes`, endpoint de gestão protegido pelo guard de homologação institucional. O 403 não demonstrava ausência de questões. A gestão continua bloqueada; não foram alterados seus endpoints, CRUD ou permissões.

Foi acrescentado `GET /avaliacoes/eligible-questions?turmaIds=<IDs separados por vírgula>&page=1` ao serviço existente de avaliações. O endpoint consulta a tabela Questao existente, sem outro acervo. Exige papel/contexto acadêmico autorizado e todas as turmas selecionadas ativas e gerenciadas pelo ator, respeitando o manifesto e a instituição ativa. ADMIN global e Aluno sem responsabilidade institucional não recebem acesso. Parâmetros de instituição/papel fornecidos na query são recusados.

A seleção aplica a mesma regra do salvamento: questões públicas, privadas próprias sem turma ou privadas da turma selecionada; uma questão privada de turma não pode ser compartilhada com outra turma. Exige estrutura válida de alternativas. A resposta contém somente ID, enunciado, disciplina, assunto, nível e visibilidade pública: não devolve alternativas, gabarito, fundamentação ou IDs administrativos. A leitura usa transação RepeatableRead; salvamento/publicação mantêm suas validações existentes.

O formulário consulta somente após selecionar turmas. Distingue carregamento, página vazia, acervo elegível vazio, insuficiência, 403, rede, erro interno e seleção inválida. Páginas são carregadas sob demanda; uma página filtrada vazia com continuação não é apresentada como acervo inteiro vazio. O botão de salvar permanece bloqueado enquanto a seleção não é válida. Paginação e repetição de consulta não submetem o formulário. Cliques repetidos de salvamento são bloqueados.

O dashboard herdava `professor-shell`, classe do editor de questões, causando distribuição estreita. A página inicial agora usa escopo visual próprio, saudação personalizada, quatro indicadores independentes e seis atalhos. Os indicadores preservam `/reports/overview`, sem números inventados. Turmas, alunos, simulados e relatórios usam o mesmo escopo visual responsivo. Instituição/perfil mantêm seus componentes existentes; o editor do Fernando fica fora desse escopo CSS.

## Convites e primeiro acesso

A tela conserva autenticação e onboarding H4.32. Recebe card navy/dourado com título, instituição, e-mail legível, papel, validade e status. Aceitar continua exigindo ação explícita e validação pelo backend. Recusar agora abre modal: abrir, Cancelar e Escape não enviam mutação; só a confirmação chama o contrato existente. O modal controla foco, restaura o foco e torna o fundo inerte.

Conta existente usa senha/Google existente, sem nova senha obrigatória. Primeiro acesso conserva o cadastro institucional pendente, confirmação de identidade/e-mail e aceite separado. Nenhuma concessão ocorre ao abrir o link. Os bloqueios administrativos anteriores permanecem; esta etapa não habilita cadastro ou operação institucional globalmente.

O token continua apenas em memória da aba após captura e remoção do fragmento da barra. Recarregar/perder a aba exige reabrir o link original. `localhost` e `127.0.0.1` têm sessões distintas: manter a mesma origem do convite e autenticação. Não transportar tokens por localStorage, logs ou parâmetros permanentes. Convite expirado, revogado, conta incorreta, contexto perdido e falha de comunicação conservam estados próprios.

## Atividades: limite real da entrega

Existe `/professor/atividades`, menu, atalho e acesso no contexto de turma. A seleção usa a listagem autorizada real `/turmas`; links abrem alunos e relatório da turma. Um ID fora da página autorizada não provoca consulta direta a uma turma externa.

**Não estão implementados cadastro, listagem de atividades persistidas, ordenação de questões, prazo, publicação, respostas ou correção de Atividades.** Não existe contrato/modelo próprio no projeto que sustente essas operações. A interface informa indisponibilidade; não oferece um falso botão Criar atividade, não declara sucesso e não transforma Simulados em Atividades. Simulados permanecem a funcionalidade existente de aplicação de questões.

O aluno já possui execução de simulados/avaliações, respostas e resultados; esses contratos são de avaliação, não comprovam suporte a Atividades. Um fluxo próprio exige definir persistência, autorização, tentativas, prazos, auditoria, publicação imutável e relação com respostas/resultados antes de criar telas mutáveis. Qualquer alteração de schema/migration depende de autorização futura.

Contrato com Fernando: reutilizar Questao e suas alternativas, `fundamentacaoJuridica`, disciplina, assunto, visibilidade e associação `turmaId` já existentes. Alterações de autoria, associação a atividade, edição e CRUD devem ser coordenadas com o responsável. Nenhum CRUD paralelo foi criado.

## Arquivos desta etapa

- Backend: `src/services/class-exam-service.ts`, `src/routes/class-exam-routes.ts`, `src/services/exam-question-catalog.test.ts`, `src/routes/class-exam.test.ts`, `src/services/institution-homologation.test.ts`.
- Frontend: `src/class-exams.tsx`, `src/teacher-dashboard.tsx`, `src/teacher-dashboard.css`, `src/teacher-workspace.tsx`, `src/teacher-activities.tsx`, `src/integration-shell.tsx`, `src/invitation-onboarding.tsx`, `src/teacher-invitation.css`, `src/account-confirmation-dialog.tsx`.
- Testes de navegador: `scripts/test-session.mjs`, `scripts/test-administration.mjs`, `scripts/test-dashboard-navigation.mjs`.
- Este relatório. Os demais arquivos já modificados no Git não devem ser atribuídos automaticamente à H4.37.

## Validação

- Backend: 259 testes aprovados em 10 arquivos, por `npm run test:no-db -- src/services/exam-question-catalog.test.ts src/routes/class-exam.test.ts src/services/institution-homologation.test.ts src/services/class-delegation.test.ts src/services/invitation-onboarding.test.ts src/services/invitation-scope.test.ts src/services/teacher-overview.test.ts src/routes/goals-reports.test.ts src/config/teacher-invitations.test.ts src/services/account-deletion-safety.test.ts`.
- Navegador: 24 cenários de navegação e 66 verificações de administração aprovados. Incluem rotas docentes sem montar o módulo de questões, seleção institucional, atividade indisponível, troca de contexto, convites, primeiro acesso e modal de recusa sem mutação ao cancelar.
- Suíte de sessão: 79 cenários aprovados; inclui catálogo negado/vazio/insuficiente/rede/erro interno e salvamento/publicação simulados.
- Suíte estática de entrega aprovada, inclusive H4.24 desabilitada e 14 verificações direcionadas do ADMIN.
- Builds backend e frontend aprovados. Frontend apresenta avisos de tamanho de bundle/anotações de dependências; não impedem compilação. A primeira tentativa de build foi bloqueada pelo sandbox ao ler diretórios ancestrais; repetição autorizada passou.
- Responsividade automatizada em 360/768/1366 px no dashboard e testes existentes de outros perfis/convites. Captura desktop docente revisada visualmente com dados explicitamente simulados.

Todos os testes de API/persistência/SMTP desta etapa usam mocks. Não comprovam catálogo disponível, cadastro novo, convite aceito ou publicação no banco conectado. Não foi revalidado estado de convite/token real. Evidências históricas de recebimento de convite não equivalem à homologação real das alterações desta etapa.

## Roteiro manual, condicionado às autorizações de acesso reais

1. Usar a origem já configurada (`localhost:5173` ou `127.0.0.1:5173`, sem alternar), com conta Professor e vínculo autorizado. Selecionar a instituição correta; conta sem vínculo deve manter bloqueio acadêmico. Não criar vínculos para contornar o bloqueio.
2. Em `/professor`, conferir saudação, instituição, quatro contagens e seis atalhos. Conferir desktop, tablet e celular, teclado e foco.
3. Em Turmas, conferir gestão, solicitações, alunos e links separados de simulados/atividades. Não matricular nem alterar alunos durante revisão somente leitura.
4. Em Simulados, abrir o formulário e selecionar uma turma autorizada. Na rede deve aparecer `/avaliacoes/eligible-questions`, nunca uma consulta de gestão `/questoes`. Conferir estados e paginação. Não clicar em Salvar/Publicar sem autorização de escrita. Um 403 deve aparecer como acesso negado, sem alegar acervo vazio.
5. Em Atividades, conferir aviso de indisponibilidade, contexto da turma, alunos e relatório. Não há criação/publicação a homologar nesta etapa.
6. Abrir o convite original na mesma origem, autenticar com a conta destinatária e conferir instituição/e-mail/validade. Abrir Recusar e testar Cancelar/Escape: nenhuma recusa deve ocorrer. Não confirmar recusa ou aceite sem autorização específica.
7. Primeiro acesso real exige autorização separada para cadastro, confirmação e respectivas auditorias; aceite posterior também exige aprovação. Não criar conta real apenas para revisar layout.
8. Conferir desempenho, relatórios e perfil; exclusão H4.24 deve continuar indisponível. Publicação real, tentativas e resultados persistidos ficam para homologação expressamente autorizada.

Não houve commit, push, merge ou deploy. A etapa entrega as correções de código e os limites acima; Atividades completas e integração real adicional permanecem pendentes.
