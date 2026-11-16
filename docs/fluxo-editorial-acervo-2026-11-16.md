# Banco de Questões do Aluno e fluxo editorial — 16/11/2026

Branch `entrega-16-11`, base `df01e20`. Alterações locais anteriores preservadas. Nenhuma nova alteração foi feita no dashboard do Professor ou nos Simulados nesta etapa. Os ajustes dessas áreas realizados na etapa anterior não foram revertidos.

## A. Código implementado e validado

### Acervo do aluno

Permanecem implementadas as cinco disciplinas, o catálogo de assuntos públicos, as contagens de questões elegíveis/inéditas, a distinção entre falta de liberação e erro de consulta, os tamanhos 5/10/20 conforme estoque e a retomada das sessões existentes. Assuntos públicos pendentes são consultáveis, mas suas questões não entram na geração de treinos. Questões privadas de turmas continuam protegidas.

O backend revalida estoque e propriedade antes de criar ou retomar uma tentativa. O diagnóstico inicial não é regravado nem usado para fabricar questões novas. As revisões de respostas usam o histórico próprio e não alteram o diagnóstico, o resultado ou o nível original.

### Nova interface editorial

Endereço: `http://localhost:5173/administracao/acervo`, também acessível pelo atalho na visão geral ADMIN. Perfil e configurações permanece intacto.

API: `/question-editorial`, protegida por sessão válida, ADMIN verificado, conta não excluída/não suspensa e capacidade administrativa existente. As mesmas condições são verificadas novamente antes de gravar. Aluno, Professor e responsável institucional não recebem acesso a essa área. Questões privadas de turmas não são listadas nem abertas por essa interface global.

Etapas independentes:

1. Conferir enunciado, alternativas A–D, gabarito, justificativa, origem, documentação e pendências.
2. Registrar uma correção documental verdadeira, com evidência. Nenhum campo é preenchido automaticamente. Alterar a documentação invalida os registros de revisão anteriores.
3. Registrar revisão jurídica efetivamente realizada, com confirmação explícita e referência à evidência. Responsável e data vêm da sessão e do servidor, não do navegador.
4. Registrar revisão pedagógica efetivamente realizada, nas mesmas condições.
5. Liberar uma única versão revisada, com confirmação específica e evidência da autorização para publicação global. A liberação é recusada sem ambas as revisões auditadas e válidas, ou se o responsável por elas estiver indisponível.

Cada revisão é vinculada por SHA-256 ao conteúdo e à documentação exatos. Mudanças posteriores invalidam sua utilização na liberação. A validação final reutiliza o predicado de elegibilidade do acervo; não basta preencher datas.

As mudanças e seus eventos em `AdministrativeEvent` são gravados na mesma transação. Falha da auditoria reverte a revisão. Concorrência não duplica registros: operações concorrentes conflitantes retornam 409. Foi corrigido o tratamento do erro de serialização retornado por SQL bruto (Prisma P2010/PostgreSQL 40001), além de P2034 e deadlock 40P01.

Não há operação de aprovação em massa. Questões já liberadas não são modificadas neste fluxo. Conteúdo incompleto, documentos pendentes, questões oficiais anuladas e questões privadas de turma não são liberados. A interface não atribui qualificação jurídica a um usuário; registra a responsabilidade e a evidência da revisão humana declarada. Não substitui essa revisão.

### Proteção operacional

Nova flag: `QUESTION_EDITORIAL_WRITES_ENABLED`, desativada por padrão. No processo local ligado ao Supabase ela foi explicitamente mantida em `false`, sem editar o `.env` compartilhado. A consulta funciona sem essa flag.

Uma eventual ativação autorizada no processo local permite somente as rotas editoriais previstas (metadados, revisões e liberação). A proteção local continua bloqueando as outras mutações administrativas/acadêmicas. Ativar essa flag não habilita instituições, simulados ou aprovação automática; cada operação ainda exige autorização, evidências, confirmação humana e a versão atual da questão.

Nenhuma flag de escrita foi ativada nesta entrega. Nenhuma operação editorial foi executada nos dados reais.

## B. Situação dos dados reais

Verificações feitas exclusivamente por leitura, com PostgreSQL `transaction_read_only=on` confirmado:

| Item | Resultado |
| --- | ---: |
| Questões globais cadastradas | 183 |
| Conteúdo estrutural completo | 150 |
| Incompletas na identificação A–D | 33 |
| Completas privadas | 120 |
| Completas públicas | 30 |
| Sem revisão jurídica completa | 183 |
| Sem liberação do acervo | 183 |
| Sem revisão pedagógica completa | 103 |
| Licença/autoria explicitamente pendente | 150 |
| Elegíveis para novos treinos | 0 |

As categorias se sobrepõem. Os IDs e as pendências por registro constam em `auditoria-editorial-questoes-2026-11-16.csv`. Questão pública não equivale a questão editorialmente liberada.

A nova consulta editorial percorreu oito páginas e abriu detalhes sem falha: 183 registros, 150 completos, zero liberados, `writesEnabled=false`. Isso foi uma chamada de serviço em sessão de banco somente leitura, não uma sessão de navegador fabricada. Foi solicitada conferência manual da interface com o ADMIN legítimo; até a confirmação, a validação visual autenticada permanece pendente.

Os 60 assuntos públicos são consultáveis (13 Constitucional, 13 Civil, 12 Penal, 11 Administrativo e 11 Trabalho). Os outros dez aparecem apenas em questões privadas. Zero questões novas são elegíveis em todas as disciplinas. Sessões antigas podem ser retomadas independentemente desse estoque; isso não significa que uma nova tentativa tenha sido criada.

### Revisar respondidas

O código e a tabela `SessaoRevisaoQuestao` existem. Consultas somente leitura do serviço encontraram histórico revisável em contas reais; por disciplina, os máximos entre as dez contas consultadas foram 11 em Constitucional, 11 em Civil e 6 em Penal, Administrativo e Trabalho. Há contas com zero, portanto esses máximos não são disponibilidade de um aluno específico.

O ambiente atual tem a API/interface de revisão desativadas, separadamente do acervo inédito. Não foi contornada essa configuração. A ativação local proposta, sujeita a autorização, é:

```text
QUESTION_REVIEW_SCHEMA_ENABLED=true
QUESTION_REVIEW_API_ENABLED=true
VITE_QUESTION_REVIEW_UI_ENABLED=true
```

Não há migration a aplicar para essa tabela. Mesmo após habilitar a consulta, criar/responder uma sessão de revisão grava registros e continua dependendo da autorização correspondente; a proteção local atual bloqueia essas escritas.

## C. O que ainda depende de autorização ou trabalho humano

- Revisão jurídica e pedagógica real, documentação de fonte/licença e autorização de publicação para as 150 candidatas completas. Nenhuma aprovação foi inferida.
- Correção documentada das alternativas A–D e da fonte dos 33 registros incompletos. A nova interface não reescreve automaticamente enunciados, alternativas ou gabaritos.
- Autorização específica antes de habilitar escritas editoriais ou alterar qualquer questão real. Uma autorização de configuração não substitui a revisão efetiva de cada versão.
- Autorização para ativar as consultas do módulo de revisão de respondidas e, separadamente, para testar registros reais de revisão. Nenhuma flag foi alterada.

O antigo importador de lotes já valida evidências e identidades (ADMIN para liberação, ADMIN/PROFESSOR para revisão), mas cria registros novos. Não foi reutilizado como atalho para atualizar os 183 IDs existentes. O novo fluxo mantém os IDs e os vínculos históricos.

A diferença entre critérios de seleção dos simulados docentes e do treino do aluno foi registrada para coordenação com Fernando, conforme decisão explícita do usuário. Não foi alterada nesta tarefa.

## Testes

- Backend: 1.492 unitários aprovados em 109 arquivos; testes adicionais direcionados do tratamento de concorrência e da proteção local aprovados.
- Frontend: dez scripts estáticos aprovados, incluindo renderização editorial sem efeitos de rede, confirmação obrigatória, bloqueios, imutabilidade de publicados e escape de texto.
- Builds backend e frontend aprovados; frontend com `--configLoader runner` usado neste ambiente. Permanecem os avisos de bundle grande e de anotações de dependência, sem erro de build.
- Integração direcionada: 27 testes aprovados em três arquivos, incluindo fluxo editorial, autorização, versão do conteúdo, concorrência, rollback, catálogo, 5/10/20 nas cinco disciplinas, retomada sem duplicação e revisão de respostas. Inclui Chrome com login ADMIN legítimo, Express e PostgreSQL descartável, lista/detalhes somente leitura e recarga com e sem barra final.
- 32 migrations validadas em PostgreSQL descartável, sem drift, com histórico/checksums preservados. Nenhuma migration foi aplicada ao Supabase.
- Uma rodada ampla teve 182 aprovados, 9 ignorados e uma falha P1001 no diagnóstico concorrente, na conexão do PostgreSQL temporário. A rodada ampla seguinte teve 187 aprovados, 9 ignorados e uma falha no carregamento inicial do navegador institucional. O editor passou a carregar separadamente. A repetição institucional encontrou P1001 na consulta administrativa do banco temporário. Essas falhas não foram ocultadas nem contornadas com relaxamento de testes; a suíte ampla inteira não está declarada aprovada. A suíte editorial direcionada passou, incluindo seu teste de navegador autenticado.
- `git diff --check` aprovado. Hashes dos arquivos protegidos de Perfil conferidos sem alteração.

## Arquivos desta etapa

- `backend/src/services/question-editorial-service.ts` e seu teste unitário.
- `backend/src/routes/question-editorial-routes.ts`.
- `backend/src/__tests__/integration/question-editorial.integration.test.ts`.
- `backend/src/__tests__/integration/question-practice.integration.test.ts` (cinco disciplinas × três tamanhos, em banco descartável).
- `backend/src/middlewares/local-read-only-navigation.ts` e testes (capacidade editorial explícita, restante protegido).
- `backend/src/server.ts` (montagem da rota).
- `backend/scripts/test-migrations-local.cjs` (modo direcionado `--question-editorial-only`).
- `frontend/src/question-editorial.tsx` e CSS com escopo próprio.
- `frontend/src/admin-navigation.ts` e `frontend/src/administration.tsx` (registro e renderização da rota editorial, atalho). `main.tsx` mantém o encaminhamento ADMIN para o componente administrativo compartilhado.
- `frontend/scripts/test-question-editorial.cjs` e `frontend/package.json`.
- Este relatório. Scripts e resultados de consultas locais ficam em `backend/.local`, ignorado pelo Git.

Não foram criados commits, nem realizados push ou deploy. A branch mantém as alterações locais anteriores e novas, sem descarte de trabalho.
