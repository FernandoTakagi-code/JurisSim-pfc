# Roteiro de apresentação acadêmica — JurisSim

## Estado desta preparação

### Preparação isolada (30/10/2026)

- Docker não está instalado. O PostgreSQL local existente em `5432` não foi utilizado.
- Foi iniciado PostgreSQL 17 em diretório temporário exclusivo, escutando apenas em `127.0.0.1:55432`; banco `jurissim_demo`. As 18 migrations foram aplicadas somente nesse banco descartável.
- O script `backend/scripts/demo/seed-academic-demo.ts` preparou três contas fictícias, uma turma e 55 questões sintéticas. Há 30 slots de diagnóstico: 15 autorais simuladas e 15 slots com origem OAB simulada. Os itens OAB dizem expressamente que não são oficiais; todo conteúdo é fictício, não jurídico e impróprio para importação real.
- `inventory:check` foi executado com `INVENTORY_CHECK_DATABASE_URL` apontando explicitamente ao loopback descartável e retornou **APTO**: 11 questões sintéticas por disciplina, 30 slots possíveis e cobertura de prática em um assunto de cada disciplina. Essa saída é evidência de fixtures técnicas somente.
- O backend passou em `npm.cmd run build`. O frontend passou em `npm.cmd run build`; Vite avisou que o bundle principal excede 500 kB.
- Na primeira verificação, a enumeração de processos do Windows foi negada (WMI `Acesso negado`), então os servidores não foram iniciados naquele momento. A confirmação posterior por `psql` e `pg_controldata` está registrada abaixo.

### Verificação interativa/API posterior

- A identidade foi confirmada por `psql` e `pg_controldata`: PostgreSQL 17.11, endereço loopback `127.0.0.1`, porta `55432`, system identifier `7702354298330355824`, correspondente ao cluster temporário. Um registro sem credenciais foi criado para permitir que `stop-demo.ps1` confirme a mesma identidade antes da limpeza.
- Backend e Vite estão servindo somente em loopback nos endereços `http://127.0.0.1:3334` e `http://127.0.0.1:5174`. O backend foi iniciado com credenciais e flags apenas no processo; dotenv foi executado a partir da raiz do repositório, sem carregar `backend/.env`.
- A automação de navegador não iniciou neste ambiente. Foram verificados a resposta HTML do Vite, `/health` e as rotas autenticadas diretamente pela API; **não houve validação visual via clique nem coleta de console do navegador**.
- Pela API, passaram login aluno e professor, sessão do aluno, diagnóstico (30 questões respondidas, resultado persistido e trilha adaptativa criada), tentativa e finalização da trilha, feedback de resposta, dashboard do aluno, criação/consulta de meta, consulta do catálogo e sessão de prática (5 questões respondidas e finalizadas), simulado (5 questões respondidas e finalizadas), turma e relatório do professor com métricas por disciplina e distribuição por nível. Um primeiro pedido para finalizar a prática com respostas faltantes foi corretamente recusado; depois de responder as cinco, a finalização passou.
- `start-demo.ps1` e `stop-demo.ps1` passaram pela análise sintática do PowerShell. O caminho de falha do start foi endurecido para reter os dados temporários se o PostgreSQL não parar; a limpeza agora também recusa diretórios temporários redirecionados por reparse point. O banco permanece ativo para apresentação.

#### Credenciais somente para o banco descartável acima

- Aluno: `aluno.demo@jurissim.local`
- Professor: `professor.demo@jurissim.local`
- Administrador: `admin.demo@jurissim.local`
- Senha comum: `Demo@JurisSim2026`

Essas contas e perguntas só existem no cluster local temporário. Não são credenciais de produção nem conteúdo homologado.

#### Como preparar um novo ciclo descartável

Em PowerShell, na raiz do repositório, o script cria um cluster novo somente quando `55432` estiver livre, aplica as migrations no cluster recém-criado, sem ler `backend/.env`, insere fixtures rotuladas e executa o inventory read-only:

```powershell
.ackend\scripts\demo\start-demo.ps1
```

O script atual prepara banco e conteúdo; ele não inicia os servidores web. **Não o execute enquanto a sessão descartável anterior ocupar `55432`.** O script gera um registro temporário de sessão e valida o identificador do cluster antes de poder removê-lo. Não pare serviços PostgreSQL manualmente.

O início do frontend/backend só deve ocorrer após a saída bem-sucedida do script e a confirmação de que as portas escolhidas estão livres. Para backend em um segundo terminal, usando exclusivamente a URL `127.0.0.1` emitida pelo script, as credenciais de demonstração e flags restritas ao processo local:

```powershell
$demoDb = 'postgresql://postgres@127.0.0.1:55432/jurissim_demo?schema=public'
$env:DATABASE_URL = $demoDb
$env:DIRECT_URL = $demoDb
$env:HOST = '127.0.0.1'
$env:PORT = '3334'
$env:JWT_SECRET = 'demo-only-JWT-secret-32-characters-minimum'
$env:CORS_ORIGINS = 'http://127.0.0.1:5174'
$env:APP_PUBLIC_URL = 'http://127.0.0.1:5174'
$env:INITIAL_DIAGNOSTIC_REQUIRED = 'true'
$env:INITIAL_DIAGNOSTIC_API_ENABLED = 'true'
$env:QUESTION_PRACTICE_SCHEMA_ENABLED = 'true'
$env:QUESTION_PRACTICE_API_ENABLED = 'true'
$shim = Join-Path $env:TEMP 'jurissim-tsx-os-compat.cjs'
Set-Content -LiteralPath $shim -Encoding ascii -NoNewline -Value "const os=require('node:os'); os.userInfo=()=>({username:process.env.USERNAME||'local-runner'});"
$env:NODE_OPTIONS = "--require=$shim"
npm.cmd --prefix backend run dev
```

Em outro terminal:

```powershell
$env:VITE_API_URL = 'http://127.0.0.1:3334'
$env:VITE_INITIAL_DIAGNOSTIC_UI_ENABLED = 'true'
$env:VITE_QUESTION_PRACTICE_UI_ENABLED = 'true'
$env:VITE_JURISSIM_DEMO_MODE = 'true'
npm.cmd --prefix frontend run dev -- --host 127.0.0.1 --port 5174
```

Ao encerrar, pare os servidores com `Ctrl+C` e, depois que existir um registro de sessão que corresponda ao cluster, rode `.ackend\scripts\demo\stop-demo.ps1`. O script confere caminho temporário, porta, banco e system identifier antes de parar PostgreSQL e remover somente aquele diretório. **Na sessão atualmente preparada o registro não pôde ser confirmado**; não use `stop-demo.ps1` até que a identidade do processo/registro esteja visível. Para limpar manualmente, solicite que um operador local confirme o cluster e use o `pg_ctl` somente com o diretório temporário exato retornado pelo `start-demo.ps1`.

- Os fluxos técnicos foram cobertos pela suíte já aprovada anteriormente (762 testes, sem repetição nesta rodada). Isso comprova contratos e comportamentos de teste, não acervo real nem um ambiente interativo preparado.
- A prévia offline do importador executou: **0 itens elegíveis**. As 15 questões IA foram bloqueadas por revisão/fonte/liberação; faltam os 15 itens OAB elegíveis; os cinco assuntos de prática ficaram em 0/5.
- `inventory:check` iniciou em modo somente leitura, mas terminou em `CONNECTION`: não foi possível alcançar o PostgreSQL configurado. Não houve leitura de inventário nem gravação.
- Há um serviço PostgreSQL local ativo em `5432`, mas não foi comprovado como descartável e não deve ser usado para a demonstração. O banco reservado ao modo de diagnóstico local, na porta `5433`, não está disponível. O `backend/.env` atual aponta para um host PostgreSQL externo; não use essa configuração para uma apresentação local.
- Existe `backend/prisma/seed.ts`, mas ele grava perguntas sintéticas como públicas, faz upsert de usuários/questões e apaga/recria alternativas para IDs fixos. As questões não têm indicação de demonstração na interface. **Não execute esse seed** contra um banco local existente e não apresente esse conteúdo como questão real, OAB ou homologada.

## Inicialização local, sem serviços pagos

O projeto não tem script de inicialização único na raiz. Frontend e backend rodam em terminais separados. Para proteger o `backend/.env` existente, prepare `backend/.env.local` (ignorado pelo Git) copiando o exemplo e substituindo os valores por credenciais de uma instância PostgreSQL **nova e descartável**, somente loopback. Não copie a URL externa atual. Use o mesmo banco em `DATABASE_URL` e `DIRECT_URL`; defina `JWT_SECRET` local com pelo menos 32 caracteres, `HOST=127.0.0.1`, `PORT=3333`, `CORS_ORIGINS=http://localhost:5173` e `APP_PUBLIC_URL=http://localhost:5173`. Mantenha as flags desligadas até schema e acervo da demonstração serem verificados.

Crie o arquivo local somente se ainda não existir; depois edite os placeholders para apontarem à instância descartável:

```powershell
if (-not (Test-Path .\backend\.env.local)) { Copy-Item .\backend\.env.example .\backend\.env.local }
```

Depois de provisionar uma instância descartável e revisar sua identidade, aplique nela as migrations do repositório. A aplicação dessas migrations é apenas para a nova instância local, nunca para o banco apontado pelo `.env` atual:

```powershell
$env:DOTENV_CONFIG_PATH = (Resolve-Path .\backend\.env.local).Path
$dotenvPreload = (Resolve-Path .\backend\node_modules\dotenv\config.js).Path
$env:NODE_OPTIONS = "--require=$dotenvPreload"
npm.cmd --prefix backend exec -- prisma migrate deploy
Remove-Item Env:DOTENV_CONFIG_PATH
Remove-Item Env:NODE_OPTIONS
```

No Windows deste ambiente, `tsx@4.23.13` falha porque a chamada nativa `os.userInfo()` retorna `ENOMEM`. Para comandos backend baseados em `tsx`, use o shim temporário abaixo. Ele só substitui `os.userInfo()` no processo Node desta sessão para fornecer o nome de usuário ao diretório temporário do tsx; não muda arquivos do sistema nem do projeto:

```powershell
$shimPath = Join-Path $env:TEMP 'jurissim-tsx-os-compat.cjs'
Set-Content -LiteralPath $shimPath -Encoding ascii -NoNewline -Value "const os=require('node:os'); os.userInfo=()=>({username:process.env.USERNAME||'local-runner'});"
$dotenvPreload = (Resolve-Path .\backend\node_modules\dotenv\config.js).Path
$env:DOTENV_CONFIG_PATH = (Resolve-Path .\backend\.env.local).Path
$env:NODE_OPTIONS = "--require=$dotenvPreload --require=$shimPath"
try { npm.cmd --prefix backend run dev }
finally {
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  Remove-Item Env:DOTENV_CONFIG_PATH -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $shimPath -ErrorAction SilentlyContinue
}
```

Execute o bloco de backend em um terminal e mantenha-o aberto. No segundo terminal, configure `frontend/.env.local` com `VITE_API_URL=http://127.0.0.1:3333` e, somente depois da validação do ambiente isolado, as flags visuais correspondentes. Inicie a interface:

```powershell
npm.cmd --prefix frontend run dev -- --host 127.0.0.1
```

Abra `http://127.0.0.1:5173`. Login por Google e envio por SMTP não são necessários para iniciar os servidores, mas autenticação demonstrável precisa de contas locais válidas. O projeto não dispõe hoje de um conjunto pronto e seguro de contas/conteúdo para essa demonstração. Não execute migrations ou seed usando o serviço PostgreSQL que já está ativo em `5432` sem antes comprovar que é descartável.

## Roteiro para a banca

| Ordem | Demonstração | Evidência atual / condição para demonstração ao vivo |
|---:|---|---|
| 1 | Apresentar login e perfis aluno/professor | Autorização por perfil foi coberta pelos testes anteriores. Para login ao vivo, preparar contas em base descartável e caminho de verificação de e-mail local. |
| 2 | Iniciar o diagnóstico adaptativo | O fluxo foi testado tecnicamente. Ao vivo depende de 30 questões elegíveis na composição original: 15 autorais e 15 OAB com direitos documentados. Hoje há 0 elegíveis. |
| 3 | Mostrar resultado, trilha recomendada e adaptação | Fluxo de serviço/integração foi testado anteriormente. Ao vivo depende de diagnóstico concluído com acervo real autorizado. |
| 4 | Responder questão e ver feedback imediato | Fluxo foi testado. Ao vivo requer questão elegível, justificativa revisada e sessão de prática no banco isolado. |
| 5 | Abrir dashboard do aluno | Evolução, desempenho e rotas foram cobertos nos testes anteriores. Ao vivo requer histórico gerado na mesma base descartável. |
| 6 | Demonstrar simulado, metas e sequência de dias | Serviços tiveram testes anteriores. Gerar tentativas reais de demonstração e mostrar a atualização após responder questões. |
| 7 | Abrir painel do professor e turma | Autorização, turmas e relatórios foram testados. Entrar com usuário professor local e turma preparada na base descartável. |
| 8 | Encerrar mostrando os limites do acervo | Informar que fixtures de teste são artificiais e não representam questões oficiais, autorizadas ou homologadas. Mostrar pendências de revisão/direitos. |

**Critério de integridade da apresentação:** não rotular fixtures como OAB, autorizadas, revisadas ou homologadas. Se o acervo não estiver disponível, demonstre a evidência técnica dos testes e a interface, mas apresente diagnóstico, trilha e prática como fluxos ainda sem validação funcional com conteúdo real. Não simule 15 questões oficiais com conteúdo inventado.

## Pendências para demonstração funcional completa

1. Disponibilizar e validar um PostgreSQL descartável dedicado; a porta local já ocupada em `5432` não foi usada. O banco reservado ao modo local de diagnóstico em `5433` está indisponível.
2. Criar um conjunto de contas de demonstração válido e identificá-las como tal; não reutilizar usuários existentes nem depender do seed atual.
3. Concluir revisão jurídica, pedagógica e liberação das 15 questões autorais, preservando autoria/geração IA.
4. Obter autorização documentada para reprodução das questões OAB ou decisão jurídica registrada; depois preencher conteúdo, conferir gabarito e classificar dificuldade/assunto com revisão humana.
5. Ter ao menos cinco questões elegíveis para cada assunto de prática declarado. Os rascunhos atuais fornecem uma questão por assunto indicado; são necessárias quatro adicionais por assunto escolhido, a menos que itens oficiais licenciados cubram o mesmo assunto.
6. Só então habilitar flags **no ambiente descartável local**, executar `inventory:check` e demonstrar o fluxo completo. Flags de produção permanecem inalteradas.
