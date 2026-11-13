# H4.25 — revisão institucional, convites, alunos e segurança

> Registro histórico da respectiva etapa. Testes, configurações, autorizações e impedimentos referem-se àquela execução; não comprovam o estado atual nem autorizam operações reais. Consulte a consolidação [H4.37](H437-CONSOLIDACAO-PROFESSOR.md) e o [README](README.md).

Atualização posterior: [H4.26 — convites e sessões](H426-CONVITES-E-SESSOES.md) substitui a confirmação do logout por modal sem checkbox e registra os testes e impedimentos atuais dos convites. Os resultados abaixo são históricos da H4.25.

13/11/2026 — branch `entrega0911`, sem criar branch. Alterações anteriores preservadas. Não foram executados comandos de banco, migrations, envios reais de e-mail, mudanças de contas/permissões, commit, push, merge ou deploy. A H4.24 continua desativada.

## Correções visuais e de navegação

- No portal `/instituicoes`, o conteúdo de `decisionReason` passou a aparecer em um componente informativo neutro, com rótulo separado do texto. Para aprovação, o rótulo é “Observação registrada na análise”; para rejeição, “Orientação para revisão do cadastro”. Não é um alerta nem uma instrução automática do sistema.
- “É uma instituição” não é uma mensagem gerada pelo frontend: o portal exibe o campo `Institution.decisionReason`. No backend, decisões e correções administrativas gravam nesse campo a justificativa fornecida. O conteúdo foi preservado; sem consultar banco/auditoria, não foi possível atribuir o texto real a um autor ou momento específico.
- “Administrar instituição” tem estilo primário azul-marinho/dourado, altura mínima de 44px, padding e foco visível. A condição de autorização e o destino da instituição selecionada foram mantidos.
- Os cartões cadastral/operacional mantêm estados distintos, com ajustes de contraste no tema escuro. A nota de análise e o botão não se sobrepõem.
- O modal institucional agora usa um portal em `document.body`, com tema próprio e camada isolada. Fundo inerte, bloqueio de rolagem externa, limites de altura/largura, rolagem interna e cabeçalho/rodapé separados impedem interferência da tabela de fundo.
- Foco inicial no nome, ciclo de Tab, retorno ao botão de abertura e fechamento por X, Fechar e Escape. Durante envio, os campos e o fechamento ficam bloqueados até a resposta, evitando novo envio acidental.
- A paginação “Anterior / Página 1 / Próxima” realmente pertencia ao formulário de convite, não à tabela atravessando o modal. Ela era sempre renderizada; além disso, os botões compartilhados não tinham `type="button"`, podendo submeter o formulário. Agora a paginação do convite aparece apenas se necessária, identifica as páginas das turmas e não envia o formulário. A turma selecionada é preservada ao mudar de página.

## Resultado da investigação do convite

O caminho que produz “Conta fora do escopo autorizado.” é `assertRestrictedParticipant`, em `backend/src/config/institution-homologation.ts`. No envio/reeenvio de convite em homologação restrita, o backend exige:

1. Ator com administração institucional válida para a instituição autorizada, e proveniência da fixture verificada.
2. Destinatário com conta previamente cadastrada e e-mail confirmado.
3. UUID do destinatário incluído em `participantIds` do registro privado de homologação.
4. Instituição ativa; turmas iniciais ativas e pertencentes àquela instituição.

O papel global **Aluno não é a causa desse bloqueio**. Uma conta Aluno pode legitimamente receber convite. O envio não muda papel, senha, histórico ou vínculo; somente o aceite válido concede o vínculo `TEACHER` e muda o papel global para `PROFESSOR`. A identidade e os dados acadêmicos existentes são preservados. O modelo tem um único papel global, portanto não oferece simultaneamente os dashboards pessoais de Aluno e Professor para a mesma conta. Para manter a conta Aluno com seu papel atual, a alternativa é outra conta, com outro e-mail, autorizada pelo fluxo institucional.

Na homologação restrita, o erro agora explica que o destinatário está fora do escopo e que a inclusão exige autorização explícita. A verificação original permanece obrigatória, inclusive no reenvio; não há inclusão automática no registro, promoção de conta ou tolerância a UUID desconhecido.

### Contas existentes, novas e ciclo do convite

| Caso | Regra implementada |
| --- | --- |
| Aluno existente, modo institucional normal | Pode receber convite; entra com a própria senha/Google, confirma o e-mail quando necessário e aceita com a conta destinatária |
| Conta nova, modo normal habilitado | Convite permite primeiro acesso com senha definida pelo próprio usuário, aceite legal e validação do token; não há cadastro público que atribua Professor livremente |
| Aluno existente na homologação restrita | Precisa estar previamente confirmado e autorizado em `participantIds` |
| Conta nova/desconhecida na homologação restrita | Não pode ser criada/promovida para contornar o escopo. Cadastro, confirmação e autorização prévia são necessários |
| ADMIN global | Não recebe gestão pedagógica por convite; o backend recusa o aceite |
| Aceite | Token válido, pendente, destinado ao e-mail da conta confirmada, instituição ativa e escopo atual. Concessão somente após essas verificações |
| Recusa | Não concede papel/vínculo docente; utiliza autenticação destinatária ou prova de e-mail no fluxo correspondente |
| Expiração/cancelamento | Convites expiram em 48 horas e são de uso único; expirados, cancelados ou já utilizados não podem ser aceitos |
| Reenvio | Revalida destinatário, escopo e turmas; respeita intervalo e limite por hora, invalidando convite anterior conforme o fluxo existente |

Nenhum estado atual de conta real foi consultado. A causa acima é a regra identificada no código que gera a mensagem, não uma comprovação de qual UUID/e-mail está autorizado hoje. **O destinatário fora do escopo continua bloqueado legitimamente.** Liberá-lo depende de autorização para conferir a conta correta e revisar o escopo privado, e depois de autorização para as alterações de vínculo/papel decorrentes do aceite. Nada disso foi realizado.

## Consulta de alunos: cadastro não é matrícula

| Necessidade | Interface/endpoint existente | Limite |
| --- | --- | --- |
| Localizar conta global | ADMIN: `/administracao/usuarios`; `GET /institutions/admin/users?search=...` | Exclusivo do ADMIN global autorizado. Pesquisa explícita por nome/e-mail, com filtros e paginação. Continua testada em navegador com API interceptada |
| Consultar matrículas institucionais | Instituição → Alunos; `GET /turmas/students` ou `GET /turmas/:id/students` | Somente turmas acessíveis naquele contexto; não pesquisa contas globais |
| Vincular conta cadastrada | Instituição → Turmas → formulário “E-mail do aluno já cadastrado” → “Vincular aluno”; `POST /turmas/:id/students` | E-mail exato, turma ativa autorizada, conta Aluno confirmada e não suspensa, além do escopo restrito quando aplicável. É uma gravação, não uma busca global |

O formulário de vinculação já existia e foi preservado; não foi criado endpoint novo de pesquisa de dados pessoais. O estado vazio institucional agora explica que ausência de matrícula não comprova ausência de cadastro, orienta sobre o ADMIN global e oferece “Ir para turmas”, mantendo instituição/turma no contexto da navegação.

## Sair de todos os dispositivos

O card “Desativar minha conta” foi removido da experiência principal de Segurança e substituído por **Sair de todos os dispositivos**, com confirmação explícita. O endpoint de desativação e seu código continuam disponíveis para fluxos existentes; não foram excluídos.

O botão **não é apenas logout local**:

- Usa o endpoint real existente `POST /auth/logout`, autenticado por Bearer JWT.
- `AuthRepository.revokeSessions` faz incremento atômico de `User.sessionVersion`, limitado ao usuário autenticado e não excluído. O serviço só informa sucesso se exatamente uma conta foi atualizada.
- O middleware autenticado compara a versão de cada JWT com a versão atual da conta. JWTs antigos, inclusive legados de versão zero, deixam de autorizar requisições; isso inclui a sessão atual.
- A infraestrutura auditada não possui refresh tokens de sessão. Tokens de confirmação de e-mail/recuperação são finalidades distintas e não renovam automaticamente JWTs revogados.
- O frontend aguarda a resposta do servidor antes de limpar a sessão atual e redirecionar ao login. Falha de rede/servidor exibe erro sem afirmar revogação; resposta atrasada não encerra uma nova sessão de outra conta. Uma sessão já inválida continua sujeita ao tratamento central de 401.
- Nome, senha, e-mail, `deletedAt`, históricos e vínculos não são alterados. Não há liberação do e-mail.
- As rotas de autenticação validam `Origin`; as chamadas utilizam Authorization explícito, sem autenticação automática por cookie. Origem externa é recusada e formulário sem Bearer não autoriza logout. Essas proteções existentes foram mantidas.

**Confirmação técnica:** a invalidação está implementada no backend, sem migration nova. Testes HTTP com Prisma mockado verificaram dois JWTs anteriores, rotas protegidas de várias famílias, preservação da conta e login novo emitindo a versão atual. Não houve execução contra PostgreSQL real e não é declarada homologação de persistência real.

O card de exclusão continua com botão vermelho desabilitado. A mensagem pública foi simplificada para “A exclusão de conta ainda não está disponível. Sua conta e seus dados permanecem preservados.” Os motivos técnicos da H4.24 ficam na documentação, sem expor migrations ao usuário final.

## Arquivos desta etapa

Backend:

- `backend/src/services/institution-service.ts`: diagnóstico específico de destinatário fora do escopo, preservando os guardas.
- `backend/src/services/auth-service.ts`: confirmação do resultado da revogação de sessões.
- `backend/src/account-deletion-availability.ts`: mensagem pública simples; disponibilidade continua `false`.
- `backend/src/services/invitation-scope.test.ts` (novo): Aluno existente, participante autorizado/não autorizado e conta desconhecida, com persistência mockada.
- `backend/src/services/auth-service.test.ts`: recusa de sucesso quando nenhuma conta é atualizada.
- `backend/src/routes/auth-security.test.ts`: revogação global, JWTs anteriores, preservação de identidade e proteção de origem; ajuste da fixture para não apagar hash ao simular incremento de versão.

Frontend:

- `frontend/src/global-sign-out.tsx` (novo): confirmação, envio, carregamento e erro.
- `frontend/src/auth-session.ts`: ação global distinta do logout local com fallback; proteção de sessão substituta.
- `frontend/src/integration-shell.tsx`: reorganização do card de Segurança.
- `frontend/src/administration.tsx`: nota de análise, botão primário e tipos explícitos dos botões compartilhados de paginação.
- `frontend/src/administration.css`: portal, cartões, nota, foco e contraste.
- `frontend/src/institution-dashboard.tsx`: modal em portal, tema, foco, fundo inerte, envio e paginação de turmas; explicação do escopo; consulta institucional de alunos.
- `frontend/src/institution-dashboard.css`: camada e layout do modal, rolagem interna e estados responsivos.
- `frontend/src/class-exams.tsx`: explicação contextual de matrículas e ação “Ir para turmas”. O módulo de questões não foi alterado.
- `frontend/scripts/test-account-deletion.cjs`: mensagem pública simplificada.
- `frontend/scripts/test-administration.cjs`: verificação de isolamento dos estilos do portal e do ADMIN.
- `frontend/scripts/test-administration.mjs`: nota/ação primária, foco, portal, X/Fechar/Escape, dimensões, paginação, escopo recusado e envio único.
- `frontend/scripts/test-session.mjs`: logout global, confirmação, erro, espera do servidor e sessão substituta.

Documentação: este relatório e referência de atualização em `H424-ACOES-DE-CONTA.md`.

## Validação

- 241 testes direcionados de backend aprovados em oito arquivos, com configuração `vitest.no-db.config.ts`. Ela bloqueia persistência não explicitamente mockada; não executa testes de banco.
- 60 cenários administrativos/institucionais de navegador aprovados, com APIs interceptadas. Incluem consulta global do ADMIN, isolamento institucional, convite e modal.
- 77 cenários de sessão/perfil aprovados com APIs interceptadas, incluindo confirmação do logout global, erro sem falso sucesso, espera da resposta e preservação de uma sessão substituta.
- Suíte estática de entrega aprovada, incluindo estilos isolados e exclusão desativada sem requisições.
- Builds de backend/frontend aprovados. Avisos de tamanho de bundle e comentários de dependências não impedem a compilação.

Esses resultados validam código e comportamento com doubles. **Não são comprovação de convite enviado, conta promovida, matrícula persistida ou logout confirmado em banco real.** Não foram executados testes de integração PostgreSQL.

Reprodução sem banco, na raiz:

```powershell
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run test:no-db -- src/routes/auth-security.test.ts src/routes/auth-stage7.test.ts src/services/auth-service.test.ts src/services/institution-service.test.ts src/services/invitation-onboarding.test.ts src/services/institution-homologation.test.ts src/services/invitation-scope.test.ts src/services/account-deletion.test.ts
npm.cmd --prefix frontend run test:delivery-static
```

Para as verificações de navegador, no diretório `frontend`, executar separadamente `node scripts/test-administration.mjs` e `node scripts/test-session.mjs`. Eles iniciam apenas Vite/Chrome headless e interceptam APIs, sem iniciar backend/banco nem enviar e-mail real.

## Procedimento manual no navegador

**Estado atual:** a revisão isolada pode ser reproduzida pelos testes acima. Para homologação real, primeiro autorizar o ambiente e contas descartáveis. Não iniciar o comando `dev` da raiz ou executar ações reais com base somente neste roteiro: isso pode conectar o runtime e gerar auditoria. O agente não iniciou/reiniciou o backend conectado.

Após autorização específica para o ambiente:

1. Em `/instituicoes`, conferir “Meus vínculos e solicitações”, separação entre rótulo/conteúdo da observação, situações cadastral/operacional e ação primária, em claro/escuro e celular. “Administrar instituição” só aparece para vínculo administrativo autorizado e situação operacional correspondente.
2. Abrir a instituição selecionada → Professores/Convites → Convidar professor. Conferir foco no nome, campos, rolagem interna, X/Fechar/Escape e retorno do foco. Não deve haver paginação de turmas quando há somente uma página; se houver várias, mudar de página não envia o convite nem perde a seleção.
3. Antes do envio real, confirmar qual conta/email é destinatária e se o UUID está autorizado no escopo restrito. Se não estiver, **parar e obter autorização para conferir e revisar o escopo**; não alterar flags nem escolher outra instituição para contornar a recusa.
4. Somente com autorização para escrita/e-mail, enviar convite a conta descartável autorizada, testar aceite/recusa/expiração e confirmar que o papel só muda no aceite. Usar outra conta se a conta Aluno existente deve conservar seu papel. Esses testes não foram realizados em dados reais nesta etapa.
5. Em ADMIN → Usuários, pesquisar explicitamente nome/e-mail. Na Instituição → Alunos, comparar matrículas no contexto correto. Para vincular uma conta confirmada, usar Turmas → e-mail exato → Vincular aluno, **somente com autorização para essa matrícula**. Não procurar diretório global de pessoas na tela institucional.
6. Com uma conta descartável autorizada em duas janelas/perfis de navegador, abrir `/perfil?aba=security` e confirmar “Sair de todos os dispositivos” na primeira. Ela deve ir ao login com mensagem de sucesso; ao fazer nova requisição protegida na segunda, o JWT anterior deve ser recusado. Uma página já desenhada pode continuar visível até a próxima requisição; isso não significa que o token ainda autoriza acesso.
7. Entrar novamente e conferir que a conta continua ativa, com o mesmo e-mail, dados e vínculos. Esse teste grava a versão de sessão e pode gerar auditoria: exige autorização prévia, embora não exclua dados.
8. Conferir que “Excluir minha conta” permanece vermelho/desabilitado, com mensagem simples e sem falso sucesso. A H4.24 ainda depende do schema e de homologação própria.

## Bloqueios restantes

- Destinatários fora do escopo H3/H4 continuam bloqueados. Inclusão e conferência de conta real exigem autorização; o registro privado e as permissões não foram alterados.
- Conta nova não passa pelo primeiro acesso de convite no runtime restrito sem autorização prévia.
- Login real, envio de convite, aceite, matrícula e logout global real não foram executados, pois exigem operações de banco e/ou envio de mensagens.
- Exclusão H4.24 continua desativada, independentemente de flags; nenhuma migration foi executada.

O próximo passo para homologar o Professor com dados reais é autorizar o destinatário e o ambiente corretos, sem excluir a conta Aluno nem afrouxar as regras de escopo.
