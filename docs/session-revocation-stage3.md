# Revogação de sessões — etapa 3

Branch: `entrega2809`. Escopo exclusivo: invalidar sessões anteriores à redefinição
de senha, preservando a confirmação obrigatória e autorização pelo perfil atual.

## Estratégia

O JWT existente usa HS256, inclui identificação/perfil e expira em oito horas.
A validação da etapa 2 consulta a conta em cada requisição, inclusive na sessão
limitada e no reenvio. A estratégia acrescenta `User.sessionVersion`, inteiro com
default zero, e o claim assinado `sessionVersion` nos tokens novos.

A redefinição incrementa a versão na mesma escrita da senha, dentro da transação
que consome o link e grava a auditoria. Falhas revertem essas quatro operações.
A comparação entre a versão assinada e a versão atual é feita antes das permissões
e da confirmação de e-mail, tanto na autenticação completa quanto na limitada.
Uma versão divergente resulta em 401. Não há cache de versões ou de perfis.

JWTs antigos sem o claim são interpretados como versão zero. Eles continuam
funcionando para contas que ainda não redefiniram a senha; após o incremento,
também são recusados. Valores negativos, fracionários, nulos, textuais ou fora
do intervalo de inteiro PostgreSQL são inválidos. Não há fallback para campos
ausentes no banco: falhas na leitura não concedem acesso.

Um login iniciado antes da redefinição pode concluir depois com a versão antiga;
esse token será recusado e o usuário precisará entrar novamente com a senha nova.
Sessões emitidas após a troca usam a versão nova. A versão não altera o perfil,
o estado de confirmação de e-mail ou sessões de outros usuários.

## Migration e limites

`20261015140000_session_version` adiciona somente a coluna, sem apagar estruturas,
editar migrations anteriores ou reescrever senhas. As contas existentes iniciam
na versão zero. O SQL tem transação, timeout de lock de 5s e de execução de 60s.

A migration deve preceder a publicação do código, e todas as instâncias do backend
precisam receber a nova validação. Instâncias antigas não verificam a versão.
O Supabase permanece fora do escopo; qualquer inspeção/aplicação remota exige
autorização separada. Requisições já autorizadas antes do commit da redefinição
podem concluir; a revogação é aplicada nas próximas verificações de autenticação.

Links de confirmação continuam válidos conforme suas regras próprias e não
restauram um JWT revogado. Redefinir senha não confirma o e-mail. Não foram
introduzidos refresh tokens, mudanças de frontend, limites de abuso ou etapa 4.

## Arquivos desta etapa

Produção:

- `backend/prisma/schema.prisma`: campo `sessionVersion`.
- `backend/prisma/migrations/20261015140000_session_version/migration.sql`: nova
  migration incremental; as sete anteriores permanecem intactas.
- `backend/src/repositories/auth-repository.ts`: seleciona a versão nas leituras
  de autenticação e nas criações de conta usadas para emitir JWT.
- `backend/src/services/auth-service.ts`: emite e valida o novo claim, com
  compatibilidade controlada para JWTs legados.
- `backend/src/middlewares/auth-middleware.ts`: verifica versão antes de liberar
  sessões completas ou limitadas, mantendo confirmação e perfil atual.
- `backend/src/repositories/password-recovery-repository.ts`: incremento atômico
  junto da alteração da senha na transação existente.

Validação e documentação:

- `backend/scripts/test-migrations-local.cjs`: estendido sem remover as verificações
  da etapa 1; cobre também a atualização da versão, as oito migrations e a execução
  dos testes reais de revogação. Gera o Prisma Client local antes da integração.
- `backend/scripts/test-session-revocation-db.ts`: integração real com Prisma,
  Express e PostgreSQL; só aceita o cluster descartável criado pelo primeiro script,
  verifica host/usuário/banco/diretório e não importa `.env`.
- `backend/src/routes/auth-security.test.ts`: 12 novos testes de revogação e
  adaptação das fixtures à versão persistida.
- Fixtures/assertivas adaptadas em `backend/src/services/auth-service.test.ts`,
  `backend/src/services/jwt-auth.test.ts`,
  `backend/src/services/legal-acceptance.test.ts`,
  `backend/src/services/google-auth.test.ts`,
  `backend/src/services/password-recovery.test.ts`,
  `backend/src/routes/audit-routes.test.ts`,
  `backend/src/routes/questao-crud.test.ts` e
  `backend/src/routes/trail-server.test.ts`.
- Este relatório. Nenhum arquivo de frontend, `.env`, dependência ou configuração
  SMTP foi alterado nesta etapa. Prisma Client regenerado apenas em `node_modules`.

## Resultados de validação local — 15/10/2026

- 190 testes aprovados em 14 suítes do backend, com transporte/persistência
  substituídos por mocks quando exercitados. Nenhum e-mail real enviado.
- TypeScript de backend e frontend aprovado, sem emissão de arquivos.
- O script TypeScript de integração também foi verificado separadamente com
  `--strict`, porque fica fora do `rootDir` da aplicação.
- PostgreSQL 17.11 descartável: replay das seis migrations originais, reconciliação
  da etapa 1 e nova migration de sessão. Os dados fictícios das 15 tabelas foram
  preservados; usuários existentes receberam versão zero.
- Banco atualizado e banco novo: `prisma migrate diff --exit-code` retornou zero,
  sem divergências em relação ao schema. `prisma validate` aprovado.
- Instalação nova: oito migrations aplicadas; segundo deploy sem pendências.
- Checksums das sete migrations anteriores preservados.
- Sete cenários de integração com banco real local aprovados: expiração de link;
  revogação e novo login; isolamento entre usuários e permissões atuais; expiração
  de JWT e versões divergentes; confirmação obrigatória; rollback após falha de
  auditoria; consumo concorrente do mesmo link com um único incremento.

Para repetir, dentro de `backend`, com PostgreSQL instalado:

```powershell
node scripts/test-migrations-local.cjs 'C:\Program Files\PostgreSQL\17\bin'
```

O teste sempre cria um cluster novo em uma porta local, substitui as configurações
de conexão dos subprocessos, não apaga tabelas/dados e encerra o cluster ao final.
Os dados de teste são fictícios e seus diretórios ficam preservados. Não houve
conexão ao Supabase, execução remota de migrations, commit, push ou merge.

Artefatos da validação final (cluster encerrado, dados mantidos):
`C:\Users\JOAOZI~1\AppData\Local\Temp\jurissim-migrations-UgqTVy`.
Comparação por hashes confirmou a preservação das sete migrations anteriores,
de todo o frontend e da documentação das etapas anteriores. Alterações nos testes
anteriores foram limitadas às fixtures da nova coluna e às assertivas de revogação.
