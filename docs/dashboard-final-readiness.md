# Preparacao para migrations do dashboard

Este documento descreve o processo local. Nao registra estado de banco remoto,
identidade de destino, caminho ou metadados de backup.

## Plano privado

O controle grava `backend/.local/dashboard-migrations-plan.json`, ignorado pelo
Git. O arquivo guarda o fingerprint do destino, checksums das migrations e do SQL,
e o hash do backup aprovado. O caminho do backup e informado por
`JURISSIM_BACKUP_PATH` ou por `backend/.local/dashboard-migrations.private.json`:

```json
{
  "backupPath": "C:/caminho/local/para/backup.dump"
}
```

Esse arquivo privado tambem e ignorado. O modo `--prepare` calcula e grava o plano
local; `--check` compara os dados atuais com o plano exato e consulta somente
metadados; `--apply` requer autorizacao separada e o argumento
`--confirm-five-approved`. Nunca versionar o plano ou a configuracao privada.
Se o plano local estiver ausente ou divergente, interromper e revisar; nao substituir
o plano automaticamente para contornar uma falha de integridade.

## Validacoes preservadas

- O hash do backup deve corresponder ao plano local preparado e revisado.
- O fingerprint do destino, checksums individuais das migrations e checksum do lote
  SQL devem permanecer identicos entre preparacao, verificacao e eventual aplicacao.
- A aplicacao exige o conjunto e a ordem das cinco migrations previstos, ausencia de
  historico/objetos conflitantes, conexao TLS validada, permissoes esperadas e roles
  de browser sem privilegios administrativos.
- SQL e verificacoes de seguranca continuam agrupados em uma unica transacao externa,
  com lock e timeouts limitados. Qualquer divergencia interrompe o processo.
- A verificacao de seguranca consulta catalogos e privilegios; nao le registros da
  aplicacao. Nenhuma migration e executada por `--prepare` ou `--check`.

## Aplicacao futura

A execucao exige autorizacao especifica, backup recuperavel, coordenacao de janela e
revisao do plano local. Repetir `--check` imediatamente antes da aplicacao. Em erro,
timeout ou estado de commit ambiguo, parar e inspecionar metadados antes de qualquer
repeticao. Registrar migrations com `migrate resolve` somente depois de validar o
resultado; nao reaplicar SQL nem apagar estruturas automaticamente.

Testes de controle usam fixtures sinteticas e nao conectam a banco, nao leem `.env`
e nao acessam backups. O ensaio SQL descartavel e uma atividade separada; nao e
executado pelos testes unitarios.
