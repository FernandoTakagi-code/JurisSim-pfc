# Validação e ativação das funções de questões

## Checagem do acervo

O script `backend/scripts/check-question-inventory.ts` usa os mesmos `inventoryWhere`, `inventorySelect`, `toEligibleCandidate` e `INITIAL_DIAGNOSTIC_COMPOSITION` dos serviços. A resolução prioriza `INVENTORY_CHECK_DATABASE_URL`; se estiver ausente ou vazia, lê somente a atribuição `DATABASE_URL` de `backend/.env`. Essa leitura pontual não carrega `.env` em `process.env`, nem torna outras variáveis disponíveis ao processo. Executa toda a leitura em uma transação PostgreSQL `READ ONLY`. Não retorna enunciados, IDs, URLs de conexão ou credenciais.

Em falhas, exibe apenas uma categoria e uma mensagem fixa sanitizada: `CONNECTION`, `AUTHENTICATION`, `PERMISSION`, `MIGRATIONS_OR_SCHEMA`, `TIMEOUT` ou `QUERY`. Mensagens originais, URL, senha, parâmetros e stack trace não são impressos.

Critérios comuns: questão pública, sem turma, em uma das cinco disciplinas suportadas, publicada/liberada para o acervo, com revisões jurídica e pedagógica registradas por revisores, enunciado/fundamentação/assunto completos, quatro alternativas A–D distintas e exatamente uma correta. Questões OAB também precisam estar válidas, com direitos documentados (autorização ou domínio público) e identificação/fonte oficial completas. Questões de professor não integram o acervo público elegível. O diagnóstico requer, **para cada disciplina**, 2 IA básicas, 1 IA intermediária, 1 OAB intermediária e 2 OAB avançadas: 30 slots exatos.

Prática usa o mesmo filtro de elegibilidade e suporta quantidades de 5, 10 ou 20 questões inéditas por aluno e assunto. A checagem informa totais e capacidade por assunto; não consulta respostas nem dados pessoais. Capacidade operacional por aluno pode ser menor devido a questões já respondidas. Código de saída: `0` critérios atendidos, `1` inventário insuficiente, `2` variável/consulta/ambiente inválido.

No PowerShell, a URL pode vir de `backend/.env`. Para ambientes de CI/produção, prefira injetar `INVENTORY_CHECK_DATABASE_URL` por um gerenciador de segredos ou sessão segura sem gravá-la no histórico. Depois execute na raiz:

```powershell
npm --prefix backend run inventory:check
```

Exemplo de integração CI: mapear o segredo de leitura da base alvo para `INVENTORY_CHECK_DATABASE_URL` no ambiente do processo; não passar a URL como argumento de linha de comando nem incluir a saída de ambiente em logs. A variável dedicada sempre tem prioridade sobre `backend/.env`. Use uma credencial com apenas `CONNECT` e `SELECT` nas tabelas necessárias. Mesmo com uma credencial mais privilegiada, o script impõe transação somente leitura no PostgreSQL.

## Flags: pré-requisitos e ordem

As flags permanecem `false`; a checagem não as altera e nenhuma migration é executada por ela.

1. Confirmar backup/plano de recuperação e aplicar, pelo processo de release aprovado, todas as migrations pendentes. A prática requer `20261028120000_question_practice_topic` e as migrations anteriores do conjunto. Não executar `prisma migrate deploy` como parte da checagem de acervo.
2. Confirmar permissões de leitura e executar `inventory:check` no ambiente alvo. Para diagnóstico, o resultado precisa ser APTO e cobrir cada slot. Para prática, revisar a disponibilidade por assunto e confirmar questões inéditas em quantidade suficiente para a experiência pretendida.
3. Ativar backend da prática em sequência: `QUESTION_PRACTICE_SCHEMA_ENABLED=true` (schema já aplicado), depois `QUESTION_PRACTICE_API_ENABLED=true` (inventário verificado e smoke test autenticado aprovado).
4. Ativar diagnóstico: `INITIAL_DIAGNOSTIC_API_ENABLED=true` após migrations, inventário APTO e smoke test autenticado. `INITIAL_DIAGNOSTIC_REQUIRED=true` é uma decisão separada de produto e só deve vir depois da API estável, com login/recuperação e conclusão do diagnóstico verificados; essa flag redireciona alunos sem diagnóstico e restringe rotas de estudo.
5. Publicar o frontend com `VITE_QUESTION_PRACTICE_UI_ENABLED=true` e/ou `VITE_INITIAL_DIAGNOSTIC_UI_ENABLED=true` somente depois da API correspondente estar ativa. As flags `VITE_*` são incorporadas no build: gere e publique novo bundle após alterar.

## Reversão

Para interromper exposição imediatamente, desligue primeiro a flag `VITE_*` correspondente e publique o novo frontend; desligue também a flag de API correspondente no backend (`QUESTION_PRACTICE_API_ENABLED=false` ou `INITIAL_DIAGNOSTIC_API_ENABLED=false`). Para o diagnóstico obrigatório, desligue `INITIAL_DIAGNOSTIC_REQUIRED=false` caso o fluxo de entrada precise deixar de bloquear alunos pendentes. Reinicie/recicle os processos para garantir que variáveis de ambiente foram recarregadas. Não reverta nem apague migrations/dados como resposta a rollback de feature; mantenha o schema aditivo. Reexecute a checagem read-only após corrigir o acervo e faça smoke tests antes de reativar.

## Limite desta validação

Não conecte produção sem autorização explícita. Uma execução local contra banco descartável valida código e política, mas não comprova o acervo do ambiente alvo. A checagem acima deve ser executada manualmente no alvo por operador autorizado; credenciais e resultado real não são presumidos.
