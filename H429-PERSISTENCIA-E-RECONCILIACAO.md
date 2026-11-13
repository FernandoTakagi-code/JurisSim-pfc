# H4.29 — proposta de persistência de entrega e reconciliação

> Registro histórico da respectiva etapa. Testes, configurações, autorizações e impedimentos referem-se àquela execução; não comprovam o estado atual nem autorizam operações reais. Consulte a consolidação [H4.37](H437-CONSOLIDACAO-PROFESSOR.md) e o [README](README.md).

**Proposta não aplicada.** Não cria tabelas, migrations, worker, e-mails, contas ou configurações. O código atual mantém transações existentes e informa estados não confirmados; esta proposta descreve o trabalho necessário para recuperação durável e operação sem supervisão.

## Problema

Uma transação de PostgreSQL não inclui o relay SMTP. O convite precisa existir antes do envio, mas o processo pode parar antes de enviar, durante a entrega ou antes de registrar a confirmação. `PENDING` sem `sentAt` não distingue essas situações. Reenviar indiscriminadamente pode duplicar mensagens; cancelar indiscriminadamente pode invalidar um link já entregue.

## Evolução proposta

Preparar, após decisão de arquitetura, um registro de entrega associado ao convite, criado na mesma transação do convite/auditoria. Campos mínimos: identidade única da tentativa, convite, estado `PREPARED`/`DISPATCHING`/`ACCEPTED`/`NOT_ACCEPTED`/`UNKNOWN`, datas, lease, contagem de tentativas, identificador seguro do provedor quando disponível e último estágio de erro sanitizado. Índices e constraints devem impedir duas tentativas ativas incompatíveis para o mesmo convite. Resultados incertos não devem ser reenviados automaticamente.

O token original hoje existe somente em memória e no e-mail, com hash no convite. Um worker não consegue reconstruí-lo pelo hash. A proposta precisa de **payload cifrado com chave gerenciada separadamente**, prazo de retenção curto e descarte após conclusão; nunca armazenar URL/token em texto simples no outbox, evento ou log. Essa decisão introduz gestão de chave e não deve ser implementada como um campo plaintext para acelerar a entrega.

Worker com claim/lease transacional recupera tentativas antes de qualquer SMTP. Crash após entrar em `DISPATCHING` vira candidato a reconciliação, não a reenvio automático. Correlacionar identificador do provedor quando o contrato permitir. SMTP comum não garante idempotência de entrega: exatamente uma mensagem não pode ser prometida apenas com uma tabela ou lease.

Após reconciliação autorizada, uma tentativa definitivamente não aceita pode gerar nova tentativa; uma aceita mantém o link; uma desconhecida exige orientação operacional. Expiração/revogação do convite sempre prevalecem e nunca restauram privilégios ou vínculos.

## Portão de implementação/ativação

Antes de gerar uma migration definitiva, aprovar formato do payload cifrado, gestor de chaves, driver/provedor, política de retenção, efeitos do worker e comportamento em resultado desconhecido. Só então preparar schema/migration, testar em bancos descartáveis e autorizar aplicação. Não há migration “pronta” anexada porque esses contratos ainda não foram decididos; criar tabela sem consumidor seguro daria uma falsa garantia.

Testes futuros necessários: rollback de convite/outbox/auditoria; dois workers concorrentes; expiração de lease; queda antes/depois do envio; confirmação tardia; falha de persistência após aceitação; revogação concorrente; rotação de chave; descarte seguro; isolamento institucional; ausência de tokens em logs e queries públicas. Rodar primeiro com doubles e depois em ambiente descartável expressamente autorizado.

Até essa evolução, o caminho atual é síncrono, com cancelamento compensatório e estado não confirmado visível, sem reenvio inseguro. Isso é uma melhoria operacional, não uma garantia de recuperação automática após qualquer interrupção.
