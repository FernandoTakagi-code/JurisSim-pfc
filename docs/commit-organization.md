# Organização dos commits locais antes da etapa 8

Esta atividade foi autorizada explicitamente pelo usuário após a estabilização.
Branch exclusiva: `entrega2809`. Base anterior: `2dfcb04`. Nenhum commit existente
será reescrito, duplicado, datado retroativamente ou retirado de outra branch.
Não há autorização para push, merge, deploy ou etapa 8.

## Auditoria e critério de separação

Foram conferidos status, histórico da branch e outras referências locais,
diffs de código/schema/configuração, índice vazio, ausência de conflitos Git,
relatórios de integração 1–7 e `pre-stage8-stabilization.md`.
Os recursos novos ainda não constam do histórico desta branch. Autenticação,
dashboard e CRUD anteriores já estão registrados e serão preservados.

Não existem snapshots completos confiáveis de cada etapa. Os inventários
temporários anteriores são hashes, não cópias de todas as versões intermediárias.
Portanto, os commits abaixo são uma **divisão técnica do incremento acumulado**,
não uma reprodução artificial da cronologia de desenvolvimento.

- O schema e as seis migrations aditivas formam a base compartilhada dos módulos.
  Isso mantém válidas as referências Prisma de autenticação, questões e fotos.
- Autenticação/autorização reúne incrementos de segurança anteriores, etapa 1
  e backend da etapa 7: repositórios, JWT, confirmação, cotas, SMTP e testes
  compartilham arquivos e contratos e não serão divididos em estados inventados.
- Histórico, turmas/simulados, metas/relatórios e fotos são separados por módulo
  de backend. Somente os imports e registros de rotas pertinentes em `server.ts`
  serão adicionados a cada commit, sem alterar o arquivo funcional em disco.
- A interface integrada reúne etapas 2–7: `main.tsx`, shell, sessão, rotas,
  páginas e avatares dependem uns dos outros. O frontend será registrado após
  todos os endpoints necessários, preservando seu estado final e o dashboard.
- Scripts de homologação compartilhados, evidências de estabilização, correção
  do log da IA e patch transitivo de dependência ficam no último grupo.

As datas e declarações de ausência de commits nos relatórios anteriores são
registros históricos das respectivas entregas e não serão reescritas como se
os commits já existissem durante sua implementação.

## Sequência aprovada pelo escopo desta solicitação

| Ordem | Commit | Conteúdo |
| --- | --- | --- |
| 1 | `fix: reforçar segurança e reconciliar a base Prisma do JurisSim` | Schema final, seis migrations novas, segurança das sessões, e-mail obrigatório, roles atuais, autoria/privacidade de questões, SMTP oficial, exemplos sem segredos e testes associados |
| 2 | `feat: integrar histórico e desempenho do aluno no backend` | Consultas por titular, resultados de diagnóstico/trilha, indicadores reais e registro incremental de rotas |
| 3 | `feat: integrar turmas e simulados no backend` | Gestão, convite/matrícula, publicação, respostas/resultados persistidos, permissões e testes |
| 4 | `feat: implementar metas de estudo e relatórios no backend` | Metas do titular, progresso verificado e relatórios restritos à turma autorizada |
| 5 | `feat: implementar avatares e fotos de perfil no backend` | Processamento seguro, armazenamento privado, exclusão transacional, sharp e testes |
| 6 | `feat: integrar interface visual e navegação aos serviços reais` | Frontend único React/Vite, sessão, perfil, dashboard original, CRUD, páginas reais e avatares locais; inclui o logout central da tela de erro já estabilizado |
| 7 | `chore: estabilizar aplicação e registrar homologação local` | Log seguro da IA, source-map-js corrigido, testes de navegador/DB compartilhados, relatórios e configuração Vite local preexistente |

Títulos ajustados ao conteúdo real: os commits 2–5 entregam os módulos do
backend; o commit 6 conecta as interfaces correspondentes. Não se exige um
número de commits por etapa, nem se afirma que cada commit é uma publicação.
Os corpos das mensagens documentam essas dependências.

## Preservação e arquivos sensíveis

O inventário e as cópias dos arquivos pendentes não secretos serão mantidos em
diretório temporário fora do repositório. Hashes das fontes/documentos e dos
ambientes serão comparados antes e depois; ambientes não serão copiados para
commits nem exibidos. Nenhum arquivo de implementação será editado nesta
organização. O índice inicial estava vazio.

`.env`, `.env.local`, credenciais, `node_modules`, `dist`, logs, perfis Chrome,
bancos descartáveis, arquivos auxiliares da organização e caches ficam fora
dos commits. `backend/.env.example` contém apenas adição documentada do Gmail
oficial e senha de aplicativo vazia, sem uma senha real. O restante do exemplo
será inspecionado sem divulgar valores. Não há mudança de credencial.

`frontend/vite.config.ts` já tinha `.trycloudflare.com` em `allowedHosts` antes
desta organização. Será registrado como configuração de desenvolvimento
preexistente, sem reformatar, abrir túnel ou alterar infraestrutura.

Há trabalho de outros integrantes no histórico e em referências locais; não
será feito cherry-pick, aplicação de stash ou mudança de autoria configurada.
Não é possível inferir autoria individual de todo trecho ainda não commitado.
As mensagens registram o incremento existente e não atribuem sua criação a uma
única pessoa. Nenhum arquivo funcional será descartado para facilitar staging.

## Verificações

Cada árvore proposta será exportada do índice a uma pasta temporária, sem
trocar o checkout. Backend: TypeScript e testes Vitest; frontend integrado:
TypeScript. As dependências instaladas serão reutilizadas apenas para os testes
locais, sem instalação ou atualização adicional. As execuções usarão variáveis
de processo de teste, URLs loopback inacessíveis e SMTP/Google/Groq vazios.
Não serão carregados os `.env` reais nesses checkouts de validação.

A homologação completa imediatamente anterior está documentada em
[pre-stage8-stabilization.md](pre-stage8-stabilization.md): 385 testes backend,
43 cenários PostgreSQL/API, 65 cenários de navegador simulados, sete cenários
integrados reais locais, TypeScript e builds. Essa referência não será
apresentada como uma nova execução de banco/navegador nesta organização.

Os resultados da organização e os hashes dos commits anteriores ao último
grupo serão acrescentados antes do commit final.

### Ajuste após validação da primeira proposta

A primeira árvore, contendo apenas schema/migrations sobre `2dfcb04`, compilou
nos dois projetos, mas revelou **41 testes falhos, 71 aprovados e 10 ignorados**
nas suítes herdadas do HEAD: mocks de autenticação desatualizados, contrato de
sessão, enum de auditoria e log bruto antigo. Nenhum commit foi criado com esse
resultado. As correções e testes já concluídos localmente resolvem esses
desalinhamentos. Por isso, base Prisma e segurança foram reunidas no primeiro
grupo, sem editar implementação ou enfraquecer testes para obter aprovação.


## Execução e validação das árvores

Os seis grupos anteriores foram commitados em sequência na branch autorizada.
Cada árvore exportada do índice passou em TypeScript de backend e frontend e
na suíte Vitest disponível naquele incremento. O grupo final também passa por
essas verificações antes de ser registrado. Não houve instalação de dependências
nem nova homologação SMTP/OAuth ou banco remoto.

| Ordem | Hash | Commit |
| --- | --- | --- |
| 1 | `bc2ad883eb` | fix: reforçar segurança e reconciliar a base Prisma do JurisSim |
| 2 | `880b38c8f2` | feat: integrar histórico e desempenho do aluno no backend |
| 3 | `78c414cb5e` | feat: integrar turmas e simulados no backend |
| 4 | `2d27a82763` | feat: implementar metas de estudo e relatórios no backend |
| 5 | `004f2fe800` | feat: implementar avatares e fotos de perfil no backend |
| 6 | `c2b5db68bf` | feat: integrar interface visual e navegação aos serviços reais |

O hash do último grupo pode ser consultado com `git log -1 --oneline`; não é
inserido no próprio conteúdo para evitar autorreferência. O inventário e os
checkouts de validação permanecem fora do repositório. Os arquivos auxiliares
da organização não são staged.
