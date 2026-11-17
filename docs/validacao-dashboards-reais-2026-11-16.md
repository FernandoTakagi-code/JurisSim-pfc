# Validação dos dashboards reais — 16/11/2026

Validação em andamento na branch `entrega-16-11`, versão consolidada `df01e20` com as alterações locais preservadas. Não foi repetida a auditoria de branches. Nenhuma alteração visual ou de Perfil e configurações foi feita nesta etapa.

## Execução confirmada

- Frontend: `http://localhost:5173`, instâncias IPv4 e IPv6 desta pasta; código servido aponta para `http://127.0.0.1:3333`.
- Backend: PID 48024, `backend/dist/server.js` desta pasta; `/health` HTTP 200.
- Disponibilidade real da API: `administrationEnabled=true`, `enabled=false`; capacidades ADMIN de visão geral, instituições, solicitações, usuários e auditoria habilitadas. Gestão independente de professores habilitada; gestão institucional de simulados e operações institucionais gerais desabilitadas.
- `.env` compartilhado preservado. Capacidade ADMIN e proteção de leitura são configurações exclusivas do processo local autorizado.
- Supabase respondeu novamente à consulta com transação `READ ONLY`; nenhum dado foi alterado por essa consulta.
- Requisições sem credenciais a sessão, instituições, turmas, questões, avaliações e atividades retornaram HTTP 401. Isso confirma bloqueio anônimo, não comprova isolamento entre contas autenticadas.
- As rotas frontend testadas retornaram o documento HTML. Esse HTTP 200, isoladamente, não comprova renderização nem carregamento autenticado.

## Matriz de navegação

| Perfil/tela | Rotas | Evidência obtida | Disponibilidade e problemas | Pronto para alteração visual? |
| --- | --- | --- | --- | --- |
| ADMIN — Visão geral | `/administracao` | Usuário confirmou login real e renderização após Ctrl+Shift+R; log local registra `/admin/summary` HTTP 200 com papel ADMIN | Indicadores reais confirmados pelo usuário: 15 contas, 10 alunos, 2 professores vinculados, 3 instituições, 3 turmas ativas, 2 simulados publicados. Atividades publicadas/concluídas indisponíveis | Sim, quanto à visão geral validada; preservar indisponibilidade real de atividades |
| ADMIN — Instituições e Solicitações | `/administracao/instituicoes`, `/administracao/solicitacoes` | `/admin/institutions` HTTP 200 autenticado observado; confirmação visual específica solicitada | Capacidade ativa; não executar aprovações, edição ou criação | Aguardar confirmação visual específica |
| ADMIN — Usuários | `/administracao/usuarios` | Capacidade ativa; confirmação de consulta autenticada ainda pendente | Não modificar permissões ou contas | Ainda pendente de validação |
| ADMIN — Auditoria | `/administracao/auditoria` | `/admin/logs` HTTP 200 com papel ADMIN observado; confirmação da listagem visual solicitada | Eventos consultados, sem executar operações administrativas | Aguardar confirmação visual específica |
| INSTITUIÇÃO | `/instituicoes`, seções internas de professores, convites, turmas, alunos, desempenho e simulados | Estrutura, vínculos e capacidades consultados; sessão institucional desta rodada ainda não validada | Gestão independente de professores ativa; operações gerais e gestão de simulados desativadas; há uma turma sem vínculo institucional, não corrigida sem autorização | Ainda pendente de navegação real |
| PROFESSOR | `/professor`, `/professor/turmas`, `/professor/alunos`, `/professor/questoes`, `/professor/simulados`, `/professor/atividades`, `/professor/relatorios` | Rotas existentes; login e navegação real desta rodada solicitados | Atividades dependem de `ClassActivity`; exclusão lógica de `ClassLifecycle`; encerramento/arquivamento de simulados de `ClassExamSettings` | Ainda pendente de navegação real |
| ALUNO | `/dashboard`, `/estudar`, `/turmas`, `/questoes`, `/simulados`, `/trilha`, `/desempenho`, `/historico`, `/metas` | Rotas existentes; sessão real desta rodada ainda não validada | Atividades de turma dependem de estrutura ausente; exercícios dependem de questões elegíveis. Não iniciar tentativas durante validação somente leitura | Ainda pendente de navegação real |
| Perfil e configurações | `/perfil`, `/professor/perfil`, `/administracao/perfil` | Usuário confirmou funcionamento aprovado; hashes dos cinco arquivos protegidos permanecem iguais ao registro anterior | Sem alteração de layout, abas ou comportamento | Fora do escopo de alterações; preservar |

## Dependências específicas confirmadas

`ClassLifecycle`, `ClassActivity` e `ClassExamSettings` continuam ausentes no Supabase. São estruturas previstas nas migrations pendentes `20261115193000_class_lifecycle` e `20261115203000_class_activities`. Não foram aplicadas. `Atividade` histórica existe e não substitui `ClassActivity` nem deve ser unificada nesta etapa.

As três migrations históricas de estruturas docentes constam aplicadas, com os checksums originais já conferidos. Não há motivo para reexecutá-las.

O aviso ADMIN anterior decorreu da execução sem capacidade administrativa; após a ativação somente no processo e atualização completa do navegador, o usuário confirmou seu desaparecimento. Não foi necessário alterar layout ou permissões da conta.

## Limite da validação

Durante a navegação posterior, os logs também registraram `/auth/session` HTTP 200 para ALUNO e PROFESSOR, consultas HTTP 200 para dashboard, overview, resultado, desempenho e disponibilidade de conteúdo, além de summary institucional, turmas, alunos, convites, notificações e auditoria institucional. O responsável institucional pode ter papel-base ALUNO e vínculo INSTITUTION_ADMIN; o papel-base sozinho não permite classificar essa sessão como dashboard do aluno. A confirmação visual específica das telas ainda foi solicitada. Houve respostas HTTP 503 em rotas registradas apenas como `/`; esse formato de log não permite atribuí-las inequivocamente a um módulo. O serviço de atividades comprovadamente gera 503 quando `ClassActivity` está ausente, mas a associação a cada requisição depende da mensagem da tela, ainda não confirmada.

Não há sessão conectada de controle do navegador. A evidência visual depende da navegação legítima do usuário, correlacionada aos logs HTTP autenticados do backend. Não foram extraídos tokens, solicitadas senhas, criadas sessões ou usadas contas fictícias. Etapas pendentes não são declaradas aprovadas.

Não foram executados builds novamente nesta etapa porque nenhum código executável foi alterado. Permanecem os resultados anteriores da versão em execução: builds frontend/backend e 1.482 testes unitários aprovados. Esses testes não substituem a validação real em andamento.
