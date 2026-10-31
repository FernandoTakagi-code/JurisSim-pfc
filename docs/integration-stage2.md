# Integração das interfaces — etapa 2

Implementada na branch `entrega2809`, mantendo o frontend React + TypeScript +
Vite, o mesmo ponto de entrada React e o backend existente. As alterações locais
anteriores foram preservadas. Nenhum endpoint, schema ou migration foi alterado.

## Fonte e adaptação

Foi utilizado exclusivamente o ZIP `desenvolvimento-do-juris-sim-aluno.zip`.
Os dois exports haviam sido auditados e têm conteúdo idêntico. A estrutura visual
de `NavItem`, `UserProfileDropdown` e `ProfileSettings`, do arquivo
`app/[[...slug]]/page.tsx`, foi adaptada para componentes React locais, CSS com
escopo `.v0-app` e navegação pela History API.

O Next.js, Tailwind, os dados demonstrativos, as ações de sucesso simulado,
analytics, configurações de build e a cópia antiga do frontend contida no ZIP
permaneceram fora da integração. Não foram instaladas dependências adicionais.

O dashboard original do aluno conserva integralmente seu trecho JSX e sua lógica.
A comparação textual desse trecho com o início da etapa passou. O arquivo
`styles.css` original permanece inalterado. Os componentes de painel, listagem e
formulário do professor continuam fazendo o CRUD existente. A moldura compartilhada
assume sidebar e cabeçalho; os controles antigos são ocultados apenas dentro dela.
O tema escuro aplica cores por seletores locais ao conteúdo original.

## Arquivos desta etapa

| Arquivo | Alteração |
| --- | --- |
| `frontend/src/integration-shell.tsx` | Sidebar, cabeçalho, dropdown, perfil/configurações, tema, menu móvel e estados indisponíveis |
| `frontend/src/integration-shell.css` | Estilos isolados da moldura e adaptação dos temas |
| `frontend/src/navigation.ts` | Consulta reativa ao caminho, push/replace e atualização por voltar/avançar |
| `frontend/src/main.tsx` | Moldura compartilhada e rotas do aluno preservando o dashboard e o fluxo de estudo |
| `frontend/src/ProfessorArea.tsx` | Rotas do CRUD e bloqueio visual de edição alheia por URL direta |
| `frontend/scripts/test-session.mjs` | Ampliação para 28 cenários de sessão e integração |
| `frontend/scripts/test-legal.mjs` | Regressão ajustada à nova navegação e bloqueio de rede externa |
| `docs/integration-stage2.md` | Registro de escopo, validação e pendências |

## Funcionalidades conectadas

| Recurso | Integração real |
| --- | --- |
| Sessão e permissões | `GET /auth/session`; perfil, nome, e-mail e confirmação provenientes do servidor |
| Alteração de nome | `PUT /auth/nome`, seguido de revalidação da sessão; atualiza cabeçalho e menu sem recarregar a página |
| Login e redirecionamento | Fluxo oficial existente; destino determinado pela sessão validada |
| Questões do aluno | `GET /questoes`, respeitando a autorização existente |
| Questões do professor | CRUD existente com `GET/POST /questoes` e `PUT/DELETE /questoes/:id` |
| Diagnóstico | Criação, questões, respostas, finalização, resultado e recomendação existentes em `/diagnostics` |
| Trilha adaptativa | Recomendação carregada no diagnóstico e exercícios em `/trilhas`, preservando seu fluxo real |
| Logout | Encerra o estado autenticado central, remove token/cache de autenticação e volta ao login |
| Temas | Claro, escuro e sistema, persistidos localmente; acompanha mudanças do sistema enquanto a página está aberta |

O menu depende do perfil autenticado. Alunos que abrem `/professor/...` são
redirecionados ao destino permitido; professores e administradores usam a área
existente do professor. As permissões de administrador permanecem determinadas
pelo backend. A edição direta por URL também exige autoria ou perfil ADMIN na UI,
além das verificações de autorização existentes no servidor.

O aluno usa `/dashboard`, `/`, `/questoes`, `/desempenho` e `/trilha`.
O CRUD usa `/professor`, `/professor/questoes`, `/professor/questoes/nova` e
`/professor/questoes/:id/editar`. Perfil e configurações usam `/perfil` e
`/configuracoes`, com prefixo `/professor` para professor/administrador.
As páginas principais atualizam a URL e respondem a `popstate`.

## Validação local

Resultados em 17/10/2026:

- Backend: **202 testes aprovados, em 14 suítes**, incluindo autorização por turma,
  confirmação obrigatória, perfil atual e revogação de JWT na redefinição de senha.
- Backend e frontend: TypeScript aprovado com
  `tsc --noEmit --incremental false`.
- `node scripts/test-session.mjs`: **28 cenários aprovados no Chrome**, incluindo
  as regressões anteriores de sessão/401/403, CRUD, login por perfil, perfil real,
  alteração de nome e falha de gravação, logout, histórico, persistência de tema,
  mudança dinâmica do sistema, menu móvel, foco por teclado, restrições por perfil
  e autoria, recarga direta e páginas pendentes sem chamadas fictícias.
- `node scripts/test-legal.mjs`: aprovado para documentos/aceite, formulários,
  privacidade, dashboard, diagnóstico completo, geração/resolução de trilha,
  navegação, confirmação e recuperação.
- Capturas em 1366 e 390 pixels: dashboard original e formulário de questões em
  tema escuro, além das configurações móveis. Verificação de ausência de overflow
  horizontal aprovada. Capturas do dashboard e formulário foram inspecionadas.
- Build de produção do Vite aprovado com API de teste local e Google desabilitado
  apenas no processo de validação. A saída usou pasta própria temporária, removida
  após o teste; o build existente foi preservado.
- Comparação com o início da etapa: backend e migrations integralmente preservados;
  trecho original do dashboard do aluno inalterado.

Os testes de navegador usam fixtures identificadas e interceptam a API; o Chrome
bloqueia conexões externas ao servidor Vite local. Não foi adicionado bypass de
autenticação ao código da aplicação. As suítes do backend usam mocks e URLs de
banco locais sem serviço real. Nenhum teste desta etapa acessou o Supabase,
executou migrations ou enviou e-mails reais. O sandbox do Windows exigiu execução
autorizada do Chrome e do build fora dele. Arquivos `.env` e credenciais foram
preservados.

## Pendências e limites

- Turmas, simulados do professor, metas, relatórios e indicadores agregados exibem
  indisponibilidade explícita, aguardando integração/implementação autorizada.
  Histórico sem API integrada permanece vazio. Nenhum dado fictício foi incorporado
  às telas reais.
- Foto, avatares e câmera estão indisponíveis, aguardando persistência segura no
  backend. A interface usa apenas iniciais derivadas do nome autenticado.
- Notificações não possuem preferências funcionais; essa limitação é informada.
- Resultados e trilhas mostrados no dashboard continuam sendo os carregados na
  sessão de estudo atual. Não foi criada uma API de histórico ou restauração de
  tentativas anteriores. Recarregar a página conserva o comportamento anterior.
- Logout remove a sessão deste navegador. A revogação no backend após redefinição
  de senha continua vigente. Não foi criado um endpoint novo de revogação no logout.
- Os testes validam UI/contratos com API simulada e regras do servidor com mocks.
  Não substituem uma homologação completa com PostgreSQL descartável, dados reais
  de desenvolvimento e serviços Google/SMTP autorizados. Não houve login Google ou
  envio SMTP real nesta etapa.
- A hospedagem final precisa encaminhar URLs internas para o `index.html` do Vite,
  permitindo recargas diretas das novas rotas. A validação local usou o fallback
  do Vite. Publicação e configuração da hospedagem não foram realizadas.

Não houve commit, push ou merge. A etapa 3 e novos endpoints continuam aguardando
autorização específica.
