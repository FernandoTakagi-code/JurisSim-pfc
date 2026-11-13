# Questões e simulados individuais — preparação do acervo

> Estado posterior: o treino de Questões foi implementado e ativado como piloto local provisório. Consulte [piloto-questoes-ativado.md](piloto-questoes-ativado.md). As descrições de prática desativada abaixo registram a etapa de preparação, anterior a essa ativação; o acervo continua privado e pendente de revisão humana.

Atualizado em 12/11/2026. Branch: `fernando/questoes-diagnostico-autoral`. O simulado misto de 30 está ativo como piloto provisório no ambiente local, com migration aplicada no Supabase e teste de navegador concluído. O lote permanece privado e sem revisão humana; somente esse piloto tem seleção especial restrita ao lote. A prática em Questões segue desativada. Ver `docs/piloto-simulado-ativado.md` para o estado e os testes mais recentes.

## Decisão e estado da entrega

Fernando escolheu preparar questões diferentes das respondidas no diagnóstico antes de liberar os treinos. Foram redigidos 60 rascunhos autorais assistidos por IA, separados dos 30 itens do piloto: 12 por disciplina, dois assuntos por disciplina e seis itens por assunto. Não são questões oficiais de provas anteriores. Após autorização de Fernando, os 60 foram cadastrados no Supabase como privados, sem preencher revisões ou liberação. A prática continua desativada.

Lote no banco: `9218bdec-f4e3-43a1-8b54-cdc40720dea5`. Total de questões passou de 63 para 123. A comparação posterior confirmou que os 63 registros anteriores, incluindo suas alternativas, permaneceram intactos. Repetir a importação recuperou o mesmo lote e criou zero registros adicionais. A autoria administrativa registra o operador da importação; a origem continua `IA`, sem atribuição de revisão humana.

- Dados editoriais: `backend/scripts/drafts/authorial-practice-60.draft.json`.
- Caderno com enunciados, alternativas, comentários e fontes: `docs/caderno-pratica-60-rascunhos.md`.
- Conferência estrutural e comparação local: `docs/conferencia-pratica-60.json`.
- Todos os registros de revisão humana e liberação continuam pendentes, com identidades e datas nulas.
- 29 níveis básicos e 31 intermediários propostos; nenhum nível empiricamente calibrado. Não foram rotulados itens como avançados apenas para preencher quota.

## Como cada área funciona hoje

| Área | Código atual | Comportamento e limite |
|---|---|---|
| Diagnóstico inicial | Fluxo próprio de diagnóstico | O piloto existente tem seu lote e sua configuração. O novo lote não altera esse fluxo. |
| Questões | `question-practice.tsx` e `question-practice-service.ts` | Consulta estoque inédito por aluno e filtro, permite apenas quantidades viáveis e indica tentativa para retomar. Correção a cada resposta e resultado final. Exige acervo elegível. Continua desativado. |
| Simulados das turmas | `class-exams.tsx` e API de avaliações | Avaliações publicadas pelo professor para turmas em que o aluno está matriculado; podem ter duração definida. É funcionalidade distinta da prática individual. |
| Simulados individuais | `individual-exam.tsx`, API e serviço próprios | Piloto provisório ativo localmente: 30 questões, seis por disciplina, salvamento, retomada e correção na entrega. Revisões humanas pendentes e aviso preservado no resultado. Não é catálogo de provas oficiais. |

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

A prática agora calcula as quantidades possíveis por aluno, disciplina e assunto e apresenta falta de estoque antes do início. O histórico de respostas já usado pelo repositório cobre as respostas de simulados do aluno, incluindo diagnóstico; o lote privado não compõe a seleção elegível. O simulado misto implementado também exclui questões já respondidas. Não completar silenciosamente uma tentativa com questões repetidas. Se houver modo de revisão no futuro, identificá-lo explicitamente.

Nova consulta autenticada: `GET /question-practice/catalog/:discipline/availability?topic=...`. Retorna contagem disponível, quantidades viáveis entre 5/10/20, contagens por assunto e ID/quantidade/assunto da prática em andamento, sem enunciados ou gabaritos. Usa as mesmas restrições de funcionalidade e papel ALUNO das demais rotas e resposta `Cache-Control: no-store`. A disponibilidade é uma fotografia do momento: iniciar a prática continua verificando o estoque no servidor. Retomar não depende de haver estoque para uma nova tentativa.

## Qualidade e fontes

Foi feita conferência preliminar assistida por IA dos dispositivos indicados em textos oficiais consultados em 12/11/2026: Constituição, Código Civil, Código Penal, Lei 9.784/1999 e CLT. Cada item contém link e artigo. Isso não equivale a revisão jurídica humana ou aprovação do orientador.

A comparação automática usou 117 entradas de referência, correspondentes a 87 enunciados únicos: pool anterior de 39, seleção de 30, lote anterior de 15 e cópia local de 33 questões do banco. A seleção de 30 está contida no pool de 39. Não houve consulta atual ao banco neste processo. Não foram encontrados enunciados normalizados idênticos. A medida de similaridade lexical serve para localizar candidatos à conferência, não certifica originalidade global nem ausência de equivalência conceitual. Os assuntos continuam relacionados ao mesmo programa; proximidade de regra jurídica não significa que a redação é inédita em todo o universo de provas.

Revisores devem resolver os itens sem consultar o gabarito, procurar outra alternativa defensável e verificar se os distratores exigem conhecimento real para serem rejeitados. Conferir também exceções, premissas, atualização normativa, clareza, tamanho e pistas das alternativas. A ordem editorial dos gabaritos não deve virar uma sequência fixa de prova. As questões e alternativas precisam preservar identidade e correção se forem embaralhadas no futuro.

## Próxima implementação

1. Revisar o lote com responsável jurídico e pedagógico; registrar correções, identidade, data real e evidência. Confirmar o escopo autoral com o orientador continua sendo pendência acadêmica.
2. Converter apenas itens liberados em manifesto próprio para prática, com assuntos-alvo compatíveis com o importador existente. Este JSON de rascunho não deve ser passado diretamente ao importador do diagnóstico ou ao importador elegível.
3. Validar o fluxo de publicação aprovado e sua reversão em banco isolado, preservando as revisões verdadeiras e sem interferir no diagnóstico. O cadastro privado já foi realizado; não repeti-lo pelo importador elegível como se fossem questões diferentes.
4. A disponibilidade da prática está implementada na API e na tela de Questões. Depois da liberação do acervo, validar funcionalmente esse fluxo no navegador antes de ativar as flags para alunos.
5. Simulado misto implementado, migration aplicada e piloto validado no navegador: 30 questões, seis por disciplina, retomada, salvamento e correção na entrega, sem limite de tempo nesta versão. A publicação definitiva continua dependendo de revisão real; o piloto usa rascunhos identificados como provisórios.
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
- Testes focados: 25/25 passaram em cinco arquivos, incluindo novo importador privado, disponibilidade, isolamento de histórico por aluno, estoque insuficiente, retomada e proteção da rota. Build do backend também passou.
- `git diff --check`: passou.
- Sem teste visual ou nova navegação funcional do navegador nesta etapa. O simulado misto passou posteriormente no teste HTTP/banco isolado, documentado em `docs/simulado-individual-e-capacidade.md`; isso não substitui a validação de interface no navegador.
- Importação no Supabase: 60/60 questões privadas e pendentes, quatro alternativas e um gabarito em cada. Nova execução criou zero duplicatas. Integridade dos 63 registros anteriores confirmada. Nenhuma publicação ou alteração de flag foi realizada.
