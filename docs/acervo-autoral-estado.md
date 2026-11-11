# Acervo autoral — estado editorial

Versão editorial 6, preparada em 11/11/2026. Questões assistidas por IA, sem aprovação jurídica humana ou liberação. A proposta de composição ainda aguarda confirmação do orientador. Esta documentação não autoriza importação no banco compartilhado.

Atualização posterior: o responsável autorizou expressamente cadastrar a seleção de 30 e ativar um piloto para alunos enquanto a revisão permanece pendente. Essa operação foi realizada por fluxo específico de piloto, sem alterar as aprovações deste snapshot editorial. Consulte `docs/piloto-autoral.md`. As nove reservas continuam fora do lote importado.

## Conteúdo versionado

- `backend/scripts/drafts/authorial-diagnostic-30.draft.json`: seleção de 30, seis por disciplina, duas por nível editorial provisório. Formato editorial aceito pelo preparador, não diretamente pelo importador.
- `backend/scripts/drafts/authorial-question-bank-39.draft.json`: acervo completo, incluindo os mesmos 30 itens e nove reservas, com IDs da seleção. É o registro completo do conteúdo e das reclassificações.
- `docs/caderno-questoes-autorais-30.md`: leitura das 30 questões, respostas propostas, comentários, fontes oficiais e pendências humanas.

As duas projeções JSON são snapshots da mesma versão. A seleção deve permanecer idêntica aos itens correspondentes do acervo. IDs históricos não representam necessariamente o nível atual; o campo `nivel` registra a classificação vigente.

Foram conferidas as 39 estruturas e feita revisão preliminar assistida por IA, com ajustes de clareza, alternativas e dificuldade. Não foram identificados enunciados exatamente iguais dentro do acervo ou nos 33 itens do inventário local e 15 rascunhos anteriores consultados. Isso não certifica originalidade global, validade jurídica ou dificuldade empírica.

Todas as revisões jurídicas e pedagógicas e liberações permanecem pendentes. Não preencher nomes, identidades, datas ou evidências fictícias para o lote passar na validação. As fixtures aprovadas dos testes são sintéticas e não concedem aprovação a estes rascunhos.

As nove reservas não garantem prática inédita suficiente por disciplina e assunto após o diagnóstico. Esta seleção é um piloto do diagnóstico inicial de 30 itens, não um acervo completo para todas as modalidades de simulado.

## Limites de integração

O cadastro e a seleção autoral são alterações locais distintas. O modo `AUTORAL_30` não habilita a API nem muda tentativas já persistidas. O padrão misto foi mantido. Consulte `docs/diagnostico-autoral-preparacao.md` para os testes e o processo de preparação.

Na consulta ao remoto em 11/11/2026, a branch `entrega0911` tinha mudanças ainda fora da `main` em simulados legados, retomada, trilhas e motor adaptativo. Não foram incorporadas a esta entrega. A validação de integração deve ser refeita quando essa branch for integrada. A branch `feature/crud-questoes` não tinha commits exclusivos em relação à `main` na mesma consulta; isso não informa trabalho ainda não publicado de outros integrantes.
