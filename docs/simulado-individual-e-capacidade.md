# Simulado individual e capacidade do banco

Entrega de 12/11/2026, branch `fernando/questoes-diagnostico-autoral`.

## Medição do banco

Leitura do Supabase configurado em 12/11/2026, 15:29 UTC:

| Medida | Resultado |
|---|---:|
| Questões / alternativas | 123 / 492 |
| Questões com índices e TOAST | 352.256 bytes |
| Alternativas com índices e TOAST | 237.568 bytes |
| Duas tabelas juntas | 589.824 bytes = 576 KiB |
| Banco inteiro | 16.477.331 bytes, aproximadamente 15,7 MiB |

O acervo atual é pequeno. Essa medição não caracteriza sobrecarga, não informa a franquia do plano e não demonstra capacidade para um número específico de usuários. Não foi feito teste de carga ou medição de CPU. [Tamanho do banco e uso total de disco são medidas diferentes](https://supabase.com/docs/guides/platform/database-size); [consultas, conexões e recursos computacionais](https://supabase.com/docs/guides/platform/performance) também influenciam o desempenho.

Com o uso, crescem tentativas, respostas e cópias históricas. Um simulado completo gera 30 vínculos de questões e até 30 respostas, além da sessão. A cópia do conteúdo preserva a prova realizada quando o acervo é editado, ocupando espaço adicional deliberadamente.

A nova seleção consulta o inventário das cinco disciplinas de uma vez e filtra as questões respondidas no banco. Ainda carrega o conteúdo elegível para validar sua integridade; esse custo cresce com o acervo. Antes de volume grande, medir latência, CPU e conexões e considerar projeções menores e seleção limitada no banco. Dois inícios concorrentes no teste verificam integridade, não capacidade de carga. Não há motivo demonstrado para contratar outro plano por causa dessas 123 questões.

## Fluxo implementado

- 30 questões distintas e inéditas por aluno, seis em cada uma das cinco disciplinas. Exclui questões respondidas em diagnóstico, prática ou outras tentativas.
- Disponibilidade por disciplina. Excedente de uma disciplina não compensa falta em outra.
- Retomada da tentativa ativa; dois inícios concorrentes convergem para a mesma tentativa.
- Respostas salvas individualmente e editáveis antes da entrega. Sem limite de tempo nesta versão.
- Entrega exige 30 respostas; gabarito, comentários e desempenho por disciplina aparecem somente depois dela.
- Questões e alternativas preservadas em snapshots da tentativa. Edição posterior no acervo não muda sua correção.
- Resultado próprio, sem substituir o diagnóstico inicial ou atualizar o nível do aluno.
- Histórico identifica `INDIVIDUAL` e não divulga acertos parciais pelo resumo de aprendizagem antes da entrega.
- A rota de trilhas exige vínculo real de origem de trilha, impedindo seu uso para abrir ou corrigir o simulado misto.

Não é prova completa ou oficial da OAB: o lote autoral cobre cinco disciplinas e dez assuntos.

## API, interface e publicação

API autenticada de ALUNO em `/individual-exams`: `GET /availability`, `POST /`, `GET /:id`, `PUT /:id/answers/:questionId`, `POST /:id/finalize`, `GET /:id/result`. Usa `Cache-Control: no-store`. No servidor também passa pelo controle acadêmico e exigência do diagnóstico inicial. A interface fica em Simulados, com tentativa em `/simulados/individual/:id`.

A migration `20261112130000_individual_exam_sessions` cria a identidade de sessão com vínculo composto de propriedade e índice por aluno/data. Tem RLS e nega acesso direto a PUBLIC/anon/authenticated. Não modifica os lotes de questões existentes.

**A migration não foi aplicada no Supabase compartilhado e as flags não foram ativadas.** As 60 novas questões permanecem privadas e pendentes de revisão. O teste utilizou somente PostgreSQL descartável próprio.

Para liberar: aplicar a migration no destino conferido, validar acervo liberado suficiente, ativar `INDIVIDUAL_EXAM_SCHEMA_ENABLED`, depois `INDIVIDUAL_EXAM_API_ENABLED` e `VITE_INDIVIDUAL_EXAM_UI_ENABLED`. Validar também o fluxo real no navegador antes de liberar para alunos. A flag de schema deve permanecer verdadeira se houver sessões históricas, mesmo com a API fechada, para preservar a classificação do histórico. Sem as duas flags da API, a rota não consulta a nova tabela; a interface desativada também não busca dados.

## Verificações

- Builds de backend e frontend passaram; permanece o aviso de tamanho do bundle.
- 60 testes focados passaram em seis arquivos, cobrindo seleção, estoque, respostas, entrega, flags, prática, histórico e serviço de trilha.
- Um teste integrado de ciclo completo passou com PostgreSQL 17.11 descartável e HTTP autenticado: início concorrente, retomada, isolamento de aluno, restrição de professor, estoque privado, gabarito reservado, entrega incompleta, snapshot após edição, bloqueio depois da entrega e preservação do nível inicial.
- Harness aplicou 22 migrations em banco novo, repetiu deploy sem pendências, conferiu preservação histórica e ausência de diferenças entre migrations e schema. Cluster encerrado ao final.
- A primeira execução encontrou diferença no nome da chave estrangeira. O mapeamento foi corrigido e a repetição completa passou.
- A geração normal do Prisma esbarrou em DLL nativa em uso. O harness gerou um cliente isolado com sucesso e confirmou equivalência do modelo do cliente local com o schema. O backend em uso não precisou ser encerrado.
- Uma execução adicional reproduziu quatro falhas conhecidas de `trail-server.test.ts`: a proteção de administração geral retorna uma mensagem 403 diferente da esperada pelo teste antigo. A suíte inteira não está sendo apresentada como aprovada. O remoto já possui mudanças nesse arquivo; não foram duplicadas aqui.
- Sem validação visual/funcional do navegador e sem teste de carga. Sem novas escritas no Supabase compartilhado nesta etapa.

## Atenção na integração

GitHub consultado: `main` em `31a098de43d3707a8bbc0116e70add5f6930c39c`, onze commits à frente da base local anterior `a6d1dbd`. Não foi feito merge, rebase ou push. A comparação não mostrou nova implementação do simulado misto nessa atualização. `entrega0911` mantém três commits próprios, com alterações sobrepostas em trilhas, histórico e navegação.

Revisar na integração futura `server.ts`, `student-history-repository.ts`, `trail-repository.ts`, `main.tsx`, `student-progress.tsx`, `vitest.config.ts` e o harness. Preservar o filtro de origem real da trilha junto com as correções de concorrência da outra branch.
