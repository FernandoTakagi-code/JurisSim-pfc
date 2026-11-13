# Dashboard do Professor — revisão e acesso

> Registro histórico da respectiva etapa. Testes, configurações, autorizações e impedimentos referem-se àquela execução; não comprovam o estado atual nem autorizam operações reais. Consulte a consolidação [H4.37](H437-CONSOLIDACAO-PROFESSOR.md) e o [README](README.md).

13/11/2026 — branch `entrega0911`.

## Revisão histórica pelo overlay privado, sem banco

**Disponibilidade:** `review:professor` e `test:teacher-review` pertencem exclusivamente ao overlay privado de revisão. Não existem nos scripts versionados do repositório público, e seus arquivos auxiliares não são distribuídos. Não use esses comandos em um clone público nem crie atalhos que dependam silenciosamente desse overlay.

Somente em uma instalação privada já autorizada e com esse overlay presente, o comando histórico era:

```powershell
npm.cmd --prefix frontend run review:professor
```

Abra **http://127.0.0.1:5190/professor**. Não é necessário iniciar backend, PostgreSQL, Supabase ou informar senha. Encerre somente esse terminal com Ctrl+C ao terminar.

Esse comando inicia **apenas Vite**, com configuração própria, sem carregar `.env` e sem proxy para backend. A porta 5190 mantém o armazenamento do navegador separado da aplicação normal em 5173. Nenhum cadastro ou sessão real é copiado, excluído ou promovido.

A faixa permanente informa **REVISÃO DE INTERFACE · DADOS FICTÍCIOS · SEM BANCO**. A autenticação e todas as respostas de API são simuladas. As gravações retornam 405; recursos não previstos retornam erro explícito; a política de rede impede conexões externas. Questões não são simuladas nem fazem parte dessa revisão.

| Teste no navegador | Caminho/ação | Resultado esperado na revisão |
| --- | --- | --- |
| Página inicial | `/professor` | Indicadores fictícios: uma turma, uma turma ativa, um aluno distinto e nenhum simulado publicado; identificação explícita de revisão |
| Turmas | “Minhas turmas” ou `/professor/turmas` | Turma fictícia; consulta e navegação. Tentar gravar deve informar que a revisão é somente leitura |
| Alunos | `/professor/alunos` ou “Consultar alunos” | Apenas o aluno fictício da turma; retorno para turmas |
| Relatórios | `/professor/relatorios`, selecionar a turma | Resumo, distribuição, disciplinas, evolução e participação; como não há tentativas fictícias concluídas, percentuais ausentes e gráficos vazios, sem resultado inventado |
| Individual | No relatório da turma, “Consultar aluno” | Mesmo escopo de turma, aluno fictício e histórico vazio; retorno ao relatório |
| Desempenho | `/professor/desempenho`, selecionar a turma | Mesmas métricas autorizadas, apresentadas na área de desempenho |
| Simulados | `/professor/simulados` | Estado vazio. Criar/publicar não pode persistir nem apresentar sucesso |
| Perfil | `/professor/perfil` | Identidade fictícia. Alteração de nome/foto deve ser recusada, pois gravações estão bloqueadas |
| Vínculo pendente | Link “Vínculo pendente fictício” na faixa inferior | Dashboard acessível com orientação; indicadores e consultas acadêmicas não são carregados |
| Navegação | Recarregar, voltar/avançar e abrir URLs diretamente | Destino preservado; uma única seleção de instituição; `/professor/inexistente` mostra página não encontrada |
| Responsividade | Larguras 360, 768 e 1366 px; tema claro/escuro no perfil | Sem transbordamento horizontal; navegação móvel utilizável |

Essa revisão comprova comportamento de interface. **Ela não valida autenticação real, vínculo real, persistência, consultas SQL ou permissões contra dados reais.**

## Fluxo real de autenticação e autorização

1. O formulário usa `POST /auth/login` (senha) ou `POST /auth/google` (credencial Google validada no servidor). Login por senha compara o hash e recusa conta excluída; o cadastro público atribui `ALUNO`, nunca Professor por escolha visual.
2. O backend emite JWT assinado com identidade, papel e versão de sessão. O frontend consulta `GET /auth/session`; usa o papel dessa resposta para escolher o dashboard. Alterar URL, cache ou o papel escrito no JWT não concede autorização.
3. A cada rota protegida, o middleware valida assinatura/expiração, relê a conta, confere exclusão, versão da sessão e confirmação do e-mail. Suspensão e contexto institucional são verificados quando a camada administrativa/institucional correspondente está habilitada.
4. No modo institucional completo, ou para participante de homologação restrita, exige-se vínculo `TEACHER` ativo em instituição `ACTIVE`. Um vínculo é selecionado automaticamente; com vários, é necessário escolher a instituição. Cabeçalho de instituição não autorizado é recusado. O backend calcula `allowedClassIds` a partir das designações atuais do Professor.
5. Ter vínculo com a instituição não implica acesso a todas as turmas: o Professor precisa estar designado à turma. Relatórios verificam turma, matrículas atuais e simulados publicados para ela. O ADMIN global não recebe acesso pedagógico por seu papel.
6. Existe compatibilidade com Professor legado quando o módulo institucional está globalmente desligado e não há escopo restrito: as consultas usam as turmas atribuídas diretamente ao Professor. Isso não transforma uma conta Aluno em Professor nem autoriza ativar flags para contornar vínculos.

A configuração efetiva depende do ambiente autorizado e pode ser complementada pelo processo de inicialização. Valores do ambiente privado não são distribuídos aqui. Nenhum launcher real ou consulta de conta/vínculo foi executado nesta revisão documental.

## Impedimento para homologação real sem gravar dados

A documentação anterior registra que a conta destinada ao teste de Professor era uma conta Aluno. Isso é histórico, não uma verificação atual: por sua instrução, o banco não foi consultado.

Se essa conta continua `ALUNO`, abrir `/professor` redireciona para sua área de Aluno. Não é necessário excluir essa conta. As alternativas reais, ambas dependentes de autorização, são:

- Usar **outra conta Professor já existente e autorizada**, em outra janela/perfil de navegador, mantendo a sessão de Aluno intacta. Para turmas institucionais, ela precisa ter vínculo ativo e designações adequadas.
- Com autorização explícita para gravação, criar uma conta separada com outro e-mail e seguir o convite docente legítimo. Aceitar convite com a própria conta Aluno também é possível no sistema, mas altera seu papel para `PROFESSOR` e seus vínculos; não corresponde à preservação do perfil Aluno atual.

O aceite de convite altera papel, vínculo, eventuais designações e auditoria. Mesmo um login real registra auditoria, e erros de acesso também podem gerar eventos. Assim, **login real não satisfaz uma proibição absoluta de operações/gravações no banco**. Não execute o `npm run dev` da raiz para essa revisão: ele inicia o runtime conectado e faz verificações de banco. A revisão frontend histórica em 5190 depende do overlay privado mencionado acima.

Antes de qualquer etapa real, é necessário indicar o ambiente e uma conta Professor legítima e autorizar expressamente o acesso/auditoria correspondente. Criar conta, aceitar convite, promover papel ou designar turmas exige autorização adicional de gravação. Nenhuma dessas ações foi realizada.

## Cobertura acadêmica e nível de integração

| Requisito | Implementação ligada ao backend | Estado de validação |
| --- | --- | --- |
| Turmas e paginação | `GET /turmas`; escrita/criação/convites já têm serviços Prisma e autorização | Código integrado; leitura/ações testadas com mocks. Persistência real não homologada nesta etapa |
| Alunos | `GET /turmas/students`, `GET /turmas/:id/students`; filtros de turmas autorizadas | Código integrado; interface e escopos testados sem banco |
| Relatórios por turma | `GET /reports/classes`, `GET /reports/classes/:id`; consultas de matrículas, simulados e tentativas em snapshot consistente | Código integrado; execução dessas consultas em PostgreSQL não validada nesta etapa |
| Desempenho e individual | `GET /reports/classes/:id/students/:studentId`; participação, acertos/erros/não respondidas, médias, disciplinas, nível e evolução | Interface ligada às rotas; gráficos com fixtures em testes anteriores e estado sem atividade na revisão interativa. Sem comprovação com resultados reais |
| Indicadores do início | **Nova** rota `GET /reports/overview`; turmas totais/ativas, alunos distintos e simulados publicados | Backend Prisma e frontend ligados; 286 testes relevantes sem banco aprovados, incluindo escopo e autorização. Consulta real não homologada |
| Simulados | `GET /avaliacoes`; formulários e serviços de rascunho/publicação existentes | Código integrado; revisão atual mostra estado vazio e bloqueia todas as gravações |
| Navegação e perfil | Rotas próprias, histórico, escolha de contexto e mensagens de pendência | Testes de interface isolados; nenhuma concessão de permissão real |
| Permissões | JWT + conta atual + vínculo/contexto + designação de turma + isolamento do ADMIN | Testes unitários/HTTP com persistência mockada; pendente validação no ambiente autorizado |

“Integrado” significa que a tela chama uma rota implementada do backend, que utiliza Prisma. Não significa que a rota foi executada contra seu banco. Nenhum item acima deve ser apresentado como homologado com dados reais.

Os itens acadêmicos solicitados têm cobertura de implementação. A entrega ainda **não tem homologação integral** de autenticação, vínculo, persistência, relatórios com dados reais e ações de escrita. O checklist antigo do README não foi marcado como concluído artificialmente.

## Correções desta etapa

- Página inicial ganhou indicadores consolidados do backend; os totais não são derivados da primeira página nem da soma de matrículas duplicadas.
- Turmas, alunos, simulados, relatórios e desempenho usam um componente de navegação próprio. Não montam o componente de questões nem consultam `/questoes` por efeito colateral.
- Rotas desconhecidas do Professor apresentam erro explícito, em vez de cair no painel antigo de questões.
- Revisão interativa somente leitura, com origem separada, faixa permanente e bloqueio de rede externa.
- Módulo de questões do Fernando preservado. H4.24 continua desativada por código compartilhado; nenhuma migration ou operação de banco executada.

## Testes reproduzíveis sem banco

```powershell
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run test:no-db -- src/services/teacher-overview.test.ts src/routes/goals-reports.test.ts src/services/account-deletion.test.ts src/services/class-delegation.test.ts src/services/auth-service.test.ts
npm.cmd --prefix backend run test:no-db -- src/routes/auth-security.test.ts src/services/institution-service.test.ts src/services/invitation-onboarding.test.ts src/services/institution-homologation.test.ts src/services/jwt-auth.test.ts
```

O comando histórico `npm.cmd --prefix frontend run test:teacher-review` só pode ser usado com o overlay privado. Ele não integra a sequência pública acima.

Também foram executados os testes de navegação dos dashboards (`frontend/scripts/test-dashboard-navigation.mjs`), com 23 cenários aprovados, incluindo ausência de consultas de questões nas páginas acadêmicas. Builds aprovados; testes backend acima: 68 + 218 = 286 aprovados, todos com persistência mockada. O teste da revisão interativa verificou as páginas, a recusa de gravação com 405 e ausência de requisições para APIs/banco/rede externa.

A regressão de sessão/perfis (`frontend/scripts/test-session.mjs`) concluiu 75 cenários aprovados com APIs interceptadas, incluindo Aluno, Professor e ADMIN, autenticação, revogação, permissões, perfil, turmas e relatórios. Nenhum desses testes autenticou uma conta real.

Sem commit, push, merge, deploy ou alteração de dados reais. A próxima etapa real depende da autorização descrita acima.
