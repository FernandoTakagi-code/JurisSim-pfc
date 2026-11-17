# Conferência da entrega

Este checklist orienta a conferência da versão escolhida pela equipe. Não declara validação de todas as funcionalidades ou equivalência entre localhost e hospedagem.

## Identificar a versão

Registrar o link do repositório, a branch e o commit apresentados. Confirmar que as alterações pretendidas foram enviadas e que o orientador tem acesso. Não incluir `.env`, credenciais, senhas, tokens ou dados pessoais reais nas evidências.

## Conferir a execução

1. Seguir o README em uma instalação nova, mantendo as configurações existentes quando houver.
2. Validar as variáveis e conferir o schema do banco de destino antes de qualquer manutenção.
3. Compilar backend e frontend e executar as verificações apropriadas.
4. Conferir o fluxo de ADMIN: consultas, solicitações institucionais e auditoria.
5. Conferir o fluxo institucional: professores, vínculos, turmas e avaliações autorizadas.
6. Conferir o professor: criar questão, preparar rascunho de atividade/simulado e publicar somente o conteúdo destinado à apresentação.
7. Conferir o percurso do aluno e os resultados, coordenando com o integrante responsável por essa área.
8. Conferir e-mail, Google e demais integrações apenas nos ambientes configurados. Não confundir configuração presente com entrega ou autenticação comprovada.

## Evidências

- Consulte o [índice de evidências](evidence/README.md): reúne cinco capturas históricas selecionadas, sua origem e os registros de testes disponíveis. Capturas históricas não substituem a conferência da versão final. Os testes visuais gravam novos artefatos locais em `frontend/.artifacts/evidence`, fora do Git.
- [Teste de carga](testes-de-carga.md) e [resultado de 14/11](relatorios/carga-2026-11-14.md): evidência local vinculada à versão registrada no relatório; não comprova capacidade do Render/Supabase.
- Testes automatizados registram seu próprio escopo. Testes com mocks não comprovam gravação, envio de e-mail ou funcionamento da publicação.

## Pontos a confirmar

- Revisão humana jurídica e pedagógica do acervo piloto e definição de sua composição com o orientador.
- Últimas alterações do perfil aluno, sob responsabilidade do integrante que está finalizando o módulo.
- Configuração e versão efetivamente publicadas no Render e na Vercel.
- Monografia, requisitos, regras de negócio e diagramas coerentes com a versão entregue.
- Aceite completo dos fluxos escolhidos para a apresentação, sem afirmar que a simples existência do código comprova sua conclusão.

Mudanças posteriores à versão de entrega devem seguir o alinhamento exigido pelo orientador. O histórico do Git preserva os documentos de etapas antigas retirados da árvore atual.
