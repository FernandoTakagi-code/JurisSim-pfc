# Estabilização e auditoria antes da etapa 8

## Escopo e referência inicial

Data de referência da solicitação: 19/10/2026. Branch `entrega2809`, HEAD
`2dfcb04`. Esta atividade não autoriza a etapa 8, publicação ou commits.
Não acessar Supabase, enviar e-mails, alterar ambientes/credenciais ou migrations
históricas. Preservar o trabalho local de todos os desenvolvedores.

Antes das correções foram executados `git status --short`, `git log`,
`git diff --stat`, leitura de diffs pertinentes, `git diff --check` e
`git ls-files -u`. Foram consultados os relatórios das etapas 1–7, schema,
rotas, serviços e frontend. Não há entradas Git em conflito. Foram registrados
hashes dos arquivos locais e, separadamente, dos arquivos de ambiente em
arquivos temporários, sem registrar seu conteúdo. Há 39 arquivos rastreados
modificados, além de arquivos novos das etapas anteriores. Esse diff acumulado
não corresponde apenas à presente atividade.

O histórico da branch já contém autenticação, confirmação obrigatória, perfil
Aluno/Professor, CRUD do professor e dashboard anteriores à integração. Os sete
incrementos de integração continuam locais; não se deve recriar em commits o
trabalho já presente em `2dfcb04` e seus ancestrais. Há commits de testes em
outras referências locais e um stash de configuração Vite: referências foram
somente consultadas, não aplicadas nem removidas. Ausência de marcadores Git
não prova ausência de conflitos semânticos; estes são avaliados por leitura e
regressão, sem atribuir autoria a alterações que o diff não permite distinguir.

Referência antes de mudanças: **382 testes backend / 19 suítes aprovados**, com
variáveis de processo isoladas, banco inacessível em loopback e provedores vazios.

## Problemas registrados antes de corrigir

1. Auditoria npm do frontend detectou `source-map-js@1.2.1`, transitivo de
   `vite@7.3.6 -> postcss@8.5.28`, vulnerável a bloqueio do event loop ao consumir
   offsets maliciosos de sourcemaps. Correção `1.2.2` satisfaz `^1.2.1` do PostCSS.
   Impacto inferido: ferramenta de desenvolvimento/build, sem endpoint conhecido
   que receba sourcemaps de usuários na aplicação publicada. Ainda deve ser
   corrigido; não é necessário atualizar Vite/PostCSS ou introduzir override.
2. `feedback-service.ts` registra o erro bruto do provedor externo. Isso pode
   expor metadados ou conteúdo sensível em logs. Manter o fallback já existente,
   registrando somente uma mensagem fixa e testando que o erro não é repassado.
3. O botão Sair da tela de erro de consulta de sessão chama `endSession`
   diretamente. Deve tentar `logoutSession`, como o shell, preservando a proteção
   contra respostas atrasadas e o aviso quando a revogação não for confirmada.
4. Os três alertas altos do backend continuam na cadeia
   `prisma@6.19.3 -> @prisma/config@6.19.3 -> deepmerge-ts@7.1.5`.
   A correção indicada pelo npm é Prisma `7.10.1` (major); não autorizada.
5. Gmail real e OAuth externo não estão homologados. Confirmação permanece
   obrigatória; indisponibilidade de entrega não será contornada.
6. Prontidão de produção ainda depende de CORS restrito (servidor usa `cors()`),
   HTTPS/proxy, limites compartilhados entre réplicas, backups/restauração,
   monitoração, retenção e política LGPD. São requisitos de infraestrutura a
   definir, não evidência de um deploy já configurado.

### Plano de correção e reversão registrado previamente

- Atualizar somente o transitivo `source-map-js` dentro do intervalo já aceito,
  sem alteração major nem `audit fix --force`. Conferir diff do lockfile e
  repetir auditoria, TypeScript, builds e regressões.
- Reversão: restaurar **somente** o lockfile frontend a partir da cópia local
  feita nesta atividade e reinstalar a árvore anterior; não usar reset/checkout
  de todo o trabalho. Essa reversão reintroduziria o alerta e não foi executada.
- Remover o log bruto da IA e centralizar o logout da tela de erro, com testes
  específicos. Nenhuma mudança de layout, schema ou funcionalidade nova.

## Dependências: evidências e limites

- [Alerta source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q):
  versões `>=1.0.0 <1.2.2`; correção `1.2.2`.
- [Alerta deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx):
  exaustão de pilha ao mesclar grafos recursivos; versões `<8.0.0`; correção `8.0.0`.
  Os três alertas são uma vulnerabilidade transitiva e seus dois dependentes,
  não três falhas independentes. Prisma é devDependency direta; o cliente
  `@prisma/client@6.19.3` é dependência de runtime e usa a mesma versão do CLI.
  Não há rota conhecida que entregue um grafo JS arbitrário ao carregador de
  configuração Prisma. Isso reduz a exposição identificada, não elimina o risco
  da cadeia de ferramentas nem substitui uma correção.
- A consulta npm das versões estáveis Prisma 6 termina em `6.19.3`; não foi
  encontrada correção compatível nessa linha. Forçar deepmerge 8 por override
  seria uma substituição major transitiva sem contrato de compatibilidade.
- [Guia oficial Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7):
  avaliar ESM/CommonJS, configuração de datasource, geração do cliente,
  adaptadores/conexões, TLS, ambiente Node e ferramentas antes de migrar.
  Recomendação: atividade própria autorizada, atualização coordenada do CLI e
  cliente e repetição da validação em PostgreSQL descartável.

## Validação final

| Verificação nesta atividade | Resultado e alcance |
| --- | --- |
| Backend `vitest run src` | **385 testes / 20 suítes aprovados**; referência 382 + 3 de feedback; repositórios/provedores simulados nas suítes unitárias/HTTP |
| TypeScript backend/frontend | `tsc --noEmit --incremental false`, ambos aprovados |
| Build backend | `tsc --outDir .validation-pre-stage8-build --incremental false`, aprovado |
| Build frontend | Vite 7.3.6 aprovado; CSS 46,16 kB / JS 330,94 kB, saída exclusiva de validação, API loopback e Google vazio no processo |
| Navegador com API simulada | **65 cenários aprovados**, 63 anteriores + 2 para logout da tela de erro; rede externa bloqueada; desktop 1366px / celular 390px, claro/escuro/sistema |
| Regressão `test-legal.mjs` | Aprovada: documentos/aceite/formulários; dashboard original/navegação/diagnóstico/trilha; confirmação/reenvio/reset com sessão ativa |
| Auditoria frontend depois do patch | **0 vulnerabilidades** reportadas pelo npm; `source-map-js@1.2.2` confirmado por `npm ls` |
| Auditoria backend | **3 altas restantes**, exclusivamente a cadeia documentada acima |
| PostgreSQL descartável / API real | **43 cenários aprovados**: 7 revogação, 6 histórico, 7 turmas/simulados, 7 metas/relatórios, 10 fotos, 6 autenticação |
| Navegador integrado sem mock de fetch | **7 cenários aprovados** com aplicação React/Vite, HTTP/backend e PostgreSQL reais locais; somente transporte de e-mail substituído por caixa em memória exclusiva do teste |
| Migrations/schema | 12 aplicadas em instalação nova; segunda aplicação sem pendências, upgrade com dados históricos preservados, hashes históricos intactos e drift zero nos dois bancos locais |

O sandbox inicialmente impediu o esbuild de ler a configuração, o Chrome de
conectar ao depurador e o pg_ctl de iniciar o cluster. As execuções foram
repetidas com execução local autorizada fora dele; não foram modificados testes
para ignorar falhas. A primeira consulta npm também foi bloqueada pela rede do
sandbox; os resultados de auditoria vieram das consultas repetidas com acesso.
Nenhum servidor da aplicação foi iniciado usando o `.env` real.

Capturas desta execução estão nos diretórios temporários `jurissim-session-lIAONa`
e `jurissim-legal-64dxlt`; dashboard desktop e relatório mobile foram inspecionados
visualmente. As capturas de autenticação real local estão em
`jurissim-auth-stage7-BHFAUD`. Capturas contêm fixtures de teste, não informações de alunos reais.
Não foi observado overflow nos cenários automatizados. Isso não equivale a
homologação de todos os dispositivos/navegadores ou teste manual exaustivo.

## Correções e arquivos desta atividade

| Arquivo | Mudança |
| --- | --- |
| `frontend/package-lock.json` | Somente versão/resolved/integrity de source-map-js 1.2.1 para 1.2.2; manifest e demais pacotes preservados |
| `backend/src/services/feedback-service.ts` | Falha do provedor registra somente mensagem fixa; fallback local preservado |
| `backend/src/services/feedback-service.test.ts` | Três testes: sem chave não chama provedor; erro bruto não é logado; sucesso/resposta vazia preservados; SDK inteiramente simulado |
| `frontend/src/main.tsx` | Sair na tela de erro tenta revogação central; nenhum JSX do dashboard/CSS/design modificado |
| `frontend/scripts/test-session.mjs` | Dois cenários novos para saída da tela de erro com sucesso e indisponibilidade remota |
| `docs/pre-stage8-stabilization.md` | Auditoria, decisões prévias, validações e plano de commits |

O artefato de build anterior em `dist` foi preservado. Não confundir arquivos
modificados nesta atividade com o diff acumulado das etapas 1–7. Os avisos
LF/CRLF preexistentes do Git não são conflitos nem justificam reformatar tudo.

Verificação final por SHA-256: todos os arquivos anteriores preservados, exceto
os quatro arquivos existentes explicitamente listados nesta tabela; o teste de
feedback e este relatório são novos. `.env` e exemplos foram conferidos à parte
e permaneceram idênticos. A árvore gerada em `node_modules` foi atualizada somente
pelo patch transitivo e pela geração do Prisma Client no harness. `git diff
--check` aprovado e branch reconfirmada como `entrega2809`.

## Funcionalidades e conexões revisadas

| Área da aplicação única | Contratos reais e isolamento |
| --- | --- |
| Cadastro/login/sessão | `/auth/register`, `/auth/login`, `/auth/session`; identidade/perfil atuais no banco; sessão limitada de conta pendente |
| Confirmação/reenvio | `/auth/email-verification`, `/auth/email-verification/confirm`; sem token/link devolvido no reenvio autenticado |
| Recuperação/reset/logout/exclusão | `/auth/password-recovery`, `/auth/password-reset`, `/auth/logout`, `/auth/conta`; operações persistidas, sem credenciais do provedor no cliente |
| Perfil/nome | `PUT /auth/nome` e reconsulta da sessão; sem campo de role editável pelo cliente |
| Questões | CRUD `/questoes`; autoria ou ADMIN para escrita; questões usadas bloqueadas; turma/visibilidade consultadas no backend; alternativas do aluno sem gabarito |
| Diagnóstico/trilhas | `/diagnostics` e `/trilhas`; tentativas do titular; questões públicas na geração; DTO de resultado e exercícios existentes |
| Dashboard/histórico/desempenho | `/students/me/overview`, `/students/me/activities`, `/students/me/diagnostics` e resultados individuais; último diagnóstico persistido; ausência de score representada como ausente |
| Turmas/alunos | `/turmas`, matrícula por convite e alunos; vínculo/gestão verificados, convite aleatório armazenado como hash, rotação e expiração, matrícula única |
| Simulados | `/avaliacoes`, publicação/tentativas/respostas/finalização; matrícula vigente, uma tentativa por aluno/prova, duração pelo servidor, publicado não editável |
| Metas | `/goals`; dono derivado da sessão, progresso de respostas reais por dia em São Paulo, conclusão verificada e snapshot persistido |
| Relatórios | `/reports/classes` e consultas de turma/indivíduo; professor/ADMIN precisa vínculo explícito de responsável, somente provas da turma e alunos atualmente matriculados |
| Fotos/avatares | `/profile/photo`, `/avatar`, `/image`; dono da sessão, JPEG/PNG/WebP decodificados e regravados, câmera com confirmação; bytes privados no PostgreSQL, sem bucket/URL pública |

As páginas usam o mesmo cliente autenticado e sessão central, navegação por
History/popstate e perfil validado pelo servidor. Os testes cobrem recarga,
voltar/avançar, login novo, 401/403, alteração de perfil, conta excluída, tokens
revogados, dados insuficientes e estados vazios. Não foram encontrados dados
demonstrativos utilizados como resultados reais nos fluxos revisados.

As preferências de notificações continuam explicitamente indisponíveis; não são
uma funcionalidade concluída. Os botões antigos “Turmas/Desempenho em breve” e a
navegação antiga permanecem no código original do professor, ocultos pelo shell
integrado; as entradas visíveis correspondentes já usam páginas reais. Preservar
esse código evita uma limpeza invasiva sem necessidade. Nenhum layout foi trocado.

## Estado da autenticação e dos e-mails

- JWT HS256, emissão de oito horas, `exp` obrigatória; cada request autenticado
  consulta usuário ativo, perfil atual, confirmação e `sessionVersion`.
- Reset altera hash bcrypt, incrementa versão, consome token e invalida outros
  links ativos na mesma transação. Logout revoga **todas as sessões do próprio
  usuário**, preservando outros usuários. Se o servidor não confirmar o logout,
  o cliente remove a sessão local e mostra aviso, sem afirmar revogação remota.
- Contas pendentes não acessam recursos protegidos; sessão limitada e reenvio
  continuam disponíveis. A exclusão anonimiza nome/e-mail/hash, bloqueia JWT e
  remove foto ativa atomicamente. Registros acadêmicos e auditoria continuam
  relacionados ao identificador: não é promessa de apagamento integral de dados.
- Tokens aleatórios ficam como SHA-256; confirmação 60min e recuperação 30min,
  uso único/expiração/cotas e emissão concorrente avaliados nos testes.
- Os dois templates têm versões texto/HTML, links para `/#/verificar-email`
  e `/#/reset-password`, TTL e orientação para ignorar solicitação desconhecida.
  A base passa por validação de URL (HTTPS em produção, sem credenciais/query/hash).
  Hash de link é removido da barra pelo frontend após leitura em memória.
- Transporte preparado: Nodemailer, smtp.gmail.com:587, STARTTLS obrigatório,
  mínimo TLS 1.2, timeouts, debug/logger desabilitados, remetente limitado a
  `jurissimplataforma@gmail.com`. Falha de envio não confirma conta e invalida
  o link emitido; recuperação preserva resposta neutra para existência da conta.
- **Bloqueio externo atual:** Google restringe senha de aplicativo; não foram
  acessados Google/Gmail, solicitadas senhas, usadas contas alternativas ou
  executados `email:verify`/envios reais. Os arquivos de ambiente não foram usados
  para validar presença ou conteúdo de credenciais. Prontidão do adaptador é
  diferente de configuração real e entrega homologadas.
- Após a liberação, o responsável configura privadamente o Gmail oficial e
  `APP_PUBLIC_URL` HTTPS. Com autorização separada, executar `email:verify`
  (conexão/AUTH, sem mensagem), depois cadastro/reenvio/reset com destinatário
  controlado; conferir entrega/spam, remetente, domínio/origem e abertura dos
  links na hospedagem. Procedimento em [email-setup.md](email-setup.md).
- Google: biblioteca valida ID token, assinatura/audiência/expiração, e-mail
  verificado e nonce. Validador é simulado nas suítes; consentimento/SDK e origens
  reais dependem de homologação posterior. A identidade legada usa e-mail, sem
  vínculo estável com `sub`; não há associação automática a conta com senha.

## Banco e migrations

Existem **12 migrations**: seis históricas, reconciliação de autenticação,
sessionVersion, índices de histórico, turmas/simulados, índices metas/relatórios
e ProfilePhoto. Nenhuma migration/schema foi alterada ou criada nesta auditoria.
Não há justificativa identificada para DDL adicional.

Os índices `MetaDiaria(alunoId,data,id)` e `Resposta(simuladoId,respondidoEm)`
estão no schema e migration da etapa 5. ProfilePhoto usa PK por usuário,
FK com cascade e check de avatar permitido **ou** imagem de até 256 KiB; RLS
habilitada sem políticas públicas e privilégios PUBLIC revogados. O backend
precisa papel confiável com permissões corretas; testes locais não comprovam
grants/RLS do Supabase. A validação de drift não substitui inspeção das
constraints/RLS, exercitadas pelos testes SQL e de fotos.

Harness: `node scripts/test-migrations-local.cjs "C:\Program Files\PostgreSQL\17\bin"`.
Criou cluster PostgreSQL **17.11** próprio em loopback/porta efêmera, validou
diretório/URL antes dos testes, executou as 43 verificações HTTP/SQL e os sete
cenários Chrome reais e encerrou o cluster. Artefatos mantidos em
`%TEMP%\jurissim-migrations-7tgPFV`; nenhum cluster existente foi reutilizado.
A execução inicial negada pelo sandbox deixou apenas artefatos temporários
de inicialização em `jurissim-migrations-sEEVvb`, sem testes de banco aprovados
nessa tentativa. Não se usou `db push`, `migrate reset` ou banco remoto.

Estado de produção é **desconhecido**, pois não houve consulta remota. Se o remoto
corresponder ao histórico do HEAD, seis migrations locais posteriores precisam
de implantação planejada. Não presumir que todas estão pendentes: antes da
publicação, com autorização própria, comparar ledger/backup e planejar janela
para índices e DDL que podem bloquear. Nunca editar migrations já aplicadas.

## Plano de commits pendentes — para revisão, sem execução

Nenhum `git add`, commit, push, merge, rebase, reset ou aplicação de stash foi
executado. Títulos abaixo descrevem trabalho **incremental local**; não substituem
commits históricos nem atribuem todo o sistema a esta atividade.

| Ordem | Título proposto em português | Conteúdo a separar/revisar |
| --- | --- | --- |
| 1 | `fix: reconciliar migrations de autenticação do Prisma` | Reconciliação incremental, ajustes de schema/enums e relatório; preservar seis migrations antigas |
| 2 | `fix: exigir confirmação e validar permissões atuais da sessão` | Middleware/consulta de usuário ativo, rotas limitadas e testes de segurança anteriores à integração |
| 3 | `fix: revogar sessões após redefinição de senha` | Migration sessionVersion, emissão/validação/reset transacional e seus testes/relatório |
| 4 | `feat: reforçar segurança e preparar integração do sistema` | Etapa 1: autoria/privacidade de questões, sessão/API frontend central, navegação por perfil e testes |
| 5 | `feat: integrar interface visual e navegação do JurisSim` | Etapa 2: shell/CSS/navegação/perfil/temas, adaptação do código original, sem duplicar projeto |
| 6 | `feat: integrar histórico e desempenho do aluno` | Etapa 3: repositório/rotas/UI de histórico, índices e recuperação do último resultado |
| 7 | `feat: integrar turmas e simulados` | Etapa 4: modelos/migration de avaliações, serviços/rotas/UI e testes de matrícula/tentativas |
| 8 | `feat: implementar metas de estudo e relatórios` | Etapa 5: índices, serviços/rotas/páginas/gráficos e testes |
| 9 | `feat: implementar avatares e fotos de perfil` | Etapa 6: migration/RLS/serviço/rotas, sharp e lockfile backend, UI/SVG e testes |
| 10 | `fix: corrigir autenticação e reforçar segurança das sessões` | Etapa 7: cotas, concorrência de tokens, login/perfil/nonce, logout, SMTP oficial, formulários e testes |
| 11 | `fix: estabilizar logout e proteger logs do provedor de IA` | Correções pontuais desta atividade e testes novos; patch relativo ao estado inicial local, após commits-base |
| 12 | `fix: atualizar dependência vulnerável de mapas de código` | Apenas lockfile frontend/source-map-js 1.2.2 e evidência de auditoria |
| 13 | `docs: registrar auditoria de estabilização antes da etapa 8` | Este relatório e resultados finais |

**Esses limites ainda não são patches prontos para commit.** Arquivos como
`schema.prisma`, `main.tsx`, `auth-service.ts`, repositórios de autenticação,
`server.ts` e os scripts de teste contêm várias etapas sobrepostas. Adicionar
arquivos inteiros em sete lotes produziria commits misturados ou quebrados.
É necessário recuperar snapshots intermediários confiáveis ou preparar hunks
com dependências e validar cada árvore completa antes de aprovar a sequência.
Não fabricar versões históricas a partir de títulos ou números de testes.

Por isso, a proposta não é fazer agora sete commits automáticos nem um commit
gigante misturando etapas. Na revisão, confirmar se existem snapshots/checkpoints
das etapas. Na ausência deles, manter os trechos compartilhados pendentes até
definir uma divisão técnica revisável; qualquer alternativa de consolidação exige
nova decisão explícita. Mudanças de ambiente/exemplos e Vite preexistentes ficam
fora de staging automático; revisar autoria/intenção sem copiar credenciais.
Commits em outras referências e o stash não devem ser incorporados sem análise
específica; não foi encontrada marcação das sete etapas no histórico da branch.

## Prontidão e classificação das pendências

| Classificação | Pendência e condição de encerramento |
| --- | --- |
| **Bloqueadora para produção** | Gmail oficial: liberar senha de aplicativo e homologar entrega/links sem contornar confirmação |
| **Bloqueadora para produção** | Infraestrutura ainda não homologada: HTTPS/certificado, domínio, fallback SPA, API/origem, proxy e segredo JWT forte fora do repositório |
| **Bloqueadora para produção** | Banco remoto ainda não auditado: backup com restauração ensaiada, ledger/migrations, papel de backend/grants/RLS, conexões/TLS e janela DDL aprovados |
| **Bloqueadora para produção** | Resolver ou formalmente avaliar/aceitar risco dos três alertas altos Prisma; major depende de autorização, não foi silenciado |
| **Bloqueadora para produção** | Definir retenção/eliminação/acesso a dados e backups, responsabilidades LGPD, logs sem corpos/tokens/fotos e procedimento de incidente |
| **Importante, mas não bloqueadora** | OAuth real não homologado; para oferecer o botão Google na publicação, homologação passa a ser condição obrigatória desse recurso; manter indicação de indisponibilidade enquanto não configurado |
| **Importante, mas não bloqueadora** | Revisar CORS `cors()` para allowlist explícita antes de expor API; Bearer é explícito e não há cookie de sessão, mas regra `/auth` de Origin não restringe o resto da API |
| **Importante, mas não bloqueadora** | Cotas HTTP são por processo, sem compartilhamento; definir IP/proxy confiável, limites de upload/concorrência e controle distribuído se houver réplicas |
| **Importante, mas não bloqueadora** | Medir carga/planos/latências, pool e volume de fotos BYTEA/backups; índices e paginação não comprovam capacidade de produção |
| **Importante, mas não bloqueadora** | Monitoração/alertas operacionais sem dados sensíveis, health/readiness e procedimento de falha; hoje logs são básicos e health não prova conexão com banco |
| **Importante, mas não bloqueadora** | Rever identidade Google por `sub` e normalização/collisões de e-mail antes de ampliar vinculação/troca de endereço; regras históricas de caixa foram preservadas |
| **Importante, mas não bloqueadora** | Diagnóstico/trilha legados não têm a mesma cobertura de concorrência de resposta/finalização dos simulados de turma; não houve ensaio de corrida dedicado nesta auditoria, sem afirmar atomicidade desses fluxos |
| **Melhoria futura** | Sessões por dispositivo/HttpOnly/refresh, política de CSP/XSS e retenção/expurgo de tokens; JWT atual fica em sessionStorage e exige proteção contra scripts na mesma origem |
| **Melhoria futura** | Testes em hardware/câmera/Safari/iOS/Android, notificações, limpeza do código oculto legado; não são funcionalidades implementadas nesta atividade |

Não há configuração de cookies de autenticação a auditar: o sistema usa Bearer
em sessionStorage. Um redesenho para cookies precisa revisar HttpOnly/Secure/
SameSite/CSRF, não apenas trocar uma opção. Foto é persistida no banco privado,
até 256 KiB, com amplificação base64 aproximada de 33% na resposta; não usar
log de corpo no proxy/APM. Sugestão de backup: definir periodicidade/RPO/RTO,
criptografia, acessos restritos, retenção e ensaiar restauração antes do deploy;
nenhuma política remota foi verificada ou configurada aqui.

## Checklist de revisão antes da etapa 8

- [x] Branch, histórico/diff/conflitos, relatórios anteriores e integração revisados.
- [x] Falhas pontuais registradas antes da correção e sem troca de design.
- [x] Backend, TypeScript, builds, navegador simulado e auditoria npm repetidos.
- [x] Persistência/API/navegador real local aprovados e cluster encerrado.
- [x] Sem migração nova, ambiente real, envio real ou alteração de credenciais.
- [ ] Usuário revisar relatório, limites de homologação e plano de commits.
- [ ] Autorizar explicitamente qualquer commit/major/deploy/etapa futura.

O projeto pode seguir para **planejamento e revisão do escopo da etapa 8** após
a revisão desta auditoria; isso não significa publicação segura nem autorização
de implementação. Os bloqueios acima impedem declarar prontidão de produção.
