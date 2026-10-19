# Integração — etapa 4: turmas, matrículas e simulados do professor

Implementação na branch `entrega2809`, na aplicação React/TypeScript/Vite e backend
existentes. Não foram alterados `.env`, credenciais, Supabase, envio de e-mails,
foto, metas ou relatórios avançados. Não houve commit, push, merge ou publicação.

## Auditoria e reaproveitamento

Antes da implementação foram revisados o schema Prisma, os endpoints, os serviços
de diagnóstico/trilha, a autorização de questões, o histórico e a navegação.

`Turma` já possuía professores, alunos e convite; faltavam endpoints de gestão.
`Simulado` representava uma tentativa individual de um aluno, não uma prova
preparada por um professor para várias turmas. Reaproveitar esse registro como
definição de prova misturaria publicação e respostas dos alunos.

Foram acrescentados:

- `Avaliacao`: definição do simulado, autor, título, descrição, duração opcional,
  publicação e turmas destinatárias.
- `AvaliacaoQuestao`: seleção ordenada das questões reais do banco autorizado.
- `Simulado.avaliacaoId`, opcional: vínculo da tentativa com a definição publicada.
- Tipo `AVALIACAO`, separado de `DIAGNOSTICO` e `PERSONALIZADO`, para impedir que
  endpoints antigos de diagnóstico/trilha sejam usados para contornar suas regras.
- Arquivamento e validade do convite em `Turma`.

Tentativas, respostas, questões atribuídas, métricas e histórico utilizam as
estruturas existentes. As migrations anteriores permaneceram intactas.

## Endpoints

Todas as rotas exigem autenticação atual, versão de sessão válida, conta ativa e
e-mail confirmado, usando o middleware anterior sem exceções novas. As respostas
recebem `Cache-Control: no-store`.

| Método e rota | Permissão e comportamento |
| --- | --- |
| `GET /turmas?page=1` | Aluno: suas matrículas; professor: turmas sob sua gestão; ADMIN: todas |
| `POST /turmas` | Professor/ADMIN; cria turma e retorna convite uma única vez |
| `PATCH /turmas/:id` | Gestor/ADMIN; altera nome ou arquiva com `{ archived: true }` |
| `POST /turmas/:id/invite` | Gestor/ADMIN; gera novo convite para turma ativa e invalida o anterior |
| `POST /turmas/join` | Aluno; matrícula com `{ code }`, idempotente e sem duplicar vínculo |
| `GET /turmas/students?page=1` | Professor/ADMIN; alunos ativos das turmas autorizadas, sem duplicar aluno compartilhado |
| `GET /turmas/:id/students?page=1` | Gestor/ADMIN; alunos matriculados na turma autorizada |
| `GET /avaliacoes?page=1` | Professor: seus simulados; ADMIN: todos; aluno: publicados para suas turmas ativas |
| `POST /avaliacoes` | Professor/ADMIN; cria rascunho com questões e turmas autorizadas |
| `PUT /avaliacoes/:id` | Autor/ADMIN; edita somente rascunho sem tentativas |
| `POST /avaliacoes/:id/publish` | Autor/ADMIN; revalida questões/turmas e publica |
| `POST /avaliacoes/:id/attempts` | Aluno matriculado em turma destinatária ativa; inicia ou recupera sua única tentativa |
| `GET /avaliacoes/attempts/:id` | Aluno proprietário e matriculado; questões, respostas selecionadas, prazo/status e resultado após conclusão |
| `PUT /avaliacoes/attempts/:id/answers/:questionId` | Aluno proprietário; salva/altera alternativa antes da conclusão/prazo |
| `POST /avaliacoes/attempts/:id/finalize` | Aluno proprietário; finaliza e grava métricas/resultado de modo idempotente |

As listas usam páginas de 50 itens, com limite de página validado. O rascunho aceita
`titulo`, `descricao`, `duracaoSegundos` (nulo ou 60–86400), `turmaIds` (1–30) e
`questaoIds` (1–80). Quantidade é derivada das questões selecionadas, evitando
divergência entre um contador e a prova efetivamente disponibilizada.
Campos desconhecidos, autor forjado e IDs duplicados são rejeitados.

## Permissões e políticas implementadas

- Uma turma criada recebe o professor atual no vínculo `professores`. O vínculo
  existente representa gestão autorizada, inclusive eventual cogestão já gravada
  em turmas antigas. Não foi criado endpoint para adicionar outros gestores.
- Professores não gerenciam turmas sem vínculo nem simulados de outros autores.
  **ADMIN pode gerir turmas e definições de simulados de qualquer autor**, respeitando
  arquivamento, imutabilidade e restrições de questões privadas. Esse privilégio
  não permite acessar endpoints de tentativa nem resultados individuais alheios.
- Questões são revalidadas na criação, edição e publicação. Públicas podem ser
  selecionadas do banco; privadas precisam estar autorizadas ao professor.
  Questão privada vinculada a uma turma só pode ser publicada para essa turma.
  Questão privada sem turma pode ser compartilhada pelo autor com suas turmas.
- Questões ligadas a uma definição de simulado são protegidas contra edição ou
  exclusão pelo CRUD, inclusive em rascunho. Para alterá-las antes da publicação,
  retire a referência do rascunho. O CRUD existente e suas demais regras permanecem.
- Após publicar, a definição e seleção de questões ficam imutáveis, mesmo antes
  da primeira resposta. Não há despublicação, exclusão de provas ou mudança de
  destinatários após publicação nesta etapa.
- Há uma tentativa por aluno e definição, com unicidade no PostgreSQL. Chamadas
  simultâneas para iniciar recuperam a mesma tentativa.
- O servidor verifica matrícula e propriedade em cada acesso de tentativa. IDs
  de aluno/autor vindos do cliente não determinam acesso. As alternativas não
  incluem gabarito e o resultado permanece ausente até finalizar.
- Respostas podem ser alteradas antes de finalizar/prazo. O vínculo único da
  resposta com a questão atribuída impede duplicação.
- Finalização grava data de conclusão e métricas na mesma transação. Chamadas
  repetidas retornam o resultado já concluído, sem duplicar métricas.
- Duração é validada no servidor pelo início persistido e limite de segundos.
  Relógio alterado no navegador não libera respostas atrasadas. Estados
  `IN_PROGRESS`, `EXPIRED` e `COMPLETED` são derivados dos campos persistidos de
  início/limite/conclusão, evitando outro campo de estado contraditório.
- Tentativa expirada bloqueia respostas e pode ser finalizada com questões não
  respondidas. A expiração não executa job em segundo plano: a conclusão explícita
  registra o resultado e o inclui nos totais de atividades concluídas.
- Arquivar impede novas matrículas, novos convites e novos inícios. Não remove
  professores, alunos, simulados ou respostas. Tentativas já abertas podem ser
  concluídas e seus resultados continuam acessíveis ao aluno matriculado.
  Turmas arquivadas ficam somente para consulta, sem restauração nesta etapa.

Mutações relacionadas a matrícula, seleção, publicação e respostas usam transações
`Serializable`, bloqueios de linhas e até três tentativas em conflitos de
serialização. Turmas e questões são bloqueadas em lote e ordem estável. Respostas
e finalização bloqueiam a mesma tentativa para preservar sua consistência.

## Convites

Novos códigos possuem 24 bytes aleatórios (192 bits), representados por 32
caracteres base64url. Valem por sete dias. O banco guarda somente
`sha256:<hash>` no campo legado `codigoConvite`; o código original retorna apenas
na criação/rotação e não é salvo pelo frontend em armazenamento persistente.
As listagens não expõem código, hash ou alunos de turmas alheias.

Valores antigos de convite não foram sobrescritos pela migration. O novo fluxo
aceita somente os convites aleatórios com hash e validade; turmas antigas precisam
gerar um novo convite pela ação autorizada. Seus demais dados/vínculos são mantidos.

## Frontend conectado

- Professor: `/professor/turmas`, `/professor/turmas/:id/alunos`,
  `/professor/alunos` e `/professor/simulados`.
- Aluno: `/turmas`, `/simulados` e `/simulados/tentativas/:id`.
- Criação/edição/arquivamento de turma, matrícula, convite e listagem de alunos
  usam os endpoints reais, com estados vazios, carregamento e erros explícitos.
- Editor de simulado usa questões do CRUD e turmas autorizadas. Configura título,
  descrição, quantidade e duração; valida a quantidade selecionada e mostra as
  restrições de questões privadas antes do envio.
- Aluno salva a seleção pela API, recupera respostas após reload/login, continua
  a tentativa e consulta resultado persistido. Após prazo/conclusão, os campos
  ficam bloqueados. A autorização definitiva permanece no backend.
- Histórico identifica `AVALIACAO` como **Simulado de turma**, com link à tentativa.
  Desempenho conta simulados de turma separadamente; a evolução diagnóstica mantém
  somente diagnósticos e não mistura as provas das turmas.
- Temas, menus, voltar/avançar, perfil e logout mantêm a moldura existente. O JSX e
  a aparência do dashboard original não foram substituídos. Os componentes do
  CRUD do professor continuam sendo os originais.

## Migration incremental

Arquivo: `backend/prisma/migrations/20261017150000_classes_teacher_exams/migration.sql`.

Adiciona o tipo `AVALIACAO`, tabelas `Avaliacao`, `AvaliacaoQuestao` e relação
`_AvaliacaoToTurma`, campos opcionais de turma/tentativa, índices, chaves
estrangeiras e unicidade `(avaliacaoId, alunoId)`. Tentativas antigas ficam com
`avaliacaoId = NULL`; a unicidade permite múltiplos diagnósticos/trilhas antigos.
Não apaga nem reescreve os dados anteriores.

## Arquivos desta etapa

| Arquivo | Alteração |
| --- | --- |
| `backend/prisma/schema.prisma` | Modelos/relações novos e campos incrementais |
| `backend/prisma/migrations/20261017150000_classes_teacher_exams/migration.sql` | Migration incremental |
| `backend/src/services/class-exam-service.ts` | Gestão, convite, autorização, publicação e tentativas |
| `backend/src/routes/class-exam-routes.ts` | Endpoints, validação e permissões por perfil |
| `backend/src/routes/class-exam.test.ts` | 44 testes HTTP novos |
| `backend/src/server.ts` | Registro de `/turmas` e `/avaliacoes` |
| `backend/src/repositories/QuestaoRepository.ts` | Proteção de questões vinculadas às definições |
| `backend/src/repositories/student-history-repository.ts` | Tipo e contagem real de simulados de turma |
| `backend/scripts/test-migrations-local.cjs` | Atualização aditiva do harness e execução da suíte nova |
| `backend/scripts/test-class-exams-db.ts` | Testes reais de PostgreSQL/HTTP e concorrência |
| `frontend/src/class-exams.tsx` | Telas reais de turmas, alunos, simulados e tentativas |
| `frontend/src/class-exams.css` | Estilos locais compatíveis com os temas existentes |
| `frontend/src/ProfessorArea.tsx` | Encaixe das novas páginas sem substituir o CRUD |
| `frontend/src/main.tsx` | Rotas novas do aluno e indicadores quando só há provas de turma |
| `frontend/src/integration-shell.tsx` | Navegação autenticada para os recursos implementados |
| `frontend/src/student-progress.tsx` | Histórico/resultados/totais com tipo de atividade correto |
| `frontend/scripts/test-session.mjs` | Sete cenários novos e regressões do navegador |
| `docs/integration-stage4.md` | Auditoria, decisões, endpoints, testes e limitações |

## Validação local

- **267 testes em 16 suítes de backend aprovados**, incluindo 44 novos testes HTTP
  de autenticação, confirmação, perfil atual, campos forjados, seleção e paginação.
- PostgreSQL **17.11 descartável** em diretório próprio temporário, bind em
  `127.0.0.1` e porta efêmera, verificados pelo harness antes dos testes:
  - dez migrations aplicadas em instalação nova, segunda aplicação sem pendências,
    atualização preservando os registros das 15 tabelas anteriores e diff sem drift;
  - checksums de todas as migrations anteriores preservados;
  - sete cenários novos de turmas/simulados com HTTP, login e persistência reais:
    gestão/propriedade, convite e hash, matrícula concorrente, expiração/rotação,
    alunos isolados, seleção privada, rascunho/publicação, tentativa concorrente
    única, respostas e login/reconexão, métricas, prazo, arquivamento e perfis;
  - sete cenários de revogação e seis de histórico das etapas anteriores aprovados;
  - cluster encerrado e artefatos de teste retidos localmente.
- **41 cenários no Chrome aprovados**, com API simulada e rede externa bloqueada:
  criação/edição de turma, convite, alunos/estado vazio, publicação, matrícula,
  resolução, recarga de respostas/resultado, expiração, bloqueio de acesso,
  arquivamento e as regressões anteriores de sessão, dashboard, CRUD e temas.
- `node scripts/test-legal.mjs`: regressão aprovada de dashboard, diagnóstico,
  trilhas, documentos, confirmação e recuperação.
- TypeScript do backend/frontend aprovado com `tsc --noEmit --incremental false`.
- Build do Vite aprovado em pasta própria de validação, preservando o build anterior.
  Capturas de turma, editor e tentativa foram inspecionadas; as páginas foram
  verificadas em 1366 e 390 pixels sem overflow horizontal.

Fixtures e contas confirmadas são criadas exclusivamente no cluster descartável
após a validação do diretório/URL local. Não existe bypass de autenticação na
aplicação. Testes de navegador usam fixtures isoladas; testes de banco executam
serviços, repositórios e login reais. Não houve homologação no ambiente remoto.

## Limites e riscos restantes

- Aplicar a migration em um ambiente real continua exigindo autorização separada.
  O backend novo depende dela; planejar implantação/migration em conjunto. DDL e
  criação de índices podem bloquear escritas durante a execução.
- Publicação é definitiva nesta etapa; edição é restrita aos rascunhos e cada aluno
  tem uma tentativa por prova. Não foram incluídos agendamento, segunda chamada,
  múltiplas tentativas, remoção de matrícula ou restauração de turma arquivada.
- Expiração bloqueia respostas no servidor, mas resultados de tentativas abandonadas
  só entram nos totais após finalização explícita; não foi acrescentado scheduler.
- Listagens são paginadas. O seletor de questões reutiliza a API existente do banco;
  bancos muito grandes podem demandar busca/paginação específica em etapa posterior.
- Não foram medidos carga, latência e planos de execução do ambiente real. A validação
  foi local, com índices e transações testados em PostgreSQL descartável.
- A hospedagem precisa manter fallback das rotas internas para o `index.html` do
  Vite. Não houve mudança de infraestrutura ou publicação.

A etapa 5, foto, metas e relatórios avançados permanecem fora do escopo autorizado.
