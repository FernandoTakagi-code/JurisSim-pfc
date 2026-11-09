# Auditoria funcional final do dashboard institucional

Data: 06/11/2026. Branch confirmada: `entrega0911`.

## Conclusão e alcance

Os onze módulos estão presentes, conectados aos contratos existentes e navegáveis com APIs simuladas. A auditoria encontrou e corrigiu um destino incorreto de navegação, uma ação duplicada e dois problemas de apresentação, sem alterar regras de negócio. A validação local está aprovada dentro dos cenários descritos abaixo. Isso não certifica a integração com o banco compartilhado nem autoriza ativação.

Nenhum acesso ao Supabase, migration, alteração de conta real, envio real de e-mail, mudança de flag compartilhada, commit, push, merge ou deploy foi realizado. `backend/.env` continua com `INSTITUTIONS_ENABLED=false`. As alterações locais anteriores das Fases B/C, inclusive bootstrap e transição dos professores, foram preservadas.

## Correções desta auditoria

1. **Ver alunos:** `ClassesPage` ainda usava a URL docente. Agora recebe callback opcional; no painel institucional segue para `/instituicoes?instituicao=<id>&secao=students&turma=<id>` e consulta os alunos daquela turma com contexto administrativo. A navegação padrão do professor permanece igual. Foi adicionado cenário específico de ida e volta.
2. **Criar turma duplicado:** removido o segundo botão do cabeçalho da seção Turmas. Permanecem o formulário funcional da seção e o atalho contextual da Visão geral.
3. **Botões comprimidos no celular:** ações de Turmas agora quebram em linhas com base mínima adequada, sem sobreposição de textos. Correção restrita a `.institution-workspace`; o teste verifica também a largura interna dos botões, além da largura da página.
4. **Título repetido em Configurações:** ocultados somente o título e a etiqueta de papel do componente pessoal dentro da composição institucional. O formulário compartilhado, seus dados e permissões permanecem intactos.

Não foram removidos recursos usados por outros perfis. Não há duas sidebars institucionais. As onze seções têm IDs únicos; os subcontextos de turma/aluno usam parâmetros distintos. Desempenho e Relatórios compartilham intencionalmente componentes/contratos de resultados, mantendo seus itens de navegação; isso não foi substituído por uma segunda implementação.

## Matriz dos módulos e ações

Todos os dados das capturas são fictícios e identificados como teste. Os endpoints e componentes abaixo são os da aplicação, não um dashboard demonstrativo alternativo.

| Módulo | Implementação e comportamento revisados | Evidência local e limites |
| --- | --- | --- |
| Visão geral | Indicadores do resumo, seleção de turma para disciplina, atalhos para convite/criação/relatórios e auditoria | Navegação/contratos testados; sem série temporal global ou variações fictícias. Período permanece desabilitado com indicação de indisponibilidade |
| Minha instituição | Dados do cadastro e edição validada de nome, telefone e descrição | Salvamento com resposta de sucesso testado; não permite aprovar instituição ou promover responsável |
| Professores | Busca explicitamente limitada à página, paginação, convite e confirmação de desvinculação | Renderização/contrato e serviços testados; última atividade identificada como não fornecida pela API |
| Convites | Formulário nome/e-mail/turma opcional, estado, paginação, reenvio e cancelamento confirmado | Envio pela interface testado com mock; serviços/rotas de convites cobertos. Nenhum e-mail real; sem mensagem personalizada ou exportação fictícia |
| Turmas | Criar/editar/arquivar, ver alunos, gerar/desativar código, administrar entradas e designar/retirar professores | Delegação, retorno de alunos e regressão docente testados; operações de serviço usam autorização vigente |
| Alunos | Listagem geral institucional ou específica da turma e retorno ao painel correto | Contexto e cabeçalhos testados; sem acesso a alunos de instituições alheias |
| Desempenho acadêmico | Turmas, resultados e relatório individual | Navegação contextual e dados do contrato testados; gráfico temporal apresenta estado sem dados quando faltam resultados |
| Simulados | Rascunho, edição autorizada, seleção de questões/turmas e publicação | Criação/publicação institucional por responsável ALUNO testadas; publicado bloqueia edição. Serviços testam acesso após revogação e escopo |
| Relatórios | Resultados de turma e aluno, paginação e seleção | Consulta e retorno institucional testados; não existe botão de CSV/PDF sem contrato |
| Notificações | Lista paginada de mensagens da conta | Consulta e estado vazio testados; texto informa que a API não separa mensagens por instituição. Sem marcar leitura ou contador inventado |
| Configurações | Perfil/foto/segurança/preferências compartilhados e auditoria institucional | Composição, tema e endpoint restrito testados; não oferece configurações globais institucionais inexistentes |

Os handlers de botões, submissões de formulários, filtros e navegação foram revisados nos componentes próprios e compartilhados. O inventário automatizado registrou **813 ocorrências de controles visíveis nas 33 combinações de tela** (não são 813 controles distintos). Nenhum botão habilitado sem handler/formulário foi encontrado. Controles de paginação sem próxima página, edição de simulado publicado e filtros sem fonte correspondente ficam desabilitados.

Esse inventário confirma ligação de eventos; não é prova de execução exaustiva de todos os valores, estados, diálogos e combinações de cada formulário. Os fluxos executados no navegador e os testes de serviço/rota são discriminados a seguir, sem apresentar mocks como validação operacional real.

## Permissões, dados e regressão

- **ADMIN geral:** frontend mantém navegação administrativa própria; testes de backend rejeitam leitura/publicação pedagógica mesmo com contexto institucional forjado. Não foi concedido acesso pedagógico global.
- **Instituição:** responsável confirmado com vínculo administrativo ativo pode designar/retirar docentes diretamente; professor não solicita permissão de entrada em turma e não designa terceiros. Contextos de outras instituições são negados.
- **Revogação docente:** teste de serviço remove atribuição e verifica que o professor perde listagem, edição e publicação de turmas/simulados, mesmo mantendo autoria e IDs antigos. A leitura do catálogo também é limitada ao vínculo/escopo atuais. A revogação é conferida no backend.
- **Históricos:** testes mantêm questões, autoria, alunos e tentativas da fixture após retirada/substituição da delegação. As operações de atribuição alteram o relacionamento, não apagam os recursos. Nenhum dado compartilhado foi lido para esta confirmação: preservação foi verificada no código e nos mocks, não por comparação antes/depois no Supabase.
- **Aluno independente:** login e dashboard sem vínculo institucional permanecem disponíveis; consultas pessoais não enviam contexto administrativo. Regressão de metas e sequência de estudo também aprovada. O diagnóstico pessoal continua exigido quando aplicável.
- **Sessões/erros:** 401 remove sessão/painel; 403 e falha de rede não expõem métricas antigas nem simulam sucesso; nova tentativa é possível. Flag institucional desativada impede consultas/ações protegidas.
- **Responsável pessoal:** mantém identidade ALUNO/PROFESSOR e pode retornar ao seu contexto pessoal sem promoção de papel.

## Testes executados nesta auditoria

| Verificação | Resultado |
| --- | --- |
| Backend: seleção de 18 arquivos de autenticação, delegação, questões, instituições, convites, ativação, bootstrap e rotas | 386 testes aprovados ao final: 323 passaram na execução conjunta; 63 de `auth-security.test.ts` tiveram timeout no hook de importação e passaram ao repetir somente essa suíte com `--maxWorkers=1` |
| Backend: `goals-reports.test.ts` e `study-goal-streak.test.ts` | Mais 48 aprovados; total **434 testes direcionados**, sem suíte geral |
| Backend `npm.cmd run build` | TypeScript aprovado |
| Frontend `test-administration.mjs` | **53 cenários Chrome aprovados** com APIs simuladas, incluindo os onze módulos, delegação, simulados, edição institucional, Ver alunos, perfis existentes, contextos, 401/403/rede e flag desativada |
| Frontend `test-administration.cjs` | 15 verificações de renderização aprovadas |
| Frontend `test-admin-routing.cjs` | Aprovado; destinos e restrições por perfil |
| Frontend `test-institution-navigation.cjs` | Aprovado; onze módulos, vínculos, contexto, unicidade e estilos delimitados |
| Frontend `test-institution-visual.cjs` | 13 propriedades estruturais conferidas contra a exportação original |
| Frontend `npm.cmd run build` | `tsc -b` e Vite aprovados após a correção de Ver alunos |
| `git diff --check` | Sem erros de whitespace |

O build mantém o aviso de chunk principal acima de 500 kB. Vitest avisa sobre futura compatibilidade de carregamento da configuração CommonJS/ESM; nenhum desses avisos impediu os resultados finais.

O script de navegador usa perfil temporário, API substituída por fixtures, Vite em loopback e bloqueio de rede fora da origem local. Backend de produção não foi iniciado. Testes de rota usam servidores de teste em loopback e serviços/repositórios simulados. Credenciais/sessões de teste não são fallback da aplicação real.

## Comparação visual e capturas

Foram inspecionadas as capturas desktop dos onze módulos e amostras móveis/tema escuro. Comparação com `referencia-dashboard-institucional-v0/page.tsx` e `globals.css`: preservados grupos/ordem do menu, composição do cabeçalho, cards/painéis, tipografia de títulos, cores e estrutura da exportação. As 13 verificações reproduzíveis conferem cores-base, raio, sidebar de 266 px, cabeçalho de 78 px, largura máxima de 1490 px, paddings-base e proporções dos grids. Resultado em `visual-comparison.json`.

A marca real, contexto autenticado e componentes funcionais substituem os placeholders. A evolução global sem contrato permanece explicitamente indisponível. A comparação é estrutural e acompanhada de inspeção das imagens, não certificação pixel a pixel contra uma instância hospedada do v0. A aprovação visual final continua com a responsável.

Larguras 1440, 768, 720, 390 e 320 px verificadas nas seções representativas; as onze seções foram capturadas/verificadas em 1440 e 390 px, com teste de largura interna de botões. Menu móvel, recolhimento/expansão desktop e alternância de tema testados.

Pasta: **`frontend/.artifacts/institution-final-review/`**.

- `index.html`: galeria local dos onze módulos, sem serviços externos.
- `inventory.json`: controles visíveis por módulo/variante.
- `visual-comparison.json`: comparação estrutural com o CSS original.

Cada prefixo abaixo possui três arquivos PNG: `<prefixo>-desktop-light.png`, `<prefixo>-mobile-light.png` e `<prefixo>-desktop-dark.png` — **33 capturas**.

| Módulo | Prefixo |
| --- | --- |
| Visão geral | `overview` |
| Minha instituição | `institution` |
| Professores | `teachers` |
| Convites | `invitations` |
| Turmas | `classes` |
| Alunos | `students` |
| Desempenho acadêmico | `performance` |
| Simulados | `exams` |
| Relatórios | `reports` |
| Notificações | `notifications` |
| Configurações | `settings` |

As imagens levam o aviso “REVISÃO LOCAL · DADOS FICTÍCIOS · SEM SUPABASE”. Algumas representam estados vazios ou limitações reais de contrato, em vez de inserir registros ilustrativos na aplicação. Para regenerar, em `frontend`: `node scripts/test-administration.mjs`, depois `node scripts/test-institution-visual.cjs`. O script inicia/encerra o seu Vite e Chrome temporários; a galeria pode ser aberta diretamente do disco.

## Separação de prontidão antes da ativação

| Categoria | Situação |
| --- | --- |
| Implementado no código | Onze módulos, sessão/contexto, componentes compartilhados, operações ligadas aos endpoints e correções acima |
| Validado com mocks | Cenários e permissões detalhados nesta nota, navegação, responsividade, temas e capturas; nenhuma alegação de teste contra Supabase |
| Dependente de migration | Onboarding/convites da Fase B usa a migration local `20261105000100_teacher_invitation_onboarding`, inclusive nome do convidado/prova de e-mail/designação inicial. Seu estado remoto não foi consultado. Esta auditoria não cria nem aplica migration |
| Pendente de integração real | Confirmar esquema compatível em procedimento autorizado; testar transações, concorrência, sessões e preservação no ambiente isolado com PostgreSQL compatível antes da liberação compartilhada; provedor de e-mail/URL/callbacks com validação autorizada |
| Pendente de ativação | Regularizar legitimamente e-mails/vínculos dos nove professores conforme guard existente e obter autorização explícita para habilitar o módulo. Nenhuma confirmação automática ou instituição fictícia |
| Lacunas de produto identificadas | Série global/meta/variação por período, última atividade docente, exportações CSV/PDF, separação de notificações por instituição, ações de leitura e configurações globais não têm contratos completos e não são apresentadas como prontas |

Antes de qualquer aplicação compartilhada: confirmar migrations efetivamente pendentes, backup atualizado/recuperável e conexão segura, em etapa autorizada própria. Esta auditoria local não substitui essa verificação e não informa falsamente que o estado remoto está compatível.

## Arquivos alterados nesta auditoria

- `frontend/src/institution-dashboard.tsx`: callback institucional de alunos e remoção da ação duplicada.
- `frontend/src/class-exams.tsx`: callback opcional de navegação, preservando o padrão docente.
- `frontend/src/institution-dashboard.css`: correções responsivas e título duplicado, integralmente delimitadas.
- `frontend/scripts/test-administration.mjs`: regressão do destino de alunos, inventário de controles, teste de legibilidade e capturas/galeria.
- `frontend/scripts/test-institution-visual.cjs`: novo teste de comparação estrutural.
- Esta nota e artefatos de teste locais. Os demais arquivos já modificados anteriormente não foram descartados ou atribuídos a esta auditoria.
