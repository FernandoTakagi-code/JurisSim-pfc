# Liberação administrativa para treino do aluno — executada após autorização

## Resultado da execução

O usuário confirmou a autorização dos mesmos 29 IDs e identificou a conta ADMIN responsável, identificada nos eventos de auditoria do banco. A conta foi verificada por leitura como ADMIN ativa e com e-mail confirmado. A reauditoria manteve exatamente os 29 IDs e hashes anteriores: nenhuma inclusão, exclusão ou necessidade de migration.

Foram inseridos **29 eventos `OWNER_AUTHORIZED_PRACTICE_RELEASE`**, lote `ad14df9908b80ded531a8683515b31a290f84d5dafa26d75434d8a027ab50217`. Os eventos registram conta responsável, data do servidor, referência da autorização, hash da questão e declaração explícita de que não representam revisão jurídica. Nenhuma questão, alternativa ou avaliação foi atualizada.

Verificação posterior, exclusivamente por leitura dos serviços reais do treino e do Supabase:

- Administrativo: 5 elegíveis; Constitucional, Civil, Penal e Trabalho: 6 cada.
- Nas seis contas ALUNO confirmadas e sem intenção de cadastro institucional, cinco têm estoque de pelo menos cinco inéditas em Civil; uma já respondeu às seis candidatas dessa disciplina. Nas outras quatro disciplinas, todas as seis têm estoque para cinco. Disponibilidade é individual e não foi artificialmente ampliada.
- Cada assunto candidato tem uma questão. Não há estoque de 10/20 por disciplina ou de cinco por assunto.
- Hashes completos de questões/alternativas e avaliações/vínculos idênticos ao snapshot anterior.
- 143 tentativas, 537 respostas e 7 sessões de prática antes e depois. Nenhuma tentativa real foi criada pelo agente.
- Backend local reiniciado na porta 3333 (PID 7300), com `QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED=true` somente no processo. `.env` preservado, `INSTITUTIONS_ENABLED=false`, escrita editorial global desativada. Os outros módulos permanecem em navegação de leitura; apenas as rotas existentes de treino pessoal são admitidas na exceção local, sempre sujeitas a ALUNO, propriedade da tentativa e estoque real.
- Um watcher duplicado do mesmo backend foi encerrado; restou a API identificada em `127.0.0.1:3333`. Frontend em `localhost:5173` confirmado apontando para ela; `/health` e `/questoes` HTTP 200.
- 38 testes de integração passaram em PostgreSQL descartável, incluindo liberação, idempotência, proteção de privados/publicados, versão, revogação, rollback e treino 5/10/20 com histórico e desempenho. A primeira execução encontrou retorno `void` do lock PostgreSQL incompatível com Prisma; foi corrigido para retorno textual e a suíte repetida passou.
- Build backend aprovado; 1.492 testes unitários da regressão aprovados, seguidos de 11 testes direcionados aprovados após o ajuste da exceção local de treino. `git diff --check` e hashes de Perfil/configurações aprovados.

A leitura dos serviços com banco real não é apresentada como login real de ALUNO no navegador. A conferência visual dessa conta foi solicitada sem pedir senha/token e sem criar tentativas.

### Reversão executável, ainda não executada

No diretório `backend`, `node scripts/publish-owner-practice.cjs --revoke-batch ad14df9908b80ded531a8683515b31a290f84d5dafa26d75434d8a027ab50217 --actor-email "<ADMIN_AUTORIZADO>" --reason "<MOTIVO_AUTORIZADO>"` insere eventos de revogação append-only, sem apagar auditoria ou dados acadêmicos. Exige autorização específica antes de executar no banco real. A capacidade também pode ser desabilitada no processo local. Revogação, consulta e retomada de tentativas existentes foram testadas exclusivamente no banco descartável.

## Plano original apresentado antes da execução

**Nenhuma publicação ou alteração no Supabase foi executada.** Auditoria capturada em 16/11/2026 às 15:08:39, horário de Brasília, em transação PostgreSQL `REPEATABLE READ / READ ONLY`.

## Inventário verificado

| Disciplina | Total | Públicas | Candidatas estruturais, sem vínculo publicado | Elegíveis pela regra atual | Tamanhos possíveis após autorização e implementação |
|---|---:|---:|---:|---:|---|
| Constitucional | 38 | 14 | 6 | 0 | 5 |
| Civil | 37 | 13 | 6 | 0 | 5 |
| Administrativo | 37 | 13 | 5 | 0 | 5 |
| Penal | 36 | 12 | 6 | 0 | 5 |
| Trabalho | 35 | 11 | 6 | 0 | 5 |
| **Total** | **183** | **63** | **29** | **0** | Por disciplina; não somar disciplinas para desbloquear tamanhos |

Separação disjunta dos 183 registros:

- 120 privados: excluídos, ainda que completos.
- 33 públicos incompletos/inconsistentes: excluídos, principalmente pela identificação das alternativas A–D.
- 1 público completo vinculado a avaliação publicada: excluído preventivamente, sem alterar o conteúdo ou os vínculos da avaliação.
- 29 públicos completos restantes: candidatos, ainda não liberados.

Há 11 questões vinculadas a avaliações publicadas no total; dez delas já pertencem ao grupo de inconsistentes. Nenhuma será alterada. Não foram encontrados grupos com enunciado repetido após normalização Unicode, caixa e espaços. Também foram verificados textos de alternativas repetidos na mesma questão. Isso não constitui uma detecção infalível de paráfrases ou uma revisão jurídica do conteúdo.

As 29 candidatas são de origem IA, têm enunciado com tamanho mínimo, assunto/disciplina, explicação preenchida, quatro alternativas A–D não vazias e distintas e exatamente um gabarito. Todas mantêm sinalização de licença/autoria pendente. A auditoria confirma integridade estrutural, **não confirma correção doutrinária, originalidade ou direitos autorais**.

Cada candidata tem um assunto diferente: 29 assuntos com uma questão candidata cada. Um filtro por assunto ainda não permitirá treino de cinco questões. O limite por disciplina é de 5–6 questões antes de excluir as já respondidas pelo aluno; portanto não há estoque para 10 ou 20 por disciplina, e mesmo o treino de cinco pode ficar indisponível após consumo do estoque. Retomadas existentes são preservadas.

## Evidências locais preparadas

- `docs/auditoria-publicacao-aluno-2026-11-16.csv`: classificação dos 183 IDs, sem enunciados, gabaritos ou dados de alunos.
- `docs/liberacao-administrativa-candidatas-2026-11-16.json`: lista exata dos 29 IDs, assuntos, hashes do conteúdo e valores anteriores de liberação.
- SHA-256 da seleção: `292cad34a94306ef99a2ecf581b4645eb90fd881ff969ad922a09fb07a5a9526`.
- `backend/scripts/audit-owner-question-release.cjs`: auditoria reproduzível; somente leitura, sem função de publicação.

## Alterações necessárias — proposta, ainda não aplicada

A regra vigente exige revisão jurídica e pedagógica. Preencher somente `liberadaAcervoEm` não resolve o bloqueio, e preencher revisores artificialmente seria incorreto. A autorização do proprietário deve ser uma **base distinta e explícita, limitada ao treino individual**, sem alterar a elegibilidade compartilhada de diagnóstico, atividades ou simulados.

Após confirmação específica:

1. Implementar e testar essa base de autorização somente no repositório/política do treino e nos seus contadores de catálogo, exclusão de respondidas e filtros. Não criar outra interface editorial. Manter o comportamento atual como padrão até a ativação autorizada.
2. Usar a conta ADMIN legítima do responsável que confirmar a autorização; não presumir que o primeiro ADMIN encontrado seja o proprietário. A referência da autorização deve ser real e informar que permite uso no treino sem alegar revisão jurídica ou verificação de direitos.
3. Reauditar os 29 IDs, os hashes, publicidade, integridade, origem IA, ausência de vínculo com turma/avaliação publicada e inexistência de autorização conflitante. Qualquer mudança interrompe o lote, sem substituição automática por outra questão.
4. Em transação serializável com bloqueio das questões selecionadas, inserir **29 eventos** `OWNER_AUTHORIZED_PRACTICE_RELEASE` em `AdministrativeEvent`, um por ID. Cada evento deve conter o responsável autenticado, data do servidor, referência da autorização, identificador do lote, hash do conteúdo, versão da política e declaração de que a autorização administrativa não é revisão jurídica. Auditar atomicamente; falha em um registro reverte o lote inteiro.
5. **Não atualizar `Questao`, `Alternativa`, campos de revisão, direitos, licença, autoria, liberação editorial global, respostas ou tentativas.** A publicação pública existente permanece igual. A disponibilidade excepcional deriva exclusivamente dos eventos válidos, vinculados à versão exata do conteúdo.
6. Habilitar somente a capacidade específica de autorização do treino no processo local, após os testes. A leitura deve exigir evento válido e não revogado, conteúdo inalterado, ADMIN responsável existente/ativo, escopo público global e integridade. Não habilitar pilotos privados nem flags institucionais. Não alterar Professor ou Simulados.
7. Validar por leitura a disponibilidade final por disciplina/assunto e aluno. Não iniciar tentativas reais apenas para testar. Não declarar quantidades liberadas antes dessa verificação.

Essa proposta usa a estrutura de auditoria existente e **não requer migration**. O código da exceção e os eventos de publicação não foram ativados ou executados nesta etapa. Os testes de treino existentes não devem ser apresentados como validação de uma política de autorização ainda não implementada.

## Reversão

- Desabilitar a capacidade específica do treino para interromper imediatamente novas seleções pela autorização administrativa.
- Registrar eventos append-only `OWNER_AUTHORIZED_PRACTICE_REVOKED` para o mesmo lote/IDs, com responsável e motivo, em vez de apagar auditoria.
- Como a proposta não atualiza questões nem campos editoriais, não há conteúdo, licença, gabarito ou revisão a restaurar. Os valores anteriores documentados permanecem intactos.
- Preservar todas as tentativas, respostas, snapshots, resultados e indicadores históricos produzidos legitimamente. Revogar a autorização bloqueia novas seleções, sem apagar o histórico nem impedir a consulta/retomada autorizada das tentativas existentes.
- Conferir por leitura que o lote revogado não fornece estoque para novas tentativas. Eventuais autorizações futuras precisam de novo lote e nova referência, sem reutilizar o evento revogado.

## Confirmação necessária

Validação desta preparação: **33 testes de integração aprovados em quatro arquivos** no PostgreSQL descartável, incluindo 5/10/20, retomada, correção, registro no histórico e desempenho por aluno. As novas verificações consultam os endpoints reais de histórico e desempenho após finalizar os treinos isolados. Build backend e `git diff --check` aprovados. As 32 migrations passaram no banco descartável, sem drift e com checksums preservados. Nenhum teste de escrita utilizou o Supabase. Esses resultados validam o mecanismo de treino existente, não uma exceção administrativa ainda não implementada.

Autorizar expressamente a base administrativa exclusiva do treino e a publicação dos **29 IDs do manifesto**, reconhecendo que não representa revisão jurídica nem comprovação de direitos e que a marcação de licença/autoria pendente será preservada. Identificar a conta ADMIN responsável, sem fornecer senha ou token.

Até essa confirmação, o número de questões liberadas por esta operação permanece **zero**. Não houve push, deploy, alterações no Professor/Simulados ou migration no Supabase.
