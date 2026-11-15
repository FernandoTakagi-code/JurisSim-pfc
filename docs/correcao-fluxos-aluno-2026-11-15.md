# Correções locais dos fluxos do aluno

Base: `567896373c8235315341abf13b82b173f2e4f652`. Trabalho exclusivo no checkout JurisSim_Vercel. Nenhum commit, push ou deploy. Os arquivos de dependências já estavam modificados antes do trabalho e foram preservados.

## Causas e correções

- **Questões:** as flags de UI/API/esquema estavam ausentes no ambiente local. O fluxo já existia, incluindo persistência, retomada e resultado. As tabelas necessárias foram verificadas por leitura antes de ativar as flags locais. A disponibilidade agora pode ser consultada pela UI. Estoque insuficiente mantém 5/10/20 desabilitados; falhas de conexão e respostas de erro da API aparecem como erros, sem serem convertidas em estoque vazio. A seleção revalida a elegibilidade e usa conteúdo atualizado dentro da transação, evitando iniciar com uma questão cuja liberação foi revogada entre a consulta e o início. Nenhuma aprovação foi criada no banco real.
- **Simulados individuais:** a mensagem “em preparação” vinha da flag de UI ausente; a API também estava desativada. A implementação de 30 questões, seis por disciplina, já existia. As flags locais foram ativadas após verificar as tabelas. A consulta da tentativa ativa passou a carregar somente identificação e indicador provisório na disponibilidade; início e retomada continuam carregando os snapshots completos. Avaliações de turma continuam separadas.
- **Trilha:** o resultado histórico do diagnóstico inicial estava atrás da mesma flag que desativa novas tentativas. A rota GET de resultado passou a exigir autenticação e papel ALUNO antes de consultar o serviço, independentemente dessa flag. Propriedade e finalização continuam obrigatórias. Foi possível ler um resultado inicial histórico com recomendação diretamente do serviço no banco configurado. Não houve acesso à sessão específica do aluno que relatou o erro nem aos logs da hospedagem; portanto não se afirma que essa era a única causa na Vercel.
- **Seleção da trilha:** anteriormente bastava `publica: true`. Novas sessões exigem a elegibilidade editorial completa, descartam conteúdo inválido, paginam em lotes de 200 e revalidam antes da criação. Tentativas já vinculadas continuam retomáveis. Uma falta de acervo não apaga a recomendação nem o histórico.
- **Diagnóstico legado:** o serviço de resultado passou a usar a consulta específica de resultado, preservando o snapshot histórico e evitando carregar alternativas e metadados editoriais atuais desnecessários.
- **Desempenho:** autenticação é reutilizada apenas dentro da mesma requisição Express; nova requisição reconsulta sessão, confirmação e permissões. A consulta dos IDs respondidos passou a filtrar pela relação com Questao, sem carregar o inventário uma segunda vez. Leituras independentes no início do treino são paralelas. `/questoes` e `/simulados` deixaram de carregar overview, resultado de diagnóstico e metas ao montar. Aulas são carregadas sob demanda.
- **Menu:** “Instituições e solicitações” e o seletor equivalente de contexto foram retirados da área pessoal do aluno. O menu docente, a área institucional própria e os módulos administrativos foram preservados. Nenhuma tabela ou módulo de backend foi apagado.

## Dados reais observados — somente leitura

No banco apontado pelo `.env` local: 183 questões, 63 públicas, zero com revisão jurídica completa registrada, 80 com revisão pedagógica completa e zero com liberação de acervo completa. O filtro editorial retornou **zero elegíveis** nas cinco disciplinas. Logo, habilitar as funcionalidades não permite legitimamente criar novos treinos/simulados com esse acervo.

Treinos exigem 5, 10 ou 20 questões elegíveis e inéditas no filtro escolhido; o simulado exige seis por disciplina. Questões já respondidas pelo aluno também são excluídas. Lotes provisórios não foram ativados para contornar esse bloqueio.

## Ambiente

- Processo Vite do checkout: `[::1]:5173`. Nenhum listener na porta 5174 no momento da inspeção.
- Backend do checkout: porta 3333; o frontend foi explicitamente configurado com `http://127.0.0.1:3333`.
- Ajustes locais ignorados pelo Git: `frontend/.env` (`VITE_API_URL`, `VITE_QUESTION_PRACTICE_UI_ENABLED`, `VITE_INDIVIDUAL_EXAM_UI_ENABLED`) e `backend/.env` (`QUESTION_PRACTICE_SCHEMA_ENABLED`, `QUESTION_PRACTICE_API_ENABLED`, `INDIVIDUAL_EXAM_SCHEMA_ENABLED`, `INDIVIDUAL_EXAM_API_ENABLED`). Credenciais existentes preservadas.
- `npm.cmd run config:check`: backend e frontend válidos no perfil local. Isso valida formato, não a validade de provedores externos.
- As flags de novas tentativas do diagnóstico inicial e as flags institucionais não foram alteradas. Não houve alteração de configuração na Vercel/Render.

## Medições

Medições de serviço/repositório com o Prisma e banco configurados, não tempos HTTP completos: três amostras sequenciais antes e três depois, mesma máquina e aluno histórico, sem escrita. Incluem consultas ao banco. A primeira amostra pode incluir aquecimento do pool. Não havia credencial de sessão de aluno fornecida para medir as requisições autenticadas completas.

| Operação | Antes (ms) | Depois (ms) | Mediana antes → depois |
| --- | --- | --- | --- |
| Disponibilidade do treino Civil | 204 / 84 / 90 | 202 / 99 / 98 | 90 → 99; sem ganho consistente neste acervo vazio |
| Disponibilidade do simulado individual | 325 / 325 / 330 | 86 / 90 / 84 | 325 → 86; redução de aproximadamente 74% |
| Resultado do diagnóstico inicial histórico | 353 / 360 / 355 | 356 / 333 / 340 | 355 → 340; variação pequena, sem otimização específica desse serviço |

Bundle inicial de produção: JavaScript **686,53 → 526,17 KB** (gzip **195,67 → 151,17 KB**); CSS **193,02 → 172,68 KB**. O conteúdo de estudo saiu para um chunk de 160,56 KB carregado sob demanda. Isso reduz transferência inicial, mas não certifica tempo de renderização nem latência na Vercel.

Índices existentes foram inspecionados: histórico de Simulado por aluno/data, sessões por aluno/data, unicidade de vínculos e respostas, Questao por origem/disciplina/nível. Nenhum índice foi criado no banco real; o tamanho e os planos observados não justificam afirmar necessidade de nova migração. Não foi realizado teste de carga em produção.

## Verificação

- Backend sem banco: `npm.cmd run test:no-db -- --reporter=dot` — **102 arquivos, 1.430 testes aprovados**. Inclui regressões de autenticação por requisição, propriedade de resultado, elegibilidade revogada, paginação editorial e resumo do simulado.
- Integração direcionada: `node scripts/test-migrations-local.cjs "C:/Program Files/PostgreSQL/17/bin" --question-practice-only` — **4 arquivos, 23 testes aprovados**, PostgreSQL descartável real; criação, respostas, retomada, correção, isolamento entre modalidades/alunos, concorrência, rollback e preservação histórica. Migrações executadas somente no cluster temporário; sem drift; cluster encerrado.
- Integração completa posterior: `--integration-suite-only` — **123 testes aprovados, 1 falhou e 8 ignorados** (14 arquivos: 12 aprovados, 1 falhou, 1 ignorado). Os oito testes de prática passaram, incluindo os novos ciclos completos de **5, 10 e 20 questões**; simulado individual e ciclo de trilhas também passaram. A falha foi `concurrent real PostgreSQL reservations permit only one SMTP send across service instances`, em `institution-decision-email.integration.test.ts`: Prisma informou que não conseguia conectar a `127.0.0.1:49254` durante dez reservas concorrentes. É um teste de e-mail institucional fora dos módulos alterados; a causa desse erro de conexão permanece sem resolução. O log do PostgreSQL descartável registrou conexões encerradas/erro Winsock 10054, e o cluster foi encerrado pelo harness. **A suíte completa não ficou verde.**
- Frontend: `npm.cmd run test:delivery-static` — aprovado, incluindo preservação de navegação administrativa e docente.
- Navegador Chrome/Edge headless: `node scripts/test-student-flows.mjs` — **7 verificações aprovadas**, UI real com API simulada e dados sintéticos isolados: `/questoes`, `/simulados`, `/trilha`, opções habilitadas/estoque vazio, falhas distintas de rede/backend, salvamento/retomada, entrega/resultado e recomendação mantida sem exercícios. No teste de entrega, as demais respostas do simulado são preenchidas na fixture persistida; a persistência HTTP das 30 respostas é coberta na integração real.
- Builds backend e frontend aprovados. O frontend ainda emite aviso de chunk principal acima de 500 KB e comentários de tree shaking em dependência; não são erros de build.
- A primeira execução ampla encontrou fixtures de trilha sem elegibilidade editorial. Foram mantidas fixtures legadas para os testes de histórico e criadas condições editoriais sintéticas somente no banco descartável para os testes de novas trilhas; a validação de produção não foi relaxada.

## Arquivos de implementação

- `backend/src/middlewares/auth-middleware.ts`
- `backend/src/repositories/diagnostic-repository.ts`
- `backend/src/repositories/prisma-individual-exam-repository.ts`
- `backend/src/repositories/prisma-question-practice-repository.ts`
- `backend/src/repositories/trail-repository.ts`
- `backend/src/routes/initial-diagnostic-routes.ts`
- `backend/src/services/diagnostic-service.ts`
- `backend/src/services/individual-exam-service.ts`
- `backend/src/services/question-practice-service.ts`
- `frontend/src/integration-shell.tsx`
- `frontend/src/main.tsx`
- `frontend/src/student-progress.tsx`

Testes e diagnóstico: `backend/scripts/diagnose-student-flows.ts`, `backend/src/repositories/trail-eligibility.test.ts`, `backend/src/repositories/diagnostic-repository.test.ts`, `backend/src/repositories/prisma-question-practice-repository.test.ts`, `backend/src/routes/auth-security.test.ts`, `backend/src/routes/initial-diagnostic-routes.test.ts`, `backend/src/services/diagnostic-service.test.ts`, `backend/src/services/individual-exam-service.test.ts`, `backend/src/__tests__/integration/attempt-lifecycle.integration.test.ts`, `backend/src/__tests__/integration/question-practice.integration.test.ts`, `frontend/scripts/test-student-flows.mjs` e este relatório.

## Pendências reais

1. Acervo editorial elegível, em quantidade suficiente por filtro e disciplina. Revisões, direitos e liberação precisam ocorrer pelo processo legítimo; não foram inventados nem importados registros para liberar botões.
2. Validação com uma sessão real do aluno nas telas e no ambiente publicado. Foram testadas UI com API simulada, API com banco descartável e leituras do banco configurado, mas não uma jornada autenticada de aluno real no banco de produção.
3. Mudanças permanecem locais. Aplicar código e flags na hospedagem exige autorização posterior de commit/push/deploy e verificação separada do ambiente publicado.
4. Investigar a falha de conexão do teste concorrente de e-mail institucional da suíte completa; não bloqueou os testes relacionados às três funcionalidades, mas impede declarar todos os testes de integração aprovados.
