# Integração — etapa 6: foto de perfil e personalização

Implementada na branch `entrega2809`, na aplicação React/TypeScript/Vite e no
backend existentes. As etapas anteriores e suas alterações locais foram
preservadas. Não houve acesso ao Supabase, alteração de `.env`/credenciais,
envio de e-mails, deploy, commit, push ou merge. Etapas 7 e 8 não foram iniciadas.

## Auditoria e decisões

Antes de editar arquivos foram verificados a branch, schema Prisma, modelo
`User`, rotas `/auth`, repositório de contas, sessão centralizada, cliente API,
moldura integrada do v0, páginas de perfil de ambos os perfis e dependências.

- Não existia campo/tabela de foto nem mecanismo de upload. O perfil já permitia
  editar o nome por `PUT /auth/nome`; foto, avatar e câmera eram indisponíveis.
- O cabeçalho, menu lateral e perfil mostravam iniciais. Esses mesmos pontos
  passaram a usar uma imagem compartilhada em contexto React, sem refazer telas.
- JWT, perfil consultado no banco, confirmação e `sessionVersion` continuam
  sendo verificados pelo middleware existente. Nenhum bypass foi introduzido.
- A sessão continua em `/auth/session`. A foto é consultada separadamente uma
  vez ao montar a moldura autenticada; nenhum conteúdo binário foi adicionado ao
  JWT ou a cada consulta de sessão. Navegar entre páginas não refaz esse fetch.
- Foi escolhido armazenamento privado **no PostgreSQL**, com uma imagem pequena
  por conta. Não há diretório público, filesystem de produção, bucket, serviço
  externo de avatares, nome/caminho de arquivo fornecido pelo cliente ou URL assinada.
- A biblioteca `sharp` foi adicionada e validada na versão **0.35.5**, com
  libvips **8.18.7**. A versão inicialmente instalada foi substituída após a
  auditoria npm; os testes foram repetidos com a versão corrigida.

## Endpoints e contratos

Todos usam `Authorization: Bearer <JWT>`, identidade do middleware e conta ativa
com e-mail confirmado e versão de sessão atual. Aluno, professor e administrador
podem gerenciar apenas a própria imagem. ADMIN não ganha leitura de fotos alheias.
Nenhuma rota aceita ID do titular, caminho de arquivo ou URL externa.

| Método e rota | Entrada | Resultado HTTP 200 |
| --- | --- | --- |
| `GET /profile/photo` | Sem parâmetros | Foto atual ou `{ "kind": "default" }` |
| `PUT /profile/photo/avatar` | JSON estrito `{ "avatarId": "scholar-1" }` | Avatar escolhido, substituindo qualquer foto |
| `PUT /profile/photo/image` | Arquivo binário; `Content-Type: image/jpeg`, `image/png`, `image/webp` ou `application/octet-stream` | WebP normalizado, substituindo escolha anterior |
| `DELETE /profile/photo` | Sem corpo ou JSON vazio | `{ "kind": "default" }`; idempotente |

Respostas possíveis:

```ts
type Photo =
  | { kind: 'default' }
  | { kind: 'avatar'; avatarId: string; version: string }
  | { kind: 'image'; dataUrl: string; version: string };
```

`dataUrl` contém exclusivamente `data:image/webp;base64,` e os bytes normalizados.
`version` é um UUID interno novo a cada substituição, não uma credencial. Não há
endpoint estático público de imagens, possibilidade de escolher outro proprietário
ou dependência de token em query string. Respostas da funcionalidade recebem
`Cache-Control: no-store` e `X-Content-Type-Options: nosniff`.

Erros tratados:

| Código | Situação |
| --- | --- |
| `400` | Falha ao receber o corpo binário |
| `401` | JWT ausente/inválido/expirado/revogado, conta excluída ou proprietário indisponível ao persistir |
| `403` | E-mail não confirmado ou perfil não autorizado pelo middleware |
| `404` | Rota de imagem de outro ID inexistente; não revela arquivo |
| `413` | Upload maior que 5 MiB (5.242.880 bytes) |
| `415` | Transporte não permitido, corpo não binário, SVG/executável/GIF ou assinatura não permitida |
| `422` | Avatar/parâmetros/campos não permitidos, imagem truncada, indecodificável, animada detectada ou além dos limites de dimensões |
| `500` | Falha interna inesperada, sem conteúdo da imagem na mensagem/log |

O corpo de upload é binário, não `multipart/form-data` ou JSON/base64. Não há
dependência de nome/extensão do arquivo; os campos MIME do navegador não decidem
o formato real. A rota autentica antes de armazenar em memória o corpo binário.

## Validação, armazenamento e exclusão

- Entrada: JPEG, PNG e WebP, no máximo 5 MiB. Conferência da assinatura seguida
  de decodificação real com `sharp`, limite de 16 milhões de pixels, dimensão
  individual máxima de 8.192 pixels e rejeição de múltiplas páginas detectadas.
- Saída: WebP estático, orientação aplicada, recorte central, até 512 × 512 pixels,
  sem ampliar imagens pequenas e sem EXIF, ICC ou bytes extras do arquivo original.
- O original não é persistido. O resultado armazenado tem limite de **256 KiB**,
  também imposto por constraint SQL. Imagens excessivamente complexas são rejeitadas.
- `ProfilePhoto.userId` é chave primária e FK: no máximo um registro por conta.
  Avatar e bytes são mutuamente exclusivos, com catálogo permitido validado no
  backend e em constraint. `User.profilePhotos` é uma relação de lista para
  permitir `deleteMany` aninhado mesmo quando não há foto; a PK continua impondo 0/1.
- Substituir faz upsert no mesmo registro e descarta os bytes antigos. Remover
  apaga somente esse registro; o avatar padrão usa as iniciais do nome atual.
- O endpoint oficial de exclusão da conta remove a foto na mesma transação da
  anonimização. Upload e anonimização bloqueiam primeiro a mesma linha de `User`;
  uma substituição concorrente não recria imagem para uma conta excluída.
- Exclusão física de `User` também remove a imagem por `ON DELETE CASCADE`.
  Não existem arquivos órfãos a limpar no servidor.
- RLS habilitada, sem políticas para clientes: papéis não proprietários e sem
  `BYPASSRLS` não acessam os registros diretamente, mesmo que recebam `SELECT`.
  Privilégios da tabela para `PUBLIC` são revogados. O backend deve conectar com
  papel confiável que possa acessar a tabela; **não** criar políticas públicas
  como solução para erro de permissão. Isso precisa ser conferido na homologação.
- Conteúdo não é enviado a logs, analytics, provedores de avatar ou SMTP. O front
  mantém a imagem apenas em memória; não a grava em localStorage/sessionStorage.
  Object URLs de prévia são revogadas ao trocar/cancelar/sair da tela.

## Interface e câmera

As páginas `/perfil` e `/professor/perfil` mantêm dados, edição de nome, abas e
estrutura da etapa 2. A etapa substitui apenas o aviso de foto indisponível.

- Galeria com seis personagens e dois símbolos educacionais, além do padrão.
  Todos são SVGs locais controlados pela aplicação; **uploads de SVG continuam
  proibidos**. Não são imagens geradas por um serviço externo em tempo de uso.
- Seleção, prévia, envio do dispositivo, remoção e confirmação/cancelamento
  explícitos, carregamento, erros, retry e sucesso. A foto anterior é mantida
  quando o backend rejeita uma alteração.
- Cabeçalho, conta no menu e perfil recebem imediatamente a escolha confirmada.
  O contexto é descartado ao sair/trocar de conta e ignora consultas atrasadas.
- A câmera usa `getUserMedia` somente após clicar em “Usar câmera”; áudio é
  desabilitado. Não há gravação de vídeo nem envio automático.
- Captura local por canvas, prévia, repetição, confirmação ou cancelamento. Só
  “Salvar foto” envia a captura para o mesmo pipeline de upload seguro.
- Tracks são encerradas após capturar, fechar, cancelar, Escape ou desmontar o
  perfil; permissões que retornam tardiamente após cancelar também são tratadas.
- Mensagens para permissão negada, câmera ausente, API incompatível, contexto
  inseguro e falha de reprodução. O usuário sempre pode escolher upload.
- Controles nativos acessíveis por teclado, rótulos, `aria-pressed` na seleção,
  estados de status/alerta, foco devolvido ao botão e layouts claro/escuro/móvel.

## Migration incremental

`backend/prisma/migrations/20261018120000_profile_photos/migration.sql` cria
somente `ProfilePhoto`, constraints, FK/cascade e proteção RLS. Não altera registros,
tabelas, enums ou migrations anteriores. Contas existentes começam sem foto e
continuam com iniciais, sem necessidade de backfill.

O diff Prisma não representa constraints CHECK/RLS no schema; sua execução e
proteção foram verificadas diretamente no PostgreSQL, além da comparação de schema.

## Arquivos desta etapa

| Arquivo | Mudança |
| --- | --- |
| `backend/package.json` e `backend/package-lock.json` | Dependência de processamento de imagem |
| `backend/prisma/schema.prisma` | Modelo privado e relação com User |
| `backend/prisma/migrations/20261018120000_profile_photos/migration.sql` | Migration aditiva, constraints e RLS |
| `backend/src/services/profile-photo-service.ts` | Decodificação, persistência e isolamento |
| `backend/src/routes/profile-photo-routes.ts` | Quatro endpoints autenticados e contratos |
| `backend/src/routes/profile-photo.test.ts` | 43 testes novos |
| `backend/src/repositories/auth-repository.ts` | Exclusão transacional da foto ao anonimizar conta |
| `backend/src/server.ts` | Registro da rota de foto |
| `backend/scripts/test-profile-photo-db.ts` | Persistência, ACL, RLS, exclusão e concorrência reais |
| `backend/scripts/test-migrations-local.cjs` | Validação da migration e da suíte nova |
| `frontend/src/profile-photo.tsx` | Contexto compartilhado, avatar, upload e câmera |
| `frontend/src/profile-photo.css` | Estilos locais e responsivos |
| `frontend/src/integration-shell.tsx` | Integração ao perfil/cabeçalho/menu existentes |
| `frontend/public/avatars/scholar-1.svg` a `scholar-6.svg` | Seis personagens locais |
| `frontend/public/avatars/books.svg` e `justice.svg` | Dois símbolos educacionais locais |
| `frontend/scripts/test-session.mjs` | Contratos isolados, câmera simulada e regressões |
| `docs/evidence/integration-stage6/*.png` | Três capturas de validação com dados exclusivamente de teste |
| `docs/integration-stage6.md` | Auditoria, contratos, testes e limites |

São **27 arquivos** nesta etapa, contando os oito avatares e três capturas.
Outros arquivos já modificados no início do trabalho não pertencem a esta etapa.
Os hashes do início foram comparados: main/dashboard, CSS original, CRUD,
metas/relatórios, diagnóstico, trilhas, turmas/simulados e migrations anteriores
permaneceram intactos. Não foram alterados os middlewares ou regras de autenticação.

## Validação local

- **354 testes backend em 18 suítes aprovados**, incluindo 43 novos: JWT,
  confirmação, perfis atuais, revogação, exclusão, isolamento, adulteração de
  titular/URL, formato real, PNG/JPEG/WebP, limites, metadados e conteúdo extra.
- TypeScript de frontend e backend aprovado; builds do Vite e backend aprovados
  em pastas próprias de validação, preservando as saídas existentes.
- PostgreSQL **17.11 descartável**: diretório próprio em temp, bind 127.0.0.1,
  porta efêmera e verificação de URL/diretório antes de dados. Nenhuma URL remota
  é aceita pelo harness; configurações de SMTP/Google são anuladas no processo.
- Doze migrations aplicadas em instalação nova; reaplicação sem pendências,
  atualização com dados preservados, hashes anteriores intactos e diff sem drift.
- **37 cenários reais de banco/HTTP**: 27 das etapas anteriores e 10 de fotos,
  incluindo acesso direto negado por RLS, leitura de outra conta, upload inválido,
  reprocessamento, substituição, remoção, revogação, novo login, reconexão,
  anonimização, cascade e corrida entre upload e exclusão. Cluster encerrado.
- **60 cenários de navegador aprovados**, incluindo os 48 anteriores e 12 novos.
  API simulada e rede externa bloqueada; fixtures ficam somente nos scripts.
  Recarga e novo login recuperam avatar; uploads e captura usam o contrato binário.
- Câmera com dispositivo artificial do Chrome: permissão real do navegador
  concedida/negada, captura/repetição, liberação das tracks, Escape, navegação,
  resposta tardia, erro de dispositivo e API ausente. **Não foi câmera física.**
- `test-legal.mjs` aprovado: documentos/consentimento, dashboard, diagnóstico,
  trilha, rotas, responsividade, reenvio e recuperação com serviços isolados.
- `git diff --check` aprovado; avisos de LF/CRLF de arquivos anteriores não foram
  tratados por reformatar ou sobrescrever trabalho existente.

Falhas durante a preparação foram corrigidas: permissões do sandbox para Chrome,
PostgreSQL/esbuild e download; tipo TypeScript de bytes; helper de 404 e seletores/
cabeçalhos dos mocks. As suítes finais passaram. A auditoria npm ainda retorna
código de saída 1 por três alertas altos na cadeia existente
`prisma → @prisma/config → deepmerge-ts`, relacionados à recursão de objetos.
O npm sugere atualização principal do Prisma; não foi feita atualização forçada
ou alteração das etapas anteriores. Na consulta final, não há alerta para sharp.

## Evidências visuais

Capturas de dados exclusivamente de teste, revisadas em desktop/celular e nos
temas claro/escuro, sem overflow horizontal:

- [Galeria e prévia — desktop claro](evidence/integration-stage6/photo-editor-light-1366.png)
- [Galeria e prévia — celular escuro](evidence/integration-stage6/photo-editor-dark-390.png)
- [Prévia de câmera simulada](evidence/integration-stage6/photo-camera-simulated.png)

## Pendências de produção e limites

- Nenhuma migration, publicação ou acesso remoto foi realizado. Aplicar a migration,
  gerar o Prisma Client e implantar frontend/backend no ambiente real exigem
  autorização separada e homologação das permissões do papel de banco/RLS.
- PostgreSQL persistente é o armazenamento da foto; filesystem efêmero do servidor
  não participa dessa solução. Avaliar quota, tamanho dos backups, capacidade e
  volume de leitura: até 256 KiB por foto e aproximadamente 33% extras na resposta
  base64. Não houve teste de carga ou homologação da infraestrutura real.
- Para grande escala, uma futura migração a object storage privado pode ser
  considerada. Não foi configurado serviço externo nesta etapa.
- Não registrar corpos/data URLs no proxy, APM ou analytics; manter TLS e acesso
  restrito ao banco/backups. Exclusão remove a cópia ativa; cópias em backups
  dependem da política de retenção/eliminação da operação, conforme a LGPD.
- Homologar HTTPS, permissões de câmera e eventual Permissions-Policy da hospedagem,
  dispositivo físico e Safari/iOS/Android reais. Verificar limites/timeouts e
  controle de taxa do proxy para o upload; só o ambiente local foi exercitado.
- Avaliar separadamente os três alertas npm da cadeia Prisma; uma atualização
  principal exige compatibilidade, revisão e regressão próprias.
- Não há recorte manual, sincronização imediata entre abas ou acesso de professor
  às fotos de alunos. Esses recursos não foram inventados para esta etapa.
- SMTP/Gmail e envio real de e-mail continuam pendentes e fora do escopo. A
  confirmação não foi desativada: testes usam contas confirmadas no banco isolado.

A etapa 7 aguarda autorização explícita após revisão desta entrega.
