# E-mails do JurisSim com Brevo

## API transacional v3 (transporte principal)

O backend usa por padrão `POST https://api.brevo.com/v3/smtp/email`. Configure no arquivo local não versionado `backend/.env` ou no gerenciador de segredos do ambiente:

```dotenv
BREVO_EMAIL_TRANSPORT=api
BREVO_API_KEY=sua-chave-privada-da-api
```

Use a chave de API transacional do Brevo, não a chave SMTP nem a senha da conta. O remetente fixo é `JurisSim <jurissimplataforma@gmail.com>` e precisa estar autorizado no Brevo. A chave nunca é impressa; logs registram duração, resultado, etapa e `messageId`, sem destinatário ou conteúdo.

Timeout, falha de rede, HTTP 408/5xx ou resposta sem `messageId` são resultado indeterminado. Não há retry nem fallback para SMTP nesses casos. HTTP 429 é tratado como limite do provedor. Consulte os eventos transacionais antes de qualquer novo envio.

## SMTP alternativo explícito

SMTP só é usado se `BREVO_EMAIL_TRANSPORT=smtp` estiver selecionado:

```dotenv
BREVO_EMAIL_TRANSPORT=smtp
BREVO_SMTP_USER=seu-login-smtp
BREVO_SMTP_KEY=sua-chave-smtp
```

Usa `smtp-relay.brevo.com:587`, STARTTLS obrigatório e TLS mínimo 1.2. Não é fallback automático da API.

## Segurança e testes

Nunca coloque credenciais em comandos, chat, logs, Git ou variáveis `VITE_*`. Preserve as outras variáveis privadas de `backend/.env`; reinicie o backend após atualizar o ambiente. O remetente oficial está fixado no código e deve ser autorizado no painel do Brevo.

Os testes de envio usam fetch/Nodemailer simulados. `npm.cmd run email:verify -- --offline` verifica somente configuração SMTP legada sem conectar; `npm.cmd run email:verify` verifica DNS/STARTTLS/autenticação SMTP sem enviar e-mail. Nenhum desses comandos valida a chave API.

Os fluxos mantêm os tokens e as expirações existentes: confirmação 30 minutos e recuperação 15 minutos. Falha comprovada invalida o token. Resultado indeterminado preserva o token, não confirma sucesso e orienta conferir inbox/spam antes de pedir outro link. Rate limiting, resposta neutra de recuperação e consumo único permanecem ativos.

## Um único teste real

Antes do teste, esclareça a tentativa anterior nos logs transacionais do Brevo. Confira também a autorização do remetente e use uma conta/destinatário de teste autorizado. Configure `BREVO_EMAIL_TRANSPORT=api` e `BREVO_API_KEY` localmente, reinicie o backend e faça uma única chamada autenticada a `POST /auth/email-verification` para uma conta ainda não confirmada. Não repita se a resposta for indeterminada. Verifique `messageId` nos logs e o status de entrega no Brevo; depois confira inbox/spam. Não copie o link/token para logs ou mensagens.
