# Mensagem para compartilhar com a equipe

Pessoal, as Fases B/C do JurisSim foram consolidadas na branch **entrega0911**: quatro dashboards, painel institucional com onze módulos, login único/Google, solicitação institucional, convites/primeiro acesso e gestão de professores, turmas, alunos e permissões.

Para atualizar, preservem alterações pessoais e usem `git fetch origin`, `git switch entrega0911` e `git pull --ff-only origin entrega0911`. Não usem reset ou force push. Em cada pasta, executem `npm ci`; no backend, `npm run prisma:generate`. Frontend: `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`. Backend: `npm run dev` somente com `.env` privado e banco autorizado configurados; padrão da API é porta 3333. Não compartilhem `.env` no Git.

A documentação para a monografia está em **docs/entrega-academica-06112026.md**. A validação local registra 434 testes direcionados de backend mais 4 complementares na consolidação, 53 cenários de navegador com mocks, 15 verificações de renderização e builds aprovados.

**O Supabase não foi alterado e o módulo institucional não foi ativado.** A migration de onboarding `20261105000100_teacher_invitation_onboarding`, a regularização legítima dos professores, configuração/validação de e-mail e homologação real ainda precisam do procedimento e da autorização próprios. Flags devem permanecer false. Não apresentem fluxos testados com mocks como funcionais em produção.

Antes de demonstrar operações institucionais reais, consultem **docs/supabase-fases-b-c-ativacao.md**. A publicação da branch não autoriza aplicar migrations, enviar convites reais ou habilitar flags. As capturas podem ser regeneradas pelo teste local isolado, conforme o relatório de validação final.
