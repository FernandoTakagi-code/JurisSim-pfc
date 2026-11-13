# JurisSim — Plataforma Adaptativa de Preparação para a OAB

> Projeto Final de Curso (PFC) — Engenharia de Software, UMC (Universidade de Mogi das Cruzes)
> Disciplina: Análise e Projeto de Software

## 📋 Sobre o Projeto

O **JurisSim** é uma plataforma web de simulados voltada para a preparação de candidatos à **1ª fase do Exame de Ordem (OAB)**. O sistema conta com um motor de regras determinístico para recomendação de trilhas de estudo personalizadas, baseado no desempenho dos alunos em simulados diagnósticos.

### Objetivo

Oferecer uma ferramenta de estudo adaptativa, na qual o desempenho do aluno em simulados anteriores direciona a geração de novas trilhas de exercícios, priorizando os assuntos e níveis onde a taxa de acerto foi menor.

## 👥 Atores do Sistema

- **ADMIN global**: gerencia usuários e configurações gerais, sem acesso pedagógico rotineiro.
- **Responsável institucional**: acompanha a solicitação e administra a instituição conforme seu vínculo autorizado, sem receber automaticamente o papel global de ADMIN.
- **Professor**: acessa turmas, questões autorizadas, simulados e relatórios conforme suas permissões. O vínculo docente depende de convite e aceite explícito.
- **Aluno**: resolve simulados, acompanha sua evolução e recebe trilhas de exercícios recomendadas.

## ⚙️ Funcionalidades Principais (MVP)

1. **Autenticação e Controle de Acesso** — Login via JWT com controle de acesso baseado em papéis (Aluno vs Professor/Admin).
2. **Gestão de Questões** — CRUD de questões organizadas por Disciplina, Assunto, Nível e Fundamentação Jurídica, com suporte a questões públicas (banco geral) ou vinculadas a uma turma.
3. **Módulo de Simulado** — Simulado diagnóstico e avaliações de turma, com duração quando configurada, correção automática e resultados após a conclusão.
4. **Motor Adaptativo** — Geração de trilhas de exercícios personalizadas com base nas taxas de acerto do aluno por assunto/nível.
5. **Dashboards Analíticos** — Painel de evolução para o aluno e painel de desempenho da turma para o professor.

## 🏗️ Arquitetura

O backend segue o padrão em camadas:

```
Controllers → Services → Repositories
```

- **Controllers**: recebem a requisição HTTP, validam entrada (via Zod) e delegam para a camada de serviço.
- **Services**: concentram as regras de negócio da aplicação (incluindo o motor adaptativo).
- **Repositories**: responsáveis pelo acesso ao banco de dados, via Prisma ORM.

## 🛠️ Stack Tecnológica

| Camada | Tecnologias |
|---|---|
| **Back-end** | Node.js, Express, TypeScript, Prisma ORM, Zod, JWT, Bcrypt |
| **Banco de Dados** | PostgreSQL, no ambiente autorizado para execução |
| **Front-end** | React, TypeScript, Vite, CSS, cliente HTTP baseado em Fetch |
| **Testes & Qualidade** | Vitest, verificações estáticas e testes de navegador com Chrome; Prettier disponível como ferramenta de desenvolvimento |

## 📁 Estrutura do Repositório

```
jurissim/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── middlewares/
│   │   ├── config/
│   │   └── utils/
│   ├── prisma/
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── evidence/
│   └── (guias técnicos, relatórios e roteiro acadêmico)
└── README.md
```

## 📊 Visão conceitual da arquitetura

### Processos do sistema

O sistema JurisSim é modelado em 6 processos principais:

1. **Autenticação e Onboarding** - Registro de novo usuário, validação de email e aceite de termos
2. **Gestão de Questões (Professor)** - Criação e categorização de questões
3. **Simulado Diagnóstico (Aluno)** - Execução do simulado inicial com geração de trilha adaptativa
4. **Simulado Personalizado (Aluno)** - Execução de simulado baseado em trilha recomendada
5. **Motor Adaptativo** - Análise de desempenho e geração inteligente de trilhas de estudo
6. **Acompanhamento de Turma (Professor)** - Visualização de métricas e desempenho dos alunos

#### Fluxo Simplificado:

```
Aluno Login → Simulado Diagnóstico → Calcular Métricas →
Motor Adaptativo (Análise de Desempenho) → Gerar Trilha →
Simulado Personalizado → Atualizar Progresso
```

Os arquivos XML de BPMN e UML anteriormente citados não estão incluídos nesta árvore. Este resumo não substitui os diagramas acadêmicos originais. Consulte a [arquitetura administrativa e de cadastro](docs/arquitetura-administrativa-cadastro-0911.md) para o contrato institucional documentado.

### Modelos e contratos

O sistema utiliza o padrão **MVC em Camadas** com separação clara de responsabilidades:

#### Camada de Modelos (Entities)
- **User** - Usuários do sistema (Aluno, Professor, Admin)
- **Questao** - Questões de múltipla escolha
- **Alternativa** - Alternativas de resposta
- **Simulado** - Instâncias de simulados realizados
- **Resposta** - Respostas do aluno
- **DesempenhoDiagnostico** - Métricas de desempenho
- **TrilhaAdaptativa** - Trilhas personalizadas geradas
- **MetaDiaria** - Metas diárias de estudo
- **Turma** - Agrupamento de alunos por professor

#### Camada de Serviços (Business Logic)
- **AuthService** - Autenticação, registro, logout, verificação de token
- **DiagnosticService** - Gerenciamento de simulados diagnósticos
- **AdaptiveEngine** - Motor de análise de desempenho e geração de trilhas
- **QuestaoService** - CRUD de questões
- **TrailService** - Gestão de trilhas adaptativas

#### Camada de Controllers (HTTP Endpoints)
- **AuthController** - Endpoints de autenticação (/auth/*)
- **DiagnosticController** - Endpoints de diagnóstico (/diagnostics/*)
- **QuestaoController** - Endpoints de questões (/questoes/*)
- **TrailController** - Endpoints de trilhas (/trilhas/*)

#### Relacionamentos principais (resumo conceitual):
```
User 1─→ * Questao (Professor cria questões)
User 1─→ * Simulado (Aluno faz simulados)
Questao 1─→ * Alternativa (Questão tem alternativas)
Simulado 1─→ * Resposta (Simulado tem respostas)
Simulado 1─→ * DesempenhoDiagnostico (Métricas)
Simulado 1─→ 1 TrilhaAdaptativa (Trilha gerada)
User 1─→ * MetaDiaria (Metas do aluno)
```

As cardinalidades e os campos completos estão no [schema Prisma](backend/prisma/schema.prisma); o registro de rotas está em [server.ts](backend/src/server.ts).

## 🚀 Como Rodar o Projeto

### Pré-requisitos

- Node.js compatível com o Vite 7: `^20.19.0 || >=22.12.0`. As validações recentes usaram Node.js 24.
- npm e as dependências dos dois diretórios instaladas pelos respectivos lockfiles.
- Configuração de PostgreSQL/schema previamente autorizada, além das variáveis necessárias de autenticação. Google e envio de e-mail exigem configuração própria quando utilizados.

### Versão pública e overlay local

No histórico versionado, `npm run dev` executado em `backend` inicia `tsx watch src/server.ts`; em `frontend`, inicia Vite. Nesta máquina, os manifestos de trabalho podem conter launchers privados de homologação: esse overlay não é distribuído pelo Git e não deve ser copiado para uma instalação pública. Não substitua `.env`, manifestos funcionais ou arquivos privados existentes seguindo instruções de instalação nova.

Os comandos abaixo destinam-se a uma instalação nova e não aplicam migrations, seeds ou provisionamento. O ambiente de banco deve ser aprovado e preparado separadamente.

### Backend

```powershell
cd backend
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Preencher somente a configuração autorizada antes de iniciar.
npm run prisma:generate
npm run dev
```

O backend de desenvolvimento usa a porta 3333. Não inicie outra instância se essa porta já estiver ocupada.

### Frontend

Em outro terminal, a partir da raiz:

```powershell
cd frontend
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

O frontend usa a porta 5173. Mantenha a mesma origem durante login e convites: `localhost` e `127.0.0.1` não compartilham automaticamente a sessão.

### Variáveis de ambiente

Consulte os exemplos públicos [backend/.env.example](backend/.env.example) e [frontend/.env.example](frontend/.env.example). Preencha credenciais apenas nos arquivos privados locais; valores `VITE_*` chegam ao navegador e não devem conter segredos de servidor.

As flags institucionais, os requisitos do acervo e a política privada de homologação continuam sendo verificados pelo backend. Não habilite funcionalidades apenas para contornar uma mensagem de indisponibilidade.

## 📌 Status do Projeto

Projeto em desenvolvimento ativo, seguindo o cronograma da disciplina de Análise e Projeto de Software (2026/2º semestre).

| Área | Situação nesta branch |
| --- | --- |
| Autenticação, cadastro e confirmação | Backend e interfaces implementados; Google, e-mail e persistência reais dependem da configuração e homologação autorizadas. |
| Dashboards de Aluno, Professor, Instituição e ADMIN | Interfaces e contratos implementados, com validações automatizadas isoladas. Acesso e dados dependem de papel, vínculo e contexto autorizado. |
| Convites e primeiro acesso docente | Fluxos implementados com destinatário validado e aceite explícito; as restrições privadas permanecem. Nenhuma promoção ocorre ao abrir o link. |
| Turmas, relatórios e simulados | Contratos existentes integrados às interfaces; consulta de questões elegíveis separada da gestão do acervo. Salvamento/publicação reais exigem autorização. |
| Atividades próprias | Rota e contexto de turma disponíveis; criação, publicação, respostas e correção próprias ainda indisponíveis. |
| Exclusão de conta H4.24 | Desabilitada para Aluno e ADMIN até validação segura da integração de persistência. |
| Desativação da conta | Backend e componente existentes; a auditoria não localizou integração direta do componente no perfil. Não considerar a ação de interface homologada. |

Os testes com APIs/Prisma/SMTP mockados não comprovam operações reais. Os commits locais C01–C11 estão organizados; a integração posterior com `origin/main`, incluindo a PR #12, permanece pendente de autorização. Nenhuma funcionalidade H4.38 está sendo declarada concluída.

## 📚 Documentação Adicional

- [Arquitetura administrativa e cadastro](docs/arquitetura-administrativa-cadastro-0911.md)
- [Administração institucional](docs/administracao-institucional-0911.md)
- [Roteiro de apresentação acadêmica](docs/roteiro-apresentacao-academica.md)
- [Evidências históricas](docs/evidence)
- [Prisma Schema](backend/prisma/schema.prisma) - Modelo de dados completo

## 🧪 Testes

Para validação sem banco, a partir da raiz:

```powershell
cd backend
npm run build
npm run test:no-db
cd ../frontend
npm run build
npm run test:delivery-static
```

Testes de integração com PostgreSQL exigem o harness descartável e autorização específica; não devem apontar para um banco existente. Esta branch não fornece scripts `lint` ou `coverage`: não os confunda com configurações ainda presentes apenas em `origin/main` ou em cópias isoladas.

## 🎓 Orientação

- Prof. Alessandro Aparecido da Silva Horas
- Prof. Oscar Alves Evangelista

## 👨‍💻 Autor

**Fernando Takagi**

---

**Última revisão documental**: 13 de novembro de 2026. Não representa homologação real de todos os fluxos.
