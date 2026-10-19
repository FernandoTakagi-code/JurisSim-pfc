# E-mails e autenticação do JurisSim

Os dois fluxos usam Nodemailer e Gmail SMTP (`smtp.gmail.com`, porta 587,
STARTTLS obrigatório). Não é necessário criar variáveis `SMTP_*`.

A etapa 7 restringe o remetente à conta oficial, limita confirmação/recuperação a
três emissões por hora por usuário, com intervalo mínimo de um minuto, e adiciona
logout com revogação no servidor. Veja [a homologação local e as pendências reais](integration-stage7.md).
Nenhum envio ou autenticação SMTP real foi realizado nessa etapa.

## Configuração privada

No `backend/.env`, configure:

- `GMAIL_USER`: a conta oficial `jurissimplataforma@gmail.com`.
- `GMAIL_APP_PASSWORD`: uma senha de app gerada **nessa mesma conta Google**.
  Nunca use a senha normal da conta nem coloque a senha de app no Git ou no chat.
- `APP_PUBLIC_URL`: URL base pública do **frontend**, sem fragmento ou query.
  Para desenvolvimento local, `http://localhost:5173`. Em produção, use HTTPS.
- Preserve `DATABASE_URL`, `DIRECT_URL` e `JWT_SECRET` existentes.

Para gerar a senha de app, entre na conta oficial, ative a verificação em duas
etapas em Segurança e abra [Senhas de app](https://myaccount.google.com/apppasswords).
Crie uma senha para o JurisSim e copie-a apenas para o ambiente privado do backend.
Se essa opção não estiver disponível, confira as restrições da conta na
[documentação do Google](https://support.google.com/accounts/answer/185833?hl=pt-BR).

No `frontend/.env`, `VITE_API_URL` deve apontar para a API (localmente,
`http://localhost:3333`). Sem essa variável, o código usa esse endereço local.
Se acessar por domínio ou túnel, configure as URLs públicas corretas; `localhost`
no navegador de outra pessoa aponta para o computador dela. Nunca coloque a senha
SMTP ou o segredo JWT em variáveis `VITE_*`, pois elas são públicas.

Reinicie backend e Vite após mudar os ambientes. Em builds publicados, reconstrua
o frontend. O backend já habilita CORS e os endpoints usam o prefixo `/auth`.

## Verificação sem envio

Dentro de `backend`, execute `npm run email:verify` (no PowerShell, `npm.cmd run
email:verify`). Esse comando verifica DNS, conexão, STARTTLS e autenticação SMTP,
sem enviar mensagens nem mostrar credenciais. Uma conexão válida não comprova a
entrega na caixa de entrada. Autorize separadamente um destinatário antes de
qualquer teste real de envio.

## Fluxos e validação real pendente

- Cadastro: gera token aleatório de 32 bytes, guarda apenas SHA-256 e envia o link
  `/#/verificar-email?token=...`. Validade: 60 minutos. Falhas de envio ficam
  explícitas na resposta do cadastro; a conta permanece não confirmada.
- Reenvio: com sessão ativa, `POST /auth/email-verification`. Não use o botão como
  teste antes de autorizar o envio: ele envia uma mensagem real ao titular da conta.
- Confirmação: `POST /auth/email-verification/confirm`. O consumo do token, a
  confirmação da conta e a auditoria ficam na mesma transação. Tokens expirados,
  utilizados e de contas excluídas são recusados. A tela bloqueada consulta a
  sessão ao recuperar foco para reconhecer uma confirmação em outra aba.
- Recuperação: `POST /auth/password-recovery`, com resposta neutra para não revelar
  contas. Token de 32 bytes, armazenado como SHA-256; validade de 30 minutos.
  O link abre `/#/reset-password?token=...`. `POST /auth/password-reset` troca o hash
  bcrypt e consome o token atomicamente. A redefinição não confirma o e-mail.
- Após configurar a conta oficial, validar com destinatário autorizado: receber
  os dois e-mails, abrir os links, confirmar a conta, entrar, redefinir a senha,
  entrar com a nova senha e verificar a recusa da reutilização dos links.

Não são necessárias migrations, seeds ou alterações manuais no Supabase para
configurar o SMTP. Os testes automatizados isolam transporte e persistência;
eles não comprovam entrega real de e-mails nem alteram o banco externo.

## Resultado desta investigação — 15/10/2026

- O login foi aceito, conforme o relato confirmado pelo usuário; o impedimento
  seguinte era a confirmação do e-mail. A ausência inicial da configuração de
  envio explicava as respostas de indisponibilidade dos dois fluxos.
- Na verificação posterior, `APP_PUBLIC_URL`, `GMAIL_USER` e
  `GMAIL_APP_PASSWORD` estavam presentes. A URL do aplicativo correspondia ao
  frontend local. `VITE_API_URL` estava ausente, usando o padrão local da API.
- A conta SMTP configurada não correspondia à conta oficial informada. Nenhuma
  credencial existente foi substituída. É necessário configurar conjuntamente
  `GMAIL_USER` e a senha de app da conta oficial antes de validar esse remetente.
- A conexão real Gmail, STARTTLS e autenticação passaram com as credenciais
  disponíveis. Não houve envio real. Entrega, spam e links recebidos em caixas
  reais ainda precisam de validação autorizada.
- A consulta de leitura ao Supabase e a inspeção das tabelas/campos de autenticação
  passaram durante esta investigação. Não houve alterações no banco.
- Validação final: 142 testes em 13 suítes do backend aprovados; TypeScript de
  backend e frontend aprovados; build do frontend e testes de navegador aprovados.
  Os testes de navegador cobriram reenvio autenticado, falha de envio mantendo o
  bloqueio, confirmação em outra aba e links com sessão ativa. SMTP e persistência
  são isolados nos testes automatizados.

Arquivos alterados para os fluxos de e-mail nesta investigação:

- `backend/.env.example` e `backend/package.json`.
- `backend/scripts/verify-email-config.ts`.
- `backend/src/services/gmail-smtp.ts` e `gmail-smtp.test.ts`.
- `backend/src/services/email-verification-sender.ts`,
  `email-verification-service.ts` e `email-verification.test.ts`.
- `backend/src/services/recovery-email-sender.ts`,
  `password-recovery-service.ts`, `app-url.ts` e `legal-acceptance.test.ts`.
- `backend/src/controllers/auth-controller.ts` e
  `backend/src/repositories/auth-repository.ts`.
- `frontend/src/auth-gate.tsx`, `frontend/src/main.tsx` e
  `frontend/scripts/test-legal.mjs`.
- Este documento, `docs/email-setup.md`.

As alterações de testes/middleware da tarefa anterior e as alterações
preexistentes em `backend/package-lock.json` e `frontend/vite.config.ts` foram
preservadas. Não houve commit, push, merge, migrations ou seeds. Os componentes
do dashboard não foram implementados nem redesenhados por esta tarefa.
