# Homologação dos e-mails com Brevo — complemento da Etapa 7

Data: 20/10/2026 (America/Sao_Paulo).

## Estado e autorização

Preparação local e lote real concluídos. O usuário confirmou a autorização de uso
do destinatário e autorizou explicitamente até três mensagens. O lote foi executado
uma única vez em 20/10/2026, entre 00:50 e 00:51 (America/Sao_Paulo), com
**três mensagens submetidas e três aceitas pelo SMTP do Brevo (250)**.
O envio isolado anterior foi aceito pelo SMTP e o recebimento na caixa de
entrada foi confirmado pelo usuário; ele não comprova os fluxos completos.

Somente o destinatário expressamente autorizado foi usado. Não houve repetição
do lote nem tentativas adicionais; o reenvio previsto consumiu a segunda mensagem.
Qualquer nova tentativa exige autorização específica.
Endereços de destinatários não serão registrados neste documento.

## Ambiente e proteção de dados

- PostgreSQL 17 local: o harness `backend/scripts/test-migrations-local.cjs`
  cria cluster próprio em diretório temporário e porta loopback exclusiva.
  Antes das operações, valida a identidade do cluster. As URLs locais são
  fornecidas explicitamente aos subprocessos; o banco Supabase não é acessado.
- O lote real usou `backend/scripts/homologate-brevo-local.cjs --authorized-three`,
  com cluster novo e banco exclusivo. A identidade do banco, proprietário,
  diretório e porta foram conferidos; nenhuma URL privada de banco foi utilizada.
- Migrations executadas exclusivamente nos bancos descartáveis do harness;
  nenhuma migration de produção, alteração de schema ou seed externo.
- Frontend e backend locais são exercitados pelos testes existentes. Os testes
  de navegador com persistência usam a origem `http://127.0.0.1:5184` e uma API
  loopback em porta exclusiva. A origem do frontend e `APP_PUBLIC_URL` precisam
  corresponderam também na fase real por configuração apenas do processo,
  sem editar o `.env` privado.
- O harness terminou com sucesso e parou o cluster e os servidores de teste.
  Os artefatos locais foram preservados. O lote real também terminou com remoção
  transacional da conta fictícia, auditoria e tokens, seguida do encerramento do
  PostgreSQL e dos servidores locais, sem reutilizar usuários da regressão.
- O SMTP real foi habilitado somente no lote autorizado. Transporte simulado
  foi usado para regressão, expiração, concorrência, limites e falhas de entrega.
- O arquivo privado `backend/.env` continua ignorado e não rastreado pelo Git.
  A presença das variáveis Brevo foi conferida sem imprimir os valores.
  Nenhuma credencial existente foi modificada.
- A fase real usou uma conta fictícia de aluno em banco próprio descartável,
  sem dados dos usuários da plataforma. Segredos, senhas, tokens, links completos,
  corpos de requisições sensíveis e respostas brutas SMTP não entram no relatório.
- Não houve commit, push, merge, criação de branch ou deploy. A Etapa 8 não foi iniciada.

## Lote real autorizado — máximo de três mensagens

| Ordem | Ação no frontend/backend local | Mensagens reais previstas |
| --- | --- | --- |
| 1 | Cadastro de aluno fictício com aceite legal e confirmação automática | 1 |
| 2 | Após o intervalo mínimo de um minuto, reenvio autenticado da confirmação | 1 |
| 3 | Após confirmar a conta, solicitação de recuperação de senha | 1 |
| Total | Mesmo destinatário autorizado, sem mensagens adicionais | 3 |

Sequência de validação após autorização:

1. Cadastrar pelo fluxo local, verificar persistência, senha com hash e conta
   ainda não confirmada. Verificar a primeira entrega com o titular da caixa.
2. Efetuar login limitado e confirmar bloqueio dos recursos protegidos. O sistema
   admite sessão limitada antes da confirmação; isso não equivale a acesso completo.
   Reenvio imediato deve ser recusado sem gerar mensagem adicional.
3. Aguardar o intervalo mínimo e solicitar o único reenvio aprovado. O primeiro
   link deve ser recusado após a emissão do segundo. Confirmar com o segundo
   link, verificar remoção do token da URL e recusa do uso repetido.
4. Validar acesso após confirmação e login com perfil de aluno. Solicitar a única
   recuperação aprovada, conferir recebimento e origem local do link.
5. Abrir a tela de redefinição, escolher nova senha de teste e verificar login
   com ela, recusa da senha anterior, recusa do link reutilizado e revogação das
   sessões anteriores. Senhas e tokens serão tratados somente no ambiente local.
6. Conferir caixa de entrada, spam, remetente exibido e os eventos no Brevo.
   Não solicitar que o usuário cole tokens ou links completos no chat.

Política atualizada após o lote real: confirmação de 30 minutos e recuperação
de 15 minutos, definidas em `backend/src/services/auth-token-policy.ts`.
O lote real registrado abaixo foi executado com os prazos anteriores (60/30);
seus resultados históricos foram preservados. A alteração dos prazos não envia
e-mails nem modifica tokens já persistidos, que conservam seu `expiresAt`.

Revalidação do ajuste: 441 testes do backend e build TypeScript aprovados.
A simulação completa com a política 30/15 também passou: três mensagens
fictícias, cadastro, reenvio, confirmação, recuperação, novo login e rejeição
de reuso; conta, auditoria e tokens removidos, PostgreSQL local encerrado.
Nenhuma mensagem real foi enviada para validar esta mudança.

Expiração de 30 minutos para confirmação e 15 minutos para recuperação,
limites horários, concorrência, contas excluídas e falhas SMTP são verificados
com transporte simulado. Esses cenários não consomem o lote real nem exigem
reduzir as proteções da aplicação.

## Resultados da preparação

| Verificação | Resultado |
| --- | --- |
| Backend: `npm.cmd test` | Aprovado: 441 testes, 25 suítes, transporte isolado |
| Backend: `npm.cmd run build` | Aprovado: TypeScript |
| Frontend: `npm.cmd run build` | Aprovado: TypeScript e Vite |
| Navegador: `node scripts/test-session.mjs` | Aprovado: 65 cenários; API e serviços externos isolados |
| Navegador: `node scripts/test-legal.mjs` | Aprovado: aceite, cadastro, dashboard, reenvio, falha SMTP simulada e links com sessão ativa |
| Harness PostgreSQL: migrations e schema | Aprovado: 12 migrations; instalação nova, reexecução sem pendências e ausência de divergência |
| PostgreSQL: repositórios e rotas reais | Aprovado: 43 cenários de sessões, histórico, turmas/simulados, metas/relatórios, fotos e autenticação |
| Navegador: frontend + backend + PostgreSQL, e-mail simulado | Aprovado: 7 cenários de aluno/professor, confirmação, recuperação, revogação e links reutilizados |
| Suíte de integração Vitest com PostgreSQL descartável | Aprovado: 8 testes, 1 suíte |
| Cadastro, reenvio e recuperação com SMTP real neste lote | Aprovado: três submissões e três aceitações SMTP 250 |
| Links produzidos pelos templates efetivamente enviados | Aprovado no navegador local; origem correta, confirmação, redefinição e remoção do token da URL |
| Recebimento das três mensagens na caixa de entrada ou spam | Pendente de conferência pelo titular; entrega não presumida |

## Resultado do lote real

| Cenário | Resultado observado |
| --- | --- |
| Cadastro e confirmação automática | Conta de aluno persistida com hash de senha e aceite legal; primeira mensagem aceita pelo Brevo; validade de confirmação de 60 minutos |
| Conta não confirmada e reenvio imediato | Recursos protegidos recusados; reenvio imediato bloqueado sem submissão adicional |
| Reenvio após intervalo real mínimo | Segunda mensagem aceita; link anterior recusado; novo link confirmou a conta; reuso recusado em nova aba |
| Login após confirmação e logout | Login pela interface aprovado; logout revogou a sessão anterior |
| Recuperação de senha | Terceira mensagem aceita; validade de 30 minutos; pedido imediato adicional permaneceu neutro sem novo envio |
| Redefinição e novo login | Interface redefiniu a senha; senha anterior recusada, nova senha aceita; token reutilizado e sessões anteriores recusados |
| Limite do lote | Exatamente três tentativas reservadas e três aceitas; um único destinatário, sem CC/BCC ou destinatários adicionais |
| Encerramento | Conta, auditoria e tokens removidos em transação; cluster descartável encerrado; nenhuma falha na execução real |

Os links foram capturados apenas em memória a partir do conteúdo entregue ao
transporte real, e abertos no frontend local. Não foram lidos da caixa de e-mail.
Como os tokens foram consumidos nos testes e a conta fictícia foi removida,
os links recebidos não devem ser usados posteriormente para acessar uma conta.
Não há comprovação independente do recebimento deste lote nem consulta ao
painel privado do Brevo. Aceitação SMTP não equivale a entrega na caixa de entrada.

As suítes automatizadas cobrem tokens aleatórios e hashes, uso único, expiração,
invalidação de links anteriores, cotas e concorrência, rate limiting HTTP, contas
excluídas, resposta neutra de recuperação, erro SMTP sem detalhes privados,
revogação de sessões, perfil de aluno/professor e remoção dos tokens da URL.
O navegador com API isolada cobre diagnóstico, trilhas, dashboard, turmas,
simulados, metas, relatórios e logout. Isso é evidência de regressão local,
não de entrega real pelo Brevo.

Não houve cenário reprovado na execução real final. Antes do lote, o executor
foi corrigido e validado em simulação quanto ao carregamento do TypeScript,
comparação de validade, limpeza e navegação entre abas. Nenhuma regra de
autenticação ou credencial foi alterada para executar o lote real.

Restrições do sandbox impediram inicialmente esbuild, PostgreSQL e conexão ao
Chrome. As execuções necessárias foram repetidas fora do sandbox, mantendo o
escopo local e SMTP real desabilitado. Nenhuma correção funcional foi aplicada
nesta preparação.

## Conferência de entrega no Brevo

Em **Transacional → Logs**, filtrar pelo destinatário autorizado, período e
assunto; abrir os detalhes e o histórico de cada mensagem.
Referência: [logs transacionais do Brevo](https://help.brevo.com/hc/en-us/articles/360021533839-Manage-your-transactional-logs-and-email-previews).

| Evidência | O que permite concluir |
| --- | --- |
| SMTP aceitou a mensagem | O relay aceitou a submissão; entrega ainda não comprovada |
| Evento de solicitação/processamento/envio no Brevo | A plataforma registrou ou encaminhou a mensagem; consultar a sequência de eventos |
| Evento Delivered/Entregue | O servidor do destinatário aceitou; caixa de entrada versus spam ainda depende da conferência do titular |
| Rejected, Blocked, Error, Hard/Soft bounce ou Deferred | Registrar o estado observado; rejeição, bloqueio, erro ou adiamento não comprovam entrega |
| Titular confirma recebimento | Comprova recebimento na pasta informada, distinguindo caixa de entrada e spam |

Os nomes exatos dos eventos devem ser registrados como aparecem no painel.
Um status de entrega não garante a pasta da caixa de entrada, conforme a
[documentação de eventos do Brevo](https://help.brevo.com/hc/en-us/articles/35699922048146-View-and-export-your-event-logs).

## Remetente, avisos e pendências de produção

A aplicação mantém o remetente oficial. A inspeção dos avisos no painel e dos
cabeçalhos das mensagens deste lote está pendente. Não foi constatada nesta
preparação uma alteração efetiva do remetente pelo provedor.

A documentação do Brevo informa que remetentes gratuitos ou domínios não
autenticados podem ter o endereço substituído por domínio do provedor, incluindo
`brevosend.com` e, para transacionais, `t-sender-sib.com`. Registrar o aviso e o
domínio efetivamente observados, sem copiar o endereço pessoal completo.
Referência: [requisitos para remetentes no Brevo](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).

Pendências: conferência da entrega e do conteúdo recebido; conferência do
remetente exibido e dos eventos pelo titular; domínio próprio autenticado para
produção (DKIM/DMARC e configuração aplicável); origem HTTPS de produção e
política de operação dos e-mails. Nenhuma dessas configurações foi alterada.

Os fluxos de autenticação locais com SMTP real estão **aprovados**, com três
mensagens aceitas pelo Brevo e nenhuma falha de execução. A comprovação da
entrega deste lote permanece **pendente** da caixa do titular ou dos eventos
do Brevo; não foi inferida a partir da resposta SMTP.
