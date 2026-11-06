# JurisSim — entrega acadêmica das Fases B e C

> Atualização posterior à consolidação: foram executados 51 testes com PostgreSQL real isolado, diagnóstico persistido e navegador real nos quatro perfis/onze módulos; o schema remoto foi consultado somente em leitura e um backup novo foi restaurado integralmente, inclusive Vault. A consulta real encontrou nove professores sem transição e zero questões elegíveis para o novo diagnóstico/prática: o sistema não está integralmente liberado no Supabase. Consulte `integracao-real-pre-ativacao-06112026.md` para evidências, limites e pendências atuais. As descrições de estado remoto desconhecido abaixo registram a situação anterior e não substituem essa atualização. Nenhuma migration compartilhada ou ativação foi realizada.

Data: 06/11/2026. Branch de entrega: `entrega0911`. Esta nota descreve o código consolidado e suas evidências locais; não declara implantação ou ativação no Supabase.

## Arquitetura

O JurisSim é uma plataforma de preparação para a primeira fase da OAB. O frontend é React com TypeScript e Vite; o backend utiliza Node.js, Express e TypeScript. Prisma define os modelos e a evolução do schema PostgreSQL. O Supabase é o banco compartilhado da equipe, cuja alteração exige autorização separada.

O frontend reaproveita sessão, cliente de API e componentes comuns. O login único usa a identidade efetiva de `GET /auth/session`, e não uma escolha visual de perfil. O acesso com Google utiliza a biblioteca oficial de OAuth no frontend e validação do token, audience e nonce no backend. Registro de aceite legal, confirmação de e-mail, recuperação de senha e logout permanecem integrados.

O envio transacional é abstraído pelo serviço de e-mail, com Brevo API HTTPS ou transporte SMTP explicitamente selecionado. A presença de credenciais locais não prova entrega real. Segredos e URLs privadas não fazem parte do repositório.

## Funcionalidades acadêmicas

- Diagnóstico inicial: composição de questões elegíveis, resolução e persistência de resultados, com mecanismos de identidade e revisão do diagnóstico. Sua exposição depende das flags próprias e do inventário/schema compatíveis.
- Motor adaptativo: análise determinística de acertos por disciplina, assunto e dificuldade, classificação de nível e recomendação de estudo. O código não constitui comprovação de eficácia pedagógica nem de um modelo de aprendizado de máquina treinado.
- Níveis definidos pelo motor: até 49% BASICO, de 50% a 79% INTERMEDIARIO e a partir de 80% AVANCADO. A recomendação considera fragilidades e nível, com quantidades previstas de 15, 10 ou 5 questões, respectivamente.
- Trilhas de estudo: organização do conteúdo e percurso conforme diagnóstico e progresso. A cobertura de conteúdo efetivamente disponível deve ser distinguida de conteúdos ainda em preparação.
- Questões: acervo público e questões privadas autorizadas, autoria docente, validação e proteção de recursos já utilizados.
- Simulados: avaliações de turmas, questões, rascunho/publicação, tentativas e resultados. Recursos individuais já existentes do aluno são preservados.
- Metas diárias, sequência de estudo, histórico e evolução: funcionalidades pessoais, independentes de filiação institucional. Confirmação de e-mail e diagnóstico podem ser pré-requisitos pessoais conforme configuração.
- Relatórios: resultados por turma, disciplina, avaliação e aluno, respeitando o escopo autorizado e a paginação.

Essas funcionalidades não foram reiniciadas na consolidação. As Fases B/C integram e restringem os fluxos existentes, preservando os dados pessoais e acadêmicos.

## Quatro dashboards e responsabilidades

| Contexto | Responsabilidades implementadas | Limites |
| --- | --- | --- |
| ADMIN geral | Instituições, solicitações, aprovação/rejeição/suspensão, responsáveis, diretório administrativo e auditoria | Não faz gestão pedagógica rotineira de turmas, questões, simulados ou desempenho individual; backend também bloqueia |
| Instituição | Onze módulos descritos abaixo, professores, convites, propriedade de turmas, matrículas e resultados próprios | Somente instituição aprovada e vínculo administrativo legítimo; não promove ADMIN nem consulta outra instituição |
| Professor | Banco de questões autorizado, turmas delegadas, criação institucional permitida, simulados, alunos e relatórios autorizados | A instituição atribui/substitui/retira docentes; professor não pede acesso à turma. Autoria isolada não mantém gestão após revogação |
| Aluno | Diagnóstico, trilhas, questões, simulados, metas, histórico e evolução | Estudo independente preservado; acesso à turma exige aprovação quando aplicável |

Não existem módulos docentes autônomos de autoria/compartilhamento de “Conteúdos” e “Atividades” entregues por esta consolidação. Conteúdos de estudo existentes e atividades representadas por questões/simulados não devem ser descritos na monografia como um novo LMS ou como compartilhamento entre turmas. Não foi iniciada nova implementação para preencher essa lacuna.

O responsável institucional mantém seu papel pessoal ALUNO/PROFESSOR e alterna para sua área individual. Não recebe papel pedagógico ou global apenas por trocar o contexto visual.

### Onze módulos institucionais

1. Visão geral: indicadores reais do resumo, atividade e resultados por disciplina da turma selecionada.
2. Minha instituição: informações e atualização dos campos autorizados.
3. Professores: vínculos, consulta paginada e desvinculação confirmada.
4. Convites: nome/e-mail, turma inicial opcional, estados, reenvio e cancelamento.
5. Turmas: criação, edição, arquivamento, códigos, matrículas e delegação docente.
6. Alunos: consulta institucional ou por turma autorizada.
7. Desempenho acadêmico: métricas e resultados autorizados por turma/aluno.
8. Simulados: rascunhos, edição, questões e publicação institucional.
9. Relatórios: resultados por turma e aluno, com paginação.
10. Notificações: mensagens da conta autenticada; o contrato não separa por instituição.
11. Configurações: perfil, preferências pessoais e auditoria institucional.

O design original do v0 foi adaptado a React/Vite sem instalar Next.js. As cores, sidebar, cabeçalho e estrutura dos painéis foram preservados com CSS delimitado. Não há dados fictícios de fallback nos módulos reais.

## Cadastro, convites e segurança

O cadastro público concede apenas identidade individual de aluno/responsável, nunca PROFESSOR ou ADMIN. O responsável confirmado solicita a instituição; somente decisão autorizada concede acesso institucional. Alteração de responsável exige conta confirmada e revoga sessões conforme o serviço, sem trocar senha ou histórico.

Professores entram por convite de uso único, expiração e cancelamento. Contas existentes devem autenticar a identidade correspondente e confirmar o e-mail. No primeiro acesso, uma segunda prova enviada ao endereço convidado permite definir a própria senha; não existe senha fixa, cadastro público docente ou sessão criada automaticamente pelo link. Aceitar ou recusar não promove administrador.

JWT e versão de sessão são conferidos pelo backend. A interface ajuda a apresentar permissões, mas não é sua fonte. Contextos acadêmicos enviam identificadores de instituição; o backend verifica vínculo ativo, instituição e delegação atual. Logs de auditoria são distintos de logs técnicos e não devem conter tokens, senhas ou requisições completas.

A retirada de um professor altera a delegação, preservando instituição proprietária, autoria, questões, simulados, alunos e tentativas. Testes verificam perda de acesso mesmo com IDs e autoria anteriores. O bootstrap do primeiro ADMIN tem conta confirmada, exclusão mútua e idempotência; não foi reexecutado nesta entrega.

Os nove professores históricos não foram confirmados, vinculados ou recriados automaticamente. O guard de inicialização impede ativação completa enquanto houver contas ou turmas sem transição legítima.

## Evidências e testes

No mesmo estado do código consolidado, a validação final anterior executou **434 testes direcionados de backend em 20 arquivos**, **53 cenários de navegador com APIs simuladas**, **15 verificações de renderização**, testes de navegação e **13 comparações estruturais com o CSS do v0**. TypeScript e builds dos dois projetos foram aprovados. Não se somam esses números como se fossem casos homogêneos nem como comprovação de uso real.

Na execução de backend, 323 passaram inicialmente; uma suíte com 63 testes teve timeout na inicialização e passou isoladamente, totalizando 386. Outros 48 casos de metas/relatórios/sequência de estudo completaram os 434. Não foi repetida a suíte geral. Resultados detalhados e correções constam em `validacao-final-dashboard-institucional.md`.

As 33 capturas dos onze módulos e seus dados fictícios ficaram locais e não são necessárias para compilar a entrega. A equipe pode regenerá-las em `frontend` com `node scripts/test-administration.mjs`; o script usa Chrome instalado, Vite em loopback, perfil temporário e interceptação de APIs. Não aciona o backend real nem o Supabase. A revisão estrutural usa `node scripts/test-institution-visual.cjs` e as fontes originais versionadas na pasta `referencia-dashboard-institucional-v0`.

Na preparação de publicação foram reconferidos os arquivos, branch/remoto, seleção e ausência de segredos. Os builds frontend/backend, `prisma validate`, renderização, navegação e comparação estrutural foram executados novamente e aprovados. Outros **4 testes** de `institution-email-transition.test.ts` passaram, incluindo a ausência de consultas institucionais quando todas as capacidades estão false: são **438 casos direcionados distintos de backend considerando as duas etapas**, sem repetir a suíte geral. Os 53 cenários Chrome permanecem válidos para o código funcional inalterado desde a auditoria final e não foram repetidos nesta consolidação. Não foram executados login Google real, entrega Brevo real, migration compartilhada, nova restauração de backup ou integração Supabase. Os registros finais de publicação ficam no hash do commit e no relatório fornecido à equipe.

## Supabase, flags e limitações

- A migration administrativa `20261104000100_institutions_administration` foi informada como aplicada e validada na etapa anterior. Esta consolidação não repetiu acesso remoto.
- A migration local nova em relação ao commit-base é `20261105000100_teacher_invitation_onboarding`. O estado remoto não foi consultado; é a pendência conhecida de aplicação, e não uma confirmação de que não existam outras divergências no Supabase.
- `INSTITUTIONS_ENABLED=false` permanece. `ADMINISTRATION_ENABLED` e `INSTITUTION_REGISTRATION_ENABLED` têm padrão false e agora estão explícitas no exemplo. Não foram habilitadas no arquivo privado ou no ambiente compartilhado.
- A presença local de IDs Google correspondentes ou configuração SMTP não certifica OAuth/e-mails em produção. Não foi enviado e-mail real nem realizado login com conta real nesta validação.
- A integração real com PostgreSQL/Supabase, a aplicação autorizada da migration, a transição legítima dos professores e a ativação constituem etapas separadas.
- Série temporal institucional global, metas/variações globais, última atividade docente, exportação CSV/PDF e notificações exclusivas por instituição não possuem contratos completos e não são oferecidas como prontas.
- Algumas funcionalidades acadêmicas preexistentes dependem de suas próprias migrations, flags e inventário de questões. Não habilitar esses controles para contornar uma tela bloqueada.

Procedimento operacional: `supabase-fases-b-c-ativacao.md`. Matriz de funcionalidades/endpoints e arquivos: `integracao-dashboard-institucional.md`. Não utilizar dados de teste ou capturas como evidência de operação em produção.

## Atualização e execução pela equipe

Com alterações pessoais preservadas, buscar a branch sem reset/force:

```powershell
git fetch origin
git switch entrega0911
git pull --ff-only origin entrega0911
```

Se a branch não existir localmente, usar `git switch --track origin/entrega0911` após o fetch. Se houver conflito, divergência ou alterações que impeçam a troca, preservar o trabalho e resolver com a equipe; não usar comandos destrutivos.

Em terminais separados, a partir da raiz:

```powershell
cd backend
npm.cmd ci
npm.cmd run prisma:generate
npm.cmd run build
# Somente após configurar backend/.env privado para ambiente autorizado:
npm.cmd run dev
```

```powershell
cd frontend
npm.cmd ci
npm.cmd run build
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Frontend: `http://127.0.0.1:5173`; API padrão: `http://localhost:3333`. Copiar `.env.example` para `.env` apenas quando o arquivo privado ainda não existir e preencher pelo canal seguro; não sobrescrever configuração de integrante. O backend exige conexão PostgreSQL autorizada e `JWT_SECRET` próprio. Não usar Supabase compartilhado para testar operações sem autorização. Nenhum comando acima aplica migration, cria administrador ou realiza seed.

Com flags desativadas, telas protegidas continuam bloqueadas: isso é esperado. Para revisão isolada sem banco, usar os testes de navegador, não promover conta nem trocar flags compartilhadas.
