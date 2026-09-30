# JurisSim — Plataforma Adaptativa de Preparação para a OAB

> Projeto Final de Curso (PFC) — Engenharia de Software, UMC (Universidade de Mogi das Cruzes)
> Disciplina: Análise e Projeto de Software

## 📋 Sobre o Projeto

O **JurisSim** é uma plataforma web de simulados voltada para a preparação de candidatos à **1ª fase do Exame de Ordem (OAB)**. O sistema conta com um motor de regras determinístico para recomendação de trilhas de estudo personalizadas, baseado no desempenho dos alunos em simulados diagnósticos.

### Objetivo

Oferecer uma ferramenta de estudo adaptativa, na qual o desempenho do aluno em simulados anteriores direciona a geração de novas trilhas de exercícios, priorizando os assuntos e níveis onde a taxa de acerto foi menor.

## 👥 Atores do Sistema

- **Admin**: gerencia usuários e configurações gerais da plataforma.
- **Professor**: cadastra questões, cria turmas (com código de convite) e acompanha o desempenho da turma.
- **Aluno**: resolve simulados, acompanha sua evolução e recebe trilhas de exercícios recomendadas.

## ⚙️ Funcionalidades Principais (MVP)

1. **Autenticação e Controle de Acesso** — Login via JWT com controle de acesso baseado em papéis (Aluno vs Professor/Admin).
2. **Gestão de Questões** — CRUD de questões organizadas por Disciplina, Assunto, Nível e Fundamentação Jurídica, com suporte a questões públicas (banco geral) ou vinculadas a uma turma.
3. **Módulo de Simulado** — Simulado diagnóstico e resolução cronometrada, com correção automática e feedback imediato.
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
| **Banco de Dados** | PostgreSQL (Supabase) |
| **Front-end** | React, TypeScript, CSS, Recharts, Axios |
| **Testes & Qualidade** | Vitest/Jest, ESLint, Prettier |

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
│   └── (em desenvolvimento)
├── docs/
│   ├── diagrams/
│   │   ├── bpmn-processes.xml
│   │   └── class-diagram.xml
│   └── README.md
└── README.md
```

## 📊 Diagramas de Arquitetura

### Diagrama BPMN - Processos do Sistema

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

Para mais detalhes, veja [docs/diagrams/bpmn-processes.xml](docs/diagrams/bpmn-processes.xml)

### Diagrama de Classes UML

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
- **DiagnosticController** - Endpoints de simulados (/diagnostic/*)
- **QuestaoController** - Endpoints de questões (/questoes/*)
- **TrailController** - Endpoints de trilhas (/trails/*)

#### Relacionamentos Principais:
```
User 1─→ * Questao (Professor cria questões)
User 1─→ * Simulado (Aluno faz simulados)
Questao 1─→ * Alternativa (Questão tem alternativas)
Simulado 1─→ * Resposta (Simulado tem respostas)
Simulado 1─→ * DesempenhoDiagnostico (Métricas)
Simulado 1─→ 1 TrilhaAdaptativa (Trilha gerada)
User 1─→ * MetaDiaria (Metas do aluno)
```

Para mais detalhes, veja [docs/diagrams/class-diagram.xml](docs/diagrams/class-diagram.xml)

## 🚀 Como Rodar o Projeto

### Pré-requisitos

- Node.js (v18+)
- npm ou yarn
- Conta no [Supabase](https://supabase.com) (PostgreSQL)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # preencher com as variáveis necessárias
npm run dev
```

O servidor sobe por padrão em `http://localhost:3333`.

### Variáveis de Ambiente

```env
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=sua_chave_super_secreta_com_minimo_32_caracteres
GOOGLE_CLIENT_ID=seu_google_client_id
```

## 📌 Status do Projeto

Projeto em desenvolvimento ativo, seguindo o cronograma da disciplina de Análise e Projeto de Software (2026/2º semestre).

### Backend
- [x] Configuração inicial do backend (Express + TypeScript)
- [x] Modelagem de dados (Prisma + PostgreSQL/Supabase)
- [x] Autenticação e autorização (JWT)
- [x] CRUD de questões
- [x] Módulo de simulado diagnóstico
- [x] Motor adaptativo
- [x] Testes automatizados
- [ ] Dashboards analíticos (API pronta)

### Frontend
- [ ] Estrutura inicial (React + TypeScript)
- [ ] Telas de autenticação
- [ ] Telas de simulados
- [ ] Dashboards do aluno
- [ ] Dashboards do professor

## 📚 Documentação Adicional

- [Diagramas BPMN](docs/diagrams/bpmn-processes.xml) - Processos do sistema
- [Diagrama de Classes UML](docs/diagrams/class-diagram.xml) - Estrutura de dados
- [Prisma Schema](backend/prisma/schema.prisma) - Modelo de dados completo

## 🧪 Testes

```bash
cd backend
npm run test        # Executar testes
npm run test:watch  # Modo watch
npm run coverage    # Cobertura de testes
```

## 🎓 Orientação

- Prof. Alessandro Aparecido da Silva Horas
- Prof. Oscar Alves Evangelista

## 👨‍💻 Autor

**Fernando Takagi**

---

**Última atualização**: Setembro de 2026
