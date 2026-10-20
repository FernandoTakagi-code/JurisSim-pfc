# Integração — etapa 7: autenticação e homologação local

## Auditoria inicial — antes das correções

Branch confirmada: `entrega2809`. Todas as alterações locais das etapas 1–6
foram inventariadas e seus hashes registrados antes de modificar código. Não
foram lidos valores de credenciais para uso, conectados ambientes remotos ou
executados os verificadores reais de SMTP/Google.

Referência inicial: **354 testes backend / 18 suítes aprovados**. O schema possui
`User.sessionVersion`, `emailVerifiedAt`, `deletedAt`, `AuthToken` e
`PasswordRecoveryToken`; confirmação usa SHA-256/60 minutos e recuperação usa
SHA-256/30 minutos. Foram conferidas as 12 migrations, incluindo metas/relatórios
e fotos/RLS. Não há necessidade identificada de mudar o schema para esta etapa.

Problemas identificados antes da implementação:

1. Reenvio de confirmação cria tokens sem limite de frequência e sem invalidar
   confirmações anteriores. A recuperação limita três por hora, mas conta/cria
   sem bloqueio do usuário e pode exceder o limite em solicitações concorrentes.
2. Cadastro/login não têm limite HTTP de tentativas. Nome/e-mail/senha precisam
   limites e validações consistentes, sem truncamento bcrypt acima de 72 bytes.
   A corrida de e-mail duplicado pode resultar em erro interno em vez de 409.
3. `AuthService` já possui verificação do perfil escolhido, mas os schemas e o
   controller descartam `perfil` enviado pelo frontend no login tradicional/Google.
4. O Google usa a biblioteca oficial para assinatura/audiência/expiração e exige
   `email_verified`; recusa associação automática a conta com senha e exige aceite
   legal. Falta vincular o ID token à tentativa no navegador por nonce. A seleção
   Professor pode ser ignorada e criar uma conta Aluno no fluxo anterior.
5. Logout limpa somente o navegador. O JWT copiado permanece válido até expirar
   ou ocorrer redefinição/exclusão. Será reutilizado `sessionVersion` para revogar
   as sessões do próprio usuário ao sair, documentando o efeito em outros dispositivos.
6. Contas excluídas são bloqueadas nos recursos, mas os serviços de emissão/login
   e recuperação também devem recusá-las explicitamente.
7. Os formulários não usam submit/validação nativa completos; confirmação de senha
   do cadastro é ignorada no backend. Erros carecem de `role=alert`; há “Lembrar de
   mim” sem comportamento implementado. Links inválidos podem manter tokens no hash.
8. Gmail SMTP já usa STARTTLS obrigatório, timeouts, logs desabilitados e dois
   templates. Não há homologação de entrega; a configuração não impõe o remetente
   oficial. Nenhuma conta alternativa será utilizada. Falta de senha de aplicativo
   permanece uma pendência externa, sem bypass de confirmação.
9. Auditoria npm confirma três alertas altos na cadeia Prisma/config/deepmerge-ts.
   A correção automática sugerida é uma atualização principal do Prisma. A migração
   de CommonJS/cliente/configuração não será feita indiscriminadamente nesta etapa.
10. Na revisão adicional da validação JWT, o emissor sempre define oito horas,
    mas o validador aceita um JWT assinado sem `exp`. Será exigida essa claim,
    preservando tokens legados com expiração e versão de sessão inicial zero.

Decisões de escopo: reutilizar rotas, middlewares, tabelas e componentes; adicionar
controle HTTP em memória limitado e cotas persistidas por usuário nos tokens;
serializar emissão com bloqueio da conta; manter tokens somente como hash, falhas
SMTP neutras/seguras, não criar transporte falso na aplicação de produção.
Mocks/transporte de teste existem exclusivamente nas suítes isoladas.

## Correções e contratos

Não foi criada migration nem alterado o schema. As tabelas e os 12 arquivos de
migration anteriores foram preservados. Não foram atualizadas dependências.

| Endpoint | Contrato e acesso |
| --- | --- |
| `POST /auth/register` | Público; nome, e-mail, senha, `role: ALUNO/PROFESSOR`, aceite legal atual; confirmação de senha é validada quando enviada. Retorna 201, JWT limitado e estado do envio, mantendo conta pendente |
| `POST /auth/login` | Público; e-mail/senha e `perfil` opcional compatível com a conta. Retorna JWT de oito horas, sem conceder acesso completo a não confirmados |
| `POST /auth/google` | Público; ID token, `nonce` hexadecimal de 64 caracteres, `perfil` opcional e aceite quando solicitado. Validações do provedor e perfil atual continuam obrigatórias |
| `GET /auth/session` | JWT válido, inclusive pendente; DTO limitado e destino conforme perfil/diagnóstico consultados no banco |
| `POST /auth/email-verification` | JWT válido, inclusive pendente; reenvio controlado, 202; não retorna token ou link |
| `POST /auth/email-verification/confirm` | Público; token temporário do e-mail. Confirma atomicamente, não emite JWT nem altera privilégios |
| `POST /auth/password-recovery` | Público; e-mail; 202 neutro para existência, conta Google, exclusão, cota da conta e falha de envio |
| `POST /auth/password-reset` | Público; token, senha e confirmação. Uso único, bcrypt, revogação e invalidação de outros links ativos na mesma transação |
| **`POST /auth/logout` — novo** | JWT válido, inclusive pendente; usa somente o titular autenticado, ignora IDs arbitrários e incrementa `sessionVersion` |
| `PUT /auth/nome`, `DELETE /auth/conta` | Contratos existentes; continuam exigindo confirmação e identidade autenticada; limpeza de foto preservada |

Erros: 400 para campos/links inválidos; 401 para credenciais/JWT/contas inválidas;
403 para perfil, confirmação ou origem recusados; 409 para e-mail duplicado ou
conta indisponível para reenvio; 413 para JSON excessivo; 429 para limites; 503
para serviço/configuração indisponível. Respostas da área `/auth` recebem
`Cache-Control: no-store` e `Referrer-Policy: no-referrer`.

- Cadastro limita nome a 120 caracteres, e-mail a 254 e novas senhas a **72 bytes
  UTF-8**, evitando truncamento silencioso no bcrypt. A política anterior de
  mínimo de seis caracteres foi preservada; não houve troca de senhas existentes.
- E-mail recebe trim; a comparação exata de maiúsculas/minúsculas herdada foi
  preservada para não confundir contas existentes. Normalização global exige
  antes inventariar possíveis colisões. Nenhum dado foi normalizado em massa.
- O erro de unicidade do PostgreSQL em cadastros concorrentes retorna 409, sem
  expor detalhes Prisma. Contas excluídas não recebem novos JWTs ou recuperações.
- `perfil` agora chega ao serviço que já fazia a verificação. Ele restringe a
  escolha da tela; o papel e as permissões continuam vindo do usuário no banco.
- JWTs precisam de `exp`, assinatura HS256, ID e role válidos. A versão da sessão,
  exclusão e confirmação são verificadas como antes. Legados sem `sessionVersion`
  continuam restritos à versão zero, mantendo a compatibilidade já documentada.
- O logout bem-sucedido encerra **todas as sessões daquela conta**, em outros
  dispositivos também. Foi escolhido esse comportamento para reutilizar a
  revogação existente, sem outra tabela ou lista temporária de tokens.
- Se o servidor não puder confirmar a saída, o navegador limpa sua sessão e
  apresenta aviso persistente até novo login válido. Não promete revogação remota
  nessa situação. Respostas atrasadas não encerram uma conta recém-autenticada.

## Tokens e limites

Política atualizada em 20/10/2026, centralizada em `auth-token-policy.ts`:
confirmação: 32 bytes aleatórios, SHA-256 no banco, validade de 30 minutos.
Recuperação: 32 bytes aleatórios, SHA-256 no banco, validade de 15 minutos. Os
links usam fragmento (`/#/...`), sem credencial em query HTTP. URLs de base são
validadas e serializadas antes de compor os links.

Emissão bloqueia a linha do usuário e verifica novamente conta/estado. Por conta,
cada fluxo permite **três emissões por hora**, com **um minuto de intervalo**.
Falhas de entrega também consomem a emissão. Novas emissões invalidam links
anteriores ativos. Confirmação e redefinição têm consumo transacional; reset
também invalida possíveis links de recuperação legados ainda ativos.

O enum `AuthToken.PASSWORD_RESET` é histórico. O fluxo atual de redefinição usa
`PasswordRecoveryToken`; não foi criado outro caminho para aceitar tokens antigos
ou acessar contas sem confirmação.

Proteção HTTP adicional por IP, independente do e-mail consultado:

| Operação | Limite por processo/IP |
| --- | --- |
| Cadastro | 15/hora |
| Login | 30/15 minutos |
| Google | 60/15 minutos |
| Recuperação | 30/hora |
| Redefinição | 30/15 minutos |
| Reenvio | 30/hora, além da cota persistida da conta |
| Confirmação do link | 60/15 minutos |

429 inclui `Retry-After`. Mapas são limitados a 10 mil IPs por operação e expiram
por janela; não há modo de desabilitar limites pelo cliente. IP vem do Express,
sem confiar manualmente em `X-Forwarded-For`. As cotas de conta são globais no
PostgreSQL e resistem à concorrência/reinício. A cota por IP é local ao processo;
proxy e múltiplas réplicas precisam controle compartilhado na infraestrutura.

## Google, CSRF e vinculação

O fluxo é **Google Identity Services com ID token via callback JavaScript**, não
um novo fluxo de authorization code. A biblioteca oficial continua verificando
assinatura, emissor, audiência e expiração; o controller exige e-mail verificado
e nonce correspondente ao contexto aleatório gerado no navegador. A aplicação
não recebe credenciais do Google por hash de navegação nem aceita `form_post`.

Quando `Origin` está presente, a área `/auth` o confronta com a origem de
`APP_PUBLIC_URL`; em produção, configuração inválida não libera uma origem web.
Clientes sem `Origin` ainda precisam suas credenciais/JWT. Não há autenticação
por cookie ambiente: o acesso protegido usa Bearer explicitamente. O nonce segue
o mecanismo descrito na [referência oficial do GIS](https://developers.google.com/identity/gsi/web/reference/js-reference#nonce).

Não há associação automática de uma conta com senha por coincidência de e-mail.
Novos cadastros Google continuam Aluno; Professor novo usa o cadastro tradicional.
Contas existentes usam seu papel atual. Aceite legal é exigido antes da criação
ou quando as versões armazenadas ficaram antigas. Nenhuma role vem do provedor
ou da URL.

O modelo histórico identifica as contas Google pelo e-mail. Não foi introduzida
migração de identidades para `sub` nem troca automática de endereço. Antes de
oferecer vinculação/troca de provedor ou lidar com reatribuição de e-mails,
homologar uma política de identificador estável e recuperação de contas legadas.
Nonce não deve ser confundido com uma lista persistida de revogação de ID tokens
do próprio Google; assinatura, expiração e proteção dos Bearers continuam essenciais.

Sem `VITE_GOOGLE_CLIENT_ID`, o frontend não injeta o SDK e mostra indisponibilidade
compreensível. Nenhuma credencial OAuth real foi usada, gerada ou alterada.

## Frontend e continuidade

- As telas existentes foram conectadas/validadas, sem substituir dashboard,
  sidebar, CRUD ou páginas de funcionalidades das etapas anteriores.
- Formulários usam submit nativo, Enter, validação de formato/obrigatoriedade,
  igualdade das senhas, carregamento e erros acessíveis por `role=alert`.
- Cadastro mantém conta pendente quando o envio falha. Reenvio mostra a mensagem
  real do backend; nenhuma confirmação é simulada no código da aplicação.
- Ao abrir confirmação/reset, o token fica só na memória do componente e o hash
  é removido da barra de endereço também nos erros. Reabrir o e-mail permite nova
  tentativa; recarregar a página limpa o token em memória.
- Links novos limpam senhas/mensagens antigas. Links incompletos não enviam uma
  confirmação vazia. A confirmação não transforma a sessão de outra conta.
- O checkbox inoperante “Lembrar de mim” foi substituído por uma indicação de
  sessão no navegador. Continua sendo usado sessionStorage e JWT de oito horas,
  sem inventar persistência em localStorage ou refresh token.
- Reset limpa o JWT local antigo. Logout, 401/403, perfil, temas e navegação
  continuam usando a sessão centralizada; o logout agora consulta o backend.

## Gmail SMTP — pendente externamente

O adaptador agora recusa remetente diferente de `jurissimplataforma@gmail.com`.
Mantém `smtp.gmail.com:587`, STARTTLS obrigatório, TLS mínimo 1.2, timeouts e logs
de transporte desativados. Templates de confirmação e recuperação têm texto/HTML
e enviam links, nunca senhas. Erros são traduzidos sem token/destinatário/detalhes
do provedor. O verificador de configuração também foi revisado, **não executado**.

Para homologação futura, o titular deve, fora do chat e após autorização:

1. Concluir a liberação da conta oficial e a verificação em duas etapas; gerar a
   senha de aplicativo na própria conta. Não usar senha normal ou conta de terceiro.
2. Configurar privadamente `GMAIL_USER` com o endereço oficial e
   `GMAIL_APP_PASSWORD` com a senha de aplicativo, sem versionar ou compartilhar
   o valor. Nenhum arquivo `.env` foi alterado nesta etapa.
3. Configurar `APP_PUBLIC_URL` com a URL HTTPS pública do frontend, sem query/hash,
   e `VITE_API_URL` com a API correta. Preservar os segredos de banco/JWT no backend.
4. Reiniciar/recompilar os componentes necessários. Autorizar separadamente
   `npm.cmd run email:verify`, que faz DNS/STARTTLS/AUTH e não envia mensagem.
5. Autorizar um destinatário controlado e verificar entrega, spam, cabeçalhos do
   remetente, links, expiração e reenvio. Conexão SMTP não comprova entrega.

OAuth externo requer client ID oficial idêntico em `GOOGLE_CLIENT_ID` e
`VITE_GOOGLE_CLIENT_ID`, origens permitidas corretas e testes reais de consentimento,
nonce, conflitos de conta, perfil e falhas. Não requer inventar client secret para
o callback de ID token usado aqui. Não houve acesso ao Google Cloud Console.

## Alertas de dependências

Em 18/10/2026, `npm audit --json` informa três alertas altos:
`prisma@6.19.3 → @prisma/config@6.19.3 → deepmerge-ts@7.1.5`. Trata-se da cadeia
relacionada ao [advisory de exaustão de pilha em grafos recursivos](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
O advisory aponta correção em deepmerge-ts 8; o npm sugere Prisma 7.10.1.

Não foi demonstrada exploração por um handler HTTP nesta auditoria; isso não
equivale a descartar o risco. Uma atualização principal exige revisar configuração,
geração/importação do cliente, ESM/CommonJS, adapters e comandos CLI, conforme o
[guia oficial Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).
Não foi aplicado `audit fix --force`, override major não validado ou atualização
parcial de client/CLI. Os alertas **permanecem abertos**, com correção e regressão
próprias necessárias antes de produção ou aceite explícito do risco.

## Validação executada

- **382 testes backend em 19 suítes aprovados**: os 354 anteriores e 28 novos,
  incluindo campos/aceite, duplicidade concorrente, perfil, exclusão, nonce,
  origem, cotas/expiração, exp obrigatório, logout e remetente alheio recusado.
- TypeScript de frontend/backend e builds de ambos aprovados em pastas temporárias
  próprias, sem sobrescrever os builds anteriores.
- PostgreSQL **17.11 descartável**, porta efêmera em 127.0.0.1 e conferência da
  URL/diretório de dados antes de qualquer fixture. Instalação nova das 12
  migrations, reaplicação sem pendências, upgrade com dados preservados, hashes
  anteriores intactos e comparação sem divergência de schema.
- **43 cenários de banco/HTTP aprovados**: 37 anteriores e seis grupos novos,
  cobrindo cadastro real, corrida de unicidade, confirmação, links antigos/
  expirados/reutilizados, concorrência e cotas, envio que falha, recuperação
  neutra, reset com revogação, logout, isolamento, exclusão e mudança de perfil.
- **63 cenários Chrome com API isolada aprovados**: os 60 anteriores e falha de
  logout com aviso persistente, logout atrasado de outra sessão e link incompleto.
- **Sete cenários Chrome adicionais com backend e PostgreSQL reais locais**,
  sem mock de `window.fetch`: aluno/professor cadastram, confirmam pelo serviço
  falso, entram, saem, redefinem com sessão ativa, recusam senha anterior,
  entram por Enter e recuperam perfil após recarga. Links inválidos/reutilizados,
  recuperação neutra e layouts de 1366/390 pixels também foram conferidos.
- `test-legal.mjs` aprovado: documentos/consentimento, autofill, dashboard,
  diagnóstico, trilhas, confirmação em outra aba, reenvio e reset com sessão ativa.
- Os hashes de schema, migrations, dependências, `.env`/exemplos, CSS original,
  CRUD, metas, relatórios, turmas, simulados e fotos foram preservados.

Os testes usam contas com domínio `example.invalid` e serviço de correio falso.
Esse transporte é injetado somente no script de teste, com banco/diretório
descartáveis verificados. O visualizador de mensagens existe só nesse script,
escuta em loopback e exige chave efêmera; não é rota da aplicação publicada e
não confirma usuários diretamente. O navegador usa os links pelos endpoints reais.
SMTP, conta Google, OAuth externo e Supabase não foram exercitados.

Falhas intermediárias foram corrigidas e repetidas: mocks antigos sem locks/nonce,
campos obrigatórios vazios em fixture, seletor, escopo de variável, recarga versus
navegação por fragmento, simulação de Enter e corridas das esperas. Um timeout de
Prisma no harness foi encerrado com o cluster e a execução foi repetida. O aviso
de logout remoto perdido na recarga e a mensagem antiga em outro link também foram
corrigidos. A auditoria npm permanece com saída 1 pelos alertas descritos acima.

## Arquivos desta etapa

| Arquivo | Alteração |
| --- | --- |
| `backend/src/controllers/auth-controller.ts` | Validação, perfil/nonce e logout |
| `backend/src/routes/auth-routes.ts` | Factory reutilizável, origem, headers, limites e rota nova |
| `backend/src/routes/auth-stage7.test.ts` | 27 casos HTTP novos |
| `backend/src/routes/auth-security.test.ts` | Mocks de transação/remetente atualizados; regressões preservadas |
| `backend/src/middlewares/auth-rate-limit.ts` | Limites HTTP sem dependência nova |
| `backend/src/middlewares/error-handler.ts` | Retry-After e JSON inválido/excessivo sem conteúdo em erro |
| `backend/src/errors/api-error.ts` | Metadado opcional de retry |
| `backend/src/services/auth-service.ts` | Duplicidade, exclusão, exp obrigatório e revogação |
| `backend/src/services/email-verification-service.ts` | Conta ativa e URL serializada |
| `backend/src/services/password-recovery-service.ts` | Exclusão, URL e instante da redefinição |
| `backend/src/services/gmail-smtp.ts` | Remetente oficial obrigatório |
| `backend/src/repositories/auth-repository.ts` | Emissão/consumo serializados e revogação |
| `backend/src/repositories/password-recovery-repository.ts` | Limites concorrentes e consumo seguro |
| `backend/src/services/email-verification.test.ts` | Mocks de lock mantendo as verificações anteriores |
| `backend/src/services/password-recovery.test.ts` | Mocks/guards de conta ativa |
| `backend/src/services/google-auth.test.ts` | Fixtures de nonce sem provedor real |
| `backend/src/services/gmail-smtp.test.ts` | Remetente oficial e caso negativo adicional |
| `backend/scripts/test-auth-stage7-db.ts` | HTTP/SQL reais, transporte falso e Chrome integrado |
| `backend/scripts/test-migrations-local.cjs` | Execução da nova suíte após as regressões |
| `frontend/src/auth-gate.tsx` | Formulários, nonce, links, erros e estados coerentes |
| `frontend/src/auth-session.ts` | Logout remoto e proteção de sessão substituída |
| `frontend/src/email-confirmation-gate.tsx` | Erro anunciado por tecnologia assistiva |
| `frontend/src/main.tsx` | Logout central e SDK somente quando configurado |
| `frontend/scripts/test-session.mjs` | Esperas determinísticas e três cenários novos |
| `frontend/scripts/test-legal.mjs` | Fixture com campos obrigatórios válidos |
| `frontend/scripts/test-auth-local.mjs` | Navegador contra API e banco isolados reais |
| `docs/email-setup.md` | Referência às regras e pendências atuais |
| `docs/integration-stage7.md` | Auditoria, correções, contratos e validações |
| `docs/evidence/integration-stage7/*.png` | Cinco capturas de teste sem credenciais reais |

Total: **33 arquivos**, sendo 23 preexistentes alterados e dez novos (incluindo
as cinco capturas). Outros arquivos locais modificados antes da etapa permanecem
fora desta lista e foram preservados.

Para repetir os testes de persistência, dentro de `backend`, execute
`node scripts/test-migrations-local.cjs "C:\Program Files\PostgreSQL\17\bin"`.
O harness cria seu próprio cluster, executa também o navegador contra a API real
local e encerra o PostgreSQL. Ele não aceita URL de banco fornecida pelo usuário.
`test-auth-local.mjs` é iniciado por esse harness, não como conexão a um servidor
de produção. Artefatos de banco/navegador ficam no diretório temporário de testes.

## Evidências e limites restantes

- [Login do aluno — desktop](evidence/integration-stage7/login-aluno-1366.png)
- [Login do professor — celular](evidence/integration-stage7/login-professor-390.png)
- [Confirmação obrigatória e reenvio controlado](evidence/integration-stage7/pending-aluno.png)
- [Recuperação com resposta neutra](evidence/integration-stage7/recovery-neutral.png)
- [Redefinição com link inválido](evidence/integration-stage7/reset-invalid.png)

A etapa está homologada **localmente**. Para homologação real ainda são necessários:
liberação do Gmail, configuração privada e autorização para envio, OAuth oficial,
HTTPS e rotas/fallback do Vite, permissões/RLS/grants do ambiente remoto, configuração
de proxy/IP e limites distribuídos, carga/latência, retenção de tokens e tratamento
dos alertas Prisma. Não foram auditados dados ou permissões do Supabase atual.

sessionStorage continua sujeito a XSS na própria origem; não foi feita migração
para cookies HttpOnly, refresh tokens ou sessões por dispositivo. Mudanças nessas
políticas e no identificador estável do Google exigem revisão própria. Navegadores
e dispositivos físicos adicionais também dependem de homologação posterior.

Não houve commit, push, merge, deploy, alteração de credenciais ou dados reais.
**A etapa 8 não foi iniciada e aguarda autorização explícita.**
