# Auditoria da equipe antes de alterar dashboards — 16/11/2026

## Escopo e conclusão

Branch local `entrega-16-11`, HEAD `df01e20`. O fetch não trouxe novos commits para a branch oficial remota, que permanece em `6fead5d`; os cinco commits locais de consolidação continuam à frente dela. Nenhum merge, cherry-pick, commit, push ou deploy foi executado nesta auditoria.

Foram comparadas as 23 referências remotas disponíveis, as branches locais e os nove commits distintos não ancestrais de HEAD. A comparação incluiu histórico, patches, conteúdo, arquivos ausentes, rotas e consumidores. Não foi identificada uma tela recente compatível da equipe ainda ausente que justificasse nova integração. Isso não significa que todos os módulos estejam operacionais no Supabase: há estruturas ausentes e capacidades desativadas.

As alterações locais foram preservadas, com patch de recuperação e cópias dos fontes não rastreados fora do repositório. Nenhum arquivo de ambiente, segredo ou backup de banco foi incluído nesta documentação.

## Matriz de funcionalidades

As origens abaixo indicam branches/commits relacionados, não autoria exclusiva de arquivos com vários colaboradores. As URLs são entradas existentes no código; não representam comprovação de navegação autenticada nesta execução.

| Funcionalidade | Origem identificada | Situação atual e diferenças | Endereço local | Trabalho restante |
| --- | --- | --- | --- | --- |
| ADMIN: visão geral, instituições, solicitações, usuários, auditoria | João `e1860f1`; Fernando `c629de6`, `a41ada8`, `f8b18d4`, `7a731be` | Componentes, endpoints, navegação e autorização integrados; versões atuais substituem menus antigos | `/administracao` e respectivas seções | Confirmar navegação na sessão real após reinício; capacidade habilitada somente no processo local autorizado |
| Instituição: visão geral, professores, convites, vínculos e relatórios | João `e1860f1`; Fernando `c1518b4`, `c78dc73` | Dashboard e gestão independente de professores existentes; intenção institucional preservada; relatórios antigos redirecionam para desempenho | `/instituicoes` | Operações institucionais gerais continuam desativadas; designações dependem também do vínculo autorizado da turma |
| Professor: início, alunos e turmas | Fernando `origin/area-professor`, `582ea9a`, `5fc3315`; João `e16eb69`; JJ `8203f82` | Menus, componentes e endpoints presentes; não foi encontrada outra tela docente recente para importar | `/professor`, `/professor/alunos`, `/professor/turmas` | Exclusão lógica depende de `ClassLifecycle`; leitura autenticada precisa ser verificada no navegador |
| Questões e acervo | Fernando `feature/crud-questoes`, `67fff60`, `da356ad`; consolidação posterior | Cadastro/consulta e regras de elegibilidade presentes | `/professor/questoes`, `/questoes` | Disponibilidade depende das questões elegíveis e permissões reais; não liberar editorialmente por configuração |
| Simulados de turma e institucionais | João `e16eb69`; Fernando `0f81340`, `c78dc73` | Fluxos de detalhes, questões, resultados e gestão presentes; contagem vem dos vínculos efetivos | `/professor/simulados`, `/instituicoes` → Simulados | Recursos que usam `ClassExamSettings` dependem de estrutura ausente; capacidade institucional de gestão de simulados desativada |
| Atividades de turma | João `e16eb69`; consolidação `dbcd436` | Frontend, serviços e permissões existentes | `/professor/atividades`; aluno pela turma | `ClassActivity` ausente no Supabase; não confundir com `Atividade` histórica |
| Dashboard e estudo do aluno | João `f2c021e`; JJ `8203f82`; implementações consolidadas | Telas, menus e integração existentes | `/dashboard`, `/estudar`, `/turmas` | Validar sessão real de aluno; consultas não garantem disponibilidade de exercícios |
| Diagnóstico e trilha | JJ `feature/motor-adaptativo`, `a716e8b`, `e84e40e`; Fernando `c897813`, `1c99208`, `200a44c` | Rotas e implementação adaptativa atuais já incluem equivalentes dos patches antigos | `/trilha`; diagnóstico no fluxo inicial | Requisitos de diagnóstico, dados e elegibilidade continuam sendo respeitados |
| Simulados individuais | Implementação consolidada e acervo autoral de Fernando | Código e API presentes; não substituir por versão antiga | `/simulados` | Exigem questões realmente elegíveis; navegação real ainda não comprovada nesta auditoria |
| Desempenho, histórico e metas | Fernando `98c040d`, `200a44c`; componentes consolidados `student-progress.tsx`, `goals-reports.tsx` | Componentes e menus presentes | `/desempenho`, `/historico`, `/metas` | Validar dados na sessão correspondente; não inventar indicadores |
| Relatórios docentes e institucionais | `goals-reports.tsx`; Fernando `c78dc73` | `TeacherReports` e `StudentClassReport` preservados; acesso por permissões | `/professor/relatorios`, `/professor/desempenho`; instituição → Desempenho | Nenhuma importação adicional identificada |
| Perfil e configurações | Implementação local aprovada; segurança Fernando `16eb166`, João `6ac2fe9` | Preservado integralmente; abas Dados pessoais, Segurança e Aparência; hashes dos arquivos aprovados conferidos | `/perfil`, `/professor/perfil`, `/administracao/perfil` | Não substituir pela Vercel nem restaurar Preferências |
| Materiais, comunicados e atividade docente histórica | Migrations históricas recuperadas em `dbcd436` | Estruturas Prisma/banco existentes; não há páginas/serviços correspondentes nos fontes remotos examinados | Sem entrada atual identificada | Seria implementação adicional, não integração de tela recente encontrada; manter `Atividade` e `ClassActivity` independentes |
| CI, integração e carga | Fernando `38d6652`; JJ `9af189e`, `8be3fef`, `9d1f963` | Infraestrutura de testes consolidada; não corresponde a páginas ocultas | Não aplicável | Nenhuma nova integração identificada |

## Commits não ancestrais examinados

| Commit | Conteúdo e decisão |
| --- | --- |
| `e84e40e` | Restaura trilhas; montagem atual já existe, com autorização. |
| `2f1f2db` | Adiciona sessão no autenticador legado; `/auth/session` atual já valida sessão no servidor. |
| `78be116` | Unifica validação JWT antiga; middleware atual já centraliza essa responsabilidade. |
| `2269c41` | Tipagem/autenticação de diagnóstico e trilha antigas; implementação atual equivalente, sem reintroduzir logs antigos. |
| `47ba1bd` | Remove seis arquivos duplicados, já ausentes no atual. Também permitiria ADMIN no cadastro público: trecho inseguro e incompatível, não importado. |
| `c1518b4` | Preserva intenção institucional independentemente de flags; comportamento atual já presente com fallback de schema restrito. |
| `a41ada8` | Simplifica menus ADMIN; navegação atual contém refinamentos posteriores. |
| `f8b18d4` | Remove menu Estado e ajusta avisos; implementação atual já contempla evolução posterior. |
| `880563f` | Exclusão de aluno e restrição de exclusão administrativa; comportamento integrado, preservando salvaguardas. |

Não se usou apenas ancestralidade: commits não ancestrais podem ter comportamento equivalente no código consolidado. Não se importou autenticação antiga nem cadastro público de ADMIN.

## Banco e execução local

Consulta ao Supabase feita com transação somente leitura: 1 ADMIN, 2 PROFESSORES e 12 ALUNOS; 2 responsáveis institucionais ativos por vínculo. INSTITUIÇÃO é contexto/vínculo autorizado, não um papel independente a fabricar no enum de usuário.

As três migrations históricas recuperadas constam aplicadas no remoto, com checksums correspondentes aos SQLs originais. `ClassLifecycle`, `ClassActivity` e `ClassExamSettings` não existem no banco consultado. Permanecem necessárias as migrations `20261115193000_class_lifecycle` e `20261115203000_class_activities`, mediante revisão e autorização próprias. Há uma turma sem vínculo institucional; nenhum vínculo foi criado ou alterado.

Frontend em `http://localhost:5173`, com instâncias IPv4/IPv6 verificadas na mesma pasta, consumindo `http://127.0.0.1:3333`. Backend local iniciado a partir de `dist/server.js` desta pasta, usando a conexão existente e sobrescritas somente no processo: `ADMINISTRATION_ENABLED=true`, `INSTITUTIONS_ENABLED=false` e proteção explícita de navegação de leitura. O `.env` compartilhado não foi alterado.

A proteção local bloqueia mutações administrativas/acadêmicas e evita gravação automática de eventos administrativos dessas consultas, registrando-os localmente. Não concede papéis. Login, logout e perfil mantêm o comportamento normal; essa proteção não é uma promessa de que toda requisição de autenticação/perfil seja livre de escrita. Nenhuma operação de negócio real foi executada para validar funcionamento.

Gestão independente de professores retornou habilitada; operações institucionais gerais e gestão institucional de simulados retornaram desabilitadas. Uma capacidade disponível não autoriza executar convites, aprovações ou outras escritas sem autorização específica nesta etapa.

## Alterações e validação

Alterações locais preservadas: ajuste anterior de largura no cabeçalho em `frontend/src/integration-shell.css`; proteção local em `backend/src/middlewares/local-read-only-navigation.ts`, seus testes e integração em `server.ts` e `administration-audit.ts`. Nenhum dashboard ou componente de perfil foi substituído durante a auditoria.

- Build backend: aprovado.
- Build frontend com `--configLoader runner`: aprovado; avisos de tamanho de bundle e comentários de dependência, sem falha.
- Testes unitários backend: 1.482 aprovados em 107 arquivos.
- Verificações estáticas frontend `test:delivery-static`: sete scripts aprovados.
- `git diff --check`: aprovado.
- Health, disponibilidade de capacidades e preflight CORS local: aprovados.
- Evidência histórica da consolidação isolada: 32 migrations e 174 testes de integração aprovados, 9 ignorados. Não foram reexecutados contra o Supabase real e não comprovam navegação real dos quatro perfis.

O usuário confirmou login ADMIN legítimo. Contudo, não há conexão de automação com essa sessão de navegador para verificar independentemente seus menus após o reinício; PROFESSOR, ALUNO e INSTITUIÇÃO também não tiveram navegação real comprovada nesta auditoria. Não foram fabricadas sessões ou solicitadas senhas/tokens.

## Pode começar a alterar dashboards?

Quanto à auditoria de código das referências disponíveis, não ficaram telas recentes compatíveis sem análise ou pendentes de merge. Os dashboards e módulos relacionados na matriz já existem e devem ser aprimorados nos componentes atuais, não recriados. Perfil e configurações continuam fora do escopo de alteração.

Ainda não é possível afirmar que todo o localhost esteja funcionalmente validado com os quatro perfis reais. Faltam a navegação autenticada observável por perfil e, para módulos específicos, estruturas/capacidades do banco. Esses bloqueios não devem ser disfarçados por redesign ou por importação de branches antigas. Não houve alteração do Supabase, aplicação de migrations, push ou deploy.
