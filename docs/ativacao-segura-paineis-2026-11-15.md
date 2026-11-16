# Ativacao segura dos paineis ADMIN e Instituicao

Branch de entrega: `entrega-16-11`
Estado: codigo e builds locais validados; ativacao no banco conectado pendente.

## Configuracao

O backend usa estas flags:

- `ADMINISTRATION_ENABLED=true` habilita capacidades do painel ADMIN geral.
- `INSTITUTIONS_ENABLED=true` habilita operacoes institucionais completas e, por compatibilidade, tambem as capacidades ADMIN e cadastro institucional.
- `INSTITUTION_REGISTRATION_ENABLED=true` habilita somente o cadastro e acompanhamento de solicitacoes; nao concede operacoes completas.

No ambiente conectado, `INSTITUTIONS_ENABLED` esta explicitamente `false` e `ADMINISTRATION_ENABLED` nao esta definido. O backend local aponta ao Supabase configurado. Por isso, as flags nao foram habilitadas no `.env` local nem no ambiente compartilhado. Apos liberar o banco, definir as flags no ambiente de implantacao do backend, em janela autorizada. Nao usar `INSTITUTIONS_ENABLED` como substituto de uma permissao por conta: os guards e vinculos ativos continuam obrigatorios.

## Bloqueios do historico Prisma

O historico remoto registra como aplicadas tres migrations cujos arquivos originais nao estao no repositorio:

- `20261113200000_teacher_academic_activities`
- `20261113210000_class_materials_announcements`
- `20261113220000_teacher_questions_in_exams`

Seus SQLs e checksums originais precisam ser recuperados e comparados com `_prisma_migrations`. Nao criar substitutos, nao usar `migrate resolve` artificialmente e nao apagar registros do historico. As migrations aditivas locais abaixo permanecem pendentes no banco real e devem continuar versionadas:

- `20261115193000_class_lifecycle`
- `20261115203000_class_activities`

## Sequencia para ativacao futura

1. Recuperar as tres migrations originais e verificar seus checksums contra o historico remoto.
2. Confirmar backup restauravel do mesmo banco, testar a restauracao e validar o estado em uma copia restaurada.
3. Reconciliar somente com os artefatos originais, sem reset, alteracao manual do historico ou apagamento de dados.
4. Validar as duas migrations pendentes na copia restaurada e revisar locks, permissao do papel de migracao e plano de recuperacao.
5. Aplicar somente apos autorizacao explicita para o Supabase real; verificar estruturas e registros Prisma ao final.
6. Configurar as flags no ambiente do backend e validar acessos ADMIN e institucionais com contas autorizadas, incluindo tentativas negativas entre perfis/instituicoes.

Nenhuma migration ou flag foi aplicada no Supabase durante esta entrega. Os testes funcionais recentes usaram PostgreSQL descartavel e contas isoladas.
