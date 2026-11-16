# Execução local da equipe

## Preparação

Use Node.js 24 ou superior. Obtenha a configuração do Supabase pelo canal seguro da equipe. Credenciais não devem aparecer no Git, nos documentos ou nas evidências.

Na raiz do repositório:

```powershell
npm run setup
npm ci --prefix backend
npm ci --prefix frontend
npm --prefix backend run prisma:generate
npm run config:check
```

O setup cria somente arquivos ausentes. Preserve as configurações que já funcionam. O backend carrega seu .env; variáveis fornecidas ao processo prevalecem. O Vite pode carregar .env.local com prioridade sobre .env, portanto confira também esse arquivo quando uma mudança parecer não surtir efeito.

## Iniciar

Em dois terminais na raiz:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

Abra http://localhost:5173. A API usa a porta 3333 por padrão. Para evitar divergências entre IPv4 e IPv6, configure VITE_API_URL=http://127.0.0.1:3333 no ambiente do frontend. CORS_ORIGINS deve permitir exatamente a origem acessada; APP_PUBLIC_URL deve corresponder ao frontend que receberá os links de e-mail.

Para executar o backend compilado, use primeiro npm --prefix backend run build e depois npm --prefix backend start.

## Conferir o ambiente

- GET /health informa disponibilidade HTTP da API; não comprova que todas as tabelas ou integrações funcionem.
- npm run config:check valida o formato da configuração sem conectar ao banco.
- npm --prefix backend run email:verify verifica conexão e autenticação SMTP, sem enviar mensagens.
- GET /institutions/availability informa capacidades e a disponibilidade dos convites.

O módulo institucional completo depende dos vínculos e da confirmação de e-mail dos professores e das instituições autorizadas para suas turmas. Não eliminar a verificação de ativação para contornar cadastros inconsistentes.

## Banco e manutenção

Executar o site no computador pode usar o Supabase real definido no .env. Não executar reset, db push, seed ou importações como parte da inicialização diária.

Para consultar o histórico de migrations, dentro de backend:

```powershell
npx prisma migrate status
```

O banco compartilhado pode conter migrations de outras branches. Conferir o histórico e o schema antes de aplicar qualquer mudança; não alterar registros de migrations para fingir uma aplicação. A aplicação de migrations é uma operação separada, coordenada com a equipe.

Scripts de demonstração e testes de integração usam bancos descartáveis próprios. Não configurá-los para usar o banco compartilhado. Veja [ambiente](variaveis-de-ambiente.md), [arquitetura](arquitetura.md) e [acervo](acervo.md).
