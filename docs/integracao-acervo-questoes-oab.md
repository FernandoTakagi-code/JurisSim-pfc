# Planejamento: questões inéditas e acervo OAB

## Escopo e estado atual

Este documento planeja a convivência de questões inéditas produzidas com apoio de IA, questões oficiais da OAB e questões particulares de professores. Nenhum texto oficial pode ser importado ou exibido enquanto a base jurídica para reprodução não estiver documentada. Questões geradas por IA também não são publicáveis antes da revisão jurídica e pedagógica.

O catálogo [catalogo-oab-47-tipo-1.json](./catalogo-oab-47-tipo-1.json) contém 80 posições do 47º Exame, 1ª fase, Tipo 1. É um catálogo histórico de metadados: textos e classificações estão vazios, os gabaritos estão associados às fontes oficiais e a posição 47 consta como anulada. O catálogo não representa 80 questões prontas para resolução. Sua licença segue bloqueada.

No código atual, `Questao` já registra enunciado, disciplina, assunto, nível, visibilidade, autor, turma e alguns metadados de procedência (`fonteNome`, `fonteReferencia`, `licencaOuAutorizacao`, `loteImportacaoId`, `fingerprint`). Ainda não há uma origem tipada (IA/OAB/professor), estado editorial, referência estruturada à posição oficial, estado de anulação ou configuração de publicação/revisão. `Nivel` já possui `BASICO`, `INTERMEDIARIO` e `AVANCADO`.

O `DiagnosticRepository.findQuestionsForDiagnostic` seleciona questões públicas por data, sem filtros de origem, nível, assunto ou histórico de respostas. `DiagnosticService` cria tentativas `DIAGNOSTICO`, persiste respostas e calcula o resultado com `analyzeDiagnostic`. O motor mede acertos por disciplina, assunto e nível e recomenda uma trilha; não considera origem, questões anuladas, revisão editorial nem repetição anterior. A trilha existente busca questões públicas por disciplina, assunto e nível, mas não evita questões já respondidas.

As avaliações de professores já apontam para questões canônicas por `AvaliacaoQuestao`; não copiam o conteúdo. `ClassExamService.validateSelection` valida visibilidade, compartilhamento e existência de alternativas, e a avaliação persiste a tentativa por referências. Essa relação deve continuar sendo o mecanismo para reutilizar questões públicas autorizadas. Questões privadas permanecem sujeitas às regras atuais de autor/turma.

A resolução não está centralizada em um componente compartilhado: `main.tsx`, `class-exams.tsx` e a tela de trilha montam interfaces semelhantes separadamente. Alternativas são lidas da relação Prisma sem ordenação explícita ou rótulo estável; a futura integração de gabaritos oficiais requer posição A–D persistida ou uma ordenação determinística validada.

## Modelo de dados a avaliar

Fazer desenho de schema e migração somente em etapa posterior, após revisão e aprovação. Preservar questões, tentativas e vínculos atuais; não inferir origem com base apenas em `publica`.

1. **Origem independente do nível:** adicionar um enum de origem, por exemplo `IA`, `OAB_OFICIAL` e `PROFESSOR`. Manter `nivel` como atributo separado. Registros existentes precisam de uma estratégia de backfill explícita, revisada antes de atribuir origem; não classificar automaticamente toda questão pública como IA ou oficial.
2. **Estado editorial/publicação:** representar estados como rascunho, aguardando revisão, aprovado e publicado. Questões geradas por IA só entram na seleção pública quando aprovadas nas revisões jurídica e pedagógica. Separar aprovação editorial de `publica`, ou substituir a ambiguidade por uma política de publicação clara e auditável.
3. **Referência oficial:** criar uma referência estruturada da questão à identidade da fonte (exame, fase, tipo, número, URL(s) oficial(is), chave definitiva, estado da posição). Garantir unicidade da posição oficial. A referência pode existir no catálogo histórico sem uma `Questao` resolvível associada. Uma questão anulada permanece somente como registro histórico e não vira item pontuável.
4. **Direitos:** registrar evidência documental, titular/fonte, escopo de armazenamento e exibição, usos permitidos e validade. Não tratar a URL oficial nem a presença de gabarito como licença. Sem autorização para reprodução integral, manter apenas os metadados permitidos e bloquear conteúdo integral na API e interface.
5. **Revisões e auditoria:** guardar estado, revisores, datas e observações sem expor conteúdo desnecessário em logs. A aprovação deve estar ligada à versão revisada do conteúdo para evitar que uma edição posterior continue aprovada indevidamente.
6. **Alternativas:** adicionar posição/rótulo estável (A–D ou A–E conforme o item) e unicidade por questão/posição. Não depender da ordem incidental retornada pelo banco. Validar que o gabarito referencia exatamente uma alternativa existente.
7. **Seleção configurável:** armazenar a proporção desejada para questões médias (inicialmente 50/50 IA/OAB) em configuração controlada no servidor, versionada e validada. O cliente pode pedir exame, disciplina, assunto, nível e quantidade, mas não pode liberar origem, questão não revisada ou conteúdo sem direitos.
8. **Histórico de exposição:** usar tentativas/respostas já ligadas à questão canônica para reduzir repetição. Se for necessária janela, contador ou política de espaçamento, definir em configuração de seleção; não duplicar questões para contornar histórico.

Não é necessário criar outra cópia de questão para o estudante e para a avaliação do professor. `AvaliacaoQuestao` continua representando o uso em uma prova, com posição e configuração da avaliação; `QuestaoSimulado` continua representando a inclusão numa tentativa. A identidade oficial e os metadados de fonte ficam ligados à questão canônica e/ou ao seu registro de origem. Resultados e respostas permanecem vinculados ao aluno e à tentativa.

## Política de seleção

A seleção deve ser aplicada no backend, com consulta parametrizada e limites de quantidade. Filtros de assunto e disciplina só podem usar classificações revisadas. Dificuldade não determina origem, exceto pelas políticas abaixo:

| Nível solicitado | Composição | Elegibilidade |
| --- | --- | --- |
| Fácil (`BASICO`) | IA | Origem IA, revisão jurídica e pedagógica aprovadas, publicada e com fundamentação obrigatória. Linguagem acessível e fundamentos jurídicos. |
| Médio (`INTERMEDIARIO`) | 50% IA / 50% OAB oficial inicialmente, proporção configurável | Cada grupo deve cumprir separadamente revisão/publicação e direitos. Se a quantidade elegível de uma origem for insuficiente, retornar a composição disponível e informar o déficit antes de iniciar; não completar silenciosamente com a outra origem. |
| Difícil (`AVANCADO`) | Exclusivamente OAB oficial | Questão oficial válida, reprodução autorizada, conteúdo completo e classificação revisada. Priorizar itens classificados como desafiadores por critério documentado/revisado, não por inferência automática. |

O pedido deve falhar com resposta controlada e informação de disponibilidade quando não houver questões suficientes de uma origem obrigatória. No nível médio, a UI pode oferecer ao aluno ajustar a quantidade ou iniciar com a composição explicitamente apresentada (por exemplo, 3 IA + 1 OAB); essa escolha não pode ocorrer por substituição invisível. No nível difícil, nunca usar IA como fallback. Não contar questões incompletas, não revisadas, sem direitos ou anuladas como disponíveis.

Para reduzir repetição, priorizar questões elegíveis ainda não respondidas pelo aluno no período/escopo definido. Se a pool não bastar, reportar quantas são novas e quantas já foram vistas e pedir uma decisão explícita (reduzir quantidade ou permitir repetição). Preservar tentativas anteriores; não alterar respostas ou histórico.

## Integração com diagnóstico, simulados e adaptação

- **Simulado Diagnóstico:** manter seu fluxo, seleção atual e finalidade de linha de base. Não aplicar as novas proporções ao diagnóstico implicitamente. Se futuramente o diagnóstico usar a nova taxonomia, sua política e impacto precisam de decisão própria, pois o resultado alimenta desempenho e trilha.
- **Provas Oficiais:** criar modo/serviço de tentativa separado do tipo `DIAGNOSTICO`, com seleção por exame e apenas posições válidas, completas, revisadas e autorizadas. Manter gabarito oculto durante a tentativa e apresentá-lo somente na correção após finalizar. O resultado da prova oficial não deve ser confundido com o diagnóstico.
- **Prática adaptativa:** estender o contrato da seleção da trilha com nível, origem permitida e histórico. A regra de origem acompanha o nível recomendado: básico seleciona IA; intermediário respeita a proporção configurada com déficit visível; avançado seleciona apenas OAB oficial. A adaptação escolhe também assunto prioritário a partir do desempenho existente. Não relaxar origem/direitos para satisfazer quantidade.
- **Sinal de desempenho:** anulações são excluídas antes de criar a tentativa. Caso uma anulação oficial seja reconhecida após a aplicação, definir um procedimento auditável para invalidar o item e recalcular denominadores/resultados afetados, sem classificar a resposta como errada. Isso requer política e testes específicos antes de produção.
- **Professor:** permitir inserir questões públicas elegíveis nas avaliações existentes por `AvaliacaoQuestao`, sem duplicação. O professor não pode editar a questão pública canônica nem ver respostas de alunos fora das turmas autorizadas. Questões particulares continuam separadas e obedecem autoria/escopo; não podem ser apresentadas como OAB oficial.
- **Interface:** extrair, em etapa própria, um componente acessível de resolução para enunciado, alternativas ordenadas, navegação, confirmação e estado da resposta. Reutilizá-lo no diagnóstico, trilha, prova oficial e avaliação após preservar contratos e permissões distintos. A tela pública deve identificar claramente a origem (“Questão inédita” ou exame/tipo/número oficial), sem sugerir oficialidade para itens de IA. Mostrar correção e fundamentação somente no momento permitido pelo modo.

## Testes necessários

### Modelo, direitos e publicação

- Migração/backfill em PostgreSQL descartável preservando questões antigas, relações, respostas e avaliações.
- Unicidade de identidade oficial e de posição das alternativas; questões antigas sem metadados continuam legíveis.
- Estados de revisão: rascunho/pendente não selecionáveis; aprovação exige revisões requeridas; mudança de conteúdo invalida aprovação anterior.
- Bloqueio de leitura integral e seleção enquanto direitos não autorizarem o uso solicitado; permissões com escopo/validade respeitadas.
- Questão anulada permanece consultável no catálogo histórico, mas não selecionável nem pontuável.

### Seleção e motor adaptativo

- Fácil retorna apenas IA aprovada; difícil apenas OAB oficial autorizada; médio respeita a proporção configurada quando existe pool suficiente.
- Pool insuficiente retorna disponibilidade/déficit explícito; nenhum fallback silencioso para IA no difícil ou para outra origem no médio.
- Filtros de exame, disciplina, assunto e nível são aplicados no servidor; classificações vazias ou pendentes não passam como filtros satisfeitos.
- Questões já respondidas são priorizadas para exclusão; quando a pool é insuficiente, a resposta comunica repetição antes de criar tentativa.
- Métricas por assunto/nível preservam denominadores corretos; anuladas nunca entram como incorretas; recálculo pós-anulação é auditável.
- Tentativas oficiais não criam nem alteram resultados do Simulado Diagnóstico, linha de base ou trilha existentes.

### Acesso, avaliações e UI

- Professor reutiliza questão pública autorizada por vínculo; não duplica conteúdo; professor comum não seleciona questões privadas de outro professor.
- Isolamento por turma e aluno para avaliações, respostas e desempenho.
- Alternativas A–D mantêm ordem e gabarito correto em API, simulado e correção.
- Gabarito não aparece antes da finalização; correção posterior contém fonte oficial e fundamentação autorizada.
- Testes de teclado, foco, leitores de tela, estados de carregamento/erro e layouts móveis no componente compartilhado.

## Ordem recomendada de implementação

1. **Fechar decisões de produto e direitos:** definir documentação válida de reprodução, critérios de revisão jurídica/pedagógica, política para pool insuficiente, repetição e anulação posterior.
2. **Primeira implementação pequena e segura:** definir em documentação/contratos de domínio a matriz de elegibilidade por nível e origem e a resposta de “pool insuficiente”, sem habilitar conteúdo nem alterar o fluxo do diagnóstico. Criar testes unitários puros da política quando a implementação for autorizada. Esta etapa não depende de banco e torna explícitas as regras antes do schema.
3. **Modelo e migração:** propor enums/relações/campos para origem, revisão, direitos, identidade oficial, status histórico e posição de alternativa. Fazer inventário/backfill planejado para registros antigos; validar migration em PostgreSQL descartável antes de qualquer banco de ambiente.
4. **Governança de conteúdo:** criar fluxo administrativo de entrada e revisões para IA e OAB; manter conteúdo bloqueado por padrão, sem disponibilizar importação ou geração em lote antes da validação.
5. **Seleção de domínio/backend:** implementar repositório seletor testável por nível/origem/filtros/histórico, erros de disponibilidade e configuração de proporção. Manter o endpoint/serviço do Diagnóstico isolado.
6. **Prática adaptativa:** integrar filtros de origem à geração da trilha por assunto e nível, com comportamento explícito de falta de pool e sem interferir no diagnóstico histórico.
7. **Modo Provas Oficiais:** serviço e tentativa separados, seleção por exame, gabarito definitivo e correção pós-finalização; excluir anulações e preservar IDs/fontes.
8. **Avaliações de professores:** ampliar apenas a descoberta/validação de questões públicas autorizadas, mantendo `AvaliacaoQuestao` como referência canônica e as regras atuais para conteúdo privado.
9. **Componente de resolução compartilhado:** extrair a interface gradualmente para diagnóstico, trilha, prova oficial e avaliação; validar acessibilidade e contratos distintos de correção.
10. **Piloto controlado:** liberar somente conteúdo com direitos documentados, classificação revisada e cobertura dos testes acima; acompanhar repetição, disponibilidade e métricas antes de ampliar o acervo.

## Limites e pendências

- O catálogo atual é metadado, não conteúdo resolvível, e não autoriza reprodução.
- O schema e os serviços atuais não aplicam a taxonomia IA/OAB/professor nem o fluxo editorial descritos.
- Não presumir origem, classificação, dificuldade, autorização ou validade com base em campos vazios, no fato de uma questão ser pública, ou em heurísticas de IA.
- Nenhuma implementação, importação, migration ou integração com banco é autorizada por este planejamento.
