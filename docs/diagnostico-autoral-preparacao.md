# Preparação do diagnóstico autoral

Implementação local em 11/11/2026, organizada na branch `fernando/questoes-diagnostico-autoral`. Não houve importação de questões reais, escrita/migration/seed no Supabase, ativação de flags ou push. Migrations e dados fictícios foram usados exclusivamente no cluster descartável do ensaio.

## Onde cada parte entra

- O formulário de professor e o CRUD já foram ajustados para quatro alternativas A–D e um gabarito escolhido. Isso é cadastro, não aprovação jurídica.
- O caderno editorial contém enunciados, alternativas, comentários, fontes e níveis provisórios. Continua fora do banco.
- Esta implementação altera a seleção do diagnóstico inicial e a preparação/validação do lote para futura importação. Não acrescenta uma nova tela nem faz as questões aparecerem no frontend.

## Composição opcional

`INITIAL_DIAGNOSTIC_COMPOSITION_MODE` aceita:

| Modo | Por disciplina | Total |
|---|---|---:|
| `MISTA_15_15` | 2 básicas IA, 1 intermediária IA, 1 intermediária oficial, 2 avançadas oficiais | 30 |
| `AUTORAL_30` | 2 básicas IA, 2 intermediárias IA, 2 avançadas IA | 30 |

O padrão continua `MISTA_15_15`; o novo modo precisa de escolha explícita. Neste projeto, o acervo autoral assistido por IA continua com origem `IA`, sem reclassificá-lo como conteúdo oficial ou atribuí-lo a professor. A variável muda a política para novas tentativas; não habilita a API e não ignora revisões e liberação. Tentativas existentes continuam sendo recuperadas pelos IDs já persistidos, sem recomposição.

A seleção mantém 30 IDs distintos, seis por disciplina, e prioriza questões inéditas. A regra anterior de reutilizar questões do histórico quando faltam inéditas na categoria foi preservada; não há promessa de ineditismo global absoluto no diagnóstico. A prática possui regras próprias de exclusão de histórico. Se faltar estoque elegível, nenhuma tentativa parcial é criada.

## Preparar o lote editorial

Executar os comandos abaixo dentro da pasta `backend`. Os caminhos de exemplo pressupõem a organização local deste trabalho, com `outputs` dois níveis acima. O preparador não usa banco, não sobrescreve arquivo existente e mantém identidades, datas e evidências de revisão como estão, inclusive valores nulos.

```powershell
npm.cmd run question-bank:prepare-authorial -- --input scripts/drafts/authorial-diagnostic-30.draft.json --output ../../outputs/lote-diagnostico-autoral-30-preparado.json
```

O arquivo de saída foi preparado nesta etapa; repetir o comando com o mesmo destino é recusado para preservar o arquivo. Para regenerar após revisão editorial, usar um novo nome versionado.

O preparador confere quantidade, IDs, origem, visibilidade, distribuição, alternativas e fontes. Converte a lista editorial de referências para o campo textual do importador. Mantém comentários individuais no arquivo; o importador atual grava texto/correção das alternativas e a fundamentação geral, mas não persiste os comentários individuais em coluna própria. Eles continuam disponíveis no caderno.

## Prévia sem conexão

```powershell
npm.cmd run question-bank:import -- --input ../../outputs/lote-diagnostico-autoral-30-preparado.json --mode AUTORAL_30 --scope DIAGNOSTIC_ONLY
```

Sem `--apply`, esse comando não conecta a banco. A prévia do lote real retornou **zero itens elegíveis**, com 30 pendências de revisão/publicação/fonte/evidências e 15 categorias sem estoque elegível. As fontes estão presentes; a mensagem agrupa esses campos e, neste lote, as identidades/datas/evidências de revisão e liberação continuam nulas. As 45 ocorrências não significam 45 erros jurídicos.

Os dois escopos são explícitos:

- `DIAGNOSTIC_ONLY`: valida a composição do diagnóstico sem exigir cobertura prática por disciplina. Assuntos de prática que forem declarados ainda precisam cumprir seus requisitos.
- `DIAGNOSTIC_AND_PRACTICE`: padrão preservado; também exige assunto declarado e ao menos cinco questões por assunto-alvo em cada disciplina. Essa contagem não certifica que sobrarão questões inéditas após o diagnóstico.

O lote preparado contém `practiceTopics: []`. Não preenchemos assuntos artificiais nem evidências fictícias para fazê-lo passar. `--apply` continua sujeito às barreiras anteriores de estágio, destino permitido, administrador, revisores, evidências, duplicatas e transação. A escolha de modo/escopo não autoriza gravação no banco compartilhado.

## Validação executada

- 92 testes direcionados passaram em nove arquivos: modo autoral, composição mista, seleção, preparação editorial, importador, serviços, rotas e repositórios simulados.
- A suíte completa executou 996 testes: 989 passaram e sete falharam nos mesmos contratos anteriores (`auth-routing`, prévia CSV descontinuada e mensagens de acesso às trilhas). Nenhuma nova falha nesses resultados.
- Build do backend e checagem TypeScript explícita dos quatro scripts alterados/novos passaram.
- A prévia real recusou o lote pendente de revisão, sem conexão.
- A execução direta do cenário de banco sem prova do harness foi recusada antes de qualquer escrita ou consulta de identidade no banco.

Os testes unitários e de rota acima usam persistência simulada. Além deles, foi executado o ensaio abaixo em PostgreSQL real. O cenário novo não prova concorrência entre dois escritores simultâneos; ele verifica o fluxo de importação, duplicata sequencial, seleção, persistência e resultado descritos.

## Ensaio executado em PostgreSQL descartável

Inicialmente não foram encontrados os executáveis necessários. Para concluir o ensaio, foram baixados os [binários portáteis oficiais da EDB](https://www.enterprisedb.com/download-postgresql-binaries), PostgreSQL 17.11, para `work/postgresql-edb-17`. Não foi instalado serviço permanente. O pacote completo usado foi `postgresql-17.11-5-windows-x64-binaries.zip`. Um pacote de servidor sem cliente, obtido antes via npm, não foi usado no ensaio final.

O comando executado, dentro de `backend`, usou o harness existente para criar seu próprio cluster, aplicar migrations somente nele e verificar sua identidade. Não aceita uma URL do Supabase ou de outro banco existente.

```powershell
node scripts/test-migrations-local.cjs "../../work/postgresql-edb-17/pgsql/bin" --authorial-diagnostic-only
```

O cenário `scripts/test-authorial-diagnostic-db.ts` usou apenas questões e usuários sintéticos, marcados `FIXTURE_ONLY`. Todos os passos abaixo passaram:

1. Prévia sem persistência e importação pelo CLI real.
2. Recusa de lote duplicado sem novos registros.
3. Seleção de 30 autorais, duas por nível em cada disciplina, e retomada estável.
4. Resposta às 30 questões sem exposição de gabarito durante a tentativa.
5. Finalização com 15 acertos, resultado de 50% e preservação da tentativa concluída.

O harness aplicou 21 migrations em instalação nova, confirmou que a segunda aplicação não tinha migrations pendentes, preservou checksums históricos e não detectou divergência de schema nos bancos de histórico, instalação nova e integração. O processo encerrou com código 0 e parou o cluster.

Artefatos retidos pelo harness: `C:\Users\ferna\AppData\Local\Temp\jurissim-migrations-Rm4rIc`. Nenhuma credencial real foi necessária. Dados de revisão sintéticos existem somente nas fixtures do teste; não foram transferidos ao lote editorial.

## O que falta para integrar

Concluir as revisões humanas e confirmar a composição com orientador/equipe. Depois, preparar a integração no ambiente autorizado, com evidências verdadeiras. O ensaio técnico isolado já passou. As nove reservas ainda não oferecem cobertura de prática por disciplina e assunto. Esta entrega prepara o fluxo; não libera o conteúdo aos alunos.
