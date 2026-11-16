# Revisão local dos simulados institucionais — 16/11

Revisão validada localmente antes da autorização de commit e push. Sem alteração do ambiente publicado.

Base da cópia isolada: `origin/entrega-16-11` em `9af189e`. A atualização de João em `origin/entrega1611`, commit `6e201fc`, foi aplicada localmente para testar os dois trabalhos juntos. Após autorização, foi incorporada na `entrega-16-11` por cherry-pick (`7d6c4dd`), preservando a autoria de João e as remoções de avisos anteriores. As correções desta revisão ficam em commit separado. Não houve merge na main nem alteração da branch original do colega.

## Encontrado e corrigido nesta revisão

- O formulário já existia na atualização de João. A capacidade `INSTITUTION_EXAM_MANAGEMENT_ENABLED` já havia sido criada, mas dois bloqueios permaneciam: o wrapper de frontend impunha leitura pelo estado do módulo completo, e o middleware só excepcionava escritas de professores/convites. O ajuste permite somente as rotas de gestão de simulados com a capacidade específica ligada, mantendo vínculo, contexto e autorização por turma nos serviços.
- A prévia de alternativas tinha estado/componente, mas não tinha botão para abri-la e apontava para `/questoes/:id`, fora do acesso institucional. Agora consulta uma rota de avaliação que valida todas as turmas e a elegibilidade da questão. Não concede acesso de gestão ao banco de questões.
- A edição de rascunho criado pelo responsável institucional reenviava o ID do responsável como se fosse professor. O envio opcional agora considera os professores disponíveis no catálogo autorizado.
- Mantida a remoção dos selos e quadros redundantes solicitada anteriormente. Corrigidos textos com escapes Unicode visíveis e rótulos corrompidos na tela de simulados.

## Conferência

- Build do backend e frontend; suíte estática de entrega.
- 93 testes direcionados de capacidade, middleware, contrato HTTP e acesso à prévia.
- Pela interface real no navegador: seleção de turma/questão, prévia de alternativas, salvamento, reabertura e edição do rascunho, publicação e consulta dos resultados sem tentativas. Nenhuma entrega de aluno foi simulada para fabricar resultados.
- Banco PostgreSQL descartável local, com instituição, professor, turma, aluno e questões técnicas sintéticas. A instituição pendente do teste anterior foi preservada.

## Para avaliar

Frontend: `http://127.0.0.1:5190`. API: loopback na porta `3340`. O lançador local habilita a capacidade de simulados; o módulo institucional completo continua desligado. Os lançadores e dados da fixture não fazem parte do código versionado. A publicação futura exige conferir a implantação do novo código, a capacidade específica no backend e a compatibilidade da estrutura do banco publicado; esta revisão não ativou nada no Render nem executou migrations no Supabase.
