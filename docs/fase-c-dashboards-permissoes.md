# Fase C — permissões, contextos e limpeza dos dashboards

Implementação local na branch `entrega0911`. As alterações anteriores da Fase B, bootstrap, convites e transição foram preservadas. Não houve acesso ao Supabase, alteração de contas reais, envio real de e-mails, execução de migrations, ativação de flags, commit, push, merge ou deploy.

## Segurança e contratos

- Professor não solicita ingresso em turma. Solicitações por código continuam exclusivas do aluno no contexto pessoal. Convite docente cria vínculo institucional; somente a instituição designa, substitui ou retira professores das turmas.
- `allowedClassIds` do professor contém somente turmas com delegação atual na instituição selecionada. Selecionar uma instituição ou possuir autoria antiga não concede acesso às demais turmas.
- Questões privadas vinculadas a turma exigem delegação atual para leitura. Escrita exige autoria e delegação atual, além das restrições anteriores contra alteração/exclusão de questões utilizadas. A retirada não apaga a questão nem altera sua autoria. Acervo público continua legível; publicidade não concede permissão de escrita.
- A resposta de leitura de questões inclui `canManage` para o professor. A interface utiliza esse resultado para exibir ações; o backend continua verificando a autorização em cada operação.
- Simulados do professor exigem autoria e autorização atual em **todas** as turmas destinatárias. Um simulado que também tenha destino não autorizado não concede gestão parcial. Retirada da delegação bloqueia leitura gerencial, edição e publicação, sem apagar avaliações ou tentativas.
- No contexto administrativo institucional, a gestão de simulados usa a instituição proprietária das turmas e funciona igualmente para responsáveis cujo papel individual é ALUNO ou PROFESSOR. Tentativas pessoais e matrícula por código não são operações desse contexto.
- ADMIN global é negado no servidor, nas rotas de questões e nos serviços pedagógicos. Foram removidas as exceções antigas de administração universal de questões/simulados.
- O papel pessoal não é convertido em ALUNO ao perder vínculo docente. O backend mantém PROFESSOR, sinaliza a pendência e nega o acesso docente; a interface orienta a regularização. Nenhum papel persistente foi alterado.

## Contextos pessoal, docente e institucional

O vínculo `INSTITUTION_ADMIN` não substitui o papel individual. A navegação permite alternar entre o espaço pessoal e cada instituição administrada, conforme a sessão validada pelo backend.

- Contexto docente: seleção local `jurissim_institution`, aceita somente quando corresponde a vínculo TEACHER ativo.
- Contexto administrativo: seleção local independente `jurissim_administration_institution`, aceita somente para vínculo INSTITUTION_ADMIN ativo.
- O cliente envia `X-Institution-Context: administration` apenas nas operações acadêmicas iniciadas pela área institucional. O backend valida novamente o vínculo; o cabeçalho não concede privilégios por si só.
- `X-Institution-Id` seleciona a instituição autorizada. No contexto pessoal ALUNO, seleções administrativas não mudam o escopo de estudo.
- As duas seleções são validadas na atualização da sessão e removidas no logout. São preferências locais, não mecanismos de autorização.
- CORS passou a aceitar o cabeçalho de contexto, mantendo as regras de origem já existentes.

## Limpeza controlada

| Item | Resultado |
| --- | --- |
| Menu operacional global de turmas | Retirado do ADMIN; nove seções operacionais permanecem |
| `/administracao/turmas` | Mantida como orientação de compatibilidade, sem consulta acadêmica |
| APIs globais antigas de turmas | URLs preservadas com bloqueio explícito; corpos e serviços inalcançáveis de consulta/adoção global removidos após verificar consumidores |
| Importação pedagógica por ADMIN | Ramo removido da aplicação e do menu; endpoint legado preservado com 403, sem transferir privilégios ao professor |
| Permissões administrativas em listagens comuns | Movidas para Segurança; consulta e suspensão autorizada permanecem nas listagens apropriadas |
| Sidebar e cabeçalhos internos antigos | Removidos das áreas de aluno/professor; `IntegrationShell` permanece como navegação oficial |
| Botões docentes antigos “em breve” | Retirados junto da navegação antiga; turmas e desempenho reais permanecem no menu oficial |
| `SettingsModal` | Implementação antiga sem consumidores removida; perfil, nome, privacidade, segurança, foto e preferências usam a área compartilhada existente |
| Páginas de perfil/preferências | Conteúdo acadêmico oculto deixa de ser montado por trás dessas páginas, evitando efeitos e consultas desnecessários |
| Marca, temas, estilos, conteúdo pedagógico e histórico | Preservados |
| Prévia e referência do v0 | Preservadas, sem importação nas rotas reais ou no build |

Os auxiliares isolados de prévia CSV não foram transferidos para outro perfil nem expostos por nova rota. A descontinuação do fluxo global não apaga conteúdo importado anteriormente.

## Dashboard institucional aprovado: bloqueio visual identificado

`referencia-dashboard-v0` contém apenas:

- `page.tsx`: exportação **administrativa**, com dez seções originais, incluindo Instituições, Solicitações de cadastro e Logs e auditoria.
- `globals.css`: estilos dessa referência administrativa.

Não há nessa pasta a exportação institucional de onze módulos, nem seus componentes ou recursos próprios. `.local-admin-preview/institutional-flow.tsx` é a prévia de fluxo, não a exportação desse dashboard institucional.

Portanto, **a integração visual institucional definitiva não foi declarada concluída e não foi redesenhada**. O portal institucional funcional existente foi preservado, com separação de contexto. Para finalizar a adaptação exata são necessários os arquivos da exportação institucional: `page.tsx`, `globals.css`, componentes referenciados e imagens/ícones/fontes locais utilizados. Eles podem ser fornecidos em uma pasta distinta, como `referencia-dashboard-institucional-v0/`, preservando a referência administrativa atual.

| Módulo solicitado | Base funcional existente | Tela institucional específica do v0 |
| --- | --- | --- |
| Visão geral | Indicadores próprios no portal existente | Pendente da exportação |
| Minha instituição | Consulta e edição autorizada de dados | Pendente da exportação |
| Professores | Consulta de vínculos e desvinculação autorizada | Pendente da exportação |
| Convites | Nome/e-mail/turmas, envio, reenvio, cancelamento, aceite, recusa e primeiro acesso | Pendente da exportação |
| Turmas | Criação, edição, arquivamento e designação docente | Pendente da exportação |
| Alunos | Matrículas e solicitações por turma, sem excluir contas pessoais | Pendente da exportação |
| Desempenho acadêmico | Indicadores e resumo autorizado por turma | Pendente da exportação |
| Simulados | Contratos de serviço corrigidos para contexto institucional; não há página institucional dedicada integrada | Pendente da exportação e da ligação dos seletores/ações à tela |
| Relatórios | APIs autorizadas e resumo no portal; componentes ricos existentes na área docente | Pendente da exportação e da adaptação da navegação institucional |
| Notificações | API de notificações do próprio destinatário; sem página institucional dedicada integrada | Pendente da exportação |
| Configurações | Dados institucionais e preferências pessoais existentes, separados | Pendente da exportação |

## Endpoints afetados

| Contrato | Alteração |
| --- | --- |
| `GET /auth/session` | Mantém papel pessoal e sinalização de vínculo pendente; não demove professor sem vínculo |
| `GET /questoes`, `GET /questoes/:id` | Delegação atual para recursos privados; metadado `canManage` para ações docentes |
| `POST /questoes`, `PUT /questoes/:id`, `DELETE /questoes/:id` | Somente professor autorizado; sem exceção ADMIN; escrita exige autoria e gestão atual da turma |
| `POST /questoes/importacao/preview` | URL legada bloqueada explicitamente com 403 |
| `GET /avaliacoes` | Escopo por delegação atual ou administração institucional; sem mistura com listagem pessoal de aluno |
| `POST /avaliacoes`, `PUT /avaliacoes/:id`, `POST /avaliacoes/:id/publish` | Validação consistente de todas as turmas e recursos autorizados |
| `/turmas` e `/reports` | Contexto administrativo explícito; contexto docente restrito às turmas delegadas |
| `POST /turmas/join` e tentativas de avaliação | Exclusivos do contexto pessoal do aluno; professor não solicita delegação |
| `GET /institutions/admin/classes`, `PATCH /institutions/admin/classes/:id` | Bloqueio preservado sem implementação gerencial global por trás |

Nenhum endpoint utilizado por alunos ou professores foi apagado. Convites, confirmação, recuperação, login por senha/Google, auditoria e dados acadêmicos existentes foram preservados.

## Verificação realizada

- **379 testes de backend, em 18 arquivos direcionados, aprovados.** Incluem delegação e retirada, reatribuição, criação de turma institucional, questões por HTTP, simulados, isolamento, contexto institucional, aluno independente, autenticação, Google simulado, convites, bootstrap e transição.
- **41 cenários de navegador aprovados**, com APIs interceptadas e rede externa bloqueada. Incluem os quatro contextos, responsáveis ALUNO/PROFESSOR, uma única sidebar, retorno à área pessoal, flags, erros, convites e regressão dos dashboards existentes.
- **15 verificações de renderização** e verificações de roteamento aprovadas.
- TypeScript e builds de frontend e backend aprovados.
- `git diff --check` aprovado. Mantidos os avisos existentes de tamanho do bundle e configuração CommonJS/ESM dos testes.

Os testes utilizam fixtures e persistência simulada. Não constituem validação de contas, e-mails, OAuth ou banco reais. Nenhuma migration foi executada nesta fase, nem mesmo para os testes.

## Arquivos modificados nesta fase

Backend:

- `src/config/cors-policy.ts` e teste.
- `src/controllers/QuestaoController.ts`.
- `src/middlewares/auth-middleware.ts` e `institution-auth.test.ts`.
- `src/repositories/QuestaoRepository.ts`.
- `src/routes/questaoRoutes.ts`, `questao-crud.test.ts`, `institution-routes.ts`.
- `src/services/class-exam-service.ts`, `institution-service.ts` e teste.
- Novo `src/services/class-delegation.test.ts`.

Frontend:

- `src/api.ts`, `auth-session.ts`, `admin-navigation.ts`, `administration.tsx`.
- `src/integration-shell.tsx`, `main.tsx`, `ProfessorArea.tsx`, `shell.tsx`.
- `scripts/test-admin-routing.cjs`, `test-administration.cjs`, `test-administration.mjs`.

README, arquivos de referência visual, configurações `.env`, schema/migration da Fase B, contas e correções de bootstrap não foram alterados nesta fase.

## Migration, ativação e execução local

Nenhuma migration nova foi necessária para a Fase C. O arquivo da Fase B `20261105000100_teacher_invitation_onboarding` continua dependente de autorização/aplicação separada conforme o contexto da entrega; o Supabase não foi consultado para verificar seu estado. As flags não foram alteradas. A transição dos professores continua sujeita à confirmação legítima de e-mail, vínculo autorizado e verificação de ativação existente.

Para validar sem banco ou e-mail real, em `frontend`:

```powershell
node scripts/test-admin-routing.cjs
node scripts/test-administration.cjs
node scripts/test-administration.mjs
npm.cmd run build
```

O teste de navegador usa seu próprio Vite em `http://127.0.0.1:5186`, Chrome com rede externa bloqueada e fixtures locais; encerra ambos ao terminar.

Para os novos casos de permissão, em `backend`:

```powershell
npm.cmd test -- src/services/class-delegation.test.ts src/routes/questao-crud.test.ts src/middlewares/institution-auth.test.ts src/services/institution-service.test.ts
npm.cmd run build
```

Para abrir o frontend real, em `frontend`:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Endereços: `/administracao`, `/instituicoes`, `/professor` e `/dashboard`, todos usando autenticação real. O seletor de contexto aparece somente quando a sessão informa administração institucional autorizada. O backend real não foi iniciado nesta fase; não iniciá-lo com a configuração do banco compartilhado para realizar testes. A navegação com dados reais continua dependente de ambiente isolado autorizado, flags apropriadas e autenticação válida, sem contornar os bloqueios existentes.
