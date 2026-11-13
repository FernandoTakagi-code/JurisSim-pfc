# Revisão de questões respondidas

Implementada em 13/11/2026 na branch `fernando/questoes-diagnostico-autoral`.

## Uso

Em **Questões → Revisar respondidas**, escolha **Somente erradas** ou **Todas as respondidas**, disciplina e assunto opcional. A seleção considera a última resposta original de cada questão em atividades concluídas. Atividades em andamento ficam fora para preservar o gabarito do simulado. Cada questão aparece uma vez na sessão.

Os tamanhos são 5, 10 e 20, conforme o histórico disponível. Quando houver entre uma e quatro questões, é possível revisar essa quantidade. Sem histórico elegível, a tela orienta concluir uma atividade ou mudar o filtro. Uma revisão em andamento no mesmo foco é retomada. As dez revisões mais recentes da disciplina ficam acessíveis pelo catálogo.

Confirme uma alternativa para receber a correção comentada. Depois da confirmação, a resposta fica bloqueada. É possível sair, retomar e consultar o resultado concluído novamente, inclusive após recarregar a página.

## Preservação

As sessões ficam na tabela própria `SessaoRevisaoQuestao`; não criam simulados nem respostas originais. Não alteram diagnóstico, nível, estatísticas das atividades originais ou estoque de questões inéditas. Uma resposta de revisão também não redefine o filtro de erros do histórico original.

O conteúdo é copiado do snapshot da atividade concluída, incluindo gabarito, comentário e identificação provisória. Para atividades antigas sem snapshot, usa-se o conteúdo atual válido do banco; não é possível reconstruir sua versão histórica. Gabarito e comentário só são enviados depois da confirmação da respectiva resposta, ou no resultado final. Cada sessão pertence exclusivamente ao aluno autenticado.

Questões provisórias continuam com revisão humana pendente. Esta funcionalidade não representa aprovação jurídica ou pedagógica do acervo.

## Banco e ativação

A migration `20261113010000_question_review_sessions` cria tabela separada, chave de proprietário, índice, validações JSON e RLS, restringindo acesso direto pelos papéis públicos. Foi aplicada no Supabase sem reset, preservando as 183 questões e as migrations existentes.

Ativação local: `QUESTION_REVIEW_SCHEMA_ENABLED=true`, `QUESTION_REVIEW_API_ENABLED=true` no backend e `VITE_QUESTION_REVIEW_UI_ENABLED=true` no frontend. Os exemplos ficam desativados por padrão. Outros ambientes precisam aplicar a migration e configurar as três flags; o push não configura esses ambientes automaticamente.

## Validação

- Nove testes de integração passaram em PostgreSQL descartável: revisão (dois), treino (cinco) e simulado individual (dois). Cobrem propriedade, autenticação, flags, exclusão de atividades incompletas, último erro, proteção do gabarito, confirmação, retomada, finalização e preservação dos resultados originais.
- 31 testes de regressão passaram nos serviços, repositório, lotes e rotas de treino. Os quatro testes HTTP precisaram de acesso à rede local fora da restrição do sandbox.
- Builds do backend e frontend passaram. O frontend mantém o aviso de bundle acima de 500 kB.
- Navegador autenticado: revisão de cinco questões, correção, saída e retomada, resultado após recarga, filtros e disponibilidade de uma questão; layout em 390 px sem transbordamento horizontal.
- A revisão técnica foi removida com backup privado. A conferência por hash confirmou que todas as tentativas, respostas originais e o nível da conta permaneceram intactos.
