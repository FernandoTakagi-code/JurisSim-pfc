# Integração — etapa 1: autorização, sessão e navegação

Branch `entrega2809`. Escopo: preparar a aplicação existente para integração;
nenhum componente dos ZIPs foi incorporado. Nenhum segundo projeto foi criado.

## Política de questões

- ALUNO lê questões públicas e privadas de turmas em que está matriculado.
  As alternativas retornadas continuam sem o campo `correta`.
- PROFESSOR lê questões públicas, as próprias e privadas das turmas que leciona.
  Somente pode editar/excluir questões de sua autoria.
- ADMIN pode ler e administrar qualquer questão. Nem ADMIN pode editar/excluir
  questões já utilizadas em respostas/diagnósticos: permanece a resposta 409.
- Uma questão privada fora do escopo retorna 404 por ID. Não é retornada na lista.
- `turmaId` requer vínculo compatível com o perfil atual e restringe a lista à
  turma solicitada; não amplia visibilidade. Sem vínculo, a resposta é 403.
- Criação/movimentação de questões para turma exige vínculo de professor ou ADMIN.
  Participar de uma turma não concede autoria sobre questões de colegas.
- `minhas=true` é um filtro adicional, sem ampliar permissões.
- Autor e perfil são obtidos da identidade autenticada. Nenhum valor de perfil
  ou autor informado pelo cliente concede acesso.

Autoria, associação com turma e proteção de conteúdo utilizado são verificadas
nas transações de escrita. `update`/`delete` também levam a condição de autoria
para PROFESSOR. Leituras aplicam escopo de visibilidade na consulta Prisma.
Filtros de lista são validados por Zod, inclusive arrays inesperados e valores
inválidos. Os campos/relacionamentos existentes são suficientes: não há migration.

## Sessão e navegação

`frontend/src/api.ts` centraliza os requests. Respostas 401 de operações
autenticadas encerram a sessão; respostas 403 propagam a mensagem à tela e
revalidam o perfil, sem encerrar uma sessão que continua válida. Erros de login
público não encerram outra sessão. Respostas atrasadas de um token antigo não
alteram a sessão de um login novo. Resposta 204 é tratada sem tentar ler JSON.

`frontend/src/auth-session.ts` centraliza `/auth/session`, deduplica consultas,
valida sua estrutura e fornece estado reativo. O endpoint passa a retornar também
`user.id`, adição compatível com clientes antigos. O novo frontend precisa do
backend atualizado: não aceita fallback para identidade/perfil decodificados do JWT.

O cache em `sessionStorage` é apenas de compatibilidade. Perfil, nome, identidade
e confirmação usados na interface vêm da resposta validada. Falhas de sessão
impedem exibir dados protegidos e permitem tentar novamente ou sair. O logout
remove somente as chaves de autenticação, preservando armazenamento alheio.

URL não concede permissões. O perfil validado escolhe a área existente; alunos
que abrem `/professor` voltam ao destino de aluno, enquanto professores/ADMIN
usam a área existente do professor. Trocar o perfil remonta a área para descartar
estado de outro perfil. Ao recuperar foco/visibilidade, a sessão é reconsultada.

A tela original de confirmação foi extraída, sem redesenho, para
`email-confirmation-gate.tsx`, compartilhada pelos três perfis. Uma conta pendente
não monta os dashboards nem dispara consultas de questões. Reenvio e reconhecimento
de confirmação em outra aba continuam usando os endpoints oficiais.

## Arquivos de implementação

- Backend: `src/controllers/QuestaoController.ts`, `src/services/QuestaoService.ts`,
  `src/repositories/QuestaoRepository.ts`, `src/services/auth-service.ts`.
- Frontend: novos `src/api.ts`, `src/auth-session.ts` e
  `src/email-confirmation-gate.tsx`; adaptação de chamadas em `src/auth-gate.tsx`,
  `src/main.tsx`, `src/ProfessorArea.tsx`, `src/QuestoesPage.tsx` e `src/shell.tsx`.
- Testes: ampliação de `backend/src/routes/questao-crud.test.ts`; ajuste de
  assertivas de contrato em `backend/src/routes/auth-security.test.ts`,
  `backend/src/services/jwt-auth.test.ts` e
  `backend/src/services/legal-acceptance.test.ts`.
- Navegador: novo `frontend/scripts/test-session.mjs` e adaptação do bootstrap
  simulado de sessão em `frontend/scripts/test-legal.mjs`.
- Este relatório.

Os componentes visuais dos dashboards e do CRUD foram mantidos, assim como os
estilos existentes. Não foram alterados `.env`, credenciais, dependências, schema,
migrations, emissores de e-mail ou a revogação de sessões.

## Validação e limites

Resultado em 17/10/2026:

- Backend: **202 testes em 14 suítes**, incluindo 12 novos testes de autorização
  por autoria, perfil atual, visibilidade e vínculo com turma.
- TypeScript de backend e frontend: aprovado com `tsc --noEmit --incremental false`.
- `node scripts/test-session.mjs` no frontend: **15 cenários aprovados** no Chrome,
  incluindo JWT/cache adulterados, bloqueio dos três perfis pendentes, 401/403,
  falha de rede, rebaixamento de perfil, respostas atrasadas e CRUD do professor.
- `node scripts/test-legal.mjs`: regressão aprovada de documentos, aceite,
  formulários, responsividade, dashboard original, navegação, diagnóstico, trilha,
  reenvio e links de confirmação/redefinição com sessão ativa.
- O Windows exigiu execução autorizada fora do sandbox para conectar ao depurador
  do Chrome local. Os testes continuaram usando API simulada, sem dados remotos.
- Nenhuma migration precisou ser criada ou executada nesta etapa.

Os testes de backend usam mocks da persistência nas rotas reais; testes de
navegador interceptam a API com fixtures identificadas. No novo teste de sessão,
o Chrome também bloqueia requests de rede externos ao Vite local. Configurações
de API/Google dos processos de teste são locais, sem editar arquivos de ambiente.
Não houve acesso ao Supabase ou envio de mensagens reais.

Permissões dependem do perfil/vínculo consultado pelo servidor. Uma alteração
concorrente posterior à autorização não cancela uma requisição já autorizada.
As regras não foram verificadas contra dados/permissões/RLS do ambiente remoto.

É necessário publicar backend e frontend compatíveis para aproveitar o novo
contrato da sessão. Publicação, inspeção remota, novos endpoints de turmas,
persistência de foto e integração dos ZIPs continuam fora desta etapa.
Não houve commit, push, merge ou avanço para a etapa 2.
