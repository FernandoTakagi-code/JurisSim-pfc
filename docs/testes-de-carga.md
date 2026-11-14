# Testes de carga do JurisSim

## Objetivo e limites

Exercitar a API HTTP real com PostgreSQL 17 descartável e até 30 alunos simultâneos. Usa Grafana k6 portátil; não exige conta na Grafana Cloud. Não chama Render/Supabase, não lê credenciais para preparar contas reais e não aceita URL pública como alvo. O harness permite somente o cluster que acabou de criar, com identificação validada antes de gravar dados.

O resultado mede essa execução local. Não estabelece a capacidade do plano do Render, do pool compartilhado do Supabase ou da rede da apresentação. Um teste hospedado exige um ambiente de homologação próprio, com limites e contas descartáveis. O ambiente staging reservado no GitHub, sozinho, não fornece essa infraestrutura.

## Cenários e critérios

| Etapa | Alunos concorrentes | Atividade |
| --- | ---: | --- |
| smoke | 1 | Login, sessão, diagnóstico completo, resultado, desempenho e histórico |
| five | 5 | Mesmo fluxo, com contas diferentes |
| ten | 10 | Mesmo fluxo |
| twenty | 20 | Mesmo fluxo |
| thirty | 30 | Mesmo fluxo |
| spike | 30 | Diagnóstico respondido em rajada, seguido de simulado individual de 30 questões inéditas |

Cada aluno entra uma vez. Há duas solicitações simultâneas de início, reenvio concorrente da última resposta do diagnóstico e duas finalizações simultâneas. As etapas comuns esperam entre 0,75 e 1,25 segundo por resposta: são pausas comprimidas de ensaio, não uma estimativa do tempo de leitura de uma questão jurídica. O pico deliberadamente remove as pausas do diagnóstico; no simulado individual elas permanecem. As etapas rodam em sequência, sem sobreposição, e usam 96 contas sintéticas diferentes. O gerador não repete ciclos indefinidamente.

Metas propostas, não SLA: p95 inferior a 2.000 ms para operações comuns e login, inferior a 5.000 ms para finalização, menos de 1% de respostas HTTP inesperadas, 100% das verificações funcionais e conclusão de todos os usuários da etapa. Uma falha impede avançar para a carga seguinte. A taxa de erros pode interromper uma etapa após 15 segundos; cada etapa tem duração máxima de 120 segundos e cada requisição tem timeout de 10 segundos.

Depois da carga, consultas ao banco conferem 126 tentativas e 3.780 respostas: um diagnóstico por aluno e 30 simulados individuais. Verificam pontuação esperada de 15/30, alternativas exatas por questão, ausência de duplicação de métricas, ausência de questões repetidas entre diagnóstico e simulado do aluno, isolamento entre contas e imutabilidade depois da conclusão. A coleta de CPU, memória e ocupação do event loop ocorre no processo da API a cada segundo.

## Ambiente sintético

O acervo tem 150 questões fictícias, com cinco disciplinas, três níveis, quatro alternativas e texto de tamanho controlado. Não usa nem valida conteúdo jurídico. Metadados de revisão são exclusivamente fixtures técnicas no banco descartável; não representam aprovação humana do acervo real. Usa composição AUTORAL_30 e inventário público elegível; o filtro dos lotes privados de piloto de produção é diferente. E-mail, Google e Groq ficam desativados. Senhas sintéticas usam bcrypt com custo 10. O tempo de inicialização é registrado separadamente e não integra os percentis do k6.

A API roda por tsx com um coletor local de métricas, no mesmo computador do banco e do gerador. Esses fatores afetam a comparação com produção. Não mede navegação/renderização do frontend, envio real de e-mail, autenticação Google, latência de IA, prova institucional, comportamento após horas de uso ou milhares de usuários.

## Execução

Use PostgreSQL 17 e um executável oficial do k6. A execução inicial utilizou k6 2.4.0, obtido da distribuição oficial e conferido por SHA-256. Não grave o executável no Git.

No PowerShell, a partir de backend:

```powershell
$env:JURISSIM_K6_BIN = 'C:\ferramentas\k6\k6.exe'
npm.cmd run test:load:disposable -- 'C:\ferramentas\postgresql-17\bin'
```

O caminho deve apontar para o executável existente. O harness não aceita connection string como argumento. Não use DATABASE_URL de produção para rodar scripts de carga. Ele cria seus próprios bancos e arquivos de identificação, aplica as migrações, inicia a API apenas em 127.0.0.1 e encerra os processos do teste ao terminar. Não modifica a API local de desenvolvimento já aberta.

Relatórios ficam em `backend/.local/load-<data>/`: `stages.json`, resumos do k6 por etapa, `runtime.jsonl`, logs locais e `report.json` quando todas as verificações passam. Em caso de falha há `failure.json`; o script termina com código diferente de zero. Arquivos temporários de contas são removidos após cada etapa. Não publique a pasta inteira como artefato; os relatórios consolidados não precisam conter senha, JWT, e-mail ou connection string. O cluster temporário é desligado e os arquivos são preservados para investigação; não há limpeza recursiva de pastas externas.

## Falha encontrada e correção

O primeiro smoke encontrou HTTP 500 ao reenviar simultaneamente uma resposta já salva. O PostgreSQL recusou uma transação por conflito de serialização. A escrita utilizava Serializable e bloqueio da tentativa, mas não repetia a transação abortada; conflitos originados por SQL bruto também podem chegar como P2010/SQLSTATE 40001.

O salvamento e a finalização bloqueiam a linha da tentativa antes de ler estado, titular e alternativas. Usam ReadCommitted para enxergar o estado confirmado após a espera, preservando a atomicidade e evitando conflitos de predicados Serializable entre alunos diferentes. Todas as escritas do diagnóstico inicial passam por essas travas; o conteúdo das questões vem do snapshot congelado. A transação inteira é repetida somente para conflitos confirmados P2034 ou P2010 com SQLSTATE 40001/40P01, com espera limitada e no máximo cinco tentativas. Falhas permanentes, unicidade e erros de rede/commit desconhecido não são repetidos. Esgotamento retorna 503 com Retry-After. O controller de início também preserva respostas de domínio em vez de convertê-las em 500.

Na criação, a tentativa ainda não existe para ser travada: a transação agora bloqueia a linha do aluno antes de consultar/criar sua identidade inicial. Usa ReadCommitted, como a criação do simulado individual, e mantém a identidade única e todas as gravações na mesma transação. Isso serializa operações do mesmo aluno sem conflitos de predicados de ausência entre alunos diferentes. A regressão com PostgreSQL verifica início duplicado entre vários alunos, reenvios, finalização repetida, auditoria única, isolamento e imutabilidade.

As execuções anteriores foram preservadas: falha em reenvio no smoke, depois falhas de início com cinco e dez alunos e esgotamento de repetição no salvamento com dez alunos. Não são resultados aprovados nem foram ignoradas para aumentar a carga.

## Referências

- k6, tipos e automação de testes: https://grafana.com/docs/k6/latest/testing-guides/automated-performance-testing/
- k6, resultados e percentis: https://grafana.com/docs/k6/latest/get-started/results-output/
- k6, instalação oficial: https://grafana.com/docs/k6/latest/set-up/install-k6/
- PostgreSQL 17, isolamento e repetição de transações abortadas: https://www.postgresql.org/docs/17/transaction-iso.html

## Resultados registrados

Consulte [a execução de 14/11/2026](relatorios/carga-2026-11-14.md), com as seis etapas aprovadas, conferência de integridade e histórico das rodadas anteriores reprovadas.
