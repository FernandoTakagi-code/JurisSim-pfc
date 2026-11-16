# Acervo do aluno — consulta real e correções

Consulta realizada na conexão existente do projeto, em transação PostgreSQL `READ ONLY` e isolamento RepeatableRead. Foram reutilizados `practiceInventoryWhere`, `isPracticeSelectable`, `inventorySelect` e `practiceExclusionScope` do código atual. Nenhuma questão, resposta, tentativa ou configuração operacional do Supabase foi alterada.

## Resultado

| Disciplina | Questões existentes | Elegíveis para novos treinos na configuração atual |
| --- | ---: | ---: |
| Direito Constitucional | 38 | 0 |
| Direito Civil | 37 | 0 |
| Direito Administrativo | 37 | 0 |
| Direito Penal | 36 | 0 |
| Direito do Trabalho | 35 | 0 |
| Total | 183 | 0 |

Nenhuma questão passou sequer pelo filtro SQL de publicação, revisão e liberação. A filtragem posterior de conteúdo não é a causa única do estoque zerado.

- 183 sem revisão jurídica completa (data e responsável).
- 183 sem liberação do acervo (data e responsável).
- 103 sem revisão pedagógica completa.
- 120 privadas, todas sem vínculo com turma em `Questao`.
- 33 não atendem à validação de conteúdo completo, incluindo a estrutura de alternativas.

Essas contagens se sobrepõem: não devem ser somadas. `publica=true` não equivale a aprovação editorial. A existência de questões em tentativas antigas também não as torna elegíveis para novas sessões.

O piloto privado de prática está desativado na configuração existente; não foi habilitado. Não foi inventada revisão jurídica, licença ou aprovação para liberar as questões.

## Disciplinas, assuntos e treino existente

As cinco disciplinas são fixas tanto em `frontend/src/question-practice.tsx` como em `PRACTICE_DISCIPLINES` e nos critérios de elegibilidade do backend. O banco consultado contém exatamente essas cinco disciplinas. Não há uma sexta disciplina existente omitida pela interface nesta consulta. Tornar o currículo dinâmico é uma evolução de contrato e regras, não uma correção que deva ser feita apenas removendo a lista do frontend.

O seletor de assuntos mostra os assuntos do acervo elegível, com contagem de inéditas por aluno. Como não há questões elegíveis, ele não mostra todos os assuntos dos 183 registros brutos. Expor questões privadas/não liberadas nesse seletor não resolveria a disponibilidade.

Foram encontradas cinco sessões de prática em andamento: uma de 10 questões e quatro de 5, distribuídas entre Administrativo, Constitucional e Trabalho. Não foram identificados usuários na documentação. Em todas, o acervo novo elegível correspondente é zero antes mesmo de excluir questões respondidas. Portanto, o treino existente não causa o estoque zerado.

O serviço encontra a sessão em andamento independentemente da elegibilidade atual do novo acervo e permite retomá-la. Questões já respondidas fora do diagnóstico inicial são excluídas apenas da seleção de inéditas; a sessão ativa não subtrai indiscriminadamente todas as questões do banco.

## Correções implementadas

- API de disponibilidade agora informa `eligibleCount`, `answeredCount` e um motivo específico: sem elegíveis, elegíveis já respondidas ou quantidade insuficiente de inéditas.
- As contagens consideram somente questões autorizadas e o filtro selecionado. Não expõem ao aluno o conteúdo nem os totais privados do banco.
- A tela distingue falha de consulta de estoque insuficiente e de ausência de questões liberadas.
- Quando há treino/revisão em andamento, os controles de quantidade explicam esse estado; o botão de continuar permanece funcionando pelo fluxo existente.
- O aviso de estoque vazio explica a dependência de questões elegíveis, preservando histórico e retomada.
- Nenhum filtro de elegibilidade foi relaxado. As quantidades 5/10/20 continuam exigindo estoque real suficiente.

## O que já existe e o que falta

Já existem filtros por disciplina e assunto, disponibilidade por assunto, exclusão de questões respondidas, seleção 5/10/20, retomada, correção por resposta, salvamento e resultado. A consulta provou falta de acervo liberado, não falta desses endpoints.

Para novos treinos funcionarem com o acervo atual, é necessário o processo real de revisão, integridade de conteúdo e liberação editorial por responsáveis autorizados. Isso exige dados/decisões e escritas especificamente autorizadas; não foi executado. A estrutura de prática existe e essa indisponibilidade não é resolvida pelas migrations pendentes de atividades e ciclo de vida.

Uma visão de disponibilidade de todas as disciplinas simultaneamente pode ser implementada depois, usando somente contagens elegíveis e autorização existente. Não é necessária para corrigir o estoque zero e não foi introduzida como redesign nesta etapa.

## Outras missões preservadas

- ADMIN: os dois indicadores de atividades foram ocultados apenas quando não há contagem real; zero real continua visível. O grid se ajusta ao número de cards. Código de ativação futura preservado.
- Instituição: `0f81340` do Fernando já é ancestral de HEAD e está em `origin/entrega-16-11`. O fetch não trouxe correção posterior. Integração encerrada conforme orientação do usuário; capacidade de gestão institucional de simulados permanece desativada.
- Aluno/trilha: histórico mantém o ID da recomendação e passa a informar separadamente o ID da tentativa vinculada. Retomar/ver resultado conhecidos navegam sem POST de geração. Compatibilidade com respostas antigas preservada.
- Dashboard do professor e Perfil e configurações não foram modificados.

## Validação e limites

- Backend: 1.484 testes unitários aprovados em 108 arquivos após as correções. Dois timeouts de processamento de foto ocorreram em uma execução anterior sob carga paralela; o arquivo isolado passou com 43 testes e a suíte completa posterior passou sem alterar Perfil.
- Frontend: oito scripts de entrega estática aprovados, incluindo 19 verificações ADMIN e os contratos de retomada/resultado da trilha. Quatro testes de progresso/revisão de exercícios também passaram.
- Builds frontend e backend aprovados. O frontend usa `--configLoader runner` porque o loader padrão do esbuild encontrou uma restrição de leitura do sandbox; não foi alterada a configuração do projeto para contornar isso.
- 32 migrations aprovadas em PostgreSQL descartável, incluindo instalação vazia, evolução histórica, reaplicação sem pendências, drift inexistente e checksums preservados.
- Suíte ampla de integração: 173 aprovados, 9 ignorados e 1 falha em `teacher-management-browser.integration.test.ts`, durante consulta de atividades no navegador docente, com erro Prisma `P1001`. Não foi declarada aprovação dessa suíte e o módulo do professor não foi alterado. A causa definitiva dessa falha de conexão no teste isolado ainda não foi estabelecida.
- Integração direcionada de prática, revisão, simulados individuais e ciclo de tentativas: 27 testes aprovados em quatro arquivos, com PostgreSQL descartável, sem drift ao final. O cluster temporário foi encerrado pelo harness.
- `git diff --check` aprovado e hashes dos arquivos de Perfil preservados.

O usuário confirmou visualmente `/questoes` com uma conta ALUNO real. Os logs autenticados confirmaram consultas de sessão, disponibilidade, desempenho, estudo e histórico ao longo da navegação. Não há conexão de controle com o navegador para comprovar independentemente todas as telas ou tamanhos de viewport.

Não foram criadas tentativas ou respostas no Supabase. Escritas de testes ocorreram exclusivamente no PostgreSQL descartável do harness. Nenhum commit, push, deploy ou migration no banco real foi executado.

## Inventário por assunto

Arquivos alterados nesta execução: `backend/src/services/question-practice-service.ts`, seu teste, `backend/src/repositories/student-history-repository.ts`, novo teste `student-trail-progress.test.ts`, `frontend/src/question-practice.tsx`, `frontend/src/trail-launch.tsx`, `frontend/src/adaptive-trail.tsx`, `frontend/src/student-progress.tsx`, `frontend/src/administration.tsx`, `frontend/src/administration.css`, `frontend/scripts/test-administration.cjs`, novo `frontend/scripts/test-trail-launch.cjs` e `frontend/package.json`. As alterações locais anteriores foram mantidas; nenhum commit novo foi criado, HEAD continua `df01e20`. O script e o resultado agregado da consulta somente leitura ficam em `backend/.local`, ignorado pelo Git.

Os valores abaixo são agregados da consulta administrativa de diagnóstico; não são promessa de disponibilidade ao aluno. Todas as linhas possuem zero questões elegíveis na configuração atual.

| Disciplina | Assunto | Total | Elegiveis |
| --- | --- | ---: | ---: |
| Direito Administrativo | Agentes públicos | 1 | 0 |
| Direito Administrativo | Anulação e revogação | 1 | 0 |
| Direito Administrativo | Atos administrativos | 1 | 0 |
| Direito Administrativo | Avocação de competência | 1 | 0 |
| Direito Administrativo | Competência administrativa | 1 | 0 |
| Direito Administrativo | Convalidação de atos administrativos | 1 | 0 |
| Direito Administrativo | Imparcialidade e participação no processo | 12 | 0 |
| Direito Administrativo | Instrução e decisão administrativa | 12 | 0 |
| Direito Administrativo | Motivação de sanções administrativas | 1 | 0 |
| Direito Administrativo | Prazo recursal e efeito suspensivo | 1 | 0 |
| Direito Administrativo | Princípios da Administração Pública | 3 | 0 |
| Direito Administrativo | Recurso ordinário e revisão sancionadora | 1 | 0 |
| Direito Administrativo | Responsabilidade civil do Estado | 1 | 0 |
| Direito Civil | Capacidade civil | 1 | 0 |
| Direito Civil | Cessão de crédito e pagamento | 1 | 0 |
| Direito Civil | Cláusula penal | 1 | 0 |
| Direito Civil | Contratos e negócios jurídicos | 12 | 0 |
| Direito Civil | Domicílio profissional | 1 | 0 |
| Direito Civil | Locação de imóveis urbanos | 1 | 0 |
| Direito Civil | Modalidades das obrigações | 12 | 0 |
| Direito Civil | Negócio jurídico | 1 | 0 |
| Direito Civil | Personalidade jurídica | 1 | 0 |
| Direito Civil | Prescrição | 1 | 0 |
| Direito Civil | Prescrição e Decadência | 1 | 0 |
| Direito Civil | Responsabilidade civil | 1 | 0 |
| Direito Civil | Solidariedade nas obrigações | 1 | 0 |
| Direito Civil | Solidariedade: renúncia e rateio da insolvência | 1 | 0 |
| Direito Civil | Venda de ascendente a descendente | 1 | 0 |
| Direito Constitucional | Alistamento e voto facultativos | 1 | 0 |
| Direito Constitucional | Cláusulas pétreas | 1 | 0 |
| Direito Constitucional | Competência legislativa concorrente | 1 | 0 |
| Direito Constitucional | Controle concentrado: quóruns e modulação | 1 | 0 |
| Direito Constitucional | Controle de constitucionalidade | 1 | 0 |
| Direito Constitucional | Direito de petição | 1 | 0 |
| Direito Constitucional | Direitos e Garantias Fundamentais | 1 | 0 |
| Direito Constitucional | Direitos e garantias fundamentais | 2 | 0 |
| Direito Constitucional | Direitos individuais e coletivos | 12 | 0 |
| Direito Constitucional | Direitos políticos | 1 | 0 |
| Direito Constitucional | Liberdade de associação | 1 | 0 |
| Direito Constitucional | Mandado de segurança: decadência e reconsideração | 1 | 0 |
| Direito Constitucional | Organização do Estado e processo legislativo | 12 | 0 |
| Direito Constitucional | Poder Legislativo | 1 | 0 |
| Direito Constitucional | Processo legislativo | 1 | 0 |
| Direito Penal | Arrependimento posterior | 1 | 0 |
| Direito Penal | Arrependimento posterior: marco temporal e redução | 1 | 0 |
| Direito Penal | Concurso formal próprio e limite da soma | 1 | 0 |
| Direito Penal | Culpabilidade e imputabilidade | 12 | 0 |
| Direito Penal | Desistência voluntária | 1 | 0 |
| Direito Penal | Erro sobre elemento do tipo | 1 | 0 |
| Direito Penal | Excludentes de ilicitude | 1 | 0 |
| Direito Penal | Excludentes e concurso de pessoas | 12 | 0 |
| Direito Penal | Imputabilidade penal | 1 | 0 |
| Direito Penal | Lugar do crime | 1 | 0 |
| Direito Penal | Princípios do Direito Penal | 1 | 0 |
| Direito Penal | Tempo do crime | 1 | 0 |
| Direito Penal | Tentativa | 1 | 0 |
| Direito Penal | Teoria do Crime — Excludentes de Ilicitude | 1 | 0 |
| Direito do Trabalho | Aviso prévio | 1 | 0 |
| Direito do Trabalho | Banco de horas individual | 1 | 0 |
| Direito do Trabalho | Banco de horas: extinção antes da compensação | 1 | 0 |
| Direito do Trabalho | Contrato e alterações contratuais | 12 | 0 |
| Direito do Trabalho | Extinção do contrato e efeitos | 12 | 0 |
| Direito do Trabalho | Férias | 1 | 0 |
| Direito do Trabalho | Férias: fracionamento, início e comunicação | 1 | 0 |
| Direito do Trabalho | Horas extras | 1 | 0 |
| Direito do Trabalho | Intervalo entre jornadas | 1 | 0 |
| Direito do Trabalho | Jornada de trabalho | 1 | 0 |
| Direito do Trabalho | Pagamento do salário mensal | 1 | 0 |
| Direito do Trabalho | Relação de emprego | 1 | 0 |
| Direito do Trabalho | Retorno do teletrabalho ao presencial | 1 | 0 |
