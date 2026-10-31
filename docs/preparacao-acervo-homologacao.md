# Preparação do acervo para homologação

## Controle da composição

`controle-acervo-homologacao.csv` é a planilha operacional dos 30 slots da regra atual: 15 questões `IA` (por disciplina, 2 básicas e 1 intermediária) e 15 `OAB_OFICIAL` (por disciplina, 1 intermediária e 2 avançadas). As linhas são posições vazias de planejamento, não questões reais nem evidência de revisão. Complete-as apenas com conteúdo e comprovantes verificáveis.

## Catálogo OAB disponível

O arquivo `catalogo-oab-47-tipo-1.json` identifica o 47º Exame de Ordem Unificado, 1ª fase objetiva, Tipo 1 (Branca), exame `18197`, realizado em 06/09/2026, com 80 posições. O catálogo tem número de questão e gabarito definitivo em 79 posições; a posição 47 está anulada. Não contém nenhum enunciado, nenhuma alternativa, nem disciplina, assunto ou dificuldade preenchidos. A classificação está ausente para todas as 80 posições. `licenseVerified` é `false` e o estado é `BLOQUEADO_ATE_DOCUMENTACAO_DE_DIREITOS`.

Fontes oficiais já identificadas no catálogo:

- [Página de editais e provas da OAB para o exame 18197](https://examedeordem.oab.org.br/EditaisProvas?NumeroExame=18197)
- [Caderno oficial Tipo 1 — PDF](https://s.oab.org.br/arquivos/2026/09/7d502f11-d906-4378-bd43-27e0c854b981.pdf)
- [Gabarito definitivo Tipo 1 — PDF](https://s.oab.org.br/arquivos/2026/09/572dc8e2-78a0-4e37-b6de-20709e2c59ab.pdf)

Para preencher os 15 slots oficiais, ainda é preciso consultar o caderno e o gabarito juntos, localizar candidatos não anulados, transcrever somente quando houver base documentada para uso, associar número e gabarito, e classificar disciplina, assunto e dificuldade com revisão humana. A URL e o gabarito não comprovam autorização de reprodução. Obter autorização/licença aplicável ou análise jurídica documentada é pré-requisito para armazenar e exibir o texto integral. Não selecionar a questão 47 anulada.

## Elaboração das 15 questões autorais

1. Distribua os slots `IA` do CSV: 2 básicos e 1 intermediário em cada uma das cinco disciplinas.
2. Para cada slot, forneça ao assistente de IA o objetivo de aprendizagem e as fontes jurídicas primárias já selecionadas pelo responsável jurídico. Peça um rascunho original com enunciado, quatro alternativas A–D, um único gabarito e justificativa ligada às fontes fornecidas. Instrua a ferramenta a não reproduzir itens OAB, não inventar citações e apontar `FONTE INSUFICIENTE` quando não puder fundamentar uma afirmação. O resultado é rascunho, nunca aprovação.
3. Um revisor jurídico confere a vigência, os dispositivos/precedentes e o gabarito. Outro revisor pedagógico verifica clareza, adequação ao nível, classificação e se há exatamente uma resposta correta. Registre IDs reais, datas e referências duráveis às evidências.
4. Um administrador confirma autoria/proveniência, autorização de uso aplicável, revisões e evidências e registra a liberação. Nenhum campo deve ser preenchido antes de essa ação ocorrer.

## Compatibilidade do importador

O contrato atual aceita a composição original sem mudança de política: cada objeto `questions` deve usar `origem`, `disciplina`, `assunto`, `nivel`, `enunciado`, `fundamentacaoJuridica`, alternativas A–D, `source`, revisões jurídica/pedagógica e `release`. Para `OAB_OFICIAL`, também exige `oab.exam`, `edition`, `examType`, `questionNumber`, `officialUrl`, `officialStatus: "VALIDA"`, estado de direitos permitido e evidências de verificação. O gabarito do catálogo só pode ser convertido em `correta: true` depois de ligar a questão ao número correto e validar que não foi anulada.

O importador verifica todos os slots como quantidades mínimas e cobertura de prática de pelo menos cinco questões por assunto declarado, com ao menos um assunto em cada disciplina. Ele não rejeita lotes maiores que 30; mantenha os 30 slots diagnósticos e não acrescente questões sem conteúdo/evidência real. Para declarar um assunto de prática por disciplina, pelo menos cinco questões elegíveis precisam estar classificadas nele. Embora haja seis slots diagnósticos por disciplina, somente três são autorais; se menos de duas das três oficiais tiverem direitos documentados, serão necessárias questões adicionais elegíveis para alcançar cinco naquele assunto. Sem direitos oficiais comprovados, as questões OAB não contam para nenhum dos dois usos.

Há ainda um mapeamento manual obrigatório: o catálogo usa `GABARITO_DEFINITIVO`/`ANULADA`, enquanto o importador espera `officialStatus: "VALIDA"`; a equipe deve confirmar a posição no caderno e no gabarito, excluir anuladas e só então preencher `VALIDA`. O número e a letra do gabarito no catálogo não bastam: faltam texto, alternativas, classificação e comprovação de direitos.

## Checklist e comandos

1. Complete os 30 slots do CSV e o modelo `backend/scripts/templates/eligible-question-batch.template.json`. O modelo JSON é uma estrutura vazia; não importe o CSV diretamente.
2. Mantenha as evidências de autorização e revisão fora do lote público, em local controlado, e use `evidenceRef` para apontá-las. Confirme que os IDs correspondem a contas ativas em homologação: revisores jurídicos/pedagógicos Admin ou Professor; liberador e verificador de direitos Admin.
3. Faça a prévia offline a partir da raiz do repositório:

   ```powershell
   npm.cmd --prefix backend run question-bank:import -- --input "C:\caminho-seguro\eligible-question-batch.json"
   ```

   Prossiga somente com zero pendências, 30 itens elegíveis e cobertura dos assuntos. Essa prévia não conecta ao banco.

4. Antes de aplicar, injete pelo gerenciador de segredos os seguintes valores de **homologação** no processo: `JURISSIM_QUESTION_IMPORT_STAGE=homologation`, `NODE_ENV` diferente de `production`, `QUESTION_IMPORT_DATABASE_URL`, `QUESTION_IMPORT_ALLOWED_HOST` (hostname exato da URL) e `QUESTION_IMPORT_ADMIN_ID`. Nunca reutilize a URL do ambiente real. Depois da revisão final, execute:

   ```powershell
   npm.cmd --prefix backend run question-bank:import -- --input "C:\caminho-seguro\eligible-question-batch.json" --apply
   ```

   A gravação é atômica; duplicata por fingerprint aborta o lote e itens existentes não são atualizados.

5. Injete `INVENTORY_CHECK_DATABASE_URL` apontando para o mesmo banco de homologação; ela tem prioridade sobre o fallback de `backend/.env`. Então execute:

   ```powershell
   npm.cmd --prefix backend run inventory:check
   ```

   O checker usa transação PostgreSQL `READ ONLY`. A homologação do acervo exige diagnóstico `APTO`, contagem por disciplina compatível com os slots e ao menos cinco questões elegíveis em cada assunto declarado para prática. Não habilite flags até essa validação passar.
