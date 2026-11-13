# Cadastro e edição de questões no formato A–D

Implementação local de 11/11/2026. O cadastro comum agora exige quatro alternativas, com textos preenchidos e diferentes e exatamente um gabarito. A validação compartilhada está em `backend/src/question-alternatives.ts`, usada por schemas Zod, serviço e formulários React.

## Contrato HTTP

As rotas continuam `POST /questoes` e `PUT /questoes/:id`. As alternativas de entrada mantêm o formato `{ texto, correta }`, na ordem A, B, C e D. O servidor atribui as letras por posição e persiste o campo Prisma `letra`; letras enviadas pelo cliente não determinam a gravação. A leitura docente inclui as letras ordenadas. A leitura do aluno continua sem expor o gabarito.

São rejeitados conjuntos de tamanho diferente de quatro, texto vazio ou apenas espaços, alternativas repetidas após normalização de caixa/espaços/Unicode canônico e conjuntos sem gabarito ou com múltiplos gabaritos. Textos de campos obrigatórios são aparados antes da validação. Respostas 400 incluem `message` legível e o detalhamento `erro`.

Edições parciais sem `alternativas` preservam as alternativas e seus IDs. Enviar o conjunto completo continua substituindo as alternativas da questão não utilizada. As regras de autoria, vínculo atual com turma e bloqueio de edição/exclusão de questões utilizadas permanecem aplicadas pelo backend.

## Formulário

Novas questões mostram quatro campos fixos e não trazem gabarito pré-selecionado. A interface exige escolha explícita. Questões antigas com menos de quatro alternativas recebem campos adicionais vazios para preenchimento, preservando o conteúdo existente. Questões antigas com mais de quatro não são truncadas: o professor precisa remover explicitamente as excedentes. Remover a opção correta não escolhe outra automaticamente.

A tela diferencia visibilidade pública de revisão e liberação do acervo. O CRUD comum não atribui origem IA, revisão jurídica, revisão pedagógica ou liberação a partir de campos enviados pelo cliente. Salvar letras não torna uma questão automaticamente elegível para o diagnóstico inicial ou a prática.

O validador legado de CSV também passa a exigir A–D; a coluna E do cabeçalho anterior deve permanecer vazia. A rota antiga de prévia CSV continua descontinuada e não foi reaberta.

## Verificação

No backend, executar os testes direcionados:

```powershell
cd backend
npm.cmd test -- src/routes/questao-crud.test.ts src/__tests__/unit/questao-service.unit.test.ts src/services/question-csv-preview.test.ts
```

No frontend, executar o teste de navegador:

```powershell
cd frontend
npm.cmd run test:questions
```

O script usa Chrome ou Edge instalado nos caminhos usuais do Windows. Para outro caminho, definir `CHROME_PATH` localmente. O teste abre navegador headless com perfil temporário e servidor Vite na porta 5190; a API é simulada e a rede externa é bloqueada. Não acessa o backend na porta 3333 nem grava no Supabase. O serviço da porta 5190 precisa estar livre.

Foram acrescentadas asserções de letras persistidas ao teste de integração existente. A suíte com PostgreSQL real descartável ainda precisa ser executada em ambiente apropriado; a validação com mocks não comprova execução transacional no banco real.

Nenhuma migration ou atualização retroativa das questões existentes é necessária para disponibilizar o código, pois a coluna já existe. Os registros atuais não são corrigidos automaticamente. Não foram aplicadas migrations, importados rascunhos, atribuídas aprovações ou ativadas flags.
