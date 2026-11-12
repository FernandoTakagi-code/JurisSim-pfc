# Questões e simulados individuais — preparação do acervo

Atualizado em 12/11/2026. Branch: `fernando/questoes-diagnostico-autoral`. Esta etapa prepara conteúdo e esclarece a interface; não publica questões nem implementa o motor de simulados individuais.

## Decisão e estado da entrega

Fernando escolheu preparar questões diferentes das respondidas no diagnóstico antes de liberar os treinos. Foram redigidos 60 rascunhos autorais assistidos por IA, separados dos 30 itens do piloto: 12 por disciplina, dois assuntos por disciplina e seis itens por assunto. Não são questões oficiais de provas anteriores. Não foi feita importação deste lote no Supabase nem ativação da prática.

- Dados editoriais: `backend/scripts/drafts/authorial-practice-60.draft.json`.
- Caderno com enunciados, alternativas, comentários e fontes: `docs/caderno-pratica-60-rascunhos.md`.
- Conferência estrutural e comparação local: `docs/conferencia-pratica-60.json`.
- Todos os registros de revisão humana e liberação continuam pendentes, com identidades e datas nulas.
- 29 níveis básicos e 31 intermediários propostos; nenhum nível empiricamente calibrado. Não foram rotulados itens como avançados apenas para preencher quota.

## Como cada área funciona hoje

| Área | Código atual | Comportamento e limite |
|---|---|---|
| Diagnóstico inicial | Fluxo próprio de diagnóstico | O piloto existente tem seu lote e sua configuração. O novo lote não altera esse fluxo. |
| Questões | `question-practice.tsx` e `question-practice-service.ts` | Treino por disciplina/assunto, 5/10/20 questões, correção a cada resposta e resultado final. Exige acervo elegível e exclui questões já respondidas pelo aluno. Continua desativado. |
| Simulados das turmas | `class-exams.tsx` e API de avaliações | Avaliações publicadas pelo professor para turmas em que o aluno está matriculado; podem ter duração definida. É funcionalidade distinta da prática individual. |
| Simulados individuais | Aviso na tela de Simulados | Ainda sem fluxo próprio implementado. A proposta é misturar disciplinas e mostrar correção ao terminar. Não existe catálogo de provas oficiais publicado por esta entrega. |

Na interface, os textos foram ajustados para explicar essa distinção. A tela de Questões não busca o catálogo desativado e não exibe erro de indisponibilidade como se fosse falha de carregamento. Seus controles ficam desabilitados enquanto a funcionalidade está fechada, inclusive em acesso direto à rota de tentativa. As avaliações de turma mantêm seu funcionamento.

## Capacidade real dos 60 itens, depois de aprovados

Estas quantidades são teóricas, considerando todos os itens aprovados e nenhum deles respondido pelo aluno. Hoje este lote tem **zero itens liberados**.

| Modalidade proposta | Estoque inicial | Possibilidade inicial |
|---|---:|---|
| Treino por assunto | 6 em cada um dos 10 assuntos | 5 questões; não 10 nem 20. |
| Treino por disciplina | 12 em cada uma das 5 disciplinas | 5 ou 10 questões; não 20. |
| Simulado individual misto | 60 no total | Seleção proposta de 30, seis por disciplina; depende de implementação. |
| Treino de 20 por disciplina | 12 em cada disciplina | Faltam pelo menos 8 por disciplina (40 no total), antes de qualquer consumo. |
| Prova completa da OAB | Cobertura limitada a 5 disciplinas e 10 assuntos | Este acervo não atende a uma prova completa nem garante representatividade do programa. |

Prática e simulado precisam compartilhar o histórico de questões respondidas. Exemplo: dez respostas em Constitucional deixam apenas duas questões inéditas nessa disciplina, impedindo um simulado balanceado que peça seis. Depois de um simulado inicial de seis por disciplina restariam seis em cada disciplina; a disponibilidade por assunto dependeria de quais itens foram selecionados. Não somar essas capacidades como se fossem estoques independentes.

O sistema deve calcular as quantidades possíveis por aluno, disciplina e assunto, excluir o diagnóstico e os demais itens já respondidos e apresentar falta de estoque antes do início. Não completar silenciosamente uma tentativa com questões repetidas. Se houver modo de revisão no futuro, identificá-lo explicitamente.

## Qualidade e fontes

Foi feita conferência preliminar assistida por IA dos dispositivos indicados em textos oficiais consultados em 12/11/2026: Constituição, Código Civil, Código Penal, Lei 9.784/1999 e CLT. Cada item contém link e artigo. Isso não equivale a revisão jurídica humana ou aprovação do orientador.

A comparação automática usou 117 entradas de referência, correspondentes a 87 enunciados únicos: pool anterior de 39, seleção de 30, lote anterior de 15 e cópia local de 33 questões do banco. A seleção de 30 está contida no pool de 39. Não houve consulta atual ao banco neste processo. Não foram encontrados enunciados normalizados idênticos. A medida de similaridade lexical serve para localizar candidatos à conferência, não certifica originalidade global nem ausência de equivalência conceitual. Os assuntos continuam relacionados ao mesmo programa; proximidade de regra jurídica não significa que a redação é inédita em todo o universo de provas.

Revisores devem resolver os itens sem consultar o gabarito, procurar outra alternativa defensável e verificar se os distratores exigem conhecimento real para serem rejeitados. Conferir também exceções, premissas, atualização normativa, clareza, tamanho e pistas das alternativas. A ordem editorial dos gabaritos não deve virar uma sequência fixa de prova. As questões e alternativas precisam preservar identidade e correção se forem embaralhadas no futuro.

## Próxima implementação

1. Revisar o lote com responsável jurídico e pedagógico; registrar correções, identidade, data real e evidência. Confirmar o escopo autoral com o orientador continua sendo pendência acadêmica.
2. Converter apenas itens liberados em manifesto próprio para prática, com assuntos-alvo compatíveis com o importador existente. Este JSON de rascunho não deve ser passado diretamente ao importador do diagnóstico ou ao importador elegível.
3. Validar a importação e sua reversão em banco isolado, preservando as revisões verdadeiras e sem interferir no diagnóstico. Só então realizar a publicação aprovada.
4. Implementar disponibilidade de estoque por aluno na API e na tela de Questões; oferecer apenas quantidades viáveis. Tratar retomada da tentativa, consumo do estoque e falta de questões.
5. Implementar o fluxo de simulado individual misto: criação balanceada proposta de 30, duração a definir, retomada, salvamento, entrega e correção apenas ao final. Manter separado das avaliações de turma e do treino com feedback imediato.
6. Testar seleção inédita, filtros, isolamento entre alunos, retomada, entrega incompleta, correção final, histórico e esgotamento do estoque. Fazer teste funcional do navegador e validação com aluno antes da liberação.

Fernando pode começar revisando o caderno por IDs e marcando dúvidas; a aprovação técnica estrutural não exige que ele assuma revisão jurídica que não realizou. Depois do piloto de conteúdo, analisar dificuldade observada, taxa de acerto e escolha dos distratores, sem concluir calibração com amostra pequena.

## Verificação reproduzível deste lote

No terminal da pasta `backend`, executar:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/audit-practice-draft.ts --out relatorio-pratica-local.json
```

Opcionalmente passar `--reference caminho/para/copia-local-de-questoes.json` para comparar também outra coleção já disponível. O arquivo deve conter somente questões, como array ou propriedade `questions`, com `enunciado`. A auditoria não conecta ao banco nem carrega arquivos de ambiente. Sem essa opção, compara os três arquivos de referência presentes no repositório; não reproduz a comparação adicional com o snapshot local de 33 itens.

Essa auditoria verifica estrutura pelo schema real do cadastro e registros editoriais; não aprova juridicamente o conteúdo nem valida elegibilidade para importação. O relatório inclui hashes dos arquivos para permitir identificar a versão conferida.

## Validação executada nesta etapa

- Auditoria offline: 60/60 itens aceitos pela projeção de campos do schema real; quatro alternativas distintas, um gabarito coerente e comentários presentes. Nenhum enunciado normalizado idêntico às referências locais comparadas.
- Build do frontend: passou (`tsc -b` e Vite); permanece o aviso de tamanho do bundle.
- Testes existentes de prática: 16/16 passaram nos quatro arquivos de serviço, repositório, rotas e configuração. A primeira execução teve três falhas de conexão local por restrição do sandbox; a repetição com acesso local passou.
- `git diff --check`: passou.
- Sem teste visual ou nova navegação funcional do navegador nesta etapa. O build e os testes existentes não demonstram o funcionamento completo do futuro simulado individual, ainda não implementado.
- Nenhuma chamada de importação ou escrita no Supabase nesta etapa.
