# Execução local da equipe

O backend usa o Supabase compartilhado de desenvolvimento quando suas variáveis
locais `DATABASE_URL` e `DIRECT_URL` apontam para esse projeto. Não use o banco
PostgreSQL da máquina nem os scripts de demonstração para a execução cotidiana.

## Preparação

1. Obtenha as URLs do Supabase e os valores locais necessários pelo canal seguro
   da equipe. Nunca cole credenciais em commits ou neste documento.
2. Se ainda não houver configuração local, copie os exemplos sem sobrescrever
   arquivos existentes:

   ```powershell
   if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
   if (-not (Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
   ```

3. Preencha `backend/.env` localmente com as URLs do Supabase compartilhado e um
   `JWT_SECRET` privado. Em `frontend/.env.local`, use
   `VITE_API_URL=http://127.0.0.1:3333`.
4. Instale dependências e gere o cliente Prisma:

   ```powershell
   npm --prefix backend ci
   npm --prefix frontend ci
   npm --prefix backend run prisma:generate
   npm --prefix backend run build
   ```

## Iniciar

Abra dois terminais na raiz do repositório:

```powershell
npm --prefix backend start
```

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1
```

Acesse `http://127.0.0.1:5173`; a API local é `http://127.0.0.1:3333`.
O endpoint `GET /health` verifica disponibilidade da API, mas não substitui a
validação de acesso ao banco.

## Banco compartilhado e migrations

Confira o estado sem modificar o banco:

```powershell
npm --prefix backend exec -- prisma migrate status --schema=prisma/schema.prisma
```

Não execute `migrate deploy`, `migrate reset`, `db push` ou seeds contra o
Supabase sem aprovação explícita da equipe. A migration
`20261030120000_diagnostic_review_snapshot` adiciona a coluna nullable
`QuestaoSimulado.conteudoSnapshot`; ela precisa de revisão/aprovação antes de
ser aplicada. O diagnóstico e a prática também dependem de acervo real elegível
e das flags correspondentes; mantenha as flags desativadas até cumprir esses
pré-requisitos.

Os scripts em `backend/scripts/demo/` são opt-in para demonstrações isoladas e
não fazem parte do comando normal de inicialização.
