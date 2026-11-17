<div align="center">
  <img src="frontend/public/brand/jurissim-logo.png" alt="Logo JurisSim" width="170" />
  <h1>JurisSim</h1>
  <p><strong>Preparação para a OAB, com diagnóstico e acompanhamento da aprendizagem.</strong></p>
  <p>Projeto Final de Curso · Engenharia de Software · Universidade de Mogi das Cruzes — UMC</p>
  <p>
    <img alt="Uso acadêmico" src="https://img.shields.io/badge/uso-acadêmico-C9A35B" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&amp;logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&amp;logoColor=white" />
    <img alt="Node.js 24 ou superior" src="https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&amp;logoColor=white" />
    <img alt="Prisma 6" src="https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&amp;logoColor=white" />
    <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&amp;logoColor=white" />
  </p>
  <p><a href="https://jurissim.vercel.app">Acessar o site</a> · <a href="#executar-localmente">Executar localmente</a> · <a href="#conferência-e-evidências">Conferência e evidências</a> · <a href="docs/entrega.md">Checklist de entrega</a></p>
</div>

## Sobre o projeto

O JurisSim apoia a preparação para a primeira fase do Exame da OAB. O aluno realiza um diagnóstico inicial, pratica questões, faz simulados e acompanha seus resultados. Professores e instituições organizam turmas e avaliações, enquanto a administração gerencia cadastros e consulta a auditoria da plataforma.

O sistema possui frontend React com Vite, API Express e persistência PostgreSQL por meio do Prisma. A publicação utiliza Vercel para o site, Render para a API e Supabase para o banco.

## Versão da entrega

- Repositório: [FernandoTakagi-code/JurisSim-pfc](https://github.com/FernandoTakagi-code/JurisSim-pfc).
- Branch de entrega: **`main`**, após a integração da `entrega-16-11`.
- Código integrado de referência: [`16a0524`](https://github.com/FernandoTakagi-code/JurisSim-pfc/commit/16a0524). Esta atualização modifica somente a documentação.

Para identificar a revisão exata que será apresentada, execute `git rev-parse HEAD` após atualizar a cópia e informe esse hash no Teams junto do link do repositório. A branch pode avançar; o hash identifica uma revisão fixa.

## Funcionalidades por perfil

| Perfil | Recursos implementados |
| --- | --- |
| Aluno | Diagnóstico inicial, trilhas de estudo, prática de questões, simulados, avaliações de turma e desempenho pessoal |
| Professor | Gestão das turmas autorizadas, cadastro de questões, preparação e publicação de atividades e simulados, acompanhamento dos resultados |
| Instituição | Gestão dos dados institucionais, professores, convites, vínculos, turmas e acompanhamento acadêmico |
| Administrador | Consulta de usuários, análise de solicitações institucionais, gestão das instituições, auditoria e acesso editorial ao acervo |

A disponibilidade depende da configuração do ambiente, das permissões e dos vínculos da conta. O acervo autoral piloto ainda depende de revisão humana jurídica e pedagógica; os resultados associados a ele são provisórios. Consulte as [regras do acervo](docs/acervo.md).

## Executar localmente

### 1. Requisitos e código

Instale **Git, Node.js 24 ou superior e npm**. É necessário acesso autorizado a um PostgreSQL com schema compatível. Para usar o banco da equipe, solicite a configuração pelo canal privado combinado.

```powershell
git clone https://github.com/FernandoTakagi-code/JurisSim-pfc.git
cd JurisSim-pfc
git switch main
```

Em uma cópia existente e sem alterações locais pendentes, atualize com `git pull --ff-only origin main`. Preserve os arquivos `.env` já configurados. Para reproduzir a entrega, utilize o **commit informado pela equipe**.

### 2. Preparar as dependências e o ambiente

Execute na raiz do repositório:

```powershell
npm run setup
npm ci --prefix backend
npm ci --prefix frontend
npm --prefix backend run prisma:generate
```

O setup cria `backend/.env` e `frontend/.env` somente quando não existem e gera um segredo JWT local. Os arquivos existentes são preservados.

Preencha os arquivos localmente:

| Arquivo | Configuração |
| --- | --- |
| `backend/.env` | `DATABASE_URL` e `DIRECT_URL` do banco autorizado; `APP_PUBLIC_URL=http://localhost:5173` e origem local permitida em `CORS_ORIGINS` |
| `frontend/.env` | `VITE_API_URL=http://127.0.0.1:3333` |
| Recursos opcionais | Configure e-mail, Google e IA conforme os provedores utilizados; habilite os módulos após conferir seus requisitos no guia de ambiente |

```powershell
npm run config:check
```

Esse comando verifica o formato da configuração, sem testar conexão com o banco ou autenticação dos provedores. Os modelos deixam vários módulos desativados por padrão; apenas copiar os arquivos não reproduz todas as funcionalidades da entrega. Veja o [guia de variáveis e ativação](docs/variaveis-de-ambiente.md).

Credenciais ficam fora do Git. Variáveis `VITE_*` são públicas no navegador e não devem conter senhas, tokens privados ou conexões do banco.

### 3. Conferir os módulos usados na apresentação

O arquivo de exemplo é um modelo seguro de configuração; os módulos opcionais ficam desligados inicialmente. Para reproduzir o ambiente da equipe, obtenha as variáveis autorizadas pelo canal privado e confira a correspondência entre frontend, backend, schema e acervo.

| Recurso | Configuração a conferir |
| --- | --- |
| Diagnóstico inicial | Backend: `INITIAL_DIAGNOSTIC_API_ENABLED`; frontend: `VITE_INITIAL_DIAGNOSTIC_UI_ENABLED`; composição/acervo de acordo com o guia |
| Treino por questões | Backend: `QUESTION_PRACTICE_SCHEMA_ENABLED` e `QUESTION_PRACTICE_API_ENABLED`; frontend: `VITE_QUESTION_PRACTICE_UI_ENABLED` |
| Questões com liberação administrativa para treino | `QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED` habilita a leitura das autorizações já registradas; não cadastra nem aprova questões automaticamente |
| Revisão de questões | Backend: `QUESTION_REVIEW_SCHEMA_ENABLED` e `QUESTION_REVIEW_API_ENABLED`; frontend: `VITE_QUESTION_REVIEW_UI_ENABLED` |
| Simulado individual | Backend: `INDIVIDUAL_EXAM_SCHEMA_ENABLED` e `INDIVIDUAL_EXAM_API_ENABLED`; frontend: `VITE_INDIVIDUAL_EXAM_UI_ENABLED` |
| Administração e área institucional | `ADMINISTRATION_ENABLED`, `INSTITUTIONS_ENABLED` e capacidades específicas de cadastro, convites e gestão, conforme os vínculos e a configuração da equipe |

Não habilite todas as opções indiscriminadamente. Os lotes piloto e as integrações têm requisitos próprios no [guia de ambiente](docs/variaveis-de-ambiente.md) e no [guia do acervo](docs/acervo.md). Uma disciplina pode ter questões cadastradas, mas nenhuma elegível para novos treinos no filtro escolhido.

Reinicie a API após alterar suas variáveis. Reinicie o Vite após alterar as variáveis do frontend; na hospedagem, mudanças `VITE_*` exigem um novo build.

### 4. Iniciar a aplicação

Abra dois terminais na raiz do projeto.

**Terminal 1 — API:**

```powershell
npm --prefix backend run dev
```

**Terminal 2 — frontend:**

```powershell
npm --prefix frontend run dev
```

- Site local: [http://localhost:5173](http://localhost:5173).
- Disponibilidade HTTP da API: [http://127.0.0.1:3333/health](http://127.0.0.1:3333/health).

Utilize uma conta autorizada para cada perfil. O cadastro público não concede permissões administrativas ou institucionais automaticamente. Contas de avaliação devem ser combinadas com a equipe por canal privado; este repositório não publica credenciais.

**Banco de dados:** o localhost utiliza o banco indicado no `.env`, que pode ser o Supabase compartilhado. Não execute `reset`, `db push`, seed ou importações para iniciar o site. A preparação de um banco novo e a aplicação de migrations são etapas separadas, coordenadas com a equipe. Consulte o [guia de execução](docs/execucao-equipe.md).

## Conferência e evidências

Para o acompanhamento do PFC, informe o repositório, a branch e o commit exatos da versão apresentada. Os comandos abaixo ajudam a identificá-los:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
```

Este README atende às instruções de execução. Para a entrega, a equipe deve disponibilizar também:

1. **Repositório, branch e commit:** indicar a `main` e o hash exato apresentado, confirmando o acesso do orientador.
2. **Monografia final:** requisitos, regras de negócio e diagramas coerentes com o sistema implementado.
3. **Relatório/checklist de acompanhamento:** registrar o que foi desenvolvido, os apontamentos corrigidos, as pendências e as dúvidas. O [checklist](docs/entrega.md) é um roteiro a preencher com os resultados da equipe.
4. **Evidências de execução:** capturas, vídeo ou relatórios que permitam conferir as funcionalidades e integrações, identificando ambiente, versão, passos e resultado.

O repositório não deve incluir senhas, tokens nem dados pessoais reais nas evidências. Modificações após o marco de entrega devem seguir o alinhamento com o orientador.

As evidências selecionadas estão no [índice de evidências](docs/evidence/README.md), com capturas históricas identificadas, resultados de testes e o que ainda precisa ser registrado na versão final.

### Roteiro de conferência funcional

Registre uma captura ou vídeo dos fluxos escolhidos e o resultado observado, utilizando contas próprias para avaliação e dados fictícios. Faça as operações de publicação somente em turmas e conteúdos destinados à conferência.

| Perfil / integração | O que conferir | Evidência esperada |
| --- | --- | --- |
| Acesso | Entrar e sair com cada perfil autorizado | Destino correto e menus compatíveis com a conta |
| Administração | Consultar solicitações, instituições, usuários e auditoria | Filtros, resultados e detalhes acessíveis |
| Instituição | Consultar professores e turmas; acompanhar um convite autorizado | Vínculos e situações coerentes com a operação realizada |
| Professor | Criar questão, salvar uma atividade como rascunho e preparar um simulado | Conteúdo salvo e disponível para a turma correta |
| Aluno | Realizar o percurso selecionado de diagnóstico, prática ou avaliação | Respostas persistidas e resultado correspondente |
| Desempenho | Consultar uma avaliação concluída | Resultado exibido no contexto correto do aluno e da turma |
| E-mail / Google / IA | Executar cada integração habilitada na versão apresentada | Resultado real, identificando ambiente e eventuais limitações |

Essas etapas são um roteiro de execução, não uma declaração de que todos os fluxos foram validados. A resposta de `/health` confirma disponibilidade HTTP; não comprova o funcionamento do banco e das integrações.

### Verificações automatizadas

Na raiz:

```powershell
npm --prefix backend run build
npm --prefix backend run test:no-db
npm --prefix backend run check:tests
npm --prefix frontend run build
npm --prefix frontend run test:delivery-static
```

Na conferência de **16/11/2026**, a reorganização dos services no código-base [`5bbc202`](https://github.com/FernandoTakagi-code/JurisSim-pfc/commit/5bbc202) passou em **1.501 testes isolados antes e depois da mudança**, nos builds, na checagem de tipos dos testes e nas verificações estáticas do frontend. A conferência posterior do professor incluiu **30 testes de integração aprovados em PostgreSQL descartável** e gravação/consulta de rascunhos no localhost com o banco configurado pela equipe.

Esses resultados se referem às execuções e ao código-base indicados, não a uma nova execução completa após o merge. O [índice versionado de evidências](docs/evidence/README.md) preserva os registros anteriores, incluindo o relatório de 1.499 testes e capturas históricas identificadas. As capturas e o relatório mais recentes da conferência do professor permanecem no arquivo local da equipe e devem acompanhar a entrega por canal apropriado.

Testes isolados e estáticos não comprovam gravação no banco real, entrega de e-mail ou equivalência com a hospedagem. Para conferir o fluxo docente com persistência em um banco de teste, o harness abaixo cria e valida um cluster descartável próprio. Ele exige os binários PostgreSQL disponíveis no computador e não utiliza o Supabase compartilhado como destino:

```powershell
# Execute dentro da pasta backend; substitua o caminho pelos binários locais.
node scripts/test-migrations-local.cjs "<DIRETORIO_BIN_DO_POSTGRESQL>" --teacher-questions-only
```

Para outros testes de integração e carga, consulte os guias e utilize o ambiente descartável previsto nos scripts, separado do banco compartilhado.

- [Procedimento de testes de carga](docs/testes-de-carga.md).
- [Relatório do teste de carga de 14/11](docs/relatorios/carga-2026-11-14.md), com escopo e limitações próprios.
- Capturas dos testes visuais são geradas em `frontend/.artifacts/evidence`, fora do Git. As evidências para a entrega devem corresponder à versão apresentada e ser compartilhadas sem senhas, tokens ou dados pessoais reais.

## Estrutura do repositório

```text
JurisSim-pfc/
├── frontend/
│   ├── src/                 Interface, navegação e componentes
│   │   └── institution/     Componentes do painel institucional
│   ├── public/              Imagens e arquivos públicos
│   └── tests/               Verificações da interface
├── backend/
│   ├── src/                 Rotas, controllers, services e acesso a dados
│   │   └── services/        Contas, instituições, questões, diagnóstico, avaliações, estudo e e-mail
│   ├── tests/               Testes isolados, integração, fixtures e preparação
│   ├── prisma/              Schema e histórico de migrations
│   └── scripts/             Manutenção, acervo e ambientes de teste
├── scripts/                 Preparação do ambiente local
├── docs/                    Guias, acervo e relatórios de validação
└── .github/workflows/       Verificações automatizadas
```

## Documentação

| Guia | Conteúdo |
| --- | --- |
| [Execução da equipe](docs/execucao-equipe.md) | Preparação local, inicialização e cuidados com o banco |
| [Ambiente e publicação](docs/variaveis-de-ambiente.md) | Variáveis, provedores e ativação de funcionalidades |
| [Arquitetura](docs/arquitetura.md) | Camadas, organização dos testes e mapa das funções dos services |
| [Acervo](docs/acervo.md) | Origem, elegibilidade e limites das questões piloto |
| [Segurança e privacidade](docs/seguranca-e-privacidade.md) | Controles e orientações de proteção de dados |
| [Entrega](docs/entrega.md) | Conferência, evidências e pendências |
| [Modelo do banco](backend/prisma/schema.prisma) | Entidades e relacionamentos implementados |

## Ambientes publicados

| Serviço | Endereço |
| --- | --- |
| Frontend — Vercel | [jurissim.vercel.app](https://jurissim.vercel.app) |
| API — Render | [jurissim-pfc.onrender.com/health](https://jurissim-pfc.onrender.com/health) |

As configurações locais não são enviadas automaticamente à hospedagem. Confira o commit e as variáveis efetivamente publicados em cada serviço antes da apresentação. Os endereços acima identificam os ambientes; este README não representa uma nova verificação de disponibilidade deles.
