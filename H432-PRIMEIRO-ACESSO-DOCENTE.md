# H4.32 — primeiro acesso de professores convidados

> Registro histórico da respectiva etapa. Testes, configurações, autorizações e impedimentos referem-se àquela execução; não comprovam o estado atual nem autorizam operações reais. Consulte a consolidação [H4.37](H437-CONSOLIDACAO-PROFESSOR.md) e o [README](README.md).

13/11/2026 — branch `entrega0911`. Implementação de código e testes sem banco. Sem novo envio real, criação de conta real, aceite real, escrita de banco, migration, alteração de `.env`/credenciais, commit, push, merge ou deploy. Recarregamentos automáticos do backend pelo watcher foram autorizados; nenhum outro launcher foi iniciado.

## Fluxos implementados

### Conta existente

`/convite-professor` apresenta **Já tenho conta — Entrar**, reutilizando o `AuthGate`, login por senha, Google, validação da sessão e confirmação de e-mail existentes. O fluxo de login do convite não encaminha para cadastro de estudante/responsável. O login Google usa uma opção restritiva no endpoint existente: nesse caminho, uma conta Google desconhecida não cria uma conta pública implicitamente; é orientada ao primeiro acesso.

O token permanece em memória na mesma aba durante login. Após autenticação, o sistema volta ao convite, valida token/destinatário/instituição no backend e mostra instituição, e-mail e **Aceitar convite** / **Recusar convite**. Login não promove a conta nem cria vínculo.

Se a conta existente ainda não confirmou o e-mail, é reutilizado `EmailConfirmationGate`, sem inspecionar o convite com uma sessão não confirmada. Depois de confirmar, **Já confirmei meu e-mail** ou a revalidação da sessão permite retornar à inspeção na aba original. Nenhum envio de confirmação ocorre automaticamente pela página de convite; o botão de reenvio existente continua explícito e sujeito à autorização real.

### Primeiro acesso

Em ambiente institucional normal/produção devidamente autorizado, um token válido para endereço ainda não cadastrado libera **Primeiro acesso — Criar minha conta**. O formulário é próprio do convite existente, não o cadastro público de Aluno. Nome, senha própria, confirmação e termos usam as políticas já utilizadas pela autenticação do JurisSim. O e-mail vem do convite e é somente leitura.

O link efetivamente recebido no e-mail é a prova de posse daquele endereço. Por isso o cadastro pelo convite pode marcar o e-mail confirmado sem disparar outra mensagem; não há um segundo sistema de autenticação ou senha temporária enviada pelo sistema.

A mudança central é separar cadastro de aceite:

1. `/institutions/invitations/register` cria **somente a identidade**, senha hash e auditoria, mantendo o convite pendente. Não chama `acceptInTransaction`, não muda para Professor e não cria vínculo/designação.
2. Retorna `LOGIN` e orientação para entrar com a senha definida. O frontend mantém o token original, limpa a senha digitada e usa o mesmo `AuthGate` com e-mail preenchido.
3. Após login, revalida o convite e exibe a instituição, destinatário e decisão explícita. Não exige navegar pelo cadastro/dashboard do Aluno.
4. Somente `/invitations/accept`, autenticado e solicitado pelo usuário, consome o convite, concede Professor/TEACHER e eventuais turmas do convite, preservando histórico. Essa operação também remove o marcador de identidade pendente.

Uma conta que já existe não tem senha sobrescrita pelo primeiro acesso. Repetição após cadastro concluído deve usar login; o token não se transforma em recuperação de senha. Os fluxos legados de definição de senha por prova também foram separados: completar a prova prepara a identidade e mantém o convite para aceitação autenticada posterior.

## Identidade pendente e compatibilidade do schema

O enum versionado só possui `ALUNO`, `PROFESSOR` e `ADMIN`. Conceder Professor antes do aceite violaria a regra solicitada; criar um novo papel exigiria migration, não autorizada. A solução usa **um único registro User**, com o papel básico interno e o marcador server-side `registrationIntent=TEACHER_INVITATION`, na coluna textual já existente.

Isso não é um segundo cadastro de Aluno nem uma etapa de estudo para virar Professor. A sessão informa `nextStep=INVITATION`; o frontend direciona essa identidade exclusivamente ao convite, inclusive após login sem contexto. Um guard no backend recusa acesso acadêmico de identidades pendentes (turmas, alunos, questões, simulados, metas, relatórios e demais rotas protegidas pelo guard), independentemente de alterações de URL/cache. Não recebe dashboard de Aluno ou Professor.

O marcador só é criado pelo cadastro validado do convite, não pelo formulário público ou por uma escolha de papel. O aceite o remove na mesma transação da concessão docente. Contas Aluno já existentes não recebem esse marcador: continuam preservadas até a decisão explícita sobre seu convite.

Não foi alterado o schema nem criada/aplicada migration. A implementação pressupõe o schema institucional existente, inclusive a coluna textual `registrationIntent`. Os testes não substituem a validação desse schema em um ambiente real autorizado.

## Homologação restrita preservada

Na homologação restrita registrada nesta etapa, o escopo privado limitava os participantes; isso não descreve a configuração atual de uma instalação pública. Nele, uma pessoa desconhecida não pode criar conta pelo convite para obter um novo UUID e contornar `participantIds`. O primeiro acesso aparece com a explicação de indisponibilidade e não dispara cadastro; conta prévia autorizada pode usar login/aceite normal.

Não foram alterados manifesto, participantes, allowlist do transporte ou flags. A liberação real de pessoas novas nesse runtime exigiria decisão de política específica, fora desta tarefa. Não se recomenda criar uma conta de Aluno manualmente como atalho. O caminho completo novo está no modo institucional normal/produção preparado pela H4.29, sem ativá-lo no ambiente atual.

## Contexto e token

- Apenas memória da aba, sem localStorage, sessionStorage, cookies novos ou persistência de token bruto. JWT de sessão continua usando o mecanismo existente, separado do token de convite.
- Fragmento do e-mail é validado e imediatamente removido da URL/history atual. Tokens/provas não são copiados para logs ou resposta de sessão.
- Cadastro não apaga o token. Concluir uma prova legada apaga somente a prova, mantendo o convite.
- Um limite local de 48 horas torna o contexto indisponível; a validade verdadeira continua sendo conferida no servidor e pode terminar antes disso.
- Recarga, nova aba sem o link ou navegação que destrua o contexto orienta reabrir o e-mail original. Não há recuperação automática por dados inseguros de navegador nem transferência silenciosa entre abas/origens.
- Outra aba que abra o link original cria seu próprio contexto, sujeito à mesma autenticação e uso único no backend. Uma URL já sanitizada, sem a prova, não recupera o convite.
- Confirmação de e-mail em outra aba: retornar à original e revalidar; se o contexto se perdeu, reabrir o convite original. Não reenviar automaticamente para resolver perda de memória.
- Link incompleto/inválido não dispara inspeção. Estados de expiração, revogação, conta incorreta, aceite anterior e falha de comunicação da H4.31 são preservados.

## Arquivos

Backend:

- `services/invitation-onboarding.ts` / `.test.ts`: criação/definição de senha sem aceite, marcador e retorno ao login.
- `services/institution-service.ts` / `.test.ts`: remoção do marcador somente no aceite autenticado.
- `services/auth-service.ts` / `.test.ts`: sessão pendente sem diagnóstico/área de Aluno e Google login-only quando solicitado pelo convite.
- `controllers/auth-controller.ts`: opção restritiva do Google no endpoint existente; não amplia privilégios.
- `middlewares/auth-middleware.ts`, `academic-access.ts`, `invitation-pending.test.ts`: identificação e bloqueio acadêmico da identidade pendente.
- `tests/auth-routing.test.ts`, `tests/invitation-context.test.ts`: roteamento seguro, memória, expiração, nova página e prova legada.

Frontend:

- `invitation-onboarding.tsx`: dois caminhos, cadastro separado, confirmação reutilizada e retorno ao convite.
- `invitation-token.ts`: contexto em memória, limite local, link inválido e limpeza separada da prova.
- `auth-gate.tsx`: reutilização do login, sem cadastro público lateral no convite; Google de conta existente e retorno.
- `auth-session.ts`, `auth-routing.ts`: sessão de convite pendente, sem dashboard acadêmico.
- `email-confirmation-gate.tsx`: orientação para retomar o convite, sem duplicar o mecanismo de confirmação.
- `scripts/test-administration.mjs`: cenários correspondentes, clique duplo, perda de contexto e confirmação.

Nenhum arquivo do módulo de questões do Fernando foi alterado. O guard comum apenas protege identidades pendentes; a regressão dos perfis existentes passou.

## Validação desta etapa

- **440 testes backend aprovados**, 18 arquivos: cadastro pendente, login/sessão/Google, guards, aceite separado, instituições, contexto, delegações, Professor/relatórios e H4.24.
- **66 verificações administrativas de navegador aprovadas**, incluindo os dois caminhos, cadastro sem concessão, login e aceite separado, confirmação existente, link/contexto perdido, temas e responsividade.
- **78 cenários de sessão/perfis aprovados**.
- Suíte estática de entrega aprovada, com bloqueio de H4.24 e 14 verificações do ADMIN.
- Builds backend/frontend e `git diff --check` aprovados. Avisos de bundle/anotações de dependências não impediram compilação.
- `/health` respondeu 200 na verificação histórica após os recarregamentos; essa resposta não comprova acesso ao banco.

As suítes usam persistência, API e SMTP mockados ou contexto de navegador isolado. Não são prova de contas criadas/aceitas ou e-mails entregues em ambiente real. Nesta H4.32 **não houve consulta de banco nem verificação SMTP real**, tampouco escrita ou nova mensagem.

## O que foi comprovado em integração real e o que não foi

| Evidência | Situação |
| --- | --- |
| Backend HTTP ativo com código recarregado | Verificado nesta etapa por `/health` |
| Banco/SMTP e convite de homologação | Evidência histórica da H4.30/H4.31: configuração e leitura reais; recebimento confirmado pelo usuário. Não reexecutados aqui |
| Login e aceite reais da conta destinatária | Não executados pelo agente; dependem de autorização e ação explícita do usuário |
| Nova identidade criada pelo fluxo H4.32 | Somente mocks; nenhuma conta real foi criada |
| Marcador, bloqueio acadêmico, cadastro sem aceite e concessão posterior em PostgreSQL | Código e testes isolados; integração transacional real ainda pendente |
| Google real/retomada entre abas de correio | Não homologados nesta etapa; validação local não substitui OAuth e correio reais |

## Revisão manual futura, após autorização

Conta existente: reabrir o e-mail original, escolher Já tenho conta — Entrar, usar senha/Google da conta destinatária, confirmar e-mail pelo fluxo existente se necessário, voltar ao mesmo convite e conferir instituição/e-mail. Parar antes de Aceitar até autorizar as escritas de concessão. Não duplicar o cadastro de uma pessoa que já possui conta.

Pessoa nova: usar ambiente institucional integrado explicitamente autorizado, endereço e convite de teste aprovados; escolher Primeiro acesso — Criar minha conta, definir senha/termos, verificar que não existe vínculo nem aceite, entrar pelo login apresentado e decidir Aceitar/Recusar separadamente. Aprovar previamente criação/auditoria, login e aceite; nenhuma dessas ações está autorizada para execução real nesta etapa.

Testar perda de contexto reabrindo o e-mail original, sem nova mensagem. Confirmar que convite vencido/revogado/reutilizado não concede acesso e que uma identidade pendente não abre os dashboards. Sem aceite, não há concessão docente; caso recuse/expire, a identidade permanece sem acesso acadêmico até uma decisão legítima futura — não é promovida ou convertida automaticamente em estudante.

H4.24 continua desabilitada. Sem migrations, exclusões, publicação ou modificação de dados reais.
