# Acesso editorial ADMIN — 16/11/2026

## Correção comprovada

O projeto utiliza `usePath` e `adminSection`, não React Router. O acervo tinha um desvio por igualdade exata em `main.tsx`, sem registro no resolvedor administrativo. `/administracao/acervo/` não recebia o componente editorial. A rota agora é reconhecida pelo resolvedor e renderizada por `GeneralAdministration`, com carregamento separado e estado de carregamento. Os cinco menus existentes foram preservados.

O guard existente admite `/administracao/*` para ADMIN. A API editorial exige sessão válida, ADMIN verificado e capacidade administrativa. A flag de escrita editorial continua desativada no processo local. Nenhuma permissão global foi ampliada.

## Redirecionamento ao login

A sessão é mantida em `sessionStorage`, por aba e origem. Uma aba sem a sessão não recebe acesso por já existir outra aba autenticada. Não foi alterado esse mecanismo nem transferido token para armazenamento persistente.

No Chrome isolado, usando formulário de login real, Express e PostgreSQL descartável, a navegação na mesma aba, consulta da lista, consulta dos detalhes e recarga de `/administracao/acervo` e `/administracao/acervo/` conservaram a autenticação. O redirecionamento relatado na conta real não foi reproduzido nesse fluxo. Sem a requisição correspondente ou confirmação de origem/aba, não é possível afirmar que foi causado por sessão ausente, expirada ou rejeitada pela API. O registro incompleto da rota era um defeito distinto e foi corrigido.

## Evento OPERATIONAL_ERROR

A consulta ao Supabase foi executada com uma conexão de sessão, `connection_limit=1` e `transaction_read_only=on`, sem mutações. Foi localizado o evento de 16/11/2026 às **17:52:26.790 UTC = 14:52:26.790 America/Sao_Paulo**, com identificador iniciado por `f6ce3d81`. Há dois eventos anteriores às 14:52:19 e 14:52:20.

Os registros contêm `event=OPERATIONAL_ERROR`, `result=FAILED`, `severity=ERROR`, responsável preenchido e recurso ausente. O middleware classifica qualquer resposta HTTP >= 500 dessa forma, incluindo bloqueios funcionais HTTP 503. O registro não contém endpoint, status HTTP, exceção ou identificador de requisição.

O log local contém eventos HTTP 503 e consultas autenticadas bem-sucedidas, mas não tem timestamps por entrada nem identificadores que permitam ligá-los inequivocamente ao evento persistido. Não há evidência suficiente para atribuir o evento ao acervo, a uma falha de autenticação ou a uma indisponibilidade específica. O processo local em modo somente leitura registra seus eventos de navegação no console, sem criar registros de auditoria no Supabase. Nenhum registro histórico foi editado para preencher essas lacunas.

## Validação

- Build frontend aprovado, incluindo chunk separado da interface editorial.
- Build backend aprovado.
- Dez scripts frontend aprovados, incluindo rotas ADMIN, restrições de professor, renderização editorial e controles de revisão.
- Dez testes unitários direcionados aprovados: serviço editorial e proteção local de navegação.
- 27 testes de integração aprovados em três arquivos, incluindo Chrome com login legítimo, lista/detalhes reais e recargas autenticadas, além de autorização, concorrência, rollback e treinos nas cinco disciplinas.
- 32 migrations aplicadas somente no PostgreSQL descartável; ausência de drift e checksums históricos preservados.
- Hashes dos arquivos protegidos de Perfil e configurações conferidos sem alteração.
- `git diff --check` aprovado.

As consultas da conta ADMIN real no navegador continuam dependendo da sessão legítima dessa aba; o teste isolado não foi apresentado como uma execução dessa conta. Não houve escrita no Supabase, liberação de questões, migrations reais, commit, push ou deploy.
