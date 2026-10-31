# Integração local com a main — resolução sem commit

## Referências e limites

Branch exclusiva: `entrega2809`. Checkout limpo e sincronizado confirmado após
`git fetch origin`. Referência de segurança/HEAD:
`2d1c4c62ed41728044c78e6be099ad400e854980`.
Origem integrada/MERGE_HEAD: `50a6b6a90e5b42f2c8422f6744d0fc07defc51e3`.
Base comum: `2dfcb045ec2215f01e50c7e0f410ee3a38cb92a9`.

A tentativa da sessão interrompida não chegou a iniciar o merge; isso foi
verificado antes de retomar. Nesta sessão foi executado somente o merge local
autorizado `git merge --no-commit --no-ff origin/main`. Nenhum commit, branch,
push, rebase, abort, deploy ou acesso ao Supabase foi realizado. A main não foi
alterada. O merge permanece pendente para revisão e autorização do usuário.

O inventário SHA-256 anterior está fora do repositório, no diretório temporário
`jurissim-main-integration-ccvccZ`, sem conteúdo de credenciais. A main tinha 13
commits exclusivos, incluindo dois merges anteriores, documentação, novas
suítes de teste, seleção de perfil no login e logs seguros. A entrega tinha os
sete commits das etapas concluídas. Não se descartou o histórico dos colegas.

## Nove conflitos resolvidos por trecho

| Arquivo | Resolução e contribuição preservada |
| --- | --- |
| `backend/.env.example` | Mantidos SMTP oficial com senha vazia e campos de teste dos colegas; removida orientação insegura de reset/Supabase. URLs de teste passam a ser injetadas exclusivamente pelo harness; `TEST_DIRECT_URL` documentada vazia. Nenhuma credencial real foi lida para uso ou modificada |
| `backend/src/controllers/auth-controller.ts` | Mantido `perfil` do login tradicional e Google, contribuição da main já contemplada na entrega; preservados limites/validação, nonce, confirmação e logout da etapa 7. Corrigida somente a sobreposição dos trechos, sem escolher arquivo inteiro |
| `backend/src/middlewares/error-handler.ts` | Preservado log fixo sem objeto de erro, contribuição de ambas as branches; mantidos Retry-After e respostas seguras para JSON inválido/excessivo |
| `backend/src/routes/audit-routes.test.ts` | Mantida consulta simulada do usuário ao banco com roles distintas, confirmação e versão; não fixar todos os usuários em ADMIN |
| `backend/src/routes/questao-crud.test.ts` | Mantido mock compartilhado do banco e identidade/permissões atuais; não fixar todas as contas em PROFESSOR. Casos anteriores de CRUD/autorização continuam presentes |
| `backend/src/routes/trail-server.test.ts` | Preservadas constantes reais do módulo e mock dinâmico de autenticação, com versão/confirmado/papel atual, incluindo os fluxos dos testes herdados |
| `backend/src/services/jwt-auth.test.ts` | Preservada exportação real do sentinel Google e consulta simulada do papel atual; removida declaração duplicada de `findByIdForAuth` introduzida pela combinação automática, que também causava erro TypeScript |
| `backend/src/services/legal-acceptance.test.ts` | Mantida verificação de nome/e-mail/role da main e assertiva completa atual, acrescentando id e `emailVerificado: false`; conta recém-cadastrada não ganha confirmação |
| `backend/src/services/password-recovery.test.ts` | Mantido evento `SENHA_REDEFINIDA` corrigido na main e exigências atuais de conta ativa, incremento de versão e consumo atômico; não regredir a reset sem revogação |

O resultado de oito desses arquivos coincide com o conteúdo funcional já
validado da entrega porque ele já incorpora as contribuições semânticas da main
com verificações adicionais. Isso foi decidido por comparação dos trechos, sem
`checkout --ours/--theirs` ou substituição indiscriminada de arquivos.

## Compatibilidade dos testes dos colegas

Todas as quatro suítes unitárias novas da main e os oito cenários de integração
foram preservados. Motor adaptativo e recuperação de senha unitários permanecem
idênticos à main. Também foram preservados README, configuração unitária e os
scripts `test:integration` e `test:all`, além do script `email:verify` da entrega.
Nenhuma dependência precisou ser alterada ou instalada.
O README mantém a contribuição da main; foram apenas removidos dois espaços
finais preexistentes apontados por `git diff --check`, sem mudança do conteúdo.

As seis falhas da auditoria foram corrigidas nos testes, conforme contratos reais:

- Dois casos de login válido tinham fixtures sem `sessionVersion`; agora usam
  versão zero/conta ativa e também verificam a versão emitida no JWT.
- Quatro casos de questões esperavam assinaturas antigas. Criação agora recebe
  explicitamente o papel do ator; listagem verifica filtros, identidade, papel e
  opção `somenteMinhas` nos argumentos corretos.
- As dez chamadas inválidas apontadas pelo TypeScript receberam identidade e
  papel obrigatórios, sem tornar opcionais os parâmetros de autorização.
- A consulta pública do teste de repositório usa um aluno autenticado sem turma;
  o teste mantém a exigência de não expor a questão privada de outro professor
  e acrescenta verificações de visibilidade do autor/filtro de próprias questões.
- O helper JWT usa a versão real da fixture. Usuários confirmados são criados
  somente no banco isolado dos testes; não há bypass no backend de produção.

Não foram removidos casos, ignoradas suítes ou relaxadas regras do backend para
fazer testes antigos passarem. O único nome ajustado explicita que a visão de
questões públicas é de aluno autenticado, conforme a política atual.

## Segurança da execução de banco

O setup antigo com `prisma db push --force-reset` foi removido. Não existe reset,
db push ou criação de schema no `global-setup.ts`. Ele apenas valida propriedade
do cluster e confere a aplicação das 12 migrations pelo ledger real.

O harness `test-migrations-local.cjs` continua criando seu próprio cluster em
loopback/porta efêmera e agora cria um banco adicional `jurissim_integration`
para a suíte dos colegas. As 12 migrations são aplicadas nele pelo runner real,
separadamente dos bancos usados para preservação de dados e cenários anteriores.

A guarda em `disposable-database.ts`:

1. Recusa antes de SQL `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` e
   `TEST_DIRECT_URL` ausentes, externas, divergentes, com senha, porta 5432,
   banco/schema não esperados, parâmetros adicionais ou usuário não autorizado.
2. Exige modo test, host exato 127.0.0.1, porta efêmera, banco exclusivo e
   diretório real `data` dentro do cluster temporário criado pelo harness.
3. Exige prova aleatória de propriedade, criada pelo harness e mantida somente
   no processo/artefatos temporários; os valores não são logados nem commitados.
4. Antes de cada TRUNCATE, confere a conexão efetiva por consulta somente de
   leitura: diretório de dados, banco, papel e porta. Nenhuma limpeza é liberada
   em cliente que esteja conectado a outro alvo.

A configuração Vitest não carrega `.env`, não usa URL alternativa sem validação
e não permite fallback para banco de desenvolvimento. Provedores externos são
esvaziados apenas no processo de teste. Os `.env` reais não foram editados.
Os 19 novos casos unitários exercitam alvos externos, divergência de URLs,
propriedade ausente/inválida e divergência da conexão efetiva. Uma invocação
negativa do CLI com `TEST_DIRECT_URL` externa também foi recusada no carregamento
da configuração, antes de carregar suítes ou consultar banco.

Para repetir as integrações, a partir de backend:

```powershell
node scripts/test-migrations-local.cjs "C:\Program Files\PostgreSQL\17\bin"
```

`npm run test:integration` é o comando interno preservado; executá-lo com URLs
manuais ou sem o contexto do harness agora falha fechado. Não preencher ambientes
reais para tentar contornar a guarda. O `test:all` dos colegas permanece, mas a
integração também depende desse contexto comprovado; não basta um nome com test.

## Validação desta resolução

| Verificação | Resultado |
| --- | --- |
| Backend unitário/rotas com mocks | **439 testes / 25 suítes aprovados** = 385 anteriores + 35 dos colegas + 19 de segurança do harness |
| TypeScript backend e frontend | Ambos aprovados, `tsc --noEmit --incremental false` |
| Build backend | Aprovado, saída própria de validação, `dist` anterior preservado |
| Build frontend | Aprovado com API loopback/Google vazio; CSS 46,16 kB / JS 330,94 kB; fonte do frontend intacta |
| PostgreSQL real descartável | **43 cenários anteriores aprovados**: sessão 7, histórico 6, turmas/simulados 7, metas/relatórios 7, fotos 10, autenticação 6 |
| Integrações dos colegas | **8 testes / 1 suíte aprovados** com HTTP, serviços, repositórios e banco locais reais; nenhum cenário descartado |
| Chrome com API simulada | **65 cenários aprovados**, rede externa bloqueada, desktop/celular, temas, permissões e câmera simulada |
| Chrome com backend/DB reais locais | **7 cenários aprovados**, somente transporte de e-mail simulado; cadastro/login/confirmar/reset/logout de aluno e professor |
| Regressão legal/estudo | Documentos, aceite, formulários, dashboard original, diagnóstico/trilha, confirmação e recuperação aprovados |
| Migrations | **12** aplicadas; segunda aplicação sem pendências; upgrade com dados históricos preservados; checksums intactos; sem drift nos três bancos locais |

PostgreSQL usado: **17.11**, artefatos `jurissim-migrations-JjHjI0`; cluster
encerrado ao fim. Capturas desta execução: `jurissim-session-0ygY59`,
`jurissim-auth-stage7-SGiY9p` e `jurissim-legal-BSM0L7`, em diretórios temporários.
Os resultados com mocks, banco real local e provedor simulado são distintos;
nenhum deles comprova SMTP/OAuth reais ou infraestrutura de produção.

Vitest emitiu um aviso sobre a futura mudança do carregador de configuração do
Vite para módulos nativos; as versões atuais executaram todas as suítes. Não foi
ocultado o aviso nem alterado o projeto CommonJS para contornar uma atualização
major que não pertence a esta resolução.

## Preservação e arquivos com diferença final

Comparação SHA-256 com o inventário anterior: **57 arquivos** de frontend/Prisma
(incluindo schema e migrations), mais os dois `.env` reais, mantêm bytes idênticos.
Todas as implementações funcionais das etapas 1–7 foram mantidas; as mudanças
adicionais desta resolução se concentram em suporte/testes, exemplos e relatório.
Não houve alteração de layout, credenciais, schema, migrations ou dependências.

Diferenças finais esperadas contra o HEAD da entrega (incluem arquivos da main):

- `README.md`.
- `backend/.env.example`, `backend/package.json`.
- `backend/scripts/test-migrations-local.cjs`.
- `backend/vitest.config.ts`, `backend/vitest.integration.config.ts`.
- `backend/src/__tests__/integration/global-setup.ts`, `helpers.ts`,
  `questoes.integration.test.ts`, novo `disposable-database.ts`.
- `backend/src/__tests__/unit/adaptive-engine.unit.test.ts`,
  `auth-service.unit.test.ts`, `password-recovery-service.unit.test.ts`,
  `questao-service.unit.test.ts`, novo `disposable-database.unit.test.ts`.
- Este relatório `docs/main-integration-resolution.md`.

Os nove arquivos conflitantes foram marcados como resolvidos no índice após a
validação. Nenhum marcador ou entrada não resolvida deve permanecer. O conteúdo
staged representa a resolução validada; `MERGE_HEAD` permanece e HEAD não avança
sem a autorização para criar o commit de merge.

## Pendências para conclusão

- Revisar a resolução e autorizar o commit de merge local e, separadamente, o
  envio de entrega2809. Não realizar commit/push automaticamente.
- Reconsultar o estado remoto antes de concluir/publicar; se a main avançar,
  analisar as novas diferenças e revalidar. Esta homologação refere-se aos hashes
  indicados no início.
- Fernando poderá revisar o PR de entrega2809 para main e efetuar a integração
  definitiva após autorização. Não é necessária outra branch para esta resolução.
- Prontidão de produção continua condicionada às pendências já documentadas:
  Gmail/OAuth reais, alertas Prisma, infraestrutura, backup/RLS e política LGPD.
  Não foram resolvidas nem ocultadas por este merge. A etapa 8 não foi iniciada.

Com os testes locais aprovados e sem conflitos, a integração está preparada
tecnicamente para revisão e eventual commit autorizado. Isso não autoriza deploy
nem modifica diretamente a main.
