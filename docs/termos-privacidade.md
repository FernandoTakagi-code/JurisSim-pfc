# Termos, privacidade e aceite

Os documentos públicos ficam em `/#/termos` e `/#/privacidade`. Os links aparecem no login, cadastro e rodapé de todas as telas autenticadas, inclusive em telas pequenas. A navegação mantém formulário e simulado montados para preservar o estado ao voltar.

O texto está em `frontend/src/legal.tsx`. As versões e a data têm fonte única em `backend/src/legal-versions.json`, importada pelos dois projetos. Ao modificar substancialmente um documento, atualize sua versão e data; preserve o texto das versões anteriores no histórico de desenvolvimento. Contas existentes não recebem aceite retroativo. Não foi implementado um fluxo de novo aceite para contas existentes.

## Cadastro e auditoria

O cadastro no fluxo oficial de autenticação exige o objeto:

```json
{
  "acceptance": {
    "accepted": true,
    "termsVersion": "2026-09-25.1",
    "privacyVersion": "2026-09-25.1"
  }
}
```

Aceite ausente, falso, convertido em texto ou com versões divergentes é rejeitado. A data vem do servidor. O Prisma cria a conta com `legalAcceptedAt`, `termsVersion`, `privacyVersion` e um `AuditLog` aninhado na mesma operação atômica. O evento `ACEITE_TERMOS_E_PRIVACIDADE` contém apenas ID, usuário, ação, data e versões. Nenhum corpo de requisição, senha, hash, JWT, IP ou user-agent é registrado nessa auditoria. Erros inesperados também não imprimem objetos de exceção que possam conter argumentos do banco.

O roteador oficial é `auth-routes.ts`, com cadastro, login e `/auth/session`, usando JWT `{ id, role }`. O cadastro público permite apenas ALUNO e PROFESSOR.

## Banco

A migração `20260925000000_legal_acceptance` acrescenta campos opcionais às contas antigas e cria `AuditLog`, com vínculo e índice por usuário/data. Não preenche consentimentos antigos e não exclui dados.

No ambiente verificado, existem duas pastas anteriores sem `migration.sql`: `20260912000000_add_email_confirmation` e `20260912160000_add_trail_execution`. Elas não foram modificadas. Por isso, foi aplicada somente a nova migração e registrada como aplicada:

```powershell
cd backend
npm.cmd exec prisma db execute -- --file prisma/migrations/20260925000000_legal_acceptance/migration.sql --schema prisma/schema.prisma
npm.cmd exec prisma migrate resolve -- --applied 20260925000000_legal_acceptance
```

Esses comandos já foram executados neste ambiente; não reaplique o SQL. Outros ambientes precisam verificar o histórico antes da implantação. As duas pastas antigas continuam pendentes de reconciliação por seus responsáveis.

## Validação

```powershell
cd backend
npm.cmd test
npm.cmd run build
npm.cmd exec prisma validate
npm.cmd run test:legal-db
cd ../frontend
npm.cmd run build
npm.cmd run test:legal
```

O teste de banco exige build, migração e conexão configurada. Cria e consulta aceite/auditoria dentro de uma transação revertida deliberadamente, verificando depois que nenhum registro de teste permaneceu. Não altera dados existentes.

O teste de navegador exige Chrome (ou `CHROME_PATH` apontando para um navegador Chromium), usa um perfil temporário separado e servidor Vite na porta 5179. Verifica documentos sem login, links do login/cadastro, preservação do formulário, bloqueio sem aceite, payload com versões, acesso autenticado e ausência de overflow nos documentos em 1366 e 390 pixels. Requisições de cadastro nesse teste são simuladas; requisições HTTP reais ao roteador oficial são cobertas pelo Vitest, com banco simulado. A gravação real é verificada separadamente pelo teste transacional.

Resultados desta implementação: 39 testes aprovados em 5 arquivos; builds do backend e frontend aprovados; `prisma validate` aprovado; teste transacional no PostgreSQL aprovado; teste headless no Chrome aprovado. A apresentação da política em 390 pixels foi também inspecionada por captura de tela. `git diff --check` passou. Não houve commit, push, criação de branch, reset de banco ou exclusão de dados existentes.

## Revisão necessária antes de publicação

O código não identifica controlador, contato oficial, bases legais por finalidade, prazos de retenção, operadores de hospedagem, localidades, backups ou transferências internacionais. Essas pendências estão explícitas nos documentos. É necessário preencher e revisar essas informações antes da disponibilização pública. O Google Login não está implementado; o carregamento de fontes pelo Google Fonts está descrito. O schema prevê turmas e metas diárias, sem afirmar que todos esses recursos já estão disponíveis.

Referência para os direitos descritos: [LGPD, texto oficial](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm).

## Arquivos criados

- `backend/prisma/migrations/20260925000000_legal_acceptance/migration.sql`
- `backend/src/legal-versions.json`
- `backend/src/services/legal-acceptance.ts`
- `backend/src/services/legal-acceptance.test.ts`
- `backend/scripts/verify-legal-db.cjs`
- `frontend/src/legal.tsx`
- `frontend/scripts/test-legal.mjs`
- `docs/termos-privacidade.md`

## Arquivos alterados

- `backend/package.json`
- `backend/prisma/schema.prisma`
- `backend/src/controllers/auth-controller.ts`
- `backend/src/middlewares/error-handler.ts`
- `backend/src/repositories/auth-repository.ts`
- `backend/src/routes/auth-routes.ts`
- `backend/src/services/auth-service.ts`
- `backend/src/services/auth-service.test.ts`
- `frontend/package.json`
- `frontend/src/auth-gate.tsx`
- `frontend/src/main.tsx`
- `frontend/src/styles.css`
