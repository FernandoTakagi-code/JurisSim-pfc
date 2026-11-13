# H4.26 — convites docentes e encerramento de sessões

> Registro histórico da respectiva etapa. Testes, configurações, autorizações e impedimentos referem-se àquela execução; não comprovam o estado atual nem autorizam operações reais. Consulte a consolidação [H4.37](H437-CONSOLIDACAO-PROFESSOR.md) e o [README](README.md).

13/11/2026, branch `entrega0911`. Alterações H4.24/H4.25 preservadas. Sem operações de banco, migrations, edição de `.env`, envio real de e-mail, alteração de contas/vínculos, commit, push, merge ou deploy. Módulo de questões do Fernando preservado.

## Causa da recusa

Fluxo: `InvitationForm` → `POST /institutions/:id/invitations` → validação da rota e contexto autenticado → `InstitutionService.invite` → `institutionAdmin` → elegibilidade do destinatário → política restrita → duplicidade/limites/turmas → criação e transporte de e-mail.

A mensagem de escopo é produzida por `assertInvitedParticipant`, que traduz a recusa de `assertRestrictedParticipant` em `backend/src/config/institution-homologation.ts`. Com uma requisição em escopo restrito, o UUID da conta destinatária precisa pertencer a `participantIds` no manifesto privado. O destinatário também precisa existir e ter e-mail confirmado. Ser Aluno não é a causa dessa recusa.

O launcher `backend/scripts/institution-homologation-unified.cjs` seleciona explicitamente `original-supabase-restricted`, com `INSTITUTIONS_ENABLED=false` e `INSTITUTION_HOMOLOGATION_ENABLED=true`. Essa é uma restrição deliberada do ambiente atual; um administrador institucional legítimo não recebe autorização para convidar qualquer destinatário nesse ambiente. O launcher não foi executado nesta tarefa e nenhuma conexão ao Supabase foi feita.

São controles diferentes:

| Controle | Regra |
| --- | --- |
| Autor do convite | Vínculo ativo de administrador da instituição, contexto e instituição autorizados; ADMIN global não substitui esse vínculo |
| Destinatário elegível | Conta sem exclusão/suspensão e sem papel ADMIN; e-mail deve identificar uma única conta, se existente |
| Homologação restrita | Conta prévia confirmada e UUID autorizado; limita também reenvio e aceite |
| Modo institucional normal | Aluno existente pode receber; pessoa ainda não cadastrada usa primeiro acesso por token, sem cadastro público de Professor |
| Concessão de acesso | Somente no aceite autorizado; enviar convite não altera User, papel global ou vínculo |

A existência do manifesto, sozinha, não impõe lista privada ao envio no modo normal: isso depende do contexto restrito da requisição. Os testes cobrem esse isolamento. Não foram consultadas as duas contas reais nem seu cadastro privado; a causa descrita é o caminho exato que gera a mensagem, sem afirmar confirmação individual dos UUIDs.

## Correções

- Consulta única de destinatário por e-mail sem diferenciar maiúsculas/minúsculas, com detecção de ambiguidade e recusa antecipada de contas que o aceite já não permite (ADMIN, excluída ou suspensa).
- Autorização do administrador verificada antes da elegibilidade e da disponibilidade do envio. Assim, configuração do provedor não mascara falta de permissão.
- Erros distintos de autorização, escopo, conta inelegível, convite duplicado e serviço de envio indisponível. Formulário permanece aberto e preenchido em erros; listagem só muda após sucesso.
- Modo normal mantém conta nova e Aluno existente; reenvio volta a conferir a política do destinatário original. Nenhuma promoção automática no envio.
- Modal institucional mantém portal centralizado, foco inicial/retorno, Tab, Escape, rolagem interna, temas, responsividade e bloqueio durante envio. Explicação adicional identifica o primeiro acesso no modo normal.
- Logout global sem checkbox: botão abre modal `Encerrar todas as sessões?`, com a explicação solicitada e botões Cancelar / Sim, encerrar todas as sessões. Cancelar recebe foco; abertura, Cancelar e Escape não chamam API. Fundo inerte, foco contido, temas e largura de celular verificados.
- Confirmação usa o backend existente de revogação por `sessionVersion`. Só uma resposta de sucesso limpa a sessão e leva ao login; erro de serviço mantém a sessão e o modal. Clique repetido e fechamento durante carregamento são bloqueados. Resposta atrasada não encerra sessão substituta.
- H4.24 permanece desativada. Não há exclusão real, migração aplicada nem sucesso simulado; mensagem e botões indisponíveis da etapa anterior preservados.

## Arquivos desta etapa

- `backend/src/services/institution-service.ts`
- `backend/src/services/institution-service.test.ts`
- `backend/src/services/invitation-scope.test.ts`
- `backend/src/services/institution-homologation.test.ts`
- `frontend/src/institution-dashboard.tsx`
- `frontend/src/global-sign-out.tsx`
- `frontend/src/account-confirmation-dialog.tsx` (novo)
- `frontend/src/account-actions.css`
- `frontend/scripts/test-session.mjs`
- `frontend/scripts/test-administration.mjs`
- `H425-REVISAO-INSTITUCIONAL.md` (referência à atualização)
- `H426-CONVITES-E-SESSOES.md` (este relatório)

O workspace já continha outras alterações antes da H4.26; esta lista não representa o diff completo em relação ao último commit.

## Validação sem banco

Backend: **294 testes aprovados**, em oito arquivos:

```powershell
cd backend
npm.cmd run test:no-db -- src/services/invitation-scope.test.ts src/services/institution-service.test.ts src/services/institution-homologation.test.ts src/services/invitation-onboarding.test.ts
npm.cmd run test:no-db -- src/routes/institution-routes.test.ts src/routes/auth-security.test.ts src/routes/auth-stage7.test.ts src/services/account-deletion-safety.test.ts
npm.cmd run build
```

Frontend: **78 cenários de sessão** e **61 verificações administrativas**, com APIs interceptadas, incluindo autorização, inelegibilidade, duplicidade, erro de envio, conta existente/nova nos serviços, confirmação, foco/teclado, carregamento e erro sem falso sucesso:

```powershell
cd frontend
node scripts/test-session.mjs
node scripts/test-administration.mjs
npm.cmd run build
```

Builds backend e frontend aprovados. Avisos de build sobre tamanho de bundle/anotações de dependência não impedem compilação. `git diff --check` aprovado. Essas verificações usam doubles de persistência/transporte: não comprovam entrega real de convite, aceite persistido ou revogação em PostgreSQL. Alguns nomes históricos dos testes dizem “real/API real”, mas nesta execução todas essas chamadas de navegador foram interceptadas.

## Impedimentos e autorização

1. Destinatários fora da lista continuam bloqueados na homologação restrita. A proposta mínima a autorizar é incluir somente UUIDs específicos de contas confirmadas em `participantIds`, sem tocar contas/vínculos, `.env` ou enviar e-mail. Nenhum manifesto foi alterado; os UUIDs não foram consultados em banco. É necessário o usuário fornecer as identidades autorizadas ou autorizar uma futura conferência, respeitando a proibição atual de banco.
2. Convidar pessoas ainda sem conta nessa homologação mudaria a política: exige decisão explícita e revisão coordenada de envio, primeiro acesso e aceite. Não se deve retirar apenas a checagem do envio nem trocar flags para contornar o escopo.
3. Homologar envio, aceite e revogação persistida exige autorização posterior para as ações reais pertinentes. Nenhuma dessas ações foi executada.
4. Exclusão H4.24 depende de persistência/migrations e validação segura; permanece indisponível.

## Revisão manual curta

Com o frontend já aberto, usando login existente autorizado, sem iniciar launcher de backend ou mudar configuração nesta etapa:

1. Abra Instituições → Administrar instituição → Professores → Convidar professor. Confira foco no nome, Tab/Shift+Tab, Escape, X e retorno ao botão. Reduza para 320/390 px e teste tema escuro; o modal deve rolar internamente, sem sobreposição.
2. Leia a explicação de Aluno existente e da homologação. Não clique em Enviar em ambiente real: o envio é escrita e pode disparar e-mail. Para rever permissão/inelegibilidade/duplicidade/erro de envio sem dados reais, execute o teste administrativo acima, que abre navegador automatizado com APIs interceptadas.
3. Abra `/perfil?aba=security`. Clique Sair de todos os dispositivos: confirme título, texto e ausência de checkbox. Teste Cancelar/Escape, retorno do foco e layout móvel; nenhuma dessas ações encerra sessão.
4. Para confirmar sucesso, erro e clique repetido sem revogar sessões reais, use o teste de sessão acima. Não confirme o logout no ambiente real nesta etapa. Em futura homologação autorizada, confirmar deverá levar ao login e o token anterior deverá falhar na próxima requisição protegida em outro navegador.
5. Confira que Excluir minha conta / Excluir conta continuam indisponíveis e não prometem conclusão. Nenhuma conta deve desaparecer.

Não execute `npm run dev` na raiz como parte deste roteiro: o launcher atual seleciona backend restrito e pode conectar ao serviço remoto, o que não foi autorizado nesta etapa.
