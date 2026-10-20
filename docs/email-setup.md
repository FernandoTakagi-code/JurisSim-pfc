# E-mails do JurisSim com Brevo SMTP

Cadastro, reenvio de confirmação e recuperação de senha usam Nodemailer com
`smtp-relay.brevo.com:587`, STARTTLS obrigatório e TLS mínimo 1.2. O login SMTP
é separado do remetente fixo `JurisSim <jurissimplataforma@gmail.com>`.
Logs e debug do transporte permanecem desativados.

Os prazos são centralizados em `backend/src/services/auth-token-policy.ts`:
30 minutos para confirmação e 15 minutos para recuperação. Os serviços usam
esses valores tanto no `expiresAt` quanto no texto e HTML dos e-mails.
A política vale para novos tokens após reiniciar o backend; tokens já emitidos
mantêm a expiração persistida, sem alteração retroativa no banco.

Referências: [configuração SMTP do Brevo](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)
e [STARTTLS no Nodemailer](https://nodemailer.com/smtp).

## Configuração privada local

1. Confira que `git check-ignore backend/.env` retorna `backend/.env` e que
   `git ls-files backend/.env` não retorna nada. O arquivo já está ignorado.
2. Abra `backend/.env` no editor local e acrescente as variáveis abaixo.
   Se já existirem, revise os valores manualmente, sem criar linhas duplicadas.

   ```dotenv
   BREVO_SMTP_USER=bf0e5b001@smtp-brevo.com
   BREVO_SMTP_KEY=
   ```

3. Cole a chave SMTP ativa **somente no editor local**, depois de
   `BREVO_SMTP_KEY=`, entre aspas duplas. Preserve a chave exatamente como foi
   fornecida. Não use a chave da API nem a senha da conta Brevo/Gmail.
   Não coloque o segredo em comandos do terminal, chat, logs, testes ou Git.
4. Preserve as credenciais existentes (`GMAIL_*`, banco, JWT e outras).
   `GMAIL_USER` e `GMAIL_APP_PASSWORD` deixam de ser utilizadas; não há fallback
   para Gmail. Nenhuma credencial existente foi modificada pela migração.
5. Confira `APP_PUBLIC_URL`: origem do frontend sem query ou fragmento;
   localmente `http://localhost:5173`, em produção uma URL HTTPS.
   Nunca coloque a chave em variáveis `VITE_*`, que são públicas.
6. Reinicie o backend quando estiver pronto para habilitar os fluxos reais.
   Com SMTP configurado, cadastrar uma conta, reenviar a confirmação e pedir
   recuperação de senha disparam mensagens reais. Aguarde autorização específica
   antes de usar essas ações como teste.

Host, porta, STARTTLS e remetente oficial ficam definidos no cliente Brevo;
não é necessário criar variáveis para esses valores públicos. O exemplo
versionado `backend/.env.example` mantém a chave vazia.

## Verificação local e autenticação

Dentro de `backend`, no PowerShell:

```powershell
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run email:verify -- --offline
```

Os testes de envio usam transporte simulado e credenciais fictícias. As novas
variáveis SMTP são isoladas das credenciais privadas no Vitest e no harness de
banco descartável. O modo `--offline` verifica presença/configuração e URL do
aplicativo, sem conexão SMTP nem autenticação. A saída mostra apenas estados,
nunca os valores. Ele não comprova que a chave é aceita pelo Brevo.

Para uma etapa posterior, `npm.cmd run email:verify` verifica DNS, STARTTLS e
autenticação reais, **sem enviar e-mail**. A resposta do provedor é omitida
dos erros. Esse comando não comprova autorização do remetente nem entrega.

## Fluxos e segurança preservados

- Cadastro e reenvio usam `EmailVerificationService`: token aleatório de 32
  bytes, apenas SHA-256 persistido, validade de 30 minutos, link
  `/#/verificar-email?token=...`. O reenvio exige sessão ativa em
  `POST /auth/email-verification`. A falha de envio invalida o token; no cadastro,
  a conta permanece não confirmada e a resposta informa a indisponibilidade.
- `POST /auth/email-verification/confirm` consome o token, confirma a conta e
  registra auditoria na mesma transação. Tokens expirados, usados e de contas
  excluídas são recusados.
- `POST /auth/password-recovery` mantém resposta neutra para não revelar contas.
  Token de 32 bytes, SHA-256 persistido, validade de 15 minutos, link
  `/#/reset-password?token=...`. Falha de envio invalida o token, sem expor erros
  do SMTP. `POST /auth/password-reset` consome o token e troca a senha bcrypt
  atomicamente; a redefinição não confirma o e-mail e revoga sessões anteriores.
- Limites de três emissões por hora por usuário, intervalo mínimo de um minuto,
  rate limiting HTTP e validação de URL permanecem nos serviços/repositórios.

Nenhuma migration, seed ou alteração no banco externo é necessária para SMTP.

## Primeiro envio real pendente

A implementação estará pronta para o primeiro envio após passar pelos testes
simulados. Antes do envio autorizado, configure a chave local, confira no painel
Brevo que o remetente oficial está validado e execute a verificação de conexão.
Consulte as [instruções de validação de remetente do Brevo](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender).

Obtenha autorização específica para o destinatário e os fluxos a testar.
Só então faça cadastro, reenvio e recuperação com a conta autorizada; confirme
recebimento (inclusive spam), remetente, links, expiração e rejeição de reuso.
Entrega e aceitação do remetente dependem da validação real com o Brevo.
