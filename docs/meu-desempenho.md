# Meu desempenho

Implementação na branch `fernando/meu-desempenho`, a partir da main integrada pela PR #12.

## Fluxo do aluno

**Meu desempenho** passa a ter uma tela própria, independente do resultado do último diagnóstico. Há filtros para todas as atividades, diagnósticos, treinos, simulados individuais, simulados de turma e trilhas. Os números junto aos filtros representam atividades concluídas, não tentativas em andamento.

Os cartões mostram taxa de acerto, acertos, erros, quantidade de atividades e questões em branco. A taxa usa acertos divididos pelas respostas confirmadas. Uma questão em branco não entra nesse denominador. O detalhamento por disciplina permite filtrar os assuntos; esse filtro local não muda os cartões gerais do tipo de atividade selecionado.

Os assuntos são ordenados pelo número de erros e, em empate, pela menor taxa de acerto. O primeiro com erros aparece como sugestão de foco. Menos de três respostas recebe aviso de histórico pequeno. A lista começa com oito assuntos e permite mostrar mais. Há estados de carregamento, erro com nova tentativa e ausência de atividades concluídas.

## Cálculo e revisão

`GET /students/me/performance?kind=practice` fornece o resumo; `kind` é opcional e aceita somente as modalidades conhecidas. A identidade vem da sessão ALUNO, nunca de parâmetros. A resposta tem `Cache-Control: no-store` e não inclui gabarito ou IDs de alternativas.

Somente simulados originais concluídos entram nos cálculos. Revisões são armazenadas separadamente e não contam novamente. Respostas são vinculadas à questão atribuída, à tentativa e ao proprietário. Disciplina e assunto usam o snapshot da tentativa; quando não há cópia, usam o cadastro atual. Acertos e erros usam a correção registrada da resposta. Uma questão repetida em atividades distintas conta uma vez em cada atividade.

Os atalhos **Revisar meus erros** abrem o catálogo de revisão com disciplina e assunto preenchidos. Sua disponibilidade vem do mesmo serviço usado pela revisão: considera a última resposta original de cada questão entre atividades concluídas, valida o conteúdo e exclui questões ainda não compatíveis com a revisão. Essa seleção é global, mesmo quando o aluno filtra uma modalidade em Meu desempenho. Não inicia uma revisão automaticamente. As flags existentes da revisão e sua interface continuam sendo respeitadas.

O recorte que contém snapshots provisórios recebe aviso de piloto com revisão humana pendente. A tela não altera nível, respostas, aprovações ou resultados, e não representa nota oficial da OAB.

## Validação

- 1.052 testes unitários e de rotas passaram; incluem autenticação do novo endpoint, filtros, isolamento da identidade e rejeição de parâmetros extras.
- 23 integrações passaram em PostgreSQL 17.11 descartável. O novo cenário cobre as cinco modalidades, questões em branco, atividades incompletas e revisões excluídas, isolamento entre alunos, snapshots após edição do cadastro, revisão habilitada/desabilitada e igualdade de disponibilidade com o catálogo real. Confere que a leitura não modifica as atividades nem o nível.
- Builds do backend e frontend e linter aprovados. Permanecem avisos informativos já existentes sobre configuração do Biome e tamanho do bundle frontend.
- Nenhuma migration nem alteração de conteúdo necessária no Supabase. O endpoint é somente leitura.
- Navegador autenticado: total geral de 9 acertos em 35 respostas, treino de 2/5 (40%), modalidade sem entregas com estado vazio, filtro por disciplina, expansão da lista e atalho abrindo o assunto correto com três questões para revisar. Layout de 390 px sem transbordamento horizontal; nenhuma resposta nem finalização executada na conta real.
