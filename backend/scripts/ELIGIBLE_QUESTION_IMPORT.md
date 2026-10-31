# Importação controlada de questões elegíveis

Preencha `scripts/templates/eligible-question-batch.template.json` como estrutura, sem deixar placeholders. O arquivo contém apenas campos vazios e não é um lote importável. Duplique os objetos para cumprir a composição: são necessárias 30 questões nos slots definidos pelo serviço (por disciplina: 2 IA básicas, 1 IA intermediária, 1 OAB oficial intermediária e 2 OAB oficiais avançadas). Declare em `practiceTopics` cada assunto coberto; cada assunto declarado deve ter pelo menos cinco questões completas.

`origem: "IA"` identifica questão original redigida para o JurisSim, inclusive quando ferramentas de IA ajudaram na redação. Registre a fonte jurídica realmente consultada e documente autoria, revisão humana e autorização de uso aplicável; o uso de IA não prova correção, originalidade ou licença. `origem: "OAB_OFICIAL"` identifica reprodução de questão oficial: use o enunciado e as alternativas oficiais somente com a situação de validade e evidências reais de autorização ou domínio público verificado. Não classifique conteúdo gerado como OAB oficial, nem use URL pública como prova suficiente de direitos.

`import-eligible-question-batch.ts` aceita um JSON produzido a partir de conteúdo real autorizado e revisado. Não há conteúdo de exemplo neste repositório. A prévia é offline e não lê `.env`, não conecta ao banco e não grava dados:

```powershell
npx tsx scripts/import-eligible-question-batch.ts --input <lote.json>
```

O lote deve trazer `questions` e `practiceTopics`. Cada questão precisa de enunciado, disciplina canônica, assunto, nível, fundamentação, origem, quatro alternativas A-D e exatamente uma correta; revisões jurídica/pedagógica com IDs, datas e referências de evidência; liberação com responsável/data/evidência; e fonte/proveniência. Questões OAB também precisam de exame/edição/tipo/número, URL oficial, status `VALIDA`, estado de direitos permitido, verificador/data/evidência de direitos e licença/autorização documentada. O script exige os slots reais de composição do diagnóstico e no mínimo cinco questões para cada assunto de prática declarado.

A prévia valida estrutura e metadados declarados; não certifica a veracidade jurídica, a licença nem as evidências. Um responsável humano precisa revisar o conteúdo e conferir os documentos originais antes de preparar o lote. Guarde o JSON de evidências em repositório seguro: o banco recebe o hash do arquivo, não seus anexos.

Gravação só é aceita com `--apply`, `JURISSIM_QUESTION_IMPORT_STAGE=development|homologation`, `NODE_ENV` diferente de `production`, e as variáveis `QUESTION_IMPORT_DATABASE_URL`, `QUESTION_IMPORT_ALLOWED_HOST` e `QUESTION_IMPORT_ADMIN_ID`. A URL precisa ser injetada pelo gerenciador de segredos; o script não carrega `.env`. O host é comparado exatamente à allowlist. Revisores e liberador são validados por ID e papel ativo no banco. Tudo é criado numa transação serializável; duplicata por fingerprint aborta o lote inteiro e itens existentes nunca são atualizados. Esse importador não deve ser habilitado em produção.

Limite de duplicatas: fingerprints nulos em questões históricas não são comparáveis com garantia. Antes de carregar, revise possíveis duplicatas históricas usando o procedimento em `backend/prisma/QUESTION_IMPORT_MIGRATION.md`; não atribua fingerprints às cegas.
