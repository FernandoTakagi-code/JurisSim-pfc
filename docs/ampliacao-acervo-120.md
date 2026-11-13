# Ampliação do piloto para 120 questões de treino

> Atualização: a revisão de questões respondidas foi implementada separadamente. Consulte [revisao-questoes-respondidas.md](revisao-questoes-respondidas.md). A limitação registrada abaixo descreve o estado anterior a essa entrega.

13/11/2026 — branch `fernando/questoes-diagnostico-autoral`.

## Entrega e cobertura

Foram preparados e cadastrados 60 novos itens autorais assistidos por IA, com IDs editoriais TRE-CON/CIV/PEN/ADM/TRA-13 a 24. O cadastro é privado e não preenche revisão jurídica, revisão pedagógica nem liberação. A seleção continua restrita ao piloto provisório, com aviso e sem alterar o nível do aluno.

| Disciplina | Assuntos cobertos | Antes | Acrescentadas | Total do piloto |
|---|---|---:|---:|---:|
| Constitucional | Direitos individuais e coletivos; Organização do Estado e processo legislativo | 12 | 12 | 24 |
| Civil | Modalidades das obrigações; Contratos e negócios jurídicos | 12 | 12 | 24 |
| Penal | Culpabilidade e imputabilidade; Excludentes e concurso de pessoas | 12 | 12 | 24 |
| Administrativo | Imparcialidade e participação no processo; Instrução e decisão administrativa | 12 | 12 | 24 |
| Trabalho | Contrato e alterações contratuais; Extinção do contrato e efeitos | 12 | 12 | 24 |

Cada um dos dez assuntos passa de seis para doze itens. Antes de descontar o histórico individual, isso permite 5/10/20 por disciplina e 5/10 por assunto. Vinte por assunto continuam indisponíveis. Os tamanhos disputam o mesmo estoque; não são tentativas independentes. Questões já respondidas continuam excluídas, inclusive respostas de simulados em andamento. O novo lote amplia a profundidade nos assuntos existentes, sem cobrir novas disciplinas ou todo o programa da OAB.

## Verificação editorial

- Foram confrontados enunciados, gabaritos, comentários e distratores com as versões oficiais da Constituição, Código Civil, Código Penal, Lei 9.784/1999 e CLT, consultadas em 13/11/2026. Cada questão indica artigo e endereço da fonte.
- Oito itens preliminares foram substituídos para evitar sobreposição forte ou variar a habilidade cobrada: CON-15/16/17/18/20, CIV-16, PEN-20 e TRA-19. Não se tratou apenas de trocar nomes ou números.
- A comparação usou os 123 registros reais do banco antes da importação e 144 entradas editoriais locais (114 enunciados distintos). Não foi encontrado enunciado normalizado idêntico. Similaridade lexical foi usada para localizar casos para conferência, não como certificado de originalidade.
- Nos pares próximos mantidos há diferença de regra ou consequência: saída do empregado/art. 480 versus dispensa pelo empregador/art. 479; manifestação do interessado/art. 44 versus prazo para decisão/art. 49; embriaguez fortuita parcial versus incapacidade inteira; deterioração versus perda da coisa; parecer incorporado versus decisão sem fundamentos; elementar conhecida versus circunstância pessoal não elementar.
- São 42 níveis básicos e 18 intermediários propostos. Dificuldade não foi calibrada empiricamente; não foi criada quota de avançadas.
- Esta conferência foi assistida por IA, não constitui parecer jurídico, revisão humana nem garantia de ausência de erro. As aprovações humanas permanecem nulas. O conteúdo deve ser validado por revisores antes da liberação definitiva.

Conteúdo completo e fontes: [caderno-pratica-expansao-60.md](caderno-pratica-expansao-60.md). Dados versionados: `backend/scripts/drafts/authorial-practice-expansion-60.draft.json`.

## Supabase e configuração

Lote anterior: `9218bdec-f4e3-43a1-8b54-cdc40720dea5`. Novo lote: `d60e8e68-0557-438b-bd27-d1707db527a2`.

O banco passou de 123 para 183 questões. A comparação de integridade confirmou que os 123 registros anteriores e suas alternativas não foram alterados. Os 60 novos registros têm quatro alternativas, um gabarito e todos os campos de aprovação pendentes. Repetir a importação recuperou o mesmo lote e criou zero questões adicionais. Nenhuma migration, reset ou alteração de respostas foi necessária.

Os pilotos de Questões e Simulado individual agora aceitam `QUESTION_PRACTICE_PILOT_BATCH_IDS` e `INDIVIDUAL_EXAM_PILOT_BATCH_IDS`: listas explícitas de até dez UUIDs separados por vírgula. A lista não vazia prevalece sobre a configuração singular legada. Uma lista malformada não autoriza nenhum lote privado. Cada funcionalidade continua exigindo sua própria flag; o diagnóstico mantém configuração e lote próprios. O ambiente local foi configurado com os dois lotes. Arquivos `.env` e credenciais não entram no Git.

Para cadastrar o lote em outro ambiente, utilizar o importador privado existente com `--input scripts/drafts/authorial-practice-expansion-60.draft.json`; conferir a prévia e usar o destino e operador reais daquele ambiente. Não reutilizar identificadores de conta ou destino sem conferência. Este lote não deve ser passado ao importador de diagnóstico.

## Validação técnica

Build do backend e 33 testes focados passaram. Sete testes de integração em PostgreSQL 17 descartável passaram, incluindo 120 itens privados elegíveis nos dois lotes, 24 por disciplina, 12 por assunto, treino de dez por assunto, preservação dos avisos, seleção restrita, retomada e histórico compartilhado. As 23 migrations mantiveram checksums e schema sem divergência.

A conferência de capacidade no Supabase confirmou quantidades 5/10/20 por disciplina para a conta usada na validação, descontando suas respostas reais. A nova sessão do navegador exigiu login; não foi criada tentativa adicional nem feito novo teste visual autenticado desta ampliação. O fluxo visual do treino já foi validado na etapa anterior.

## Próximas lacunas

Ainda faltam mais assuntos e disciplinas do programa da OAB, revisão humana do conteúdo, acompanhamento de dúvidas e estatísticas de distratores. Treinos de revisão de itens respondidos deverão ter identificação explícita e seleção própria; não estão implementados por esta ampliação. O acervo atual continua limitado a um piloto de cinco disciplinas.
