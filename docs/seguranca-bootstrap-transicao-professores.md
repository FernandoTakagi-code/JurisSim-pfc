# Bootstrap administrativo e transição dos professores

## Bootstrap interno

`scripts/provision-first-admin.cjs --bootstrap-first-admin` continua sendo um
comando de operador, sem endpoint público. O identificador é recebido por
`ADMIN_PROVISION_USER_ID`; a conta deve existir, ser ALUNO, estar ativa, sem
suspensão e ter e-mail confirmado. A migration institucional precisa constar
como aplicada no ledger. Não há senha fixa, criação de conta ou mudança de e-mail.

O comando não depende de ativar o módulo. Manter `INSTITUTIONS_ENABLED=false`.
Não executar novamente no banco compartilhado nesta etapa.

A operação usa uma transação Read Committed, lock consultivo transacional
`710911`, timeout de espera de 5 segundos e lock da linha do usuário. O resultado
`void` do lock é executado por `$executeRaw`, sem desserialização. Depois de esperar
pelo lock, a leitura dos administradores vê o commit da execução anterior.

O primeiro provisionamento altera somente `role` e `sessionVersion` e registra o
evento na mesma transação. Se a auditoria falhar, a promoção e revogação de sessões
são revertidas. Repetir para a mesma identidade comprovadamente provisionada
retorna sem gravar nem incrementar a versão novamente. Outro administrador,
inclusive excluído, ou evidência de bootstrap anterior fecha o procedimento.
Não há reset automático, retry de promoção ou reabertura após excluir uma conta.

O CLI não imprime identidades, tokens, erros brutos do Prisma ou credenciais.
Importar o arquivo não carrega `.env`, não conecta nem executa provisionamento.
Cadastro público continua atribuindo ALUNO no repositório; JWTs não substituem
o papel atual consultado no backend. O comando não concede permissões por HTTP.

## Barreira de ativação

Antes de abrir a porta HTTP, o backend verifica a transição quando a flag é true.
Ele recusa a partida com mensagem explícita e contagens se houver professor ativo:

- sem e-mail confirmado;
- sem vínculo TEACHER ativo em instituição ACTIVE;
- com turma que não esteja vinculada a uma instituição em que ele tenha vínculo
  docente ativo, inclusive turmas antigas/arquivadas que precisam continuar visíveis.

Falha de consulta também impede a partida. A barreira não confirma e-mails,
não cria instituições/vínculos e não altera a flag para ocultar uma configuração
inválida. A API não chega a aceitar requests se essa ativação foi recusada.
Com a flag false, a barreira não consulta as tabelas institucionais e os fluxos
legados permanecem. A confirmação de e-mail que já era obrigatória continua sendo:
a barreira não transforma contas pendentes em contas verificadas.

É possível inspecionar a prontidão sem ativar o módulo, com autorização de leitura:

```powershell
cd backend
npm.cmd exec -- tsx scripts/check-institution-activation.ts
```

O comando abre transação READ ONLY, imprime somente contagens e retorna código 2
quando há pendências, 1 quando não conseguiu verificar, ou 0 quando todas foram
regularizadas. Não foi executado no Supabase durante esta implementação.

## Regularização posterior dos nove professores

1. Manter a flag false no ambiente compartilhado. Preservar os nove IDs existentes,
   hashes de senha, históricos e perfis; não cadastrar substitutos.
2. Cada titular entra pela autenticação atual e usa a confirmação/reenvio normal.
   O acesso completo continua bloqueado até a confirmação. Se precisar recuperar
   a senha, usar o fluxo normal; nenhum operador marca `emailVerifiedAt` manualmente.
   Envio real só deve ocorrer em etapa autorizada, com destinatários legítimos.
3. Identificar as instituições reais e seus responsáveis. Registrar para cada ID
   a instituição de destino e a autorização correspondente; não preencher com
   instituições fictícias nem inferir vínculo pelo domínio do e-mail.
4. Depois de aprovação explícita, preparar instituições aprovadas e vínculos
   legítimos em operação administrativa de transição auditada. O fluxo institucional
   público continua indisponível com a flag false; não ligar a flag para contornar
   a barreira e só depois tentar regularizar as contas. A operação excepcional de
   preparação do legado depende de autorização e execução controlada separadas;
   este trabalho não implementa nem executa um backfill automático.
5. Caso sejam usados convites, concluir sua aceitação no ambiente de preparação
   autorizado antes da troca do backend usual. O processo deve usar os mesmos IDs
   e exigir titularidade do e-mail. Professores novos continuam entrando por convite.
6. Mapear também quaisquer turmas criadas nesse intervalo às instituições reais,
   preservando seus alunos, avaliações e histórico. O levantamento anterior não
   encontrou turmas, mas não assumir que isso continuará verdadeiro na ativação.
7. Rodar a inspeção READ ONLY. A flag só poderá ser ativada após todas as pendências
   zerarem, mediante nova autorização. O teste passa se os vínculos estão corretos;
   não autoriza o vínculo nem substitui a decisão da proprietária.

## Validações direcionadas

Testes de unidade/HTTP usam dependências simuladas. O harness
`node scripts/test-first-admin-bootstrap-local.cjs` não lê `.env`, cria um cluster
PostgreSQL próprio em loopback, prepara apenas fixtures sintéticas e o encerra.
Ele força duas transações reais a esperarem simultaneamente pelo mesmo lock,
testando alvos diferentes e o mesmo alvo. Também verifica idempotência, rejeições,
revogação de sessões, preservação de dados e rollback em falha de auditoria.

Nenhuma migration, conta real, convite, e-mail, deploy, commit ou push faz parte
desses testes. A suíte geral não precisa ser repetida para executar o harness.
