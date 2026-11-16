# Acervo de questões

## Conteúdo e fontes

O conteúdo editorial versionado fica em `backend/scripts/drafts`. Não remover esses JSON: são usados pelos preparadores/importadores e por testes de elegibilidade.

| Material | Leitura para revisão |
| --- | --- |
| Diagnóstico autoral de 30 questões | [Caderno do diagnóstico](caderno-questoes-autorais-30.md) |
| Prática autoral inicial | [Caderno de prática](caderno-pratica-60-rascunhos.md) |
| Expansão da prática | [Caderno da expansão](caderno-pratica-expansao-60.md) |

As projeções JSON e os cadernos são fontes de conteúdo, não prova de aprovação humana. Arquivos JSON/CSV de conferência em `docs` preservam rastreabilidade. Os quantitativos importados e elegíveis dependem do banco e dos lotes configurados; não devem ser deduzidos apenas dos nomes dos arquivos.

## Cadastro docente

Questões possuem enunciado, disciplina, assunto, nível, fundamentação e quatro alternativas A–D, com exatamente uma correta. Confira o [contrato do cadastro](modulo-questoes-contrato-ad.md).

Questões privadas pertencem à turma autorizada. O professor pode criá-las dentro da atividade, sem abrir outra aba; ao salvar, ficam selecionadas na atividade. Salvar a questão não publica a atividade nem aprova o conteúdo global.

## Revisão e piloto

O acervo normal exige revisão jurídica, pedagógica e liberação. Questões oficiais exigem também os critérios de origem e direitos previstos no código. Não inventar identidades ou datas de revisão para atender ao filtro.

O piloto permite apenas lotes explicitamente autorizados, mantendo origem, proveniência e revisão pendente. As configurações são independentes:

- Diagnóstico: `INITIAL_DIAGNOSTIC_PILOT_ENABLED` e `INITIAL_DIAGNOSTIC_PILOT_BATCH_ID`.
- Prática: `QUESTION_PRACTICE_PILOT_ENABLED` e a lista/identificador de lotes correspondente.
- Simulado individual: `INDIVIDUAL_EXAM_PILOT_ENABLED` e a lista/identificador de lotes correspondente.
- Atividade: `CLASS_ACTIVITY_PILOT_ENABLED` e `CLASS_ACTIVITY_PILOT_BATCH_IDS`.

Habilitar um piloto não autoriza automaticamente os demais. Nas atividades, os itens aparecem como piloto em revisão e a descrição salva recebe o aviso de gabarito e resultados provisórios. A seleção é validada novamente ao salvar, publicar e iniciar uma nova tentativa.

## Operação

Os comandos de manutenção estão no `backend/package.json`. Consulte também `backend/scripts/ELIGIBLE_QUESTION_IMPORT.md` para o fluxo de importação de conteúdo elegível.

Importação, ativação e revisão são ações distintas. Antes de gravar, confira o destino, o lote e o responsável. Preserve fingerprints, vínculos de importação, tentativas e respostas; não reimporte o mesmo conteúdo como solução para uma lista vazia.

O importador específico de diagnóstico tem prévia sem gravação por padrão; a aplicação exige os parâmetros explícitos de destino e operador documentados no próprio script. Não assumir que todos os scripts de manutenção têm a mesma interface.
