# Complemento de seguranca das avaliacoes e fotos

Estado: ensaio executado somente em cluster local descartavel PostgreSQL 17.11.
Aplicacao remota nao autorizada. Sem alteracao das migrations historicas.

## Modelo de acesso

As tabelas Avaliacao, AvaliacaoQuestao, _AvaliacaoToTurma e ProfilePhoto sao
acessadas pelo backend Prisma. O navegador usa as rotas autenticadas da aplicacao,
nao a Data API diretamente. Habilitar RLS nas quatro tabelas, sem politicas de
liberacao, e revogar todos os privilegios de PUBLIC, anon e authenticated.
Nao alterar proprietarios, papeis, BYPASSRLS, privilegios padrao do schema ou
privilegios de service_role. A confianca nesses papeis administrativos permanece.

O backend configurado foi inspecionado anteriormente como proprietario capaz de
criar objetos e com BYPASSRLS. Reconfirmar essa condicao antes de executar.
Nao usar FORCE RLS nem criar politicas baseadas no JWT Supabase: a autorizacao do
JurisSim e aplicada pelo backend com sua propria identidade autenticada.

## Artefatos

- Migration nova: 20261020120000_backend_only_evaluations_photos/migration.sql.
- Verificacao: backend/scripts/verify-evaluations-photos-security.sql.
- A verificacao consulta somente catalogos e privilegios efetivos, inclusive
  privilegios herdados e de colunas. Nao le registros, nao muda papeis e nao faz DML.
- Requer PostgreSQL 17 por verificar tambem MAINTAIN. Exige anon e authenticated.
- Uma politica existente, tabela ausente ou privilegio herdado inesperado deve
  interromper a operacao. Nao remover politicas ou usar REVOKE CASCADE automaticamente.

## Aplicacao futura sem intervalo de exposicao

Nao executar migrate deploy nem aplicar as criacoes com autocommit para depois
revogar acesso: uma migration posterior nao protege o intervalo entre commits.
Os quatro SQLs historicos envolvidos nao possuem BEGIN/COMMIT internos.

1. Obter aprovacao para o conjunto exato, confirmar backup recuperavel, janela de
   manutencao, ausencia de outro executor e estado das migrations/objetos/roles.
2. Usar uma conexao de migracao verificada, mesmo papel do backend, em uma unica
   transacao externa, com search_path restrito a public e pg_catalog,
   lock_timeout=5s e statement_timeout=60s. Configurar limites somente na sessao.
3. Aplicar os quatro arquivos historicos, em ordem cronologica, sem modifica-los.
   Conferir estrutura depois de cada arquivo dentro da mesma transacao.
4. Aplicar a nova migration de seguranca. A tabela ProfilePhoto deve existir antes.
5. Executar a verificacao de seguranca ainda dentro da transacao. Qualquer erro,
   timeout, politica ou permissao inesperada: ROLLBACK de todo o conjunto e parar.
6. COMMIT apenas apos todas as verificacoes. Antes do commit, o enum novo nao
   deve ser usado em testes funcionais nem em comandos que gravem esse valor.
7. Revalidar estrutura, RLS e ACL em transacao de leitura pelas duas conexoes.
8. Registrar individualmente as quatro migrations e o complemento com
   prisma migrate resolve --applied <nome>, somente apos validar seu conteudo completo.
   Confirmar checksum local, conclusao e ausencia de reversao no historico.
   Se o registro falhar apos o commit, parar; nao reaplicar SQL nem apagar tabelas.

Uma instalacao futura tambem precisa de um executor atomico equivalente: o simples
replay separado das migrations por migrate deploy nao garante ausencia de exposicao.
O executor existente test-migrations-local.cjs exige revisao antes de aceitar esta
nova ultima migration; sua trava atual deve continuar impedindo replay desatualizado.

## Riscos e verificacoes preparadas

- CREATE INDEX comum bloqueia escritas; ALTER TABLE pode bloquear leituras/escritas.
  Uma transacao unica mantem os locks ate o commit. Nao prometer indisponibilidade zero.
  Em timeout, aguardar diagnostico e nova autorizacao; nao aumentar limites sozinho.
- Novas colunas opcionais preservam registros existentes. Nao fazer backfill, seed,
  redefinicao de senha ou consulta a dados pessoais como parte deste complemento.
- RLS sem politicas bloqueia acesso de browser; REVOKE tambem protege operacoes como
  TRUNCATE que RLS nao cobre. Privilegios via outros papeis/colunas causam falha na
  verificacao, exigindo plano separado em vez de revogacoes amplas.
- Papeis confiaveis com BYPASSRLS/propriedade continuam com acesso. Nao significa
  protecao contra um administrador ou uso indevido de service_role.
- Em ambiente descartavel, um teste futuro deve criar anon/authenticated e defaults
  amplos ficticios, aplicar criacoes+seguranca atomicamente e verificar catalogos.
  Cobrir falha por permissao herdada, grant de coluna, politica inesperada e rollback.
  Testes funcionais com usuarios/fotos ficticios precisam de autorizacao separada.
- Nao remover o complemento apos uso sem avaliar exposicao e dependencia da aplicacao.
  Preferir correcao aditiva. Backup e acesso de restauracao ainda precisam ser confirmados.

## Ensaio isolado

Executor separado: `node backend/scripts/rehearse-dashboard-migrations-local.cjs`.
Ele cria seu proprio cluster em loopback/porta dinamica e verifica data_directory.
Usa ambiente de subprocessos permitido explicitamente e copia schema e migrations
para uma pasta temporaria, impedindo descoberta dos .env privados pelo Prisma.
Nao aceita URL externa. Os binarios precisam ser PostgreSQL 17 no caminho local
predefinido. Nao instala programas nem usa o servico PostgreSQL existente.

O ensaio passou com papel backend NOSUPERUSER BYPASSRLS e dados exclusivamente
ficticios. Reproduziu defaults amplos, aplicou os cinco arquivos em uma transacao,
validou RLS/ACL inclusive MAINTAIN e grants por coluna, schema diff Prisma vazio,
sete FKs novas validas, restricao de foto e falha de FK. Oito leituras diretas pelos
papeis de browser foram recusadas. Consultas Prisma reais do overview e do servico
de foto passaram sem atividades concluidas e sem foto. Os valores preexistentes
dos dados ficticios foram preservados.

Falhas injetadas (antes do commit, privilegio herdado, grant por coluna e politica
inesperada) abortaram a transacao, restaurando catalogo, enum e dados ficticios.
O procedimento migrate resolve foi exercitado apenas no banco local, com todos
os registros, estados e checksums conferidos. O cluster foi parado ao terminar;
artefatos locais permanecem no diretorio temporario indicado pelo executor.

Testes automatizados do backend: 492 aprovados em 27 arquivos. Build TypeScript
aprovado. O executor anterior permanece com sua trava; este ensaio nao o utiliza.
Ainda exigem confirmacao antes da execucao real: backup recuperavel, janela de
manutencao, ausencia de concorrencia, rechecagem dos metadados/permissoes remotos
e efeitos dos gatilhos DDL gerenciados do Supabase (nao reproduzidos localmente).
