# Correção do catálogo de assuntos do aluno — 16/11/2026

## Git

Alterações locais preservadas em cópia de recuperação antes da edição. O fetch encontrou `0f96026` do Fernando em `origin/entrega-16-11`, voltado à usabilidade docente. Esse commit não altera `question-practice.tsx`, o serviço ou o repositório de prática. Não foi aplicado, respeitando o escopo do aluno e o trabalho em andamento no professor. As correções antigas do acervo examinadas no histórico já pertencem à versão consolidada; não foi encontrada nova correção remota específica para este problema.

Nenhum merge, commit, push ou deploy executado. HEAD local permanece `df01e20` com alterações anteriores e desta rodada não commitadas.

## Contagem real atual

Consulta realizada novamente com os métodos atuais de disponibilidade das cinco disciplinas, para as dez contas ALUNO existentes sem intenção institucional. Toda a execução ocorreu dentro de uma transação PostgreSQL `READ ONLY`, sem chamar criação/finalização de tentativas. Os resultados locais são agregados/anônimos; nenhuma identidade ou gabarito foi incluído neste documento.

| Disciplina | Questões existentes | Assuntos totais | Assuntos públicos consultáveis | Questões elegíveis para novos treinos |
| --- | ---: | ---: | ---: | ---: |
| Constitucional | 38 | 15 | 13 | 0 |
| Civil | 37 | 15 | 13 | 0 |
| Penal | 36 | 14 | 12 | 0 |
| Administrativo | 37 | 13 | 11 | 0 |
| Trabalho | 35 | 13 | 11 | 0 |
| **Total** | **183** | **70** | **60** | **0** |

Os dez assuntos restantes aparecem apenas em questões privadas. Eles não devem ser expostos indiscriminadamente. Um assunto de tentativa antiga do próprio aluno pode continuar visível como contexto da retomada, sem expor questões privadas de terceiros.

Todas as dez contas consultadas retornaram zero elegíveis e zero inéditas nas cinco disciplinas na configuração atual, com piloto privado desativado. Os campos obrigatórios de revisão jurídica e liberação continuam ausentes nas 183 questões; portanto, nenhuma nova quantidade 5/10/20 pode ser autorizada nesse estoque.

## Por que duas disciplinas parecem permitir iniciar?

Foi encontrada uma conta com tentativas ativas de cinco questões em Constitucional e Administrativo, sem tentativa ativa nas outras três disciplinas. Isso coincide com o padrão relatado, mas a auditoria anônima não identifica essa conta como sendo a sessão do navegador.

O fluxo existente verifica `activeAttempt` antes de verificar estoque para uma nova tentativa. O botão de continuar navega diretamente para a tentativa existente; mesmo o serviço de criação recupera uma sessão ativa antes de verificar quantidade de inéditas. Assim, conseguir abrir cinco questões pode ser retomada, e não criação de uma sessão nova nem evidência de cinco questões atualmente liberadas. Nenhuma nova tentativa foi iniciada para comprovar isso.

## Por que poucos assuntos apareciam?

Os assuntos não eram fixos no frontend: a interface recebia apenas os nomes derivados de `listEligibleQuestions`. Isso misturava o catálogo consultável com o subconjunto autorizado para geração de treinos. Conforme o modo/inventário ativo, o subconjunto podia mostrar poucos assuntos. O estoque privado tem dois assuntos por disciplina, mas não foi comprovado que a sessão relatada estivesse usando esse piloto; a configuração atual auditada tem piloto desativado. O número exato de dois assuntos da captura não foi reproduzido nessa configuração e não foi atribuído automaticamente a cache.

O problema comprovado é que o contrato não permitia listar assuntos públicos ainda sem questões elegíveis. Com zero elegíveis, o contrato anterior poderia retornar lista vazia mesmo existindo assuntos públicos cadastrados.

## Correções implementadas

- `PrismaQuestionPracticeRepository.listCatalogTopics`: consulta somente questões públicas e sem turma vinculada, agregando nome, quantidade cadastrada e pendências. Não retorna IDs de questões, textos, alternativas ou gabaritos.
- `QuestionPracticeService`: une os assuntos públicos do catálogo aos assuntos de questões já autorizadas e ao contexto da tentativa ativa pertencente ao aluno. Mantém a seleção de exercícios exclusivamente sobre o acervo elegível e inédito.
- API de disponibilidade: cada assunto diferencia `availableCount`, `eligibleCount`, `catalogCount` e `pendingReviewCount`.
- Endpoint `/topics`: mantém o contrato de nomes, agora incluindo o catálogo público consultável.
- Frontend: assuntos pendentes são selecionáveis para consulta e identificados como aguardando revisão/liberação. Quantidades continuam desabilitadas quando não há estoque suficiente. Treino existente e seus resultados permanecem preservados.
- Nenhuma disciplina, regra editorial, autorização ou registro foi alterado. Nenhuma mudança no dashboard do professor ou Perfil e configurações.

## Validação

- Consulta real: 50 combinações conta/disciplina verificadas em transação somente leitura.
- 26 testes direcionados de serviço, repositório e rotas aprovados, incluindo catálogo pendente, bloqueio de geração e projeção segura sem conteúdo.
- Builds backend e frontend aprovados; frontend com o loader runner já utilizado no ambiente.
- Oito scripts de verificação estática frontend aprovados.
- Frontend servido no localhost contém a nova apresentação de pendências; backend reiniciado apenas no processo local, preservando ADMINISTRATION_ENABLED=true, INSTITUTIONS_ENABLED=false e proteção de leitura.
- PostgreSQL descartável: 28 integrações aprovadas em quatro arquivos, incluindo consulta pública pendente, exclusão de assuntos privados, ausência de criação durante consulta e fluxos existentes de 5/10/20. As 32 migrations passaram sem drift; o cluster foi encerrado pelo harness. Dois testes antigos inicialmente presumiam que todo assunto listado era treinável; foram atualizados para exigir dois assuntos elegíveis do piloto com as mesmas contagens anteriores e zero inéditas nos assuntos apenas consultáveis. Nenhuma regra de seleção foi flexibilizada.
- `git diff --check` e hashes de Perfil preservados.

Não há sessão conectada de controle do navegador. O teste visual autenticado depois da atualização permanece dependente da navegação legítima do usuário; servir o código novo e responder health não é declarado como validação visual completa.

## Pendência real

O módulo já possui criação, respostas, retomada, correção e resultados; novos treinos continuam dependendo de revisão e liberação editorial legítimas, com conteúdo íntegro. Não é necessário aplicar as migrations de atividades/ciclo de vida para resolver a elegibilidade das questões. Nenhuma liberação ou correção de dados foi executada.

Arquivos desta rodada: serviço e testes de prática, repositório e testes de prática, integração `question-practice.integration.test.ts`, `frontend/src/question-practice.tsx` e este relatório. Scripts/resultados de consultas permanecem em `backend/.local`, ignorado pelo Git.
