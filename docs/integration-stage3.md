# Integração — etapa 3: histórico e desempenho persistidos

Trabalho na branch `entrega2809`. As alterações das etapas anteriores foram
mantidas. Não houve acesso ao Supabase, envio de e-mails, mudança de credenciais
ou arquivos `.env`, publicação, commit, push ou merge.

## Auditoria e decisões

Antes da implementação foram revisados o schema, os repositórios, serviços,
controladores e rotas de diagnóstico/trilha, a autenticação e as páginas do aluno.

- `Simulado` já registra aluno, tipo, início e conclusão de diagnósticos e
  exercícios personalizados.
- `QuestaoSimulado` registra as questões atribuídas e sua ordem. `Resposta`
  registra a alternativa selecionada e o resultado da correção.
- `DesempenhoDiagnostico` já armazena as métricas do diagnóstico finalizado.
  `TrilhaAdaptativa` guarda a recomendação e o vínculo com os exercícios gerados.
- Os endpoints de diagnóstico já permitiam consultar resultado e recomendação de
  uma tentativa conhecida, verificando sua propriedade. Foram reutilizados.
- Faltavam histórico paginado, resumo por aluno e consulta de resultado de uma
  trilha concluída. O frontend mantinha resultados somente na memória da página.
- Não foi necessária tabela nova, cópia/backfill de resultados, criação de dados
  demonstrativos ou alteração do mecanismo de autenticação.

## Endpoints

| Endpoint | Comportamento |
| --- | --- |
| `GET /students/me/overview` | Totais das atividades concluídas, últimos 30 diagnósticos para evolução, cinco atividades recentes e ID do último diagnóstico concluído com questões |
| `GET /students/me/activities?limit=20&cursor=...` | Tentativas de diagnóstico e trilha, concluídas ou em andamento, da mais recente à mais antiga |
| `GET /students/me/diagnostics?limit=20&cursor=...` | Mesma paginação, restrita a diagnósticos |
| `GET /trilhas/attempts/:attemptId/result` | Resultado persistido de uma trilha concluída, recalculado pelo motor existente a partir das respostas gravadas |

`GET /diagnostics/:attemptId/result` continua sendo a consulta do resultado de
diagnóstico. Sua resposta recebeu campos aditivos `answeredQuestions`,
`incorrectAnswers` e `unansweredQuestions`, mantendo os campos anteriores.
Resultados e novas consultas enviam `Cache-Control: no-store`.

As rotas `/students/me` exigem JWT válido, versão atual de sessão, conta existente
e não excluída, e-mail confirmado e perfil **ALUNO consultado no banco**. O ID do
aluno vem exclusivamente do middleware. Não há parâmetro para escolher outro
aluno; parâmetros desconhecidos são rejeitados. Histórico alheio não pode ser
consultado mudando query strings, JWT antigo ou URL do frontend.

O endpoint novo de resultado de trilha usa as verificações de propriedade já
existentes no serviço: tentativa alheia retorna 403, inexistente retorna 404 e
tentativa ainda aberta retorna 409. A consulta de diagnóstico mantém o 404 para
tentativa alheia. As novas consultas de histórico rejeitam professor e ADMIN.

## Definições dos indicadores

- Acertos e respostas erradas vêm do campo `Resposta.correta` da resposta vinculada
  à questão atribuída. Uma questão sem resposta não é contada como resposta errada.
- Não respondidas = questões atribuídas menos respostas vinculadas.
- O percentual de cada tentativa mantém a regra do motor existente: acertos
  divididos pelo total de questões atribuídas. Não respondidas reduzem esse
  percentual, mas são identificadas separadamente.
- Totais gerais incluem somente atividades finalizadas, com diagnósticos e trilhas
  identificados separadamente. Atividades abertas aparecem no histórico com seu
  progresso; acertos, erros e pontuação permanecem ocultos até sua conclusão.
- Evolução compara somente diagnósticos concluídos, evitando misturar exercícios
  personalizados de escopos diferentes. A variação é exibida em **pontos
  percentuais**, entre o primeiro e o último dos até 30 registros exibidos.
- Com um único diagnóstico não é calculada uma variação. Sem atividades, as telas
  mostram estados vazios. Sem questões atribuídas, uma tentativa não recebe
  percentual artificial nem é usada para escolher o último diagnóstico recuperável.

## Frontend

- O dashboard original mantém cabeçalho de conteúdo, recomendação, três cartões,
  disciplinas e os painéis originais. Somente suas fontes de dados, estados vazios
  e conteúdos dos painéis de evolução/atividade foram conectados à persistência.
  O CSS original não foi alterado e o dashboard não foi recriado.
- Ao montar a área autenticada do aluno, consulta-se o resumo e, se existir,
  recupera-se o último diagnóstico com o endpoint de resultado existente.
  Recarregar, sair e autenticar novamente recupera os dados pela API.
- `/historico` usa a API paginada, filtro de diagnósticos e paginação anterior/próxima.
- `/resultados/diagnostico/:id` e `/resultados/trilha/:id` consultam o resultado real,
  aceitam recarga direta e funcionam com voltar/avançar do navegador.
- `/desempenho` mostra indicadores agregados, evolução e o último resultado disponível.
  É possível consultar desempenho durante uma trilha e voltar à tentativa em memória.
- Resultados de um diagnóstico em execução permanecem separados do último resultado
  salvo: estudar novamente não apaga o resultado persistido do dashboard.
- A conclusão de diagnóstico/trilha atualiza o resumo. Navegar para perfil e voltar
  não dispara novas consultas de resumo. Páginas de histórico e detalhes consultam
  somente os registros necessários à página atual.
- Falhas têm erro e ação de nova tentativa; não se transformam em sucesso vazio.
  Respostas atrasadas após desmontar a área do usuário não atualizam a conta seguinte.
- Nome, configurações, temas, sidebar, logout, dashboard e CRUD do professor foram
  preservados. Nenhum componente dos recursos excluídos desta etapa foi implementado.

## Consultas e migration

Migration incremental: `20261017120000_student_history_indexes/migration.sql`.

Ela adiciona somente os índices de `Simulado`:

- `(alunoId, iniciadoEm, id)`, para histórico com paginação por cursor.
- `(alunoId, finalizadoEm, id)`, para diagnósticos concluídos e última tentativa.

Não altera tabelas, enums, valores, credenciais ou migrations anteriores. A
paginação tem limite padrão 20 e máximo 50. O cursor combina data e ID, inclusive
quando várias tentativas têm o mesmo horário, evitando paginação por offset.
Datas do cursor são comparadas explicitamente com `timestamp(3)`, preservando a
semântica do schema sem sofrer deslocamento pelo fuso do servidor PostgreSQL.

O resumo usa três consultas em uma transação `RepeatableRead`, com agregação no
banco e relações contadas sem N+1. Evolução, atividade recente e páginas são
limitadas. A consulta do resultado reaproveita o contrato e o motor existentes.
Não há polling ou cache persistente de dados de outro usuário no navegador.

## Arquivos desta etapa

| Arquivo | Mudança |
| --- | --- |
| `backend/prisma/schema.prisma` | Dois índices de histórico |
| `backend/prisma/migrations/20261017120000_student_history_indexes/migration.sql` | Migration incremental somente de índices |
| `backend/src/repositories/student-history-repository.ts` | Consultas privadas, resumo e paginação |
| `backend/src/routes/student-history-routes.ts` | Endpoints autenticados e validação de query/cursor |
| `backend/src/routes/student-history.test.ts` | Testes HTTP de autorização, contrato e paginação |
| `backend/src/server.ts` | Registro de `/students/me` |
| `backend/src/controllers/diagnostic-controller.ts` | Contagens aditivas e resultado sem cache |
| `backend/src/services/trail-service.ts` | Recuperação do resultado de exercícios concluídos |
| `backend/src/controllers/trail-controller.ts` | Resposta da consulta de resultado de trilha |
| `backend/src/routes/trail-routes.ts` | Registro da consulta de resultado |
| `backend/scripts/test-migrations-local.cjs` | Validação aditiva da migration e execução dos testes novos no cluster próprio |
| `backend/scripts/test-student-history-db.ts` | Persistência e isolamento com repositórios, rotas e login reais no PostgreSQL descartável |
| `frontend/src/student-progress.tsx` | Carregamento do resumo, indicadores, histórico e resultados |
| `frontend/src/student-progress.css` | Estilos dos conteúdos de histórico e indicadores |
| `frontend/src/main.tsx` | Ligação da área do aluno aos dados persistidos |
| `frontend/src/integration-shell.tsx` | Liberação da página de histórico real na moldura existente |
| `frontend/scripts/test-session.mjs` | Regressão e novos cenários de persistência da interface |
| `frontend/scripts/test-legal.mjs` | Compatibilidade com resumo, diagnóstico e navegação de trilha |
| `docs/integration-stage3.md` | Auditoria, contratos, validação e limites |

## Testes executados

Validação local em 17/10/2026:

- **223 testes em 15 suítes** de backend aprovados, incluindo 21 novos testes HTTP
  de autorização, paginação, cursor, limite e tratamento de falha.
- PostgreSQL **17.11 descartável**, criado pelo harness em diretório temporário
  próprio, porta efêmera e bind exclusivo em `127.0.0.1`:
  - atualização das migrations históricas, preservação dos dados das 15 tabelas,
    nove migrations em instalação nova, segunda aplicação sem pendências e diff
    sem divergência de schema;
  - checksums das migrations anteriores preservados;
  - **seis cenários de histórico/persistência** com login e HTTP reais, aluno com e
    sem atividades, diagnóstico parcial/finalizado, contagens, trilha existente,
    paginação com datas iguais, limite de evolução, isolamento, JWT expirado,
    exclusão, confirmação, perfil atual, reconexão ao banco e login novo;
  - **sete cenários anteriores de revogação de sessão** novamente aprovados;
  - clusters encerrados ao fim; artefatos locais de teste retidos.
- **34 cenários no Chrome** aprovados com API simulada e bloqueio de rede externa,
  incluindo reload, logout/login, histórico paginado, resultados, indicadores,
  estados vazios, retry, isolamento da interface, login por perfil, CRUD, temas e
  navegação desktop/celular. Fixtures são exclusivas dos testes.
- Regressão `test-legal.mjs`: dashboard original, diagnóstico, trilhas, documentos,
  confirmação e recuperação. Inclui consulta de desempenho durante uma trilha.
- TypeScript de backend e frontend aprovado com
  `tsc --noEmit --incremental false`.
- Build de produção do Vite aprovado em pasta temporária própria com API local de
  teste, preservando a saída de build existente. Capturas de dashboard preenchido,
  histórico e desempenho foram inspecionadas; ausência de overflow verificada em
  1366 e 390 pixels.

O teste real de banco e os testes de navegador têm escopos distintos: o primeiro
exercita persistência/HTTP/autorização reais; os navegadores exercitam os fluxos de
UI com respostas isoladas. Não foi feita homologação no ambiente remoto.

## Riscos restantes e próxima autorização

- A migration está preparada e validada somente em banco descartável. A aplicação
  no ambiente real exige autorização separada. `CREATE INDEX` pode bloquear
  escritas durante a construção; planejar a janela conforme o volume real.
- Os totais agregam as atividades concluídas do aluno; o custo cresce com seu
  histórico individual. Listas e evolução são limitadas e os acessos têm índices,
  mas volumetria e planos de execução do ambiente real não foram medidos.
- Dados legados que não têm questões atribuídas ou respostas vinculadas não são
  inventados ou reconstruídos. A correção segue a estrutura usada pelo motor atual.
- O histórico registra tentativas de diagnóstico e exercícios. Não cria rastreamento
  de navegação nem transforma leitura de questões em resposta registrada.
- Tentativas em andamento aparecem no histórico. Retomar uma tentativa depois de
  recarregar não foi implementado; a recuperação solicitada é do diagnóstico concluído.
- O resultado individual antigo é recalculado pelo motor atual a partir das respostas
  registradas, seguindo o comportamento existente. Mudanças futuras nas regras de
  classificação exigirão decidir sobre versionamento do motor/snapshots.
- A hospedagem deve manter fallback das rotas internas para o `index.html` do Vite.
  Não houve publicação nem mudança da infraestrutura.

A etapa 4, recursos de turmas/simulados do professor/metas/foto e intervenções no
ambiente real continuam fora do trabalho autorizado nesta etapa.
