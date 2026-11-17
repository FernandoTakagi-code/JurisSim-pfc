# Simulados institucionais — prontidão local

## Bloqueio confirmado

O frontend consulta `GET /avaliacoes` com contexto institucional. `ClassExamService.listExams` passa por `examStaff`, que responde HTTP 503 com a mensagem relatada quando o ator é responsável institucional e `institutionalExamManagementEnabled()` é falso. A mesma validação protege outros endpoints de gestão e consulta de simulados.

A expressão da capacidade é `institutionsEnabled() || process.env.INSTITUTION_EXAM_MANAGEMENT_ENABLED === 'true'`. Portanto, a capacidade específica pode ser ativada sem alterar `INSTITUTIONS_ENABLED=false` e sem ativar módulos institucionais gerais. Não deve ser confundida com `INSTITUTION_TEACHER_MANAGEMENT_ENABLED`.

`0f81340` está integrado por ancestralidade. Ele ajusta o fluxo autorizado e seus testes; não modifica `config/institution-feature.ts` nem ativa a configuração do ambiente. Não há indicação de código antigo executando: o processo local identificado é PID 34416, `backend/dist/server.js` desta pasta, com a função independente presente no build. A API real `/institutions/availability` retornou `examManagement=false`, `institutionalOperations=false`, `enabled=false`, `administrationEnabled=true`.

## Banco e conta real

Consulta em transação PostgreSQL `READ ONLY`, usando a conexão existente e a conta institucional cujo identificador já havia sido informado pelo usuário:

- Conta encontrada, papel-base ALUNO com intenção INSTITUTION, e-mail verificado, não excluída e não suspensa.
- Vínculo INSTITUTION_ADMIN ativo na instituição ativa `JurisSim Academy — HOMOLOGAÇÃO`.
- Duas turmas vinculadas: `Teste 1` ativa e `teste` arquivada. Não foram criados ou corrigidos vínculos nesta etapa.
- `Simulado teste` consta publicado, com uma questão efetivamente vinculada e zero tentativas, dentro do escopo dessa instituição. Nenhuma descrição ou conteúdo foi alterado.

Existem `Institution`, `InstitutionalMembership`, `InstitutionalClass`, `User`, `Turma`, `Avaliacao`, `AvaliacaoQuestao`, `Questao`, `QuestaoSimulado`, `Simulado` e `Resposta`.

Não existem `ClassExamSettings`, `ClassActivity` e `ClassLifecycle`. A listagem de simulados e as consultas básicas tratam a ausência dessas estruturas. Encerramento e arquivamento de simulados dependem de `ClassExamSettings`, prevista em `20261115203000_class_activities`; atividades e exclusão lógica possuem suas dependências próprias. Essas ausências não justificam ativar módulos adicionais para simplesmente consultar os simulados existentes.

Vínculos e schema foram conferidos por leitura; não foi fabricada sessão institucional nem testado um endpoint autenticado com a capacidade habilitada no backend real, pois sua ativação continua aguardando autorização.

## Operação proposta — aguardando autorização

Somente no processo backend local:

```text
INSTITUTION_EXAM_MANAGEMENT_ENABLED=true
INSTITUTIONS_ENABLED=false                 # preservar
LOCAL_READ_ONLY_NAVIGATION=true            # preservar
```

Preservar também ADMINISTRATION_ENABLED e demais configurações já autorizadas, sem gravar mudanças no `.env` compartilhado. Reiniciar exclusivamente o backend local e verificar:

1. Disponibilidade retorna `examManagement=true`, com `institutionalOperations=false` e `enabled=false`.
2. A sessão legítima do responsável consulta `/avaliacoes` e abre detalhes, questões e resultados pertencentes à instituição.
3. Nenhuma operação de criação, edição, publicação, encerramento, arquivamento ou exclusão é executada.

A capacidade específica não é uma flag de leitura: o código também a utiliza para autorizar operações de gestão. Por isso, a proteção local de leitura deve continuar ativa, bloqueando mutações acadêmicas no servidor. Não se propõe ativar isso no Render, na Vercel ou em outro backend compartilhado.

Reversão: remover somente a sobrescrita dessa capacidade no processo local e reiniciar o mesmo backend. Não há SQL ou alteração de dados a reverter. Nenhuma migration é proposta para liberar a consulta básica.

## Testes e alterações

93 testes direcionados de capacidades, autorização institucional, rotas de simulados e visualização de questões aprovados. Teste estático frontend de independência da capacidade aprovado. Nenhum código executável precisou ser modificado: remover o guard ou a mensagem para contornar a configuração seria incorreto.

Nenhuma flag foi ativada nesta etapa. Nenhum registro, permissão, schema, migration, frontend aprovado ou código do professor foi alterado. Sem commit, push ou deploy. Arquivo versionável desta rodada: este documento. Consulta e resultado sanitizado em `backend/.local/institution-exam-readonly.*`, ignorado pelo Git.
