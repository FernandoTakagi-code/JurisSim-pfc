# Piloto do simulado individual ativado

Em 12/11/2026, Fernando autorizou aplicar a migration, habilitar o piloto provisório e testar o fluxo no navegador. Ativado no ambiente local (`http://localhost:5173`), usando o Supabase configurado pelo projeto. Não foi feito deploy em hospedagem externa nem push da branch.

## Configuração e acervo

- Migration `20261112130000_individual_exam_sessions` aplicada e registrada pelo Prisma, com RLS e chave estrangeira de propriedade confirmadas. O total de questões permaneceu 123.
- Preservada a migration externa já concluída `20261111000100_institution_request_details`, que não está nesta branch. Nenhum reset ou reescrita do histórico de migrations.
- Flags locais `INDIVIDUAL_EXAM_SCHEMA_ENABLED`, `INDIVIDUAL_EXAM_API_ENABLED`, `INDIVIDUAL_EXAM_PILOT_ENABLED` e `VITE_INDIVIDUAL_EXAM_UI_ENABLED` ativas.
- Lote exclusivo: `9218bdec-f4e3-43a1-8b54-cdc40720dea5`, com 60 questões, 12 por disciplina.
- Questões continuam privadas. Campos de revisão jurídica, pedagógica e liberação continuam nulos. A seleção provisória é separada do filtro de acervo aprovado e restrita ao lote configurado; não altera aprovações em memória ou no banco.
- A prática em Questões não foi ativada nesta entrega. O piloto habilitado é o simulado individual misto. Diagnóstico e demais flags foram preservados.

O piloto valida a estrutura das questões e sua proveniência de rascunho, mas não substitui revisão humana. Usa 30 questões inéditas, seis por disciplina. Questões respondidas em outras atividades deixam de ser consideradas inéditas. Depois de dois simulados completos desse lote, o aluno poderá esgotar as 12 questões de cada disciplina; não há repetição automática.

O aviso **Piloto provisório** aparece na entrada, na tentativa e na correção. Snapshots da tentativa guardam `provisional=true`; resultados antigos continuam provisórios se a configuração do piloto for desligada posteriormente. Não há alteração do diagnóstico ou nível inicial pelo simulado.

## Teste no navegador

Fernando fez login pessoalmente como ALUNO; nenhuma senha foi solicitada no chat, lida ou impressa pelo agente.

O controle do navegador foi feito com a skill de Computer Use. Foi criada uma tentativa temporária para verificar:

1. Entrada com 12 questões disponíveis por disciplina e aviso provisório.
2. Início com 30 questões e entrega desabilitada antes de todas as respostas.
3. Salvamento de uma resposta, saída e retomada na primeira pendente com a resposta anterior preservada.
4. Salvamento e navegação nas demais questões, sem correção antecipada.
5. Entrega e exibição das alternativas corretas, explicações e resultado por disciplina.
6. Recarregamento da página com correção e aviso provisório preservados.

As respostas desse registro eram técnicas de teste (alternativa A), sem avaliação do conhecimento de Fernando. A tentativa temporária `71f7d19a-2996-469a-a087-7d02750b3428` foi retirada em transação após salvar cópia local e validar sua identidade, lote, 30 snapshots provisórios e 30 respostas de teste. Foram removidos somente sua sessão, tentativa, 30 vínculos e 30 respostas. Diagnóstico inicial e nível anteriores foram conferidos sem alterações. Nenhuma questão do acervo foi removida.

Ao fim, o navegador voltou a Simulados, com **12 inéditas por disciplina e botão Iniciar simulado de 30 questões**. A conta ficou sem a tentativa técnica e com as 60 questões disponíveis para uso real.

## Verificações e comprovantes

- 18 testes focados passaram em quatro arquivos, incluindo seleção do lote privado e persistência do marcador provisório.
- Dois testes de integração passaram em PostgreSQL descartável: fluxo normal e fluxo piloto com o lote real de rascunhos. Confirmaram que o lote não entra na prática padrão e que os 60 registros seguem privados e sem revisões.
- Builds do backend e frontend passaram. Permanece o aviso de tamanho do bundle do frontend.
- Health da API retornou 200; consulta sem autenticação retornou 401.
- Teste funcional e visual do navegador concluído conforme os passos acima. Isso não representa teste de carga ou validação jurídica das questões.
- Recibos locais em `outputs/migration-simulado-individual-aplicada.json` e `outputs/teste-navegador-piloto-simulado.json`; imagens em `outputs/piloto-simulado-ativado.png` e `outputs/piloto-simulado-resultado-teste.png`.

## Fechamento do piloto, se necessário

O backup das flags anteriores está no arquivo ignorado `backend/.local/individual-pilot.previous-flags.json`. Para fechar novos acessos, desligar a API/UI do simulado e o piloto, reiniciar a API e recarregar o frontend. Manter a flag de schema verdadeira enquanto houver sessões históricas, para o histórico reconhecê-las. Não remover a tabela nem apagar tentativas de alunos para desativar a funcionalidade.

As questões permanecem fora do acervo padrão; desligar o piloto não inventa nem remove revisões. Uma publicação definitiva exige revisão real e fluxo próprio de liberação. A cópia da tentativa técnica retirada ficou apenas em `backend/.local/individual-pilot-browser-test-backup.json`, sem credenciais.
