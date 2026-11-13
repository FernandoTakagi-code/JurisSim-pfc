# Configuração de ambientes do JurisSim

## Onde cada configuração fica

| Ambiente | Frontend | Backend | Valores privados |
|---|---|---|---|
| Computador | `frontend/.env` | `backend/.env` | Arquivos locais ignorados pelo Git |
| Produção | Vercel, no build | Render, na execução | Somente no serviço que os utiliza |
| GitHub Actions | Variables do Environment selecionado | CI usa PostgreSQL descartável | Apenas Secrets necessários à automação; o workflow público não precisa de senha do banco |

Endereços informados por Fernando: frontend `https://jurissim.vercel.app`, API `https://jurissim-pfc.onrender.com`. Configurações do GitHub não são sincronizadas automaticamente para Render ou Vercel. O código pode executar sem arquivo `.env` quando as variáveis são fornecidas pela hospedagem.

## Contrato do backend

| Nome | Tipo | Uso |
|---|---|---|
| `DATABASE_URL` | Secret obrigatório | Conexão de execução com PostgreSQL, obtida no Supabase autorizado |
| `DIRECT_URL` | Secret obrigatório | Conexão usada pelo Prisma nas operações de schema; conferir destino e compatibilidade da rede |
| `JWT_SECRET` | Secret obrigatório | Chave privada de pelo menos 32 caracteres; preservar entre deploys para manter sessões |
| `NODE_ENV` | Variable | `development` local, `production` no Render |
| `PORT` | Variable | Local 3333; no Render respeitar a porta fornecida pelo serviço |
| `HOST` | Variable | `0.0.0.0` para receber conexões no container |
| `APP_PUBLIC_URL` | Variable | Frontend que recebe links de confirmação e recuperação; produção `https://jurissim.vercel.app` |
| `CORS_ORIGINS` | Variable | Origens exatas permitidas, separadas por vírgula; produção `https://jurissim.vercel.app`, sem barra final nem wildcard |
| `GOOGLE_CLIENT_ID` | Identificador público opcional | Mesmo cliente OAuth usado no frontend; não é o segredo do cliente Google |
| `BREVO_EMAIL_TRANSPORT` | Variable | `api` ou `smtp`; API é o padrão |
| `BREVO_API_KEY` | Secret condicional | Necessário para envio de e-mails por API |
| `BREVO_SMTP_USER`, `BREVO_SMTP_KEY` | Credenciais condicionais | Somente quando o transporte escolhido for SMTP |
| `GROQ_API_KEY` | Secret opcional | Enriquecimento de justificativas; fluxo mantém fallback sem chave |
| `AUDIT_RETENTION_DAYS` | Variable opcional | Retenção operacional, não executa expurgo automático |

Sem provedor de e-mail, a verificação de formato avisa que confirmação de contas e recuperação de senha não estão prontas para uso real. Chaves de teste e placeholders não tornam um provedor válido. A validade de JWT atual é fixa em oito horas no serviço de autenticação; `JWT_EXPIRES_IN` não é uma opção implementada.

## Frontend: tudo que começa com VITE_ é público

| Nome | Produção |
|---|---|
| `VITE_API_URL` | `https://jurissim-pfc.onrender.com` |
| `VITE_GOOGLE_CLIENT_ID` | Mesmo Client ID público do backend, se Google estiver configurado |
| `VITE_QUESTION_PRACTICE_UI_ENABLED` | Exibe treinos quando a API correspondente estiver pronta |
| `VITE_QUESTION_REVIEW_UI_ENABLED` | Exibe revisão quando a API correspondente estiver pronta |
| `VITE_INDIVIDUAL_EXAM_UI_ENABLED` | Exibe simulado individual quando a API correspondente estiver pronta |
| `VITE_INITIAL_DIAGNOSTIC_UI_ENABLED` | Exibe diagnóstico inicial quando a API estiver pronta |
| `VITE_INITIAL_DIAGNOSTIC_PILOT_UI_ENABLED` | Identifica o piloto provisório, conforme configuração do backend |
| `VITE_JURISSIM_DEMO_MODE` | `false` em produção |

Nunca usar `VITE_DATABASE_URL`, `VITE_JWT_SECRET`, tokens ou chaves de provedores. Vite incorpora `VITE_*` ao JavaScript entregue ao navegador. Alterar essas variáveis exige um novo build; reiniciar só o backend não atualiza o frontend.

## Flags e dependências

Os exemplos deixam funcionalidades opcionais desativadas. Isso evita presumir que qualquer banco já tenha o schema e o acervo necessários. Para reproduzir o piloto já autorizado, conferir migrations, lotes e permissões do destino antes de habilitar:

| Funcionalidade | Backend | Frontend |
|---|---|---|
| Treino | `QUESTION_PRACTICE_SCHEMA_ENABLED`, `QUESTION_PRACTICE_API_ENABLED` | `VITE_QUESTION_PRACTICE_UI_ENABLED` |
| Revisão | `QUESTION_REVIEW_SCHEMA_ENABLED`, `QUESTION_REVIEW_API_ENABLED` | `VITE_QUESTION_REVIEW_UI_ENABLED` |
| Simulado individual | `INDIVIDUAL_EXAM_SCHEMA_ENABLED`, `INDIVIDUAL_EXAM_API_ENABLED` | `VITE_INDIVIDUAL_EXAM_UI_ENABLED` |
| Diagnóstico inicial | `INITIAL_DIAGNOSTIC_API_ENABLED`; `INITIAL_DIAGNOSTIC_REQUIRED` exige conclusão antes do estudo | `VITE_INITIAL_DIAGNOSTIC_UI_ENABLED` |

Valores booleanos: `true` ou `false`. Os pilotos de diagnóstico, treino e simulado têm suas próprias flags `*_PILOT_ENABLED` e identificadores `*_PILOT_BATCH_ID` ou `*_PILOT_BATCH_IDS`, conforme o módulo. IDs de lote não são senhas, mas são específicos de cada banco. `INITIAL_DIAGNOSTIC_COMPOSITION_MODE` aceita a política implementada, `MISTA_15_15` ou `AUTORAL_30`. Ativar flags não aprova conteúdo nem substitui a revisão humana.

Administração institucional usa `INSTITUTIONS_ENABLED`, `ADMINISTRATION_ENABLED` e `INSTITUTION_REGISTRATION_ENABLED`; conferir requisitos em `docs/dashboard-migrations-security.md`. Não ativar recursos institucionais apenas para eliminar uma mensagem de indisponibilidade.

`SEED_LOCAL_DATABASE`, `LOCAL_EMAIL_CAPTURE_ENABLED`, diagnósticos locais e as variáveis `TEST_*` pertencem aos fluxos isolados. Não copiar credenciais de produção para testes. O harness cria seu próprio PostgreSQL e injeta as variáveis necessárias. `SEED_LOCAL_DATABASE` permanece `false` por padrão.

## Instalação local

Na raiz, com Node.js 24:

```bash
npm run setup
npm ci --prefix backend
npm ci --prefix frontend
npm --prefix backend run prisma:generate
npm run config:check
```

Na primeira instalação, preencher as duas URLs PostgreSQL em `backend/.env` antes da última etapa. O setup gera JWT aleatório somente se criar o arquivo; mantém arquivos existentes intactos. Configurações já fornecidas no processo têm prioridade sobre arquivos locais. O verificador considera `.env` e `.env.local`; em produção também considera `.env.production` e `.env.production.local`.

```bash
npm --prefix backend run config:check -- --backend-only
npm --prefix backend run config:check -- --frontend-only
npm --prefix backend run config:check -- --backend-only --production
```

O comando valida formato, valores booleanos e dependências de flags, sem imprimir valores nem conectar ao banco. Não prova que senha, rede, schema, lotes ou envio de e-mail funcionam. Mensagens citam nomes das variáveis, nunca suas credenciais.

## GitHub Environments, Variables e Secrets

1. Em **Settings → Environments**, selecionar `production` ou `staging`.
2. Em **Environment variables**, cadastrar `VITE_API_URL` e as demais configurações públicas necessárias ao build.
3. Em **Environment secrets**, guardar apenas credenciais que uma automação daquele ambiente realmente precise. Não colocar valores privados em Variables. Não é necessário copiar `DATABASE_URL`, `DIRECT_URL` ou `JWT_SECRET` para executar a validação pública criada aqui.
4. Em **Actions → Validar configuração pública do ambiente → Run workflow**, escolher o ambiente.

O workflow `validar-ambiente.yml` usa `${{ vars.VITE_API_URL }}`, valida HTTPS e compila o frontend. Ele não faz deploy, não usa credenciais do banco, não altera Render/Vercel e não cria registro de deployment. O Environment `production` contém a URL pública da API fornecida pelo responsável. `staging` precisa de sua própria URL de homologação antes de ser validado; não reutilizar silenciosamente um banco ou uma API de produção.

A referência para um segredo em um workflow que realmente o necessite é `${{ secrets.NOME_DO_SEGREDO }}`. Isso apenas fornece o valor ao job autorizado; não o instala no computador de quem clona o repositório. O CI existente mantém banco descartável e independe das credenciais do Supabase. A PR #11 de reapresentação do pipeline continua fora do escopo desta entrega e não deve ser mergeada.

## Render e Vercel

No Render, serviço da API → **Environment**: manter as credenciais existentes; configurar as URLs públicas acima e `NODE_ENV=production`. O build deve instalar dependências, gerar Prisma Client e compilar o backend; o start usa `npm start` dentro de `backend`. Não incluir reset, seed ou migration automática nesse ajuste de variáveis. Mudanças de ambiente precisam de deploy para entrar em vigor.

Na Vercel, projeto → **Settings → Environment Variables**: configurar `VITE_API_URL` e as flags públicas para o ambiente Production; Preview e Development podem usar valores próprios. Root Directory é `frontend`, comando de build `npm run build`, saída `dist`. Fazer redeploy após alterar valores. GitHub Variables não substituem automaticamente o painel da Vercel na integração Git já existente.

Conferir `GET https://jurissim-pfc.onrender.com/health`, login e recuperação de senha no site publicado. Saúde da API não comprova acesso ao banco ou envio de e-mail; testar esses fluxos separadamente com uma conta autorizada.

## Conferência desta entrega

Em 13/11/2026, a API pública retornou HTTP 200 no health e o preflight CORS retornou HTTP 204 permitindo exatamente `https://jurissim.vercel.app`. Os Environments `production` e `staging` foram criados no GitHub; `production` recebeu somente a variável pública `VITE_API_URL`. `staging` está reservado, sem endpoint próprio configurado. Nenhuma credencial privada foi copiada para o GitHub e nenhuma variável existente do Render/Vercel foi alterada.

Passaram 1.064 testes unitários/rotas, o teste da preparação local, builds e linter. A conferência local de formato passou, com aviso de provedor de e-mail local ausente. A alteração local limitou-se a explicitar `VITE_API_URL=http://localhost:3333`, que antes usava o fallback do código; as demais configurações e chaves existentes foram preservadas.

Fontes: [GitHub Variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables), [GitHub Environments](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/deploy-to-environment), [Vite](https://vite.dev/guide/env-and-mode), [Render](https://render.com/docs/configure-environment-variables), [Vercel](https://vercel.com/docs/environment-variables).
