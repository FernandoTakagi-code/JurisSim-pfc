# Revisão da área do professor — 16/11

Alterações avaliadas no localhost e aprovadas por Fernando para commit e push na `entrega-16-11`. Sem publicação ou merge na main.

## Comportamento

- Início com hierarquia mais compacta, ações para preparar simulado e criar turma, três indicadores e quatro atalhos. O indicador agregado foi identificado como avaliações publicadas, pois inclui simulados e atividades; não apresenta essa contagem como se fossem apenas simulados.
- Desempenho reúne resultados das turmas e relatórios individuais. Links antigos de Relatórios redirecionam preservando os identificadores e a consulta. As consultas continuam usando os mesmos endpoints autorizados. Os textos dos indicadores compartilhados usam avaliações, pois os resultados também incluem atividades; nenhuma regra de agregação do backend foi alterada.
- Turmas abre o formulário por ação explícita e mantém as operações de manutenção em Mais ações. Formulário do aluno para ingresso permanece separado.
- Simulados do professor usa busca, filtros, resumo e o formulário em quatro etapas já existente. O atalho de uma turma preserva essa seleção na criação. A listagem deixa claro que o professor gerencia simulados de sua autoria; as permissões de autoria não foram ampliadas.
- Atividades usa um estado vazio único e filtros de situação. O editor tem busca por enunciado/disciplina na página carregada e uma área de questões com rolagem. Não promete pesquisar o banco inteiro. A seleção existente é preservada ao pesquisar.
- A mensagem antiga de rascunho é limpa quando uma ação posterior, como publicação, é concluída.
- Nova questão apresenta as turmas ativas para escolha, em vez de redirecionar silenciosamente para Gestão de turmas. O cadastro continua privado e vinculado à turma, com autorização pelo backend.
- Solicitações de matrícula do professor só são consultadas quando o recurso está habilitado. Corrigido o desvio de `requestsOnly` que consultava a API mesmo com a capacidade desligada. Cadastro manual e consulta de matriculados continuam disponíveis nas permissões existentes.
- Estilos do professor com controles consistentes, foco visível, estados vazios, contraste nos filtros, blocos menores e adaptação ao menu móvel. Elementos `hidden` permanecem ocultos mesmo quando o componente define `display`.

## Verificação

Build do frontend e suíte `test:delivery-static`, incluindo testes novos de rotas antigas, seleção de turma/aluno e disponibilidade das solicitações. Scripts de navegador existentes foram atualizados e conferidos com `node --check`; não foram executados por automação externa de navegador.

Conferência manual pela interface no localhost com API e PostgreSQL reais descartáveis: criação de turma; criação/publicação e consulta de resultados de atividade; criação/publicação de simulado; seleção inicial da turma; cadastro de questão privada; busca vazia e cancelamento do editor; consulta de alunos; navegação de desempenho; início e menu em 390 px. Registros técnicos sintéticos, sem alterações no Supabase, no Render ou na Vercel.

Prévia funcional em `http://127.0.0.1:5190/professor`, servida pela cópia local de teste. O ambiente de demonstração permanece separado da configuração publicada.
