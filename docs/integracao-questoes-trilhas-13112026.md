# Integração de questões, simulados e trilhas

13/11/2026. Integração de `fernando/questoes-diagnostico-autoral`, `entrega0911` e da `main` atual em `integracao/questoes-trilhas-desempenho`. Os commits originais dos dois autores ficam preservados.

## Resolução

- Histórico distingue diagnóstico inicial, diagnóstico legado, prática, simulado individual, avaliação de turma e trilha. Retomar um simulado individual usa sua própria rota; o diagnóstico inicial usa seu contrato próprio.
- A finalização transacional da prática usa o snapshot original para análise. Questões provisórias não alteram o nível, inclusive em finalizações concorrentes. O nível de práticas elegíveis é atualizado na mesma transação da finalização; retries de atividades concluídas não o regravam.
- Correção de prática mantém snapshot e bloqueio de alteração depois da confirmação. Os escopos positivos de trilha e prática impedem tratar uma modalidade como a outra.
- Dashboard, estudo de conteúdos, trilha adaptativa e recuperação de tentativas do João permanecem integrados aos simulados e revisões do Fernando.
- CI e roteamento do Vercel da main foram preservados. Configurações de teste isolam tanto os pilotos quanto os módulos institucionais. Tipos do preparo autoral e importação foram ajustados para o linter existente, sem conceder aprovações.

## Validação

- Suíte completa unitária e de rotas aprovada localmente.
- 22 integrações em PostgreSQL 17.11 descartável: 13 de ciclo de tentativas, cinco de prática, duas de simulado individual e duas de revisão. Cobrem concorrência, rollback, idempotência, propriedade e preservação do nível no piloto. As 24 migrations foram aplicadas sem drift e sem alterar checksums históricos; cluster encerrado.
- Builds de backend e frontend e linter aprovados. Permanecem o aviso informativo de configuração antiga do Biome e o aviso de tamanho do bundle frontend.
- Navegador autenticado: desempenho, catálogo de questões, revisão, histórico, retomada do simulado existente (3/30) e da trilha existente (5/14). Nenhuma resposta ou finalização executada na conta real nesta integração.
- Nenhuma migration ou alteração de conteúdo foi aplicada ao Supabase nesta etapa. As configurações privadas locais foram copiadas apenas para executar a versão integrada; não são versionadas.

Esta entrega concilia os trabalhos existentes. A reformulação de **Meu desempenho**, com detalhamento por assunto e atalhos para revisão, continua como próxima etapa.
