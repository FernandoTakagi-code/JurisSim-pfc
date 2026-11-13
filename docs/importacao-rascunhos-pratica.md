# Cadastro privado do lote de prática

Em 12/11/2026, Fernando autorizou cadastrar as 60 questões no Supabase e avançar a implementação. O lote foi armazenado como rascunho privado; cadastrar não representa aprovação jurídica ou pedagógica nem liberação para alunos.

| Dado verificado | Resultado |
|---|---|
| Lote | `9218bdec-f4e3-43a1-8b54-cdc40720dea5` |
| Hash do plano de importação | `447f92c90a9a936d68541e9bd432cdad3e962e803f022a45a89a3943b352aac7` |
| Questões cadastradas | 60 |
| Alternativas | 240, quatro por questão e um gabarito |
| Visibilidade | Privadas (`publica=false`) |
| Revisão jurídica / pedagógica / liberação | Campos nulos; não realizadas |
| Origem | IA, preservada |
| Conteúdo editorial | IDs TRE, fontes, comentários por alternativa, habilidade, nível proposto e revisão preliminar preservados em `fonteReferencia` |
| Repetição do comando | Mesmo lote, zero novas questões |
| Total no banco | 63 antes, 123 depois |
| Integridade anterior | 63 questões e suas alternativas sem alterações |

O campo `autorId` identifica o administrador que cadastrou as questões, não uma declaração de autoria intelectual humana. As flags do diagnóstico e da prática não são alteradas pelo importador. Os rascunhos não entram no estoque elegível da prática, que exige visibilidade e liberação.

## Importador de manutenção

Na pasta `backend`, o comando abaixo valida o JSON e mostra uma identificação opaca do destino. Não se conecta nem escreve sem `--apply`:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/import-practice-drafts.ts
```

A aplicação exige `--operator-id`, `--target-id` conferido na prévia e `--receipt` para salvar o comprovante. O operador deve ser ADMIN ativo. O comando não imprime URLs, senhas ou detalhes de conexão. Usa transação serializável e bloqueio do lote; recusa conteúdo já existente, aprovações preenchidas, alternativas duplicadas, gabarito inconsistente e lote parcial. Não sobrescreve conteúdo.

O hash e os fingerprints permitem recuperar uma execução já concluída sem duplicar questões. Modificar o JSON depois do cadastro não atualiza automaticamente o lote: revisões futuras precisam de fluxo explícito de edição/publicação dos registros já existentes.

O arquivo JSON editorial e a auditoria offline registram a preparação anterior à importação; não são manifestos de conteúdo aprovado. O comprovante da operação e a verificação de integridade estão nos artefatos de entrega locais, sem credenciais.

## Se o lote precisar ser retirado

Identificar exclusivamente o lote acima e conferir seus 60 IDs com o recibo antes de qualquer exclusão. Verificar novamente se houve publicação, edição, associação com avaliações, inclusão em simulados ou respostas. Enquanto privados, os itens não são selecionados pela prática, mas essa condição deve ser reconfirmada no momento da retirada.

Se não houver uso, uma manutenção transacional pode remover as alternativas e questões desse lote, mantendo o registro de auditoria e identificando o motivo da retirada. Se houver avaliações, simulados ou respostas vinculadas, retirar de circulação e preservar o histórico; não apagar respostas de alunos para forçar uma exclusão. Não executar exclusão por disciplina, por origem IA ou por quantidade total: isso poderia alcançar o diagnóstico ou outros acervos. Nenhuma remoção foi executada nesta entrega.
