# Auditoria editorial e telas do aluno — 16/11/2026

## Escopo e proteção dos dados

Auditoria real das 183 questões da conexão já configurada, com transação `READ ONLY`, sem publicação, revisão automática, criação de tentativas ou alteração de permissões. Não foram modificados o dashboard do professor nem Perfil e configurações. Todas as alterações locais anteriores foram preservadas.

O arquivo `auditoria-editorial-questoes-2026-11-16.csv` identifica individualmente os 183 registros por ID, disciplina, assunto, nível, origem, completude, privacidade e pendências. Não contém enunciados, gabaritos, credenciais, responsáveis ou dados pessoais.

## Critérios editoriais auditados

A classificação estrutural reutiliza `hasCompleteContent` do projeto: enunciado com pelo menos dez caracteres, disciplina e assunto preenchidos, justificativa não vazia, exatamente quatro alternativas com textos não vazios, letras A/B/C/D distintas e exatamente uma alternativa correta. Nível é um enum obrigatório no schema.

Também foram verificados presença de origem, fonte, referência e licença; situação privada/pública e vínculo de turma; datas e responsáveis das revisões jurídica e pedagógica; data e responsável da liberação; situação e verificação de direitos; registro de fonte oficial e eventual anulação.

Campos preenchidos não comprovam exatidão jurídica, originalidade, atualidade, titularidade, qualidade pedagógica ou autorização. Nenhuma dessas aprovações foi inferida. A auditoria foi estrutural e documental, não uma revisão jurídica do mérito dos enunciados e gabaritos.

## Resultado por disciplina

| Disciplina | Total | Conteúdo completo | Conteúdo incompleto | Privadas completas | Públicas completas |
| --- | ---: | ---: | ---: | ---: | ---: |
| Administrativo | 37 | 30 | 7 | 24 | 6 |
| Civil | 37 | 30 | 7 | 24 | 6 |
| Constitucional | 38 | 30 | 8 | 24 | 6 |
| Penal | 36 | 30 | 6 | 24 | 6 |
| Trabalho | 35 | 30 | 5 | 24 | 6 |
| **Total** | **183** | **150** | **33** | **120** | **30** |

As categorias privacidade e revisão são dimensões independentes, não grupos a somar. Todas as privadas são estruturalmente completas; os 33 registros incompletos são públicos, mas isso não os torna publicados editorialmente.

### Candidatas à revisão editorial

**150 questões IA** têm conteúdo estrutural completo e fonte, referência e licença preenchidas. Podem ser encaminhadas para revisão humana, preservando a privacidade das 120 privadas. Porém, as 150 licenças/autorias estão explicitamente pendentes. Dessas 150, 70 ainda não têm revisão pedagógica completa. Todas as 150 carecem de revisão jurídica e liberação do acervo.

O CSV permite selecionar `complete=True` para obter exatamente seus IDs; `private=True` separa as privadas. Isso é uma fila potencial de revisão, não autorização para publicar.

### Questões que precisam de saneamento antes da revisão

**33 questões** falham na identificação das alternativas A–D. Não foram encontradas outras falhas estruturais pelos critérios acima: enunciado, textos das quatro alternativas, uma correta e justificativa estão preenchidos. As 33 também não têm fonte, referência ou licença preenchidas; oito não têm origem definida. Não foram corrigidas letras ou metadados automaticamente, pois isso exige conferência do registro e do material original.

### Pendências comuns

- 183 sem revisão jurídica completa e sem liberação do acervo.
- 103 sem revisão pedagógica completa (70 completas e 33 incompletas).
- 150 com declaração explícita de licença/autoria pendente.
- Zero elegíveis para novos treinos na configuração atual.

Não é necessário inventar outra migration para resolver a elegibilidade editorial. São dados e decisões humanas pendentes, além do saneamento de conteúdo identificado. As migrations de atividades/ciclo de vida não aprovam questões.

## Verificação real das consultas do aluno

Foram executados os métodos de leitura existentes, sem autenticação fabricada, utilizando IDs das dez contas ALUNO existentes sem intenção institucional. Os IDs e dados acadêmicos individuais não foram registrados no relatório. Utilizou-se exclusivamente a `DIRECT_URL` existente do pooler de sessão 5432, com limite de uma conexão e `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`, confirmado por `SHOW transaction_read_only` antes das consultas. O backend local, seu `.env` e as flags operacionais não foram alterados por esse script.

Uma primeira tentativa de ativar somente leitura por parâmetro de URL não foi confirmada pelo Prisma; o script interrompeu antes dos métodos de negócio. A verificação subsequente usou a sessão explicitamente somente leitura descrita acima. Isso não alterou configurações globais do banco.

**84 verificações aprovadas, nenhuma falha:**

| Tela | Rota e consultas | Resultado real | Limitação/pendência |
| --- | --- | --- | --- |
| Diagnóstico | `/diagnostico-inicial`; resultados históricos pelo histórico/rota de resultado | Quatro resultados de diagnóstico existentes consultados com sucesso, usando o serviço correspondente à identidade inicial/legada | `INITIAL_DIAGNOSTIC_API_ENABLED` ausente: criação e resolução do novo inicial desativadas. Resultados históricos têm rota de leitura independente. Nenhuma tentativa criada ou retomada por POST |
| Trilha adaptativa | `/trilha`; overview e learningSummary | Dez consultas de overview e dez de aprendizagem aprovadas; vínculo explícito da tentativa preservado | Nova geração continua sendo escrita e depende de acervo elegível; não testada no Supabase |
| Simulados | `/simulados`; disponibilidade e tentativa individual ativa | Dez consultas de disponibilidade e dez resumos de tentativa ativa aprovados | Schema/API individual habilitados. Novo simulado exige seis questões elegíveis por disciplina; nenhum iniciado. A consulta não comprova visualmente todos os cards de turma |
| Desempenho | `/desempenho`; StudentPerformanceRepository.summary | Dez consultas aprovadas, sem erro SQL/Prisma | Não substitui inspeção visual dos gráficos e de cada filtro no navegador |
| Histórico | `/historico`; StudentHistoryRepository.history | Dez consultas da primeira página aprovadas | Paginação/correções são implementadas; cliques autenticados e todas as páginas não foram comprovados nesta rodada |
| Metas | `/metas`; StudyGoalService.list e dashboard | Dez listagens e dez resumos aprovados | Nenhuma meta criada, editada ou concluída; escritas continuam protegidas |

Os métodos foram inspecionados antes da execução e somente os de leitura foram chamados. Essa evidência prova compatibilidade das consultas com o schema e os dados reais, não equivale a login ou teste de navegador autenticado de dez contas. Não foram produzidos JWTs, copiados tokens ou simulados perfis.

## Funcionamento no navegador e correções

O usuário já confirmou o carregamento real de `/questoes` e os bloqueios de estoque. Nesta rodada foi solicitada a confirmação específica de Trilha, Simulados, Desempenho, Histórico e Metas, sem escritas; não há sessão de controle de navegador conectada. Até a resposta, a validação visual dessas telas permanece pendente.

Nenhum novo defeito de frontend/backend foi reproduzido pelas 84 verificações. Portanto, não foram feitas alterações especulativas de funcionamento nesta rodada. Permanecem as correções anteriores de diagnóstico da disponibilidade e navegação sem geração das trilhas já vinculadas.

Não foram repetidos builds/testes gerais nesta rodada porque os únicos novos arquivos versionáveis são esta documentação e o CSV; o código executável não foi alterado. Evidência da versão atual: builds aprovados, 1.484 unitários e 27 integrações direcionadas aprovadas. A falha P1001 no teste amplo de navegador docente continua registrada separadamente, sem interferência no trabalho do Fernando.

## Arquivos desta rodada

- `docs/auditoria-editorial-e-telas-aluno-2026-11-16.md`.
- `docs/auditoria-editorial-questoes-2026-11-16.csv`.
- Scripts e resultados locais de consulta em `backend/.local/editorial-readonly.*` e `backend/.local/student-reads-readonly.*`, ignorados pelo Git.

Nenhum commit, push, deploy, migration ou alteração de dados reais foi executado. Ainda dependem de autorização específica: corrigir registros, revisar/liberar conteúdo, alterar flags e realizar operações acadêmicas de escrita. A próxima etapa segura é a revisão humana dos 150 candidatos e o saneamento documentado dos 33 registros restantes, sem publicação automática.
