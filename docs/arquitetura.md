# Arquitetura e responsabilidades

## Componentes

- Frontend: React, TypeScript e Vite. A navegação escolhe o painel conforme a sessão devolvida pelo servidor.
- Backend: Node.js, Express, TypeScript, Zod e Prisma. As rotas aplicam autenticação e autorização; controllers recebem requisições; services executam regras e transações; repositories encapsulam parte do acesso ao banco. Há serviços que consultam Prisma diretamente.
- Banco: PostgreSQL, com o modelo completo em `backend/prisma/schema.prisma`. As migrations representam a evolução do schema e devem permanecer versionadas.

Algumas validações puras são compartilhadas por imports do frontend para arquivos do backend, como senha, alternativas A–D e cadastro institucional. Mover esses arquivos exige atualizar imports e verificar os dois builds.

## Organização dos testes

`backend/src` contém somente a aplicação. A estrutura de testes é:

```text
backend/tests/
  unit/          Testes isolados, incluindo rotas com dependências simuladas
    config/
    middlewares/
    repositories/
    routes/
    services/
  integration/   Testes com PostgreSQL descartável e seus auxiliares
  fixtures/      Dados de teste compartilhados
  setup/         Preparação e bloqueio de persistência para testes sem banco
frontend/tests/  Verificações de interface e navegação
```

O build do backend limpa `dist` e compila somente `src`. A checagem `npm --prefix backend run check:tests` valida os tipos dos testes sem gerar arquivos. Os testes de integração mantêm a validação do banco descartável antes da execução; reorganizar pastas não autoriza usar o banco real.

Capturas geradas pelos testes visuais ficam em `frontend/.artifacts/evidence`, ignoradas pelo Git. Scripts de manutenção e ferramentas de provisionamento dos ambientes de teste continuam em `backend/scripts`.

## Perfis

| Perfil | Responsabilidade |
| --- | --- |
| ADMIN global | Administração de contas, instituições e auditoria; não recebe acesso pedagógico rotineiro |
| Responsável institucional | Gestão da instituição autorizada, seus vínculos, turmas e avaliações |
| Professor | Questões, atividades, simulados e desempenho das turmas autorizadas |
| Aluno | Diagnóstico, prática, avaliações e acompanhamento pessoal |

A responsabilidade institucional é representada por vínculo; não equivale a receber o papel global de ADMIN. A autorização depende de papel, instituição, vínculo ativo e turma. Ocultar um botão não substitui essas verificações no backend.

## Fluxos acadêmicos

- Diagnóstico inicial: estabelece o ponto de partida e orienta a trilha de estudo.
- Prática e simulado individual: usam os critérios próprios de elegibilidade e configuração.
- Atividade de turma: lista de questões, pontuação e prazo opcional para iniciar, sem cronômetro.
- Simulado de turma: avaliação publicada para turmas, com duração quando configurada.
- Desempenho da turma: agrega atividades e simulados publicados para aquela turma; resultados concluídos alimentam médias e métricas. Não reúne indiscriminadamente todo o histórico pessoal do aluno.

Tentativas e resultados existentes precisam ser preservados durante mudanças no acervo e na configuração.

## Configuração

`GET /institutions/availability` informa as capacidades disponíveis no processo. Flags independentes podem liberar somente parte da administração institucional.

`INSTITUTIONS_ENABLED=true` exige que a verificação de ativação não encontre professores sem e-mail confirmado, vínculo ativo ou instituição autorizada para suas turmas. Não remova essa verificação para contornar cadastro inconsistente.

Consulte [variáveis de ambiente](variaveis-de-ambiente.md), [segurança](seguranca-e-privacidade.md) e [acervo](acervo.md). Esta visão do código não substitui os diagramas da monografia.
