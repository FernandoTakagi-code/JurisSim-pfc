# JurisSim — Plataforma Adaptativa de Preparação para a OAB

> Projeto Final de Curso (PFC) — Engenharia de Software, UMC (Universidade de Mogi das Cruzes)
> Disciplina: Análise e Projeto de Software

## 📋 Sobre o Projeto

O **JurisSim** é uma plataforma web de simulados voltada para a preparação de candidatos à **1ª fase do Exame de Ordem (OAB)**. O sistema conta com um motor de regras determinístico para recomendação de questões, classificadas em três níveis de dificuldade (Básico, Intermediário e Avançado), além de dashboards analíticos para acompanhamento de desempenho tanto de alunos quanto de professores.

### Objetivo

Oferecer uma ferramenta de estudo adaptativa, na qual o desempenho do aluno em simulados anteriores direciona a geração de novas trilhas de exercícios, priorizando os assuntos e níveis onde a taxa de acerto é menor.

## 👥 Atores do Sistema

- **Admin**: gerencia usuários e configurações gerais da plataforma.
- **Professor**: cadastra questões, cria turmas (com código de convite) e acompanha o desempenho da turma.
- **Aluno**: resolve simulados, acompanha sua evolução e recebe trilhas de exercícios recomendadas.

## ⚙️ Funcionalidades Principais (MVP)

1. **Autenticação e Controle de Acesso** — Login via JWT com controle de acesso baseado em papéis (Aluno vs Professor/Admin).
2. **Gestão de Questões** — CRUD de questões organizadas por Disciplina, Assunto, Nível e Fundamentação Jurídica, com suporte a questões públicas (banco geral) ou vinculadas a uma turma específica.
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
└── README.md
```

## 🚀 Como Rodar o Projeto

### Pré-requisitos

- Node.js
- npm
- Conta no [Supabase](https://supabase.com) (PostgreSQL)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # preencher com as variáveis necessárias
npm run dev
```

O servidor sobe por padrão em `http://localhost:3333`.

## 📌 Status do Projeto

Projeto em desenvolvimento ativo, seguindo o cronograma da disciplina de Análise e Projeto de Software (2026/2º semestre).

- [x] Configuração inicial do backend (Express + TypeScript)
- [ ] Modelagem de dados (Prisma + PostgreSQL/Supabase)
- [ ] Autenticação e autorização (JWT)
- [ ] CRUD de questões
- [ ] Módulo de simulado
- [ ] Motor adaptativo
- [ ] Dashboards analíticos
- [ ] Frontend (React)
- [ ] Testes automatizados


## 🎓 Orientação

- Prof. Alessandro Aparecido da Silva Horas
- Prof. Oscar Alves Evangelista