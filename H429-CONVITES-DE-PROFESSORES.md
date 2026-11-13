# H4.29 — fluxo de convites docentes

> Registro histórico da respectiva etapa. Testes, configurações, autorizações e impedimentos referem-se àquela execução; não comprovam o estado atual nem autorizam operações reais. Consulte a consolidação [H4.37](H437-CONSOLIDACAO-PROFESSOR.md) e o [README](README.md).

13/11/2026 — branch `entrega0911`. Código e interfaces preparados/revisados; **não se declara homologação integrada nem prontidão para produção**. Nesta etapa não houve conexão de banco, envio/verify SMTP, criação/aceite/revogação real, mudança de conta/vínculo, migration, edição de `.env` ou credenciais, commit, push, merge ou deploy.

## 1. Reversão da H4.28

A H4.29 reverteu a exceção pontual de destinatário da H4.28, preservando os controles de transporte, o manifesto autorizado e as alterações anteriores. As evidências operacionais permaneceram privadas, fora do versionamento.

Os recarregamentos automáticos foram autorizados naquela etapa; nenhum processo foi encerrado manualmente. A rota `/health` respondeu com sucesso na verificação histórica, sem comprovar conexão de banco ou entrega de e-mail. Isso não descreve processos ativos hoje.

## 2. Arquitetura anterior e diagnóstico

Já existiam envio, reenvio, cancelamento, inspeção por token, aceite autenticado, cadastro pelo convite, concessão transacional e acesso docente por vínculo. Foram reutilizados, sem duplicar serviços.

A aplicação confundia na experiência de revisão dois controles independentes: autorização por UUID no manifesto e permissão de destinatário no transporte restrito. O envio normal já aceitava uma conta Aluno e destinatário novo; o runtime atual continuava limitado por suas proteções privadas. A H4.29 não remove essas proteções.

Outros problemas corrigidos:

- Ambiente de produção não tinha uma seleção específica e explicitamente validada para convites.
- Reenvio podia substituir convite com resultado de entrega incerto.
- Reenvio de um registro antigo não verificava outro convite pendente mais recente.
- Convites cancelados não podiam ser reenviados pela ação correspondente.
- O cancelamento compensatório não conferia quantas linhas efetivamente mudaram.
- Repetição do aceite devolvia erro mesmo quando a mesma conta já havia aceitado; agora a resposta é idempotente e não reativa vínculo removido.
- A URL do e-mail podia acompanhar `127.0.0.1` da interface, embora o transporte restrito exigisse a origem canônica `localhost`.

## 3. Separação de ambientes

`backend/src/config/teacher-invitations.ts` seleciona a política exclusivamente por configuração do servidor. Não lê parâmetros HTTP, cabeçalhos, papel selecionado no navegador ou dados do formulário.

| Política | Configuração/limites |
| --- | --- |
| Homologação restrita | `NODE_ENV=development` ou `test`, `INSTITUTION_HOMOLOGATION_ENABLED=true`, `INSTITUTIONS_ENABLED=false`, manifesto válido e modo ausente ou `restricted`. Mantém UUIDs autorizados, contexto/proveniência, conta prévia confirmada e transporte guardado. Não oferece cadastro de desconhecidos nesse ambiente |
| Desenvolvimento institucional explícito | `NODE_ENV=development` ou `test`, módulo institucional global explicitamente ligado, homologação desligada e modo ausente ou `institutional`. Mantém compatibilidade com as suítes e ambientes institucionais completos; não é um fallback do runtime restrito |
| Produção | `NODE_ENV=production`, `TEACHER_INVITATIONS_MODE=production`, `INSTITUTIONS_ENABLED=true`, `INSTITUTION_HOMOLOGATION_ENABLED=false`, URL pública HTTPS sem credenciais/query/fragmento, transporte `api` ou `smtp` explicitamente configurado e credencial correspondente presente. Recusa marcadores de runtime restrito e modos locais de demonstração/captura |
| Configuração ausente ou conflitante | Recusa criação/aceite/primeiro acesso com erro público de indisponibilidade, antes de executar as operações do serviço |

Em produção, não existe consulta de `participantIds` para autorizar destinatários nem dependência da lista privada do bootstrap. O transporte normal é escolhido pelo servidor; o bootstrap restrito não é usado em produção e recusa esse ambiente. Todos os controles de ator, identidade, instituição, token, vínculo, limites e turmas continuam obrigatórios.

**Nenhuma dessas flags foi alterada no ambiente atual.** A configuração acima é documentação para uma ativação futura autorizada, não instrução para trocar o runtime existente e contornar sua lista privada.

## 4. Fluxos e segurança

### Envio para conta existente

O backend valida administrador institucional ativo (ADMIN global não substitui vínculo), instituição ativa/proveniência quando restrita, e-mail, identidade única, exclusão/suspensão, papel elegível, vínculo docente já ativo na mesma instituição, duplicidade, limite de 30 convites/hora e turmas autorizadas. Não há diretório público de contas nem resposta contendo o UUID ou dados da conta destinatária. Erros de elegibilidade são genéricos.

Gera token com 32 bytes aleatórios, armazena apenas SHA-256, validade de 48 horas, cria convite/auditoria e tenta transporte. Não cria conta, muda papel ou ativa vínculo no envio. O link usa a URL canônica do servidor em produção/homologação restrita.

O aceite exige sessão real da conta destinatária, e-mail confirmado, conta elegível, token válido, instituição correta/ativa e designações válidas. A transação serializável, com lock da instituição e claim condicional do convite, marca uso único, ativa somente o vínculo `TEACHER` da instituição do token, aplica designações autorizadas e muda o papel para Professor. A atualização do usuário altera somente o papel: histórico acadêmico e identidade são preservados.

Repetir o aceite pela mesma conta já aceita retorna confirmação sem repetir concessões, auditoria de aceite ou atualização de papel. Isso **não reativa** vínculo que foi removido depois. Outra conta, inclusive outra conta com e-mail indevidamente reutilizado mas UUID diferente do aceite anterior, não recebe concessão por repetição.

### Envio para pessoa ainda sem cadastro

Somente em modo institucional normal/produção. O link do e-mail permite inspeção do convite e identifica o destinatário. O token de alta entropia recebido no endereço convidado serve como prova de posse desse e-mail; não há necessidade de uma segunda mensagem de confirmação. No fluxo consolidado pela [H4.32](H432-PRIMEIRO-ACESSO-DOCENTE.md), o formulário exige nome, senha própria, confirmação da senha e aceite dos termos. A decisão sobre o convite é posterior e separada.

A descrição original da H4.29 de cadastro e aceite em uma única transação foi substituída pela H4.32. `register` cria somente a identidade pendente, com e-mail proveniente do convite, hash de senha, confirmação baseada na prova do token e auditoria legal. Retorna `LOGIN` e mantém o convite pendente. Após autenticar, a pessoa revisa a instituição e aceita ou recusa explicitamente. Somente o aceite autenticado concede papel Professor e vínculo docente. O papel básico interno e `registrationIntent=TEACHER_INVITATION` não concedem dashboard acadêmico. Uma conta existente não tem senha sobrescrita: deve usar o login único e confirmar o e-mail pelo fluxo existente, se necessário.

Abrir o link não aceita convite. O cadastro público continua Aluno. Links inválidos, vencidos, revogados ou consumidos não permitem novo cadastro/aceite. Inspeção não consome token; conta errada não pode aceitar. Os detalhes retornados pela inspeção são limitados ao portador do token, não a uma consulta pública por e-mail.

### Entrega e persistência

- Criação do convite e evento `TEACHER_INVITED`/`TEACHER_INVITATION_RESENT` ocorrem na mesma transação. Esses eventos registram solicitação de convite, não prova de entrega na caixa postal.
- Aceitação confirmada pelo provedor permite preencher `sentAt`. A interface só informa sucesso depois da resposta do backend; aceitação pelo provedor não garante entrega final.
- Recusa definitiva tenta transação compensatória: `PENDING` → `CANCELLED`, com `INVITATION_DELIVERY_FAILED`. Agora exige exatamente uma linha alterada para afirmar cancelamento.
- Resultado incerto preserva link válido e registra `INVITATION_DELIVERY_UNKNOWN`. Falha da compensação propaga erro, sem simular cancelamento.
- `PENDING` sem `sentAt` é exposto como `deliveryState=UNCONFIRMED`. A interface o identifica e desabilita reenvio enquanto válido; o backend também recusa reenvio. Isso cobre interrupção antes da gravação de confirmação e falha ao persistir `sentAt`, sem afirmar que a mensagem não foi enviada.
- Convite revogado pode gerar novo token após cooldown, verificando outro pendente mais recente. O registro antigo é preservado; o token antigo não é reativado. Revogação de pendente/expirado continua explícita e auditada.

**Limite de durabilidade:** SMTP e banco continuam separados. Queda entre commit e envio pode deixar convite não confirmado; a aplicação agora sinaliza esse estado e bloqueia reenvio inseguro, mas não possui worker de reconciliação durável. A proposta complementar está em H429-PERSISTENCIA-E-RECONCILIACAO.md. Não se promete exatamente uma entrega nem ausência absoluta de pendências após falha de processo.

## 5. Interface e dashboard

O modal mantém foco inicial/retorno, Tab contido, Escape e fechamento bloqueado durante requisição, fundo inerte, rolagem, temas e dimensões móveis. E-mail tem validação HTML e backend; formulário e primeiro acesso têm proteção imediata por ref contra cliques repetidos.

A interface usa mensagens públicas compreensíveis, sem nomes de arquivos, UUIDs de allowlist ou parâmetros privados. Lista pendentes, aceitos, expirados, revogados e recusados; mostra entrega não confirmada e limita reenvio. O papel Aluno e a consequência do aceite continuam explicados.

Após aceite autenticado, o frontend reconsulta `/auth/session` e navega para Professor. Não confia em papel de URL/cache/JWT isolado. O backend continua conferindo conta atual, vínculo institucional ativo e designações. Turmas, alunos, simulados, desempenho e relatórios usam endpoints reais de Prisma com limites de instituição/turma. Aceite sem turma inicial não dá acesso a todas as turmas; exige designação posterior autorizada.

Testes isolados cobrem ausência de privilégio antes do aceite, perfil docente após concessão, vínculo pendente, seleção entre instituições, escopo de turmas/relatórios e isolamento do ADMIN. Isso valida o código com doubles, não uma conta real conectada. Nenhuma implementação real usa fixtures para conceder privilégios. Módulo de questões do Fernando não foi alterado.

## 6. Arquivos desta etapa

- `backend/src/config/teacher-invitations.ts` e `.test.ts`: política de ambientes e testes.
- `backend/src/services/institution-service.ts` e `.test.ts`: elegibilidade/vínculo, reenvio, compensação, idempotência, URL canônica, testes de concorrência/rollback simulados.
- `backend/src/services/invitation-onboarding.ts` e `.test.ts`: política aplicada à validação e testes de cadastro por prova do convite.
- `backend/src/services/invitation-scope.test.ts`: produção, escopo, reenvio, persistência, origem canônica e retry serializável.
- `frontend/src/institution-dashboard.tsx`: situação de entrega, reenvio revogado/incerto e texto público.
- `frontend/src/invitation-onboarding.tsx`: proteção de requisição contra clique repetido.
- `frontend/scripts/test-administration.mjs`: cenários correspondentes e cadastro com clique duplo.
- Overlay privado do transporte: reversão da exceção da H4.28; não integra a distribuição pública.
- Este relatório e `H429-PERSISTENCIA-E-RECONCILIACAO.md`.

As cópias de recuperação e evidências operacionais foram preservadas exclusivamente em armazenamento privado ignorado pelo Git. Não são dependências da distribuição pública.

## 7. Testes e builds

- **406 testes backend aprovados**, 14 arquivos: política de produção/restrita, runtime guardado, convites, onboarding, serviços e rotas institucionais, Professor/relatórios/delegação, autenticação, SMTP mockado e bloqueio da H4.24.
- **62 verificações administrativas de navegador aprovadas**, incluindo reenvio incerto/revogado, mensagens, foco, temas, desktop/celular e cadastro sem duplo envio.
- **78 cenários de sessão/perfis aprovados**, API e serviços externos isolados.
- **23 cenários de navegação dos dashboards aprovados**, APIs interceptadas.
- Suíte estática de entrega aprovada, incluindo bloqueio da exclusão e 14 verificações direcionadas do ADMIN.
- Builds backend/frontend aprovados. Avisos de tamanho de bundle/anotações de dependência/configLoader não impediram compilação. `git diff --check` aprovado.

Comandos principais:

```powershell
npm.cmd --prefix backend run build
npm.cmd --prefix frontend run build
npm.cmd --prefix backend run test:no-db -- src/config/teacher-invitations.test.ts src/services/invitation-scope.test.ts src/services/institution-service.test.ts src/services/invitation-onboarding.test.ts src/services/institution-homologation.test.ts src/routes/institution-routes.test.ts src/services/teacher-overview.test.ts src/services/class-delegation.test.ts src/routes/goals-reports.test.ts src/routes/auth-stage7.test.ts src/routes/auth-security.test.ts src/services/account-deletion-safety.test.ts src/services/brevo-smtp.test.ts
```

Scripts de navegador, executados dentro de `frontend`: `node scripts/test-administration.mjs`, `node scripts/test-session.mjs`, `node scripts/test-dashboard-navigation.mjs`; suíte estática: `npm.cmd run test:delivery-static`.

Não foram executadas suites de integração PostgreSQL. Concorrência/rollback nesses testes usam estado/serialização mockados: não comprovam locks ou rollback de SQL reais. Alguns nomes históricos de cenários dizem “real/API real”, mas todas as APIs dessas execuções foram interceptadas.

## 8. Roteiro de homologação — somente após novas autorizações

**Situação histórica da H4.29:** a autorização no manifesto não substituía a permissão de entrega do transporte. O estado atual das listas privadas deve ser conferido separadamente e somente com autorização, sem trocar flags para contornar restrições.

Para homologar o fluxo sem exceção por destinatário, aprovar um ambiente integrado separado, com configuração institucional/produção explicitamente revisada, dados e schema autorizados, frontend HTTPS e SMTP/API válidos. Nenhum ambiente desse tipo foi criado ou ativado. Configuração, conexão de banco, envio, aceite e designações reais precisam de aprovação específica; não estão incluídos na autorização de editar código.

1. **Preparação autorizada:** confirmar ambiente, schema e configuração do servidor. Validar a elegibilidade atual da conta destinatária, a instituição e o vínculo administrativo do remetente. Conferir convites pendentes/incertos antes de enviar. Não usar UUID histórico. Verificação SMTP exige autorização específica.
2. **Preservar a conta Aluno existente:** usar o administrador institucional autorizado como remetente e outra janela/perfil para a conta destinatária. Nunca aceitar com a conta errada. Explicar que o aceite muda o papel global para Professor, preservando o histórico; manter perfis separados exige contas distintas autorizadas.
3. **Envio único autorizado:** Instituições → instituição aprovada → Professores/Convites → Convidar professor. Informar nome e e-mail da pessoa destinatária, opcionalmente turma inicial autorizada. Confirmar uma única vez. Não promover papel ou criar vínculo manualmente.
4. **Escritas desse envio:** `TeacherInvitation` pendente, `TeacherInvitationClass` se houver turmas, `AdministrativeEvent` `TEACHER_INVITED`; pendentes anteriores substituíveis podem ser cancelados pela transação. Em sucesso, atualização `sentAt`. Em recusa definitiva, cancelamento e `INVITATION_DELIVERY_FAILED`; em incerteza, `INVITATION_DELIVERY_UNKNOWN`, preservando link. Erros HTTP podem gerar também eventos operacionais da auditoria geral. Não repetir automaticamente se o resultado for incerto.
5. **Recebimento:** verificar caixa/spam. Link e token não devem ser publicados em relatório, screenshot, chat ou log. Conferir instituição e endereço. Abrir o link não concede papel.
6. **Conta existente:** autenticar exclusivamente a conta destinatária pelo login único, confirmar seu e-mail pelo fluxo normal se necessário e clicar Aceitar. Login/auditoria são operações reais e também dependem de autorização. Tentar outra conta deve ser recusado.
7. **Pessoa sem conta:** somente em ambiente autorizado para esse cenário, concluir primeiro acesso com senha própria e termos. A criação registra identidade pendente e auditoria, sem vínculo ou aceite; depois, entrar pelo login existente e decidir Aceitar/Recusar separadamente, conforme a H4.32. Cada operação real exige autorização.
8. **Escritas do aceite autorizado:** convite `ACCEPTED`/`acceptedById`, `InstitutionalMembership` `TEACHER` da instituição do token, designações opcionais em turmas, papel `PROFESSOR` e `TEACHER_INVITATION_ACCEPTED`. Nenhum dado acadêmico anterior é removido. Repetição da mesma aceitação não deve criar outra concessão.
9. **Dashboard:** revalidar sessão/login e abrir `/professor`. Conferir apenas instituição correta, turmas designadas, alunos dessas turmas, simulados autorizados, desempenho e relatórios, inclusive caso vazio. Sem designação inicial, ausência de turmas é esperada. Testar URL de outra instituição/turma deve dar recusa, não dados externos. Perfil e histórico anterior devem permanecer.
10. **Cenários destrutivos de teste:** usar apenas convites e contas descartáveis previamente autorizados para expiração, revogação, rejeição e reenvio. Cada escrita precisa constar no escopo aprovado. Não revogar vínculo ou excluir conta real como limpeza automática; H4.24 permanece desativada.

## 9. Pendências e riscos para produção

- Homologação integrada de autenticação, SQL/Prisma, transações concorrentes, schema existente, provedor e entregabilidade não realizada.
- Ambiente atual continua restrito; produção não foi ativada. Nenhum banco/migration foi alterado para a H4.29.
- Não há reconciliação durável automática para quedas entre banco/SMTP; verificar a proposta complementar antes de operação sem supervisão.
- Token no e-mail é prova de posse: proteger HTTPS, acesso ao correio e segredos; não há verificação independente de entrega na caixa postal. Reencaminhamento do link pode expor essa prova.
- Mudança de papel no aceite é regra atual de produto, não suporte a dois papéis globais simultâneos.
- A validade das credenciais SMTP verificada na H4.28 é histórica; não foi revalidada nesta etapa e não comprova entrega futura.
- A política de produção valida configuração declarada, não substitui auditoria de infraestrutura, limites/monitoramento, retenção e validação do schema.

O fluxo foi reforçado e está revisável no código e em testes isolados. A entrega integrada depende das autorizações e validações acima, sem exceções por destinatário.
