# Integração final para entrega — 16/11/2026

Integração local autorizada e validada. **Push, deploy e alterações no Supabase não foram executados.** Este relatório integra o commit de merge final.

## Commits locais preparados

| Hash | Mensagem |
|---|---|
| `fb3ce1f` | Corrige treinos do aluno e preserva liberações administrativas auditáveis |
| `3fd8d8d` | Corrige retomada de trilhas com tentativas persistidas |
| `0ba1267` | Preserva consultas administrativas e controles de escrita local |
| `38b1cab` | Preserva melhorias compatíveis de simulados e validação docente |
| `70eacbe` | Documenta validação, limites e continuidade pela equipe |

As alterações remotas `0f96026` e `c8db1ba` foram integradas por merge, mantendo a autoria e o histórico dos colaboradores. O merge não recria os trechos de simulados já aproveitados por conteúdo. A base consolidada `df01e20`, seus cinco commits exclusivos anteriores, as três migrations históricas recuperadas e os modelos docentes foram preservados. O schema e os SQLs locais não tiveram modificações neste merge.

## Conflitos e preservação funcional

- `frontend/package.json`: união das duas listas de testes, sem duplicação de entradas. A lista final possui 12 scripts, incluindo os novos testes de workspace docente e editor de atividades de Fernando.
- `frontend/src/class-exams.tsx`: mantida a condição que só mostra “Mais ações” quando há operações disponíveis. Permanecem as melhorias remotas de turmas e os ajustes locais de simulados, seleção inicial de turma, permissões e rascunhos.
- `frontend/src/integration-shell.tsx`: o merge automático trouxe a navegação docente centralizada. O bloco `ProfileSettings` foi comparado por conteúdo com a versão aprovada e permaneceu idêntico. O texto do cabeçalho de Perfil foi preservado; a classe visual docente nova é aplicada somente fora das telas de Perfil, evitando que os estilos docentes alterem esse layout. Os demais arquivos protegidos de Perfil mantiveram os hashes anteriores.
- O formulário de questões foi extraído por Fernando para `question-form.tsx`, reutilizado nas atividades. A extração preserva o formulário; não é remoção de funcionalidade. A política de acervo piloto de atividades permanece explicitamente opt-in, desativada por padrão no template.
- Os relatórios docentes mantêm compatibilidade com links antigos e são apresentados em Desempenho. A administração conserva a rota editorial de consulta e os indicadores funcionais. A navegação institucional e as correções de caracteres do colaborador foram mantidas.

## Validação

- Builds backend/TypeScript e frontend/TypeScript/Vite aprovados. Avisos de tamanho de bundle e anotações de dependências permanecem sem erro de compilação.
- **1.498 testes unitários aprovados**, 110 arquivos. O código de saída foi confirmado como zero por subprocesso, pois o PowerShell havia tratado um aviso de configuração do Vite em stderr como erro de shell.
- **12 scripts estáticos frontend aprovados**, incluindo ALUNO, ADMIN, Professor, Instituição, editor de atividades, simulados e navegação docente.
- Suíte completa de integração: **195 aprovados e 9 ignorados**, 20 arquivos aprovados e um arquivo condicional ignorado, sem falhas. Os oito cenários positivos de exclusão de conta dependem de ativação explícita; um teste de envio real de e-mail exige autorização/configuração própria. Não foram ativados para forçar aprovação. A suíte usa exclusivamente PostgreSQL descartável, autenticação real na API de teste e testes de navegador, sem escrita no Supabase.
- Os testes de treino de cinco nas cinco disciplinas e revisão de Civil passaram novamente após o merge, assim como os fluxos administrativos/institucionais e de autorização docente disponíveis na suíte. Os 32 scripts de migration passaram no descarte, com checksums históricos preservados e ausência de drift nas bases vazia, evoluída e de integração. Nenhuma migration foi aplicada ao banco real.

## Questões do aluno e Civil

A liberação administrativa dos 29 IDs ocorreu na etapa autorizada anterior e não foi repetida por esta integração. Nenhuma revisão jurídica foi inferida. A política específica do treino continua independente dos simulados e das atividades.

Civil possui seis questões administrativamente autorizadas; a conta real de João já respondeu às seis numa trilha concluída. Zero inéditas para essa conta é um resultado correto, não motivo para reiniciar o histórico. A revisão permite cinco no filtro “Todas as respondidas”; o filtro “Somente erradas” tem quatro. A capacidade de revisão continua dependente de ativação explícita no ambiente real.

O teste de navegador usa um aluno novo no banco descartável e valida cinco questões em cada disciplina, assunto insuficiente e retorno a todos os assuntos, clique repetido na disciplina, retomada após interrupção, respostas, correção, finalização, histórico e desempenho. Também verifica revisão separada de Civil sem alterar histórico/totais originais e mantém 10/20 desabilitados quando o estoque não comporta esses tamanhos. Os fluxos maiores continuam cobertos com estoque isolado suficiente.

## Segurança e arquivos locais

- Nenhum `.env` real, chave, token, senha, backup ou CSV de metadados privados foi adicionado aos commits.
- Foi feita busca de padrões de chaves privadas, JWTs completos e chaves de provedores nos arquivos novos/alterados dos commits locais e do merge; nenhuma ocorrência foi encontrada. Essa verificação não substitui a revisão humana do diff.
- E-mails reais não ficam fixos nos scripts de publicação/verificação. Operações de escrita exigem argumentos explícitos e autorização; o comando de publicação sem argumentos é dry-run e não abre conexão.
- Os 29 IDs do manifesto são o conjunto público aprovado, com hashes, sem gabaritos ou conteúdo privado. A identidade efetiva do responsável permanece na auditoria do banco.
- Três PNGs de evidência foram regenerados pelos testes e permanecem modificados no disco, excluídos dos commits. São artefatos de teste; não houve descarte de código, `git clean` ou alteração de branches de terceiros.

## Próximo passo

O merge local contém os dois commits remotos e os cinco commits desta entrega, além da consolidação anterior. A comparação com `origin/entrega-16-11` será conferida novamente após o commit: nenhum commit remoto pode permanecer de fora. **O push permanece pendente da confirmação final do usuário.** Não usar força. Antes do envio, atualizar as referências remotas e verificar novamente se surgiram commits de colaboradores. Se o remoto tiver avançado, integrar e validar antes de publicar.
