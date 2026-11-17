# Preparação da entrega para Fernando — 16/11/2026

> Registro histórico da preparação. Após autorização, os cinco commits foram criados e a integração remota foi iniciada. Consulte `integracao-final-fernando-2026-11-16.md` para os resultados posteriores. As afirmações de “não commitado” abaixo descrevem o momento anterior à autorização.

**Preparação concluída, aguardando autorização. Nenhum arquivo foi adicionado ao stage e nenhum commit, merge ou push foi executado nesta etapa.** Nenhuma operação foi executada no Supabase durante a preparação.

## Git e destino

- Branch atual e recomendada para compartilhamento: `entrega-16-11`.
- HEAD local: `df01e20`.
- `git fetch origin` atualizou a referência compartilhada para `c8db1ba`.
- Divergência: **5 commits locais exclusivos e 2 remotos exclusivos**. A base comum é `6fead5d`.
- Commits locais a preservar: `dbcd436`, `d0072cb`, `6046a25`, `1a4c025`, `df01e20`.
- Commits remotos exclusivos: `0f96026` (usabilidade docente) e `c8db1ba` (atividades, formulário compartilhado de questões e acervo piloto).
- `origin/entrega1611` está em `6e201fc`; não contém atualização exclusiva em relação ao HEAD atual. A branch local antiga `entrega1611` está em `6fead5d` e também é ancestral do HEAD.
- Não há merge em andamento, arquivos não mesclados, arquivos excluídos ou alterações staged. Há **28 arquivos rastreados modificados e 31 novos**, incluindo este relatório e o manifesto de commits.

Não comparar apenas as árvores finais: o diff direto com o remoto mostra as três migrations históricas e os modelos docentes como ausentes do outro lado porque aquele histórico ainda não recebeu os cinco commits locais. Os dois commits novos de Fernando **não apagam essas migrations**. Não substituir o schema ou a árvore local pela versão remota.

## Alterações do Fernando

`0f96026` modifica navegação docente, atividades, relatórios, shell, testes e simulados. Partes de `ExamsPage`/`ExamForm` desse commit já foram aproveitadas no arquivo local `class-exams.tsx`, incluindo turma inicial, apresentação das ações, paginação e tratamento de rascunhos conforme a capacidade disponível. Isso é integração por conteúdo, **não incorporação integral do commit**.

`c8db1ba` extrai `question-form.tsx`, integra o formulário às atividades, adiciona `class-activity-eligibility.ts`, controla explicitamente o acervo piloto de atividades e corrige textos institucionais. Está preservado no remoto e **ainda não foi integrado localmente**. Não foi alterada a regra docente de seleção de questões por esta preparação.

Sobreposições que exigem atenção no futuro merge:

| Arquivo | Combinação necessária |
|---|---|
| `frontend/package.json` | Preservar todos os scripts novos locais e os testes de atividade/workspace do remoto. |
| `frontend/src/administration.tsx` | Manter os indicadores disponíveis, o acesso editorial local já existente e os ajustes do colaborador. |
| `frontend/scripts/test-administration.cjs` | Unir expectativas de ambas as versões, sem relaxar os testes. |
| `frontend/src/class-exams.tsx` | Reconhecer os trechos de `0f96026` já aproveitados; preservar ajustes locais adicionais. |

O remoto também altera `integration-shell.tsx`. O Perfil/configurações aprovado deve permanecer com o layout e comportamento atuais; não escolher um arquivo completo de qualquer lado. O formulário compartilhado de questões e a nova política de atividades dependem de arquivos novos do mesmo commit e precisam ser integrados juntos, mantendo as capacidades de piloto desativadas por padrão.

Esses são **riscos de conflito**, não conflitos de merge já criados. Nenhum merge foi iniciado para produzir essa análise.

## Arquivos propostos e organização dos commits

O inventário completo, arquivo por arquivo, está em `docs/manifesto-commits-propostos-2026-11-16.json`. A proposta contém **56 arquivos**, em cinco grupos:

1. **Corrige treinos do aluno e preserva liberações administrativas auditáveis** — 15 arquivos: serviços/política e scripts de auditoria, publicação e verificação; repositório e serviço de treino; interface do aluno; testes API/Chrome; manifesto público dos 29 IDs; `.gitignore` e `.env.example` sem credenciais.
2. **Corrige retomada de trilhas com tentativas persistidas** — 6 arquivos: IDs persistidos no resumo, retomada sem gerar tentativa duplicada e testes correspondentes.
3. **Preserva consultas administrativas e controles de escrita local** — 19 arquivos: indicadores administrativos, rota de consulta editorial de etapa anterior, segurança de escrita local, testes, carregamento separado e ajustes de cabeçalho existentes. A interface editorial anterior foi preservada, não removida; ela **não é requisito** para a autorização administrativa das 29 questões e sua escrita continua desativada por padrão.
4. **Preserva melhorias compatíveis de simulados e validação docente** — 5 arquivos: melhorias locais de apresentação já analisadas, testes e integração dos comandos de teste no `package.json`. Não são substituição do trabalho novo de Fernando.
5. **Documenta validação, limites e continuidade pela equipe** — 11 arquivos: relatórios técnicos e manifesto desta entrega.

Os grupos incluem testes junto aos contratos funcionais que verificam. O pacote final de scripts de frontend vem depois dos arquivos que referencia. A lista precisa ser conferida novamente antes de cada commit; ela não deve justificar incluir alterações novas surgidas depois desta auditoria sem análise.

## Arquivos que ficam locais

- `.env` reais e suas variantes, `backend/.local/`, logs, `node_modules`, builds e `.artifacts` estão ignorados. Não há `.env` real rastreado.
- Dois CSVs de auditoria dos 183 registros contêm metadados do acervo privado. Foram preservados no disco e adicionados explicitamente ao `.gitignore`; não entram nos commits. O manifesto dos 29 IDs contém somente o conjunto público aprovado e os hashes, sem enunciados, gabaritos ou identidade pessoal do ADMIN.
- Três PNGs rastreados em `docs/evidence/teacher-management-live/activities-{1440,768,390}.png` foram regenerados em testes. Ficam **fora dos commits propostos**, preservados no disco. Como já são rastreados, o `.gitignore` não os exclui automaticamente: não usar `git add -A` na raiz.
- E-mails reais antes fixados em scripts e na documentação operacional foram substituídos por parâmetros explícitos e referência à auditoria do banco. O vínculo real registrado no Supabase não foi alterado.
- A verificação pode operar sem o snapshot privado anterior: nesse caso informa comparação histórica não disponível em vez de inventar uma confirmação. Os backups não precisam ser copiados ao repositório do colaborador.
- A busca por padrões de chaves privadas, JWTs completos, chaves de provedores e e-mails pessoais nos arquivos propostos não encontrou ocorrências após a preparação. É uma verificação de padrões, não uma garantia absoluta contra qualquer segredo.

## Validação

| Verificação | Resultado |
|---|---|
| Build backend / TypeScript | Aprovado. |
| Build frontend / TypeScript / Vite | Aprovado; permanecem avisos de tamanho de bundle e anotações de dependências. |
| Unitários backend | **1.494 aprovados**, 109 arquivos. |
| Scripts estáticos frontend | **10 scripts aprovados**, incluindo ADMIN, acesso docente, navegação institucional, simulados e trilhas. |
| Integração de treino e tentativas | **39 aprovados**, quatro arquivos, em PostgreSQL descartável. |
| Chrome com API/DB reais isolados | Treinos de cinco nas cinco disciplinas; filtro insuficiente/removido; clique repetido na disciplina; interrupção, recarga e retomada; resposta/correção, finalização, histórico, desempenho; revisão separada de Civil preservando histórico e totais originais. |
| Estoque de 10/20 | Botões bloqueados no navegador quando o conjunto tem 5–6 questões; tamanhos maiores continuam testados com estoque suficiente nos testes isolados existentes. |
| Perfil/configurações | Hashes dos arquivos protegidos conferidos, sem alteração. |
| Git | `git diff --check` aprovado; stage e conflitos vazios. |

O teste de navegador usa login normal de uma conta criada **exclusivamente no PostgreSQL descartável**, com Express e frontend reais. Não usa mocks de sessão/fetch e não escreve no Supabase. A preparação não executou novas migrations; a aplicação de 32 migrations no descarte pertence à validação isolada iniciada na tarefa anterior. Nenhuma migration foi aplicada ao banco real.

Esses resultados validam o **código local**, não o resultado de um merge futuro com `c8db1ba`. Os checks precisam ser repetidos após a integração remota, principalmente atividades e navegação docente. Não foi declarada aprovação de toda a suíte ampla de integração; rodadas amplas anteriores tiveram falhas intermitentes de ambiente, documentadas nos relatórios anteriores.

## Situação de Civil e das 29 questões

Há seis elegíveis em Constitucional, Civil, Penal e Trabalho e cinco em Administrativo. A autorização foi gravada em etapa anterior por 29 eventos auditáveis, sem atualização de questões/revisores/licenças e sem migration. A preparação atual **não republicou nem revogou** questões.

O aluno João já respondeu às seis de Civil em uma trilha concluída. Zero inéditas para essa conta é correto; não apagar respostas nem reaproveitá-las silenciosamente como inéditas. O filtro de revisão “Todas as respondidas” tem seis questões e permite selecionar cinco; “Somente erradas” tem quatro. O serviço existe, mas as flags de revisão estão desativadas no ambiente real/local atual. Não foram habilitadas nesta preparação.

Existe também uma correção real de frontend: clicar na disciplina já selecionada não pode apagar a disponibilidade sem disparar consulta. Ela está implementada e coberta pelo teste no Chrome. O usuário também pode remover explicitamente um filtro de assunto insuficiente quando há estoque de cinco na disciplina.

Não foram fabricadas revisões jurídicas. A revisão de conteúdo por advogado continua pendente e é distinta da revisão de respostas feita pelo aluno.

## Como Fernando deve testar

1. Receber a branch compartilhada somente depois dos commits e da integração autorizados. Não substituir o schema recuperado por uma cópia antiga.
2. Instalar dependências de frontend/backend com os lockfiles existentes. Criar sua configuração local a partir dos templates; obter credenciais por canal privado. Não copiar backups nem `.local` desta máquina.
3. Executar `npm run build` nos dois diretórios, `npm test` no backend e `npm run test:delivery-static` no frontend. No PowerShell, usar `npm.cmd` se a política bloquear `npm.ps1`.
4. Para escrita funcional, usar o harness descartável: no diretório backend, `node scripts/test-migrations-local.cjs "<DIRETORIO_BIN_DO_POSTGRESQL>" --question-practice-only`. Esse comando exige PostgreSQL local e cria seu próprio descarte; não aceita URL de Supabase nem usa `.env` como destino de teste. A validação inclui navegador Chrome instalado e a base temporária. Não usar esse fluxo para aplicar migrations no banco compartilhado.
5. Validar Civil com aluno isolado sem respostas anteriores; conferir também a retomada e a revisão sem alterar o histórico original. A conta real de João não é evidência de falha quando o estoque de inéditas está esgotado.
6. O backend de desenvolvimento necessita das capacidades de treino e de UI coerentes, e a política de liberação administrativa exige `QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED=true` no processo autorizado. Os templates mantêm novas capacidades desativadas por padrão. Não ligar flags de módulos ou escrita real apenas para passar um teste.
7. `node scripts/publish-owner-practice.cjs` é **somente dry-run**, inclusive sem `.env`. A liberação existente já foi aplicada; não reaplicar para testar. Publicar ou revogar no banco real exige nova autorização e argumentos explícitos `--actor-email` e `--authorization-ref`/`--reason`.
8. A verificação real `node scripts/verify-owner-practice.cjs` usa somente leitura e necessita da conexão privada existente e do build backend. `--actor-email` é opcional para verificar adicionalmente a identidade do responsável. Se o snapshot privado anterior não estiver disponível, a comparação de antes/depois fica declarada não verificada; não copiar dados reais para preencher isso.

## Sequência proposta para publicar — NÃO executada

Após autorização, revisar/stagear **somente os arquivos de cada grupo do manifesto**, confirmar o diff staged e criar os cinco commits em português. Não usar adição global por causa dos PNGs rastreados.

```text
git status --short
git add -- <arquivos explícitos do grupo>
git diff --cached --check
git diff --cached --stat
git commit -m "<título do grupo no manifesto>"
# Repetir por grupo, conferindo conteúdo e segredos antes de confirmar.
git fetch origin
git merge --no-commit --no-ff origin/entrega-16-11
# Analisar/resolver sobreposições, preservar schema/SQLs/Profile e repetir checks.
git diff --check
git commit -m "Integra atualizações do Fernando preservando o trabalho consolidado"
git rev-list --left-right --count HEAD...origin/entrega-16-11
# A coluna de commits exclusivos do remoto precisa estar zerada.
git push -u origin entrega-16-11
```

Nenhum `reset`, `clean`, push forçado, alteração da main ou deploy faz parte do plano. Se o remoto avançar novamente ou surgir conflito de implementação, pausar apenas essa integração e revisar antes de substituir trabalho. **O push direto do estado atual não é apropriado: há divergência real de histórico.**
