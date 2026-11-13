# Preparação da entrega acadêmica — H4.24 e dashboards

> Registro histórico da respectiva etapa. Testes, configurações, autorizações e impedimentos referem-se àquela execução; não comprovam o estado atual nem autorizam operações reais. Consulte a consolidação [H4.37](H437-CONSOLIDACAO-PROFESSOR.md) e o [README](README.md).

Continuação prioritária do Professor: [procedimento atual, integrações e impedimentos de acesso real](HOMOLOGACAO-PROFESSOR.md). A revisão frontend sem banco utiliza a porta 5190; este documento conserva os resultados da etapa anterior.

Atualização das ações de conta: [H424-ACOES-DE-CONTA.md](H424-ACOES-DE-CONTA.md), com endpoints, estilos corrigidos, verificações de identidade e separação entre backend conectado e exclusão ainda indisponível.

Estado em 13/11/2026, branch `entrega0911`. As alterações que já estavam no diretório foram preservadas. Nenhum commit, push, merge ou deploy foi realizado.

## Limite atual

Por solicitação expressa do usuário, estão suspensas conexões, migrations, criação de papéis, provisionamento e alterações no PostgreSQL local. Não foi utilizado Supabase nem `jurissim_local` como alternativa. Nenhuma conta real foi excluída.

Antes dessa suspensão, o arquivo privado `backend/.local/h424-connection.json` foi confirmado como ignorado por `/backend/.local/`. As duas URLs e a autenticação foram verificadas exclusivamente em `127.0.0.1:5432`, bancos `jurissim_h424_test` e `jurissim_h424_shadow`, sem imprimir credenciais.

A tentativa anterior de migration no banco descartável principal parou em `20261020120000_backend_only_evaluations_photos` por ausência dos papéis históricos `anon` e `authenticated`. A tentativa de criação desses papéis foi negada pelo PostgreSQL (42501); eles não foram criados pelo agente. O banco principal ficou com aplicação parcial das migrations históricas. Não houve reset ou tentativa posterior de limpeza. O shadow recebeu apenas a verificação de conexão; nenhuma migration foi aplicada nele nesta execução. As migrations da H4.24 não foram aplicadas.

Os scripts `h424-local.cjs` e `h424-connection.cjs` recusam operações de banco. O primeiro permite apenas `--unit`, sem ler o arquivo privado. A configuração de integração H4.24 também recusa execução enquanto a funcionalidade estiver suspensa.

## Funcionalidades preparadas

| Área | Pronto no código | Limite restante |
| --- | --- | --- |
| Exclusão no ADMIN | Botão, formulário, escolha entre liberar/bloquear e justificativa; rota administrativa e verificações transacionais | Integração com banco não validada; ação desativada |
| Exclusão no Aluno | Botão no perfil/Segurança, confirmação EXCLUIR e senha atual; alternativa de reautenticação Google recente | Integração com banco e Google real não validadas; ação desativada |
| Revogação de bloqueio | Formulário exclusivo do ADMIN, rota, normalização de e-mail e evento de auditoria preparados | Banco não validado; ação desativada |
| Persistência H4.24 | Transação de anonimização, consumo de tokens, incremento de versão de sessão, remoção de foto e vínculos ativos, auditoria; migrations preparadas | Nenhuma exclusão foi validada ou executada; políticas de retenção e dados indiretos exigem revisão antes da habilitação |
| Proteção da entrega | Bloqueio de H4.24 em código compartilhado, independente de flags de ambiente; testes garantem zero chamadas à nova tabela durante cadastro | Habilitação futura exige revisão deliberada do código e validação autorizada |

`backend/src/account-deletion-availability.ts` mantém a funcionalidade desativada. Não basta configurar `EMAIL_REUSE_BLOCKS_ENABLED=true` ou `ACCOUNT_DELETION_ENABLED=true`. Não se deve remover esse bloqueio para a apresentação.

O cadastro, login e as funcionalidades existentes continuam com seus fluxos atuais; a política nova não consulta a tabela ainda não validada. Desativação de conta é um fluxo anterior e distinto da H4.24.

## Auditoria dos dashboards

| Dashboard | Correção/validação desta etapa | O que ainda depende de homologação |
| --- | --- | --- |
| Professor | Tela inicial própria em `/professor`, independente do carregamento de questões; redirecionamento de outras áreas para o destino correto; perfil acessível sem escolha prévia de instituição; pendência de vínculo e escolha entre múltiplas instituições sem carregar dados acadêmicos; atalhos e consultas existentes de turmas/simulados | Login de conta legítima, vínculo/designações, dados e permissões com backend real. A existência de um dashboard acessível não concede vínculo ou contorna permissões |
| Aluno | Navegação e diagnóstico obrigatório preservados; perfil com H4.24 explicitamente indisponível; fechamento do menu de perfil corrigido mesmo na mesma rota ou ao trocar apenas a aba | Fluxo completo com dados reais e persistência acadêmica; H4.24 permanece pendente |
| Instituição | Verificações de navegação, papéis, contexto e estilos; auditoria no navegador com respostas interceptadas | Aprovação, convites, designações e relatórios com backend real, quando houver autorização |
| ADMIN global | Navegação, busca explícita de contas, estados de erro/indisponibilidade, auditoria independente e isolamento da área pedagógica; H4.24 desativada | Operações administrativas e exclusão com persistência real; não há validação produtiva nesta etapa |

O código do módulo de questões do Fernando, incluindo `ProfessorArea.tsx`, `QuestaoService.ts` e `QuestaoRepository.ts`, não foi alterado nesta etapa. A nova tela inicial foi implementada em arquivo próprio.

## Verificações sem banco

No backend:

```powershell
cd backend
npm.cmd run build
npm.cmd run test:no-db
```

A configuração `vitest.no-db.config.ts` substitui o Prisma por um bloqueio padrão: acesso não explicitamente mockado falha antes de abrir conexão. URLs de teste usam uma porta inativa e não carregam as credenciais privadas. Testes de integração são excluídos.

Resultado da suíte ampla: **1.188 aprovados / 1.192**, com **4 falhas mantidas sem alteração no módulo de questões**:

- Duas em `src/__tests__/unit/questao-service.unit.test.ts`: expectativas antigas com quatro argumentos; a implementação passa também o contexto opcional.
- Duas em `src/routes/question-import-preview.test.ts`: esperam acesso de ADMIN, enquanto a restrição acadêmica atual responde 403. A política não foi relaxada para fazer os testes passarem.

As suítes específicas de exclusão desativada, cadastro e delegação passaram com persistência mockada. Isso não constitui validação da exclusão no PostgreSQL.

No frontend:

```powershell
cd frontend
npm.cmd run build
npm.cmd run test:delivery-static
node scripts/test-dashboard-navigation.mjs
node scripts/test-session.mjs
node scripts/test-administration.mjs
```

Os testes de navegador iniciam apenas o Vite e Chrome headless, interceptam APIs e bloqueiam requisições externas. Os cenários com respostas simuladas são testes de interface, não comprovação de alterações em contas, convites, sessões ou dados reais. O diagnóstico obrigatório indisponível continua apresentado como indisponível, sem resultados inventados.

Resultados concluídos: builds de backend/frontend aprovados; suíte estática de entrega aprovada (incluindo 14 verificações do ADMIN); 22 cenários de navegação dos dashboards aprovados; 55 verificações de ADMIN/Instituição aprovadas; 75 cenários de sessão/perfil aprovados. Todos os cenários de navegador usam APIs interceptadas. A auditoria institucional gerou 33 capturas identificadas como dados fictícios em `frontend/.artifacts/institution-final-review/index.html`. Os avisos do build sobre tamanho do bundle e comentários de dependências não impediram a compilação.

Não restaram falhas de interface nas suítes isoladas executadas dos quatro dashboards. Isso não elimina as pendências de homologação com backend real, vínculos e permissões reais descritas na tabela, nem as quatro falhas da suíte de questões. As expectativas antigas de títulos e abas nos testes foram alinhadas às rotas atuais; o fechamento do menu de perfil foi corrigido no produto.

## Procedimento de revisão manual

1. Nesta etapa, revisar apenas as interfaces e os artefatos dos testes isolados. Não iniciar provisionamento, migration ou testes de integração.
2. Conferir a entrada do Professor, a mensagem de vínculo pendente, o seletor único de instituição e o acesso ao perfil. Vínculo pendente não deve produzir consultas de turmas, simulados, relatórios ou questões.
3. Conferir Aluno, Instituição e ADMIN em desktop/celular, com temas claro/escuro, estados vazio/erro e navegação por URL e histórico.
4. Conferir `Excluir minha conta` no perfil do Aluno e `Excluir conta` na consulta do ADMIN: botões indisponíveis, aviso de integração pendente e nenhuma mensagem de exclusão concluída. A revogação de bloqueio também deve permanecer indisponível.
5. Para futura homologação real, obter autorização específica para um ambiente de testes e contas descartáveis. Somente então validar migrations, reutilização por senha/Google/convite/cadastro institucional, bloqueio/revogação, permissões, concorrência, auditoria, invalidação de tokens e preservação dos históricos. Não habilitar H4.24 antes dessa etapa.

A entrega está preparada para revisão de interfaces e contratos. Não foi declarada homologação completa dos dashboards com banco real ou da exclusão de contas.
