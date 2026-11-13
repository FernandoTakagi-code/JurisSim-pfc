# H4.24 — ações de conta e estado de validação

> Registro histórico da respectiva etapa. Testes, configurações, autorizações e impedimentos referem-se àquela execução; não comprovam o estado atual nem autorizam operações reais. Consulte a consolidação [H4.37](H437-CONSOLIDACAO-PROFESSOR.md) e o [README](README.md).

Atualização posterior H4.25: o perfil principal passou a mostrar **Sair de todos os dispositivos**, preservando o endpoint de desativação. A mensagem de exclusão foi simplificada, sem habilitar a H4.24. Consulte [H425-REVISAO-INSTITUCIONAL.md](H425-REVISAO-INSTITUCIONAL.md); este documento registra a etapa anterior.

13/11/2026, branch `entrega0911`. Nenhuma operação de banco, migration, chamada ao Supabase, exclusão de conta real, commit, push, merge ou deploy foi realizada nesta etapa. Alterações anteriores foram preservadas.

## 1. Ações conectadas a endpoints reais

| Botão | Endpoint existente | Comportamento implementado | Limite da validação atual |
| --- | --- | --- | --- |
| Desativar minha conta | `POST /auth/conta/desativacao` | JWT, confirmação `DESATIVAR`, senha atual, nova conferência do hash dentro da transação; bloqueio de responsáveis institucionais; consumo de tokens de autenticação/recuperação; incremento de versão da sessão; evento `ACCOUNT_DEACTIVATED` | Conectado ao backend real; testado sem banco. Nenhuma desativação real foi executada |
| Suspender | `PATCH /institutions/admin/users/:userId`, `suspended: true` | ADMIN global autenticado; justificativa; bloqueio de autoalteração e do último ADMIN ativo; revalidação da autoridade dentro da transação; suspensão e revogação de sessões; auditoria | Conectado ao backend real; depende das tabelas administrativas já existentes e da capacidade administrativa habilitada. Nenhuma suspensão real foi executada |
| Reativar | Mesmo PATCH, `suspended: false` | Remove a suspensão administrativa de uma conta existente e não excluída; revoga sessões anteriores e registra auditoria | Conectado ao backend real; não restaura conta desativada/excluída. Nenhuma reativação real foi executada |

“Conectado” não significa homologado novamente em um banco real: por instrução do usuário, todos os testes desta etapa usaram persistência mockada ou APIs interceptadas.

**Desativação não é exclusão.** Ela preserva nome, e-mail e histórico; o e-mail permanece reservado. Uma eventual reativação exige atendimento e verificação de identidade, conforme a política atual. Não existe reativação automática no login nem pelo botão de reativar suspensão. O fluxo atual de desativação exige senha; contas Google continuam recebendo recusa segura e orientação de suporte, até haver fluxo específico validado para essa ação.

## 2. Código preparado e validado somente em testes simulados

Na exclusão H4.24, o código está ligado aos endpoints reais abaixo, mas sua execução permanece bloqueada:

- `DELETE /auth/conta`: confirmação `EXCLUIR`, prova da identidade do Aluno, anonimização, liberação do e-mail, consumo de tokens e revogação de sessões. O frontend encerra a sessão apenas após resposta de sucesso.
- `DELETE /institutions/admin/users/:userId`: confirmação `EXCLUIR`, justificativa, escolha liberar/bloquear e **prova da identidade do próprio ADMIN**, não a senha do usuário selecionado.
- `POST /institutions/admin/email-reuse/revoke`: revogação administrativa do bloqueio de reutilização do e-mail.

A confirmação de identidade preparada aceita senha atual ou, para contas Google, token verificado no servidor, audiência configurada, e-mail verificado correspondente e emissão nos últimos cinco minutos. Credenciais e tokens não são copiados à auditoria.

O backend administrativo revalida papel, confirmação do e-mail, suspensão e credenciais/versão da sessão dentro da transação. Usa o mesmo bloqueio transacional das alterações de suspensão/permissões. A exclusão exige outro ADMIN para operar e preserva pelo menos um ADMIN ativo; responsabilidades institucionais precisam ser transferidas antes. O evento registra responsável, usuário alvo, política escolhida e justificativa. A escolha do e-mail é normalizada e os históricos acadêmicos permanecem vinculados a uma identidade anonimizada.

Os testes de exclusão usam um **double de disponibilidade e de Prisma restrito ao arquivo de teste**. Isso não habilita a funcionalidade no aplicativo, não executa SQL e não comprova exclusão real. Os formulários habilitados e o provedor Google real ainda dependem de homologação autorizada.

## 3. Operações que continuam indisponíveis

| Operação | Motivo explícito na interface |
| --- | --- |
| Excluir minha conta | Migrations H4.24 e validação segura da integração pendentes |
| Excluir conta no ADMIN | Mesmo impedimento; não basta estar autenticado ou preencher uma confirmação |
| Revogar bloqueio de reutilização | Depende da tabela `EmailReuseBlock` e da validação da política |

`backend/src/account-deletion-availability.ts` continua retornando `false`. Flags de ambiente não retiram esse bloqueio. Não há sucesso fictício, fallback para outro banco ou bypass das proteções.

As migrations preparadas `20261113000100_email_reuse_block` e `20261113000200_email_reuse_registration_guard` **não foram executadas nesta etapa**. Os testes de integração que dependem delas não foram executados. Cadastro e login continuam sem consultar a nova tabela enquanto a H4.24 estiver desativada.

## 4. Impedimentos que exigem autorização futura

1. Autorizar um ambiente e contas descartáveis antes de qualquer conexão ou operação de banco. Não usar contas reais para testar exclusão.
2. Validar os pré-requisitos e aplicar o schema/migrations somente nesse ambiente autorizado.
3. Homologar transações, concorrência, último ADMIN, vínculos, auditoria e invalidação dos tokens contra PostgreSQL; revisar o tratamento dos dados retidos/indiretos antes da habilitação.
4. Homologar liberação, bloqueio e revogação do e-mail nos cadastros por senha, Google e convites, sem recuperar histórico da identidade anterior.
5. Validar o provedor de reautenticação Google e qualquer fluxo futuro de reativação de contas desativadas. A reativação de suspensão já existente é uma operação diferente.

Não foi solicitada nem presumida autorização para executar essas etapas. Login e operações reais também podem gravar auditoria; não devem ser usados para contornar a proibição atual de operações de banco.

## Padronização visual e comportamento

- Classes de ações de conta isoladas em `frontend/src/account-actions.css`, utilizando as variáveis de tema do JurisSim.
- Ações secundárias para desativar/suspender/cancelar; exclusão vermelha; reativação com estilo positivo.
- Altura mínima de 42px, bordas de 8px, padding e espaçamento consistentes; quebra de texto e empilhamento em celular.
- Texto desabilitado permanece legível com opacidade 1; variantes para claro/escuro; hover apenas em botões habilitados e foco visível.
- Estados de envio bloqueiam cliques repetidos e alterações do formulário. Erros preservam sessão/listagem. A listagem é recarregada somente após sucesso do backend; não há atualização otimista de suspensão ou exclusão.
- Confirmação administrativa identifica o e-mail do usuário alvo e explica a diferença entre reativar suspensão e restaurar uma conta desativada.

O módulo de questões do Fernando não foi alterado.

## Testes executados sem banco

- Builds de backend e frontend aprovados.
- **182 testes backend aprovados**: identidade por senha/Google mockado, guardas da H4.24, credenciais alteradas antes da transação, vínculos institucionais, último ADMIN, liberação/bloqueio do e-mail, revogação de tokens, auditoria sem credenciais, suspensão/reativação e permissões de rotas.
- **57 cenários administrativos de navegador aprovados**, com APIs interceptadas. Incluem 320/390/1366px, temas, botões com pelo menos 42px, exclusão bloqueada sem requisição, reativação recusada sem alterar lista, carregamento sem recarregar lista e recarga após resposta de sucesso.
- **76 cenários de sessão/perfil aprovados**, com APIs interceptadas. Incluem ações distintas do Aluno, confirmação/erro da desativação, encerramento da sessão somente após sucesso e exclusão H4.24 bloqueada sem requisição.
- Suíte estática de entrega aprovada, incluindo 14 verificações do ADMIN e zero requisições dos controles de exclusão desativados.

Comandos, a partir da raiz:

```powershell
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run test:no-db -- src/services/account-identity.test.ts src/services/account-deletion-safety.test.ts src/services/account-deletion.test.ts src/services/account-deactivation.test.ts src/services/institution-service.test.ts src/routes/institution-routes.test.ts src/routes/auth-security.test.ts
npm.cmd --prefix frontend run test:delivery-static
```

Os testes de navegador são `frontend/scripts/test-administration.mjs` e `frontend/scripts/test-session.mjs`, executados com diretório de trabalho `frontend`. Eles iniciam Vite/Chrome headless e interceptam APIs; não iniciam backend ou banco. Não usar os scripts de integração/migrations para reproduzir esta validação.
