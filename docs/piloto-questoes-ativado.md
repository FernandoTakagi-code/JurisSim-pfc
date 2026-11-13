# Piloto de treino por questões

Implementação na branch `fernando/questoes-diagnostico-autoral`. Ativação local autorizada por Fernando; não representa publicação externa nem aprovação jurídica ou pedagógica.

## Uso

Em **Questões**, o aluno escolhe disciplina, assunto opcional e quantidade. Somente tamanhos com estoque inédito suficiente ficam disponíveis: 5, 10 ou 20. Os 60 itens iniciais têm 12 por disciplina e 6 por assunto; o histórico individual reduz essas quantidades. Não há estoque inicial para treinos de 20.

Selecionar uma alternativa não envia a resposta. **Confirmar resposta** salva e mostra o gabarito e comentário daquela questão. Depois da correção, a resposta fica bloqueada. O aluno pode navegar pelas questões e sair para retomar depois; respostas confirmadas e comentários são recuperados. Após a última correção, **Ver resultado do treino** finaliza a tentativa, com revisão das respostas. Simulados individuais continuam mostrando a correção somente na entrega.

## Conteúdo e proteção

- Lote de 60 rascunhos: `9218bdec-f4e3-43a1-8b54-cdc40720dea5`. Mantido privado, com revisão humana e liberação pendentes. Total de 123 questões preservado pela aplicação da migration.
- Seleção especial do piloto exige configuração própria e valida o lote e os metadados de rascunho. Ativar apenas o piloto de simulados não ativa a prática.
- Tentativas novas guardam uma cópia do conteúdo e do gabarito. Mudanças posteriores no acervo não alteram a correção daquela tentativa.
- Somente respostas já confirmadas retornam feedback na retomada. Resultados provisórios não alteram o nível do aluno; o marcador provisório fica preservado na tentativa.
- Treino e simulado consultam o mesmo histórico de questões respondidas. Não há preenchimento silencioso com questões repetidas. Falta de estoque impede novos treinos, sem impedir a retomada existente.
- API autenticada para ALUNO, com verificação de propriedade das tentativas. Migration `20261112160000_private_practice_sessions` ativa RLS na tabela de sessões e restringe acesso direto por papéis públicos. Ela já foi aplicada no Supabase; não executar reset.

## Configuração local

Backend: `QUESTION_PRACTICE_SCHEMA_ENABLED=true`, `QUESTION_PRACTICE_API_ENABLED=true`, `QUESTION_PRACTICE_PILOT_ENABLED=true` e `QUESTION_PRACTICE_PILOT_BATCH_ID` com o lote acima. Frontend: `VITE_QUESTION_PRACTICE_UI_ENABLED=true`. Arquivos `.env` não são versionados. Configuração anterior preservada localmente em `backend/.local/practice-pilot.previous-flags.json`.

## Validação

Backend e frontend compilaram após recuperação do trabalho. Os 32 testes focados de serviços, repositório, seleção e rotas passaram. Seis testes de integração de treino e simulado passaram novamente após a retomada em PostgreSQL 17 descartável, incluindo cópia do conteúdo, estoque por assunto, retomada, respostas imutáveis, histórico compartilhado, manutenção do nível e RLS. As 23 migrations foram aplicadas no banco descartável, sem divergência de schema e sem alterações nos checksums históricos.

### Navegador autenticado

Fluxo completo conferido na sessão ALUNO em 12/11/2026, com término registrado em 13/11/2026 às 02:58 UTC:

- Filtro com quatro inéditas bloqueou o treino mínimo de cinco. Assunto com cinco inéditas permitiu iniciar; dez e vinte ficaram indisponíveis.
- Seleção de alternativa permaneceu sem envio e pôde ser alterada antes da confirmação. Confirmar exibiu comentário, alternativa correta e resposta escolhida; as opções ficaram bloqueadas.
- Sair e continuar recuperou a mesma tentativa na primeira questão pendente. Revisitar a primeira questão manteve resposta e comentário.
- A quinta correção permaneceu visível antes da finalização explícita. Resultado e aviso provisório foram preservados ao recarregar; filtro de incorretas exibiu somente os quatro erros da tentativa técnica.
- Catálogo conferido também com viewport de 390 px, sem transbordamento horizontal (`scrollWidth` igual à largura). Viewport restaurado depois.
- A tentativa técnica de cinco respostas foi removida com backup privado. Conferência posterior confirmou preservação das tentativas anteriores, do diagnóstico e do nível; 60 questões continuaram privadas e pendentes. Seu resultado técnico não representa desempenho real do aluno.

O teste visual identificou perda do assunto no resumo da retomada. A consulta da sessão foi corrigida para recuperar `assunto`; o cenário de integração verifica o assunto tanto na tentativa criada quanto na disponibilidade de retomada.

O aviso de tamanho do bundle do frontend permanece. A aprovação do orientador e as revisões humanas do conteúdo continuam pendentes.
