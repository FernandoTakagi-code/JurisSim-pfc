# Administração e cadastro institucional — entrega0911

## Arquitetura e preservação

O frontend usa React/Vite e o login único. A identidade e o papel vêm de
`/auth/session`; ADMIN usa `/administracao`. O shell oficial e os dashboards
de aluno/professor são preservados. A autorização continua no backend.

Foram reutilizados Institution, InstitutionalMembership, TeacherInvitation,
InstitutionalClass, AccountControl, AdministrativeEvent e AdministrativeNotification.
Não há modelo paralelo de solicitação: Institution registra EMAIL_PENDING,
PENDING, ACTIVE, REJECTED ou SUSPENDED. Não foi criada nem aplicada migration.

O tipo institucional é validado como ENSINO_SUPERIOR, CURSO_PREPARATORIO ou
OUTRA_ORGANIZACAO e identificado em texto nas informações institucionais
(`description`). Não é uma nova coluna estruturada: filtros por tipo exigiriam
evolução de schema futura. CNPJ permanece opcional; quando informado segue a
validação existente. O e-mail é sempre derivado da conta autenticada.

## Capacidades e defaults

As flags abaixo são opt-ins explícitos e não foram habilitadas no ambiente
compartilhado. Todas são falsas por padrão. A flag original verdadeira mantém
compatibilidade com o módulo integral já implementado.

| Configuração | Efeito quando true |
| --- | --- |
| INSTITUTION_REGISTRATION_ENABLED | Receber solicitações, acompanhar as próprias, analisar/decidir como ADMIN e consultar notificações/eventos relacionados |
| ADMINISTRATION_ENABLED | Consultas globais, indicadores, usuários, controles de conta, professores, turmas e notificações; não exige vínculos dos professores |
| INSTITUTIONS_ENABLED | Operação institucional integral: convites, aceitação, isolamento por instituição, gestão institucional e vinculação de turmas |

`GET /institutions/availability` publica somente flags/capacidades, sem dados
pessoais. O frontend usa essas capacidades separadamente. O backend aplica
as mesmas barreiras em cada grupo de endpoints; declarar capacidades no
cliente não concede acesso.

Controles de suspensão são verificados na autenticação quando administração
ou cadastro estão habilitados. Com o módulo integral desligado, essa verificação
não ativa seleção institucional, não remove papel PROFESSOR e não consulta
vínculos para mudar seu papel. Não desligar capacidades de controle em operação
como substituto de uma política de suspensão; mudanças de configuração exigem
revisão operacional. Com todas as flags false, mantém-se o comportamento legado.

## Primeiro cadastro, sem vínculo prévio

1. No login, selecionar **Quero cadastrar minha instituição**.
2. Em `/instituicoes`, entrar com identidade existente ou criar o acesso individual
   de responsável pelo cadastro público normal (sem concessão administrativa).
3. Com recebimento autorizado, preencher instituição, tipo, responsável, telefone,
   informações e CNPJ apenas quando aplicável. O contato é o e-mail da conta.
4. O envio autenticado cria EMAIL_PENDING se o e-mail estiver pendente, ou PENDING
   se confirmado. Não altera User, não cria vínculo e não aprova a instituição.
5. Usar a confirmação normal de e-mail. Ela move EMAIL_PENDING para PENDING
   quando cadastro ou administração estão habilitados, sem ativar instituições.
6. Acompanhar somente solicitações próprias/vínculos autorizados em `/mine`.
   Esse acompanhamento pode continuar com cadastro fechado e administração ativa.
7. ADMIN analisa dados e decide com justificativa. A aprovação exige e-mail
   confirmado e cria somente INSTITUTION_ADMIN para o responsável naquela
   instituição; nunca concede ADMIN global. A recusa não cria vínculo.
8. A decisão atualiza status, gera notificação interna ao responsável e evento
   de auditoria na mesma transação. Uma aprovação não habilita a flag operacional.

O formulário usa a conta e confirmação existentes; não há solicitação anônima
que aceite e-mail arbitrário. O transporte de e-mail existente continua sendo
usado pela confirmação/cadastro da conta. A solicitação institucional em si
não dispara e-mail adicional; decisões geram notificações internas reais.

## Abuso, duplicidade e histórico

POST /requests reutiliza o limitador por IP (15/hora por processo, sem confiar
em forwarded headers). A transação SERIALIZABLE serializa verificações de
duplicidade com advisory lock, mantém retries de conflitos e as constraints
únicas de e-mail/CNPJ. Também rejeita mesmo nome (sem diferenciar caixa) e
telefone. A resposta de conflito não divulga ID de solicitação alheia.
O limitador em memória não substitui proteção distribuída na borda.

O ADMIN visualiza CNPJ, contato, situação e justificativa mais recente; o botão
de histórico consulta os eventos paginados daquela instituição na auditoria
global. O modelo atual preserva eventos/autor/data, mas somente a justificativa
mais recente em Institution; não se afirma haver histórico textual completo de
todas as justificativas. Não foram acrescentados dados pessoais livres aos logs.

## Permissões e seções

As rotas abaixo têm prefixo `/institutions`, exceto `/audit-logs` e `/auth/*`.
Listagens administrativas existentes usam `{items,page,hasMore}`; `/audit-logs`
retorna array limitado e não possui paginação ou total global.

| Seção | Recurso real | Condição / estado |
| --- | --- | --- |
| Visão geral | GET /admin/summary; GET /audit-logs | Indicadores com administração; atividade da plataforma independente; sem séries históricas fictícias |
| Instituições | GET/PATCH /admin/institutions[/id] | ADMIN + administração ou cadastro; detalhes/status/decisão |
| Solicitações | GET /admin/institutions?status=PENDING; PATCH /admin/institutions/:id | ADMIN + administração ou cadastro; justificativa e confirmação |
| Usuários | GET/PATCH /admin/users[/id] | ADMIN + administração; busca, filtros e proteções de autoalteração/último ADMIN |
| Professores | GET /admin/users?role=PROFESSOR | ADMIN + administração; e-mail confirmado e vínculos pendentes identificados, sem backfill |
| Turmas | GET /admin/classes?scope=all | ADMIN + administração; vínculo atual/ausente e arquivamento; PATCH de vínculo exige módulo integral |
| Logs | GET /audit-logs; GET /admin/logs | ADMIN; primeiro independente, segundo com administração ou cadastro; filtros contratuais |
| Segurança | /auth/session; auditoria; perfil | Conta real, confirmação e fluxos de proteção existentes; sem métricas inventadas |
| Notificações | GET /notifications (sob /institutions) | Usuário confirmado, somente próprias; administração ou cadastro; não há rota raiz independente |
| Configurações | Preferências do shell; /auth/nome; /profile/photo | Própria conta; sem API de configurações globais |

As rotas institucionais `/:id/*` exigem módulo integral e vínculo autorizado;
ADMIN global não recebe vínculo institucional automaticamente. Convites e
desvinculação permanecem sujeitos à autorização específica. Os alunos mantêm
estudo individual e os professores antigos não recebem instituição arbitrária.

Extensão contratual: GET /admin/classes aceita scope=all|unassigned (default
unassigned por compatibilidade). Inclui identificação do vínculo e arquivamento.
Não foi criada rota paralela; o tipo é dado adicional opcional de POST /requests.

## Diagnóstico dos nove professores e ativação

Última informação fornecida: nove contas PROFESSOR sem confirmação de e-mail
e sem vínculo. Esse é um diagnóstico histórico, não uma consulta atual ao Supabase.
Nenhuma conta foi consultada, alterada, confirmada ou vinculada nesta entrega.

O diagnóstico técnico preservado inspeciona: emailVerifiedAt; TEACHER ativo em
Institution ACTIVE; turmas e InstitutionalClass compatíveis com esses vínculos.
A tela Professores apresenta esses indicadores por conta com dados retornados
pelo backend. O CLI existente `scripts/check-institution-activation.ts` é somente
leitura, mas usa a conexão configurada: não foi executado no banco compartilhado.
O teste isolado com nove fixtures confirma que nove pendências bloqueiam a
ativação integral. Nenhum resultado simulado é apresentado como levantamento real.

Antes da ativação integral é necessário um levantamento atual autorizado,
confirmação de e-mail pelos titulares e regularização auditada dos vínculos reais
e das turmas. O procedimento excepcional de preparação do legado continua
separado e requer autorização; não há backfill automático ou instituição fictícia.
A barreira de startup continua ligada exclusivamente à ativação integral.

## Validação e limites

Testes HTTP usam Express local com Prisma/repositórios simulados. O navegador
usa a aplicação real com respostas de API simuladas e bloqueio de rede externa.
Não constituem comprovação de restauração, concorrência PostgreSQL real ou envio
de e-mails. Não foi feito novo teste de integração contra banco real, pois não
houve mudança de schema. Não foram acessados Supabase, SMTP ou provedores reais.

Cobertura: combinações de flags, default seguro, primeira solicitação sem CNPJ,
duplicidade, invalidez/injeção, aprovação/recusa, papel efetivo, suspensão sem
ativação institucional, escopo de notificações/auditoria, turmas, legado docente,
login único, erros, estados vazios, celular e regressão de aluno/professor.

Permanecem separados: autorização operacional das novas flags no ambiente real,
diagnóstico atual dos professores, regularização legítima e ativação integral.
README e documentação acadêmica não foram alterados.
