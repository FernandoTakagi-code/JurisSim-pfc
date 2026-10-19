# Integração — etapa 5: metas e relatórios persistidos

Implementada na branch `entrega2809`, mantendo a aplicação existente. Não houve
acesso ao Supabase, alteração de `.env`/credenciais, envio de e-mails, publicação,
commit, push ou merge. Foto, avatares e câmera permanecem fora desta etapa.

## Auditoria e decisões

Antes de modificar os arquivos foram revisados o schema Prisma, os serviços de
turmas/simulados, os registros de respostas e desempenho, o histórico, a sessão,
a navegação e os componentes existentes.

- `MetaDiaria` já possui data, quantidade-alvo, questões resolvidas, conclusão e
  aluno. Foi reutilizado integralmente; não foi criada outra tabela de metas.
- `Resposta`, `QuestaoSimulado` e `Simulado` permitem calcular progresso real,
  respeitando a propriedade da tentativa e o vínculo da resposta com a questão.
- `Avaliacao`, suas turmas destinatárias e os vínculos de matrícula/gestão permitem
  relatórios sem duplicar provas, respostas ou alunos.
- Não existiam endpoints de metas ou relatórios. As páginas correspondentes
  estavam sinalizadas como indisponíveis na moldura integrada.
- A única mudança de schema é a adição de dois índices. Nenhum dado anterior foi
  apagado, reconstruído ou sobrescrito por migration.

## Endpoints

Todos exigem JWT atual, conta ativa, confirmação de e-mail e versão de sessão
válida. Os middlewares de autenticação anteriores foram preservados. Respostas
recebem `Cache-Control: no-store`.

| Método e rota | Comportamento |
| --- | --- |
| `GET /goals?page=1&status=pending` | Metas do próprio aluno; filtro opcional `pending`/`completed`, páginas de 20 |
| `POST /goals` | Cria meta com `{ date: "YYYY-MM-DD", targetQuestions: 10 }` |
| `PATCH /goals/:id` | Edita data/quantidade de meta própria ainda pendente |
| `POST /goals/:id/complete` | Verifica progresso real, registra conclusão e retorna o registro; idempotente |
| `GET /reports/classes?page=1` | Turmas nas quais o professor/ADMIN possui vínculo explícito de responsabilidade |
| `GET /reports/classes/:id?page=1&examPage=1` | Resumo, participação, simulados, alunos e evolução da turma autorizada |
| `GET /reports/classes/:id/students/:studentId?page=1` | Desempenho individual nos simulados publicados para essa turma |

Datas novas devem ser válidas entre 2000 e 2100; quantidade é inteira entre 1 e
1000. Campos desconhecidos, autoria forjada, contadores enviados pelo cliente,
conclusão arbitrária e paginação fora de limites são rejeitados.
As listas de relatórios usam páginas de 20 itens; evolução usa até 30 pontos.

## Regras das metas

- Somente ALUNO pode acessar a API de metas. O aluno é obtido do middleware,
  jamais de um campo do cliente. Acesso a uma meta alheia retorna 404.
- Cada resposta vinculada a uma questão de tentativa própria conta uma vez.
  Diagnósticos, trilhas e simulados de turma participam do progresso; acertos e
  respostas erradas contam como prática. Alterar a alternativa de uma resposta
  existente não cria outra questão resolvida.
- O dia é definido pelo timestamp `Resposta.respondidoEm`, convertido de UTC para
  `America/Sao_Paulo`. O limite inicial do dia é inclusivo e o próximo dia exclusivo.
  O teste cobre precisamente as transições 02:59:59/03:00:00 UTC.
- A data da meta representa um dia de calendário; novas datas são normalizadas
  para meia-noite UTC no campo existente, sem deslocar o dia exibido no navegador.
- Metas pendentes consultam contagens reais a cada carregamento. A consulta não
  grava progresso fictício nem faz polling. Criar/editar também grava a contagem
  real disponível no campo `questoesResolvidas`.
- Conclusão exige contagem real maior ou igual à quantidade-alvo, mesmo que o
  cliente tente chamar o endpoint diretamente. A transação grava `cumprida` e
  `questoesResolvidas` verificados; a conclusão repetida devolve o mesmo registro.
- Metas concluídas ficam somente para consulta. A contagem da conclusão permanece
  como snapshot do progresso efetivamente verificado, preservando seu registro.
- Metas na mesma data acompanham o mesmo conjunto de respostas. Não foi adicionada
  unicidade destrutiva nem atribuição artificial de questões a metas diferentes.
  Os alvos não devem ser somados como se representassem práticas distintas.
- O progresso usa o horário de registro da resposta existente. Em simulados nos
  quais a edição de alternativa atualiza `respondidoEm`, uma resposta ainda não
  consolidada em meta concluída pode passar a contar para o dia da edição.

Mutações usam transações `Serializable`, bloqueio da meta e tratamento de conflitos.
Listagem usa snapshot `RepeatableRead`, uma consulta paginada de metas e uma
agregação das respostas para os dias necessários, evitando uma consulta por meta.

## Escopo e cálculos dos relatórios

- Professor só consulta turma com seu vínculo `professores`. **ADMIN também precisa
  desse vínculo para relatórios**; as permissões globais de gestão de metadados da
  etapa 4 não foram convertidas em acesso global a resultados individuais.
- O escopo combina a turma destinatária da prova e sua matrícula atual. Em prova
  compartilhada entre A e B, o relatório de A exclui alunos exclusivos de B.
- Consulta individual exige aluno ativo com perfil ALUNO matriculado na turma.
  Mesmo um aluno matriculado em A e B não tem provas exclusivas de B exibidas no
  relatório individual de A.
- Diagnósticos e trilhas pessoais são excluídos dos relatórios do professor. São
  incluídas somente tentativas `AVALIACAO` de simulados publicados para a turma.
- Não são expostos gabarito, alternativas escolhidas, metas pessoais, convites,
  credenciais ou resultados de outras turmas.
- Participação = alunos distintos com tentativa iniciada / alunos atualmente
  matriculados. Quando não há matriculados ou simulados publicados, o percentual
  é ausente e a interface informa que não há oportunidades.
- Tentativas iniciadas, concluídas, em andamento e expiradas são contadas de
  registros reais. Tentativas abertas/expiradas não recebem pontuação antecipada.
- Acertos, respostas erradas e não respondidas vêm das respostas vinculadas às
  questões atribuídas, seguindo a correção existente. Não respondidas não são
  somadas novamente como respostas erradas.
- Médias percentuais são médias aritméticas dos percentuais das tentativas
  concluídas; quantidades médias de acertos/erros também são exibidas. O denominador
  dos percentuais é o total de questões atribuídas, conforme a regra atual.
- Sem resultados, médias são `null`, com estado “Sem resultado”; não recebem 0%
  artificial. Contagens zero de matrículas/tentativas são contagens reais.
- Evolução da turma usa até 30 simulados com resultados, ordenados por publicação;
  a individual usa até 30 tentativas concluídas ordenadas pela conclusão. Variação
  é expressa em pontos percentuais e o gráfico só aparece com pelo menos dois pontos.
- As questões e os participantes podem mudar entre provas; o gráfico descreve as
  médias registradas e não afirma ganho de aprendizagem de uma coorte fixa.
- Os relatórios usam matrículas e perfis atuais, não uma composição histórica
  reconstruída. Turmas arquivadas continuam consultáveis pelos responsáveis.

O relatório usa autorização e uma agregação SQL em transação `RepeatableRead`.
Os CTEs de matrícula, simulados e tentativas são reutilizados; não são carregados
textos de questões nem executadas consultas individuais por aluno. Paginação de
alunos e simulados é independente.

## Frontend

- `/metas`: criação, edição, filtros, progresso real e conclusão, com estados vazios,
  carregamento, erro e nova tentativa. Dados são recuperados após recarga/login.
- `/professor/desempenho` e `/professor/relatorios`: seleção de turma autorizada e
  consulta dos indicadores; turma selecionada usa `/turmas/:id` no final da rota.
- `/professor/relatorios/turmas/:id/alunos/:studentId`: desempenho individual.
- Gráficos responsivos de linha e barras segmentadas usam os valores da API,
  legendas, tooltips, rótulos acessíveis e lista alternativa dos pontos. Pontos
  podem receber foco por teclado. Há estados específicos para dados insuficientes.
- Temas claro/escuro/sistema permanecem na moldura anterior. Menus e breadcrumb
  reconhecem também as páginas internas de relatórios/desempenho.
- O trecho JSX do dashboard original foi comparado textualmente com o início da
  etapa e permaneceu idêntico. Seu CSS original também permaneceu intacto.
  Turmas, simulados, diagnóstico, trilhas, CRUD, perfil, logout e autenticação foram
  preservados.
- Não foram instaladas dependências ou criados outro projeto/frontend, fotos,
  avatares, câmera, exportações de relatórios ou dados de demonstração na aplicação.

## Migration incremental

`backend/prisma/migrations/20261017180000_goals_reports_indexes/migration.sql`
adiciona somente:

- `MetaDiaria(alunoId, data, id)` para consultas de metas do aluno.
- `Resposta(simuladoId, respondidoEm)` para contagens por tentativa/data.

Não modifica valores, enums ou migrations anteriores e não exige backfill de metas.
Os índices anteriores de tentativas, questões e relações de turma são reutilizados.

## Arquivos desta etapa

| Arquivo | Mudança |
| --- | --- |
| `backend/prisma/schema.prisma` | Dois índices aditivos |
| `backend/prisma/migrations/20261017180000_goals_reports_indexes/migration.sql` | Migration incremental de índices |
| `backend/src/services/study-goal-service.ts` | Metas privadas, progresso e conclusão verificada |
| `backend/src/services/class-report-service.ts` | Agregações e isolamento de relatórios |
| `backend/src/routes/goals-reports-routes.ts` | Contratos e validação dos endpoints |
| `backend/src/routes/goals-reports.test.ts` | 44 testes HTTP novos |
| `backend/src/server.ts` | Registro de `/goals` e `/reports` |
| `backend/scripts/test-goals-reports-db.ts` | Persistência, métricas, timezone e isolamento reais |
| `backend/scripts/test-migrations-local.cjs` | Validação aditiva da migration e execução da suíte nova |
| `frontend/src/goals-reports.tsx` | Metas, relatórios, gráficos e consulta individual |
| `frontend/src/goals-reports.css` | Estilos locais e responsivos |
| `frontend/src/main.tsx` | Rota de metas na área do aluno |
| `frontend/src/ProfessorArea.tsx` | Rotas dos relatórios sem substituir o CRUD |
| `frontend/src/integration-shell.tsx` | Remoção dos estados indisponíveis implementados e destaque das rotas internas |
| `frontend/scripts/test-session.mjs` | Novos cenários de metas/relatórios e regressões |
| `docs/integration-stage5.md` | Auditoria, contratos, cálculo, testes e limites |

## Validação local

- **311 testes em 17 suítes de backend aprovados**, incluindo 44 novos testes de
  autenticação, perfis, confirmação, campos forjados, datas, quantidades e contratos.
- PostgreSQL **17.11 descartável**, com diretório próprio, bind `127.0.0.1`, porta
  efêmera e validação do diretório/URL antes de acessar dados:
  - onze migrations em instalação nova, segunda aplicação sem pendências, atualização
    com dados históricos preservados e diff sem drift;
  - checksums das migrations anteriores inalterados, incluindo metas já gravadas;
  - **sete cenários novos** com login/HTTP/repositórios reais: estados vazios,
    participação/médias, prova compartilhada, relatório individual isolado,
    ADMIN com vínculo explícito, timezone, diagnósticos/trilhas/provas, metas,
    conclusão, snapshot, campos forjados, confirmação/revogação, paginação e novo login;
  - os vinte cenários anteriores de revogação, histórico e turmas/simulados passaram;
  - cluster encerrado; artefatos de teste retidos localmente.
- **48 cenários no Chrome aprovados**, com API simulada e bloqueio de rede externa:
  metas, edição, progresso, conclusão, filtros, recarga/login, relatórios, gráficos,
  consulta individual, acesso negado, dados insuficientes, retry e todas as regressões
  anteriores de turmas, provas, sessão, dashboard, CRUD e temas.
- Capturas em 1366 e 390 pixels: metas e relatórios; gráficos em claro/escuro
  inspecionados. Verificação de ausência de overflow horizontal aprovada.
- `test-legal.mjs`: dashboard, diagnóstico, trilha, documentos, confirmação e
  recuperação aprovados.
- TypeScript de frontend e backend aprovado com `tsc --noEmit --incremental false`.
- Build do Vite aprovado em pasta temporária própria com API local de teste,
  preservando a saída de build existente.

Fixtures e contas confirmadas existem somente nos testes. O harness cria seu
próprio cluster e substitui as URLs por conexões locais explícitas. Nenhum bypass
foi adicionado ao código da aplicação. Não houve testes de SMTP/Google reais.

## Riscos e limites restantes

- Aplicação da migration/publicação em ambiente real requer autorização separada.
  `CREATE INDEX` pode bloquear escritas; planejar a janela conforme o volume real.
- Metas concluídas ficam somente para consulta. Não há exclusão, reabertura,
  distribuição de respostas entre metas ou atividades de leitura sem registro.
- Progresso pendente usa o timestamp disponível da resposta; o sistema anterior
  não mantém um histórico completo de cada edição de alternativa.
- Relatórios usam matrícula atual e simulados da turma. Não incluem diagnósticos
  pessoais, análise causal de aprendizagem, coortes históricas, PDF ou exportações.
- Totais agregam os registros do escopo autorizado; custos crescem com o histórico.
  Paginação/índices foram validados localmente, mas não houve teste de carga,
  medição de planos/latência ou homologação no ambiente remoto.
- Não há polling: navegação, recarga e novas consultas atualizam as telas. A
  hospedagem deve preservar o fallback das rotas para o `index.html` do Vite.

A etapa 6 continua fora do escopo autorizado.
