# Segurança de autenticação — etapa 2

Branch: `entrega2809`. Decisão de acesso definida antes da implementação.

## Endpoints acessíveis sem confirmação de e-mail

| Método e rota | Condição e finalidade |
| --- | --- |
| `POST /auth/register` | Público; criar conta pendente e iniciar confirmação. |
| `POST /auth/login` | Público; validar credenciais e obter sessão que permanece limitada enquanto o e-mail estiver pendente. |
| `POST /auth/google` | Público; validar credencial Google e manter o fluxo existente de aceite. Não concede privilégios além do perfil atual da conta. |
| `POST /auth/password-recovery` | Público; solicitar recuperação com resposta neutra. |
| `POST /auth/password-reset` | Público; exige token de recuperação válido; não confirma e-mail. |
| `POST /auth/email-verification/confirm` | Público; exige token de confirmação válido e conta ativa, conforme o fluxo existente. |
| `GET /auth/session` | JWT válido e conta ativa; somente identificação própria, perfil atual, estado de confirmação e destino de navegação. Não retorna questões, resultados, trilhas ou dados de outros usuários. |
| `POST /auth/email-verification` | JWT válido e conta ativa; reenviar confirmação exclusivamente ao próprio usuário. |

`GET /health` permanece público: informa somente saúde da API, sem dados de usuário.
Não existe endpoint de logout no backend; o encerramento local da sessão permanece
como está. Alteração de nome (`PUT /auth/nome`) e exclusão (`DELETE /auth/conta`)
não são exceções: exigem e-mail confirmado nesta etapa.

## Política para recursos protegidos

- `requireAuth` exige JWT válido, conta existente/ativa e e-mail confirmado.
  A regra vale para ALUNO, PROFESSOR e ADMIN; não há isenção implícita para ADMIN.
- Somente sessão e reenvio usam uma variante explicitamente limitada de
  autenticação. Não há liberação baseada em fragmentos de URL ou prefixo `/auth`.
- Todas as requisições autenticadas consultam `User` e usam o perfil atual do
  banco para autorização. O perfil do JWT permanece no formato do token por
  compatibilidade, mas não determina permissões.
- Conta inexistente ou excluída: 401. Conta pendente em recurso protegido: 403.
  Perfil sem permissão: 403. Falha ao consultar a conta não libera acesso.
- Leitura de questões exige confirmação. Criação/edição/exclusão continuam
  exclusivas de PROFESSOR/ADMIN; auditoria continua exclusiva de ADMIN.
- Regras existentes de propriedade e acesso aos recursos permanecem em vigor.
- Cadastro/login continuam emitindo token para permitir confirmação e reenvio.
  A sessão mantém o contrato `user`/`nextStep` usado pelo frontend; o destino de
  navegação não concede autorização. Para preservar o redirecionamento existente,
  o backend mantém a consulta interna da existência de diagnóstico concluído do
  próprio aluno, retornando somente `DIAGNOSTIC` ou `DASHBOARD`. Isso também vale
  para conta pendente, sem liberar os endpoints de diagnóstico ou seus dados.
  PROFESSOR/ADMIN mantêm `PROFESSOR`.

## Limites desta etapa

Sem mudanças de frontend/design, SMTP, credenciais, migrations ou dados remotos.
Revogação de JWT após troca de senha, limitação de tentativas/reenvios e demais
etapas continuam pendentes de autorização. A interface de professor pode continuar
abrindo sua estrutura visual para uma sessão pendente; a API deve negar seus
recursos. Um JWT cujo perfil ficou antigo também pode exibir a área antiga até
nova sessão; isso não deve conceder acesso no servidor.

## Implementação e arquivos desta etapa

- `backend/src/middlewares/auth-middleware.ts`: exige confirmação por padrão;
  `requireLimitedAuth` valida JWT/conta ativa e é usado somente nas duas exceções;
  `request.auth.role` recebe o perfil atual consultado no banco.
- `backend/src/repositories/auth-repository.ts`: consulta estado de confirmação
  no middleware e exclusão na consulta de sessão.
- `backend/src/routes/auth-routes.ts`: sessão e reenvio usam autenticação limitada;
  alteração de nome e exclusão permanecem sob a proteção completa.
- `backend/src/services/auth-service.ts`: valida conta ativa na consulta de sessão
  e retorna confirmação de forma conservadora, mantendo o contrato de navegação.
- `backend/src/routes/auth-security.test.ts`: nova suíte de segurança com as rotas
  montadas no servidor real, persistência e transporte substituídos por mocks.
- `backend/src/services/jwt-auth.test.ts`,
  `backend/src/routes/audit-routes.test.ts`,
  `backend/src/routes/questao-crud.test.ts` e
  `backend/src/routes/trail-server.test.ts`: fixtures agora representam contas
  confirmadas e perfis atuais independentes dos valores declarados nos JWTs.
- Este documento, criado antes da implementação para registrar as exceções.

## Validação — 15/10/2026

- Backend: 178 testes aprovados em 14 suítes, incluindo 36 novos testes de segurança.
- TypeScript de backend e frontend: aprovado com `tsc --noEmit --incremental false`.
- Contas pendentes de todos os três perfis recebem 403 nas 18 operações protegidas,
  inclusive quando o JWT declara ADMIN, sem chamar as operações de negócio.
- Contas inexistentes/excluídas recebem 401 nos recursos, sessão e reenvio.
- A matriz de nove combinações de perfil atual e perfil do JWT verifica leitura,
  criação de questões, auditoria administrativa e perfil retornado na sessão.
- Mudanças de perfil e confirmação são observadas na requisição seguinte, usando
  o mesmo JWT. Falha na consulta da conta mantém o acesso bloqueado.
- Sessão/reenvio continuam disponíveis para contas pendentes com JWT válido;
  credenciais inválidas/expiradas não passam por essas exceções.
- Confirmação por link libera o acesso, recusa reutilização e não exige novo login.
- Recuperação/redefinição permanecem públicas, com transporte simulado, sem
  confirmar o e-mail. Cadastro e login existentes continuam cobertos pelas suítes.
- Os testes substituem conexões por URLs fictícias locais e isolam persistência,
  Google e SMTP quando exercitados. Não houve consulta ao Supabase, migrations,
  e-mails reais ou testes de entrega. Não foi necessário iniciar outro banco.

As migrations, o schema, o script e o relatório da etapa 1 foram preservados.
O frontend e os demais arquivos preexistentes fora desta lista foram preservados.
Sem commit, push, merge ou avanço para a etapa 3.

## Riscos restantes

- O ambiente remoto ainda precisa de revisão e autorização próprias para aplicar
  as migrations da etapa 1 antes de publicar esta proteção. Não foi acessado aqui.
- A consulta ao banco ocorre em cada requisição autenticada; indisponibilidade
  bloqueia o acesso. Alterações concorrentes após essa leitura não interrompem
  uma operação que já passou pela autorização.
- A atualização visual de uma sessão com perfil antigo e a tela de confirmação
  de professores continuam sendo trabalho de integração do frontend, sem mudança
  de design nesta etapa. O servidor aplica as restrições independentemente da UI.
- Revogação de sessões após redefinição de senha, limites de abuso e configuração
  do remetente oficial continuam fora desta etapa e dependem de autorização.
