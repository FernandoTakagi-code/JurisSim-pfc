# Conferência da auditoria administrativa — 16/11

Alterações destinadas à branch `entrega-16-11`, sem merge na main.

- A auditoria do ADMIN é global. A auditoria institucional continua limitada ao endpoint da instituição autorizada.
- Gestão administrativa e Acessos e contas têm seletores separados; apenas o histórico escolhido é consultado.
- Eventos conhecidos têm nomes legíveis; códigos, IDs, versões legais e resultado original ficam em detalhes recolhidos. Eventos desconhecidos continuam acessíveis pelo código nos detalhes e no filtro avançado.
- A gestão administrativa mantém paginação real. Acessos e contas mantém a consulta dos registros mais recentes limitada a 25, 50 ou 100; datas permitem investigar períodos antigos, sem inventar paginação.
- Os filtros de datas validam a ordem e podem ser limpos. Formulários preservam a seleção visível após consulta.
- A visão geral mantém os indicadores implementados pela equipe, retira atalhos redundantes e apresenta até cinco movimentações administrativas. Logins permanecem no histórico de acessos.

## Validação

Build do frontend, suíte `test:delivery-static` e conferência visual no navegador com API e PostgreSQL locais e dados sintéticos. Nenhuma migration, alteração de permissões ou escrita no Supabase foi necessária para este ajuste.

O script de teste de navegador existente foi ajustado ao novo texto; foi conferido apenas com `node --check`. A conferência visual foi feita separadamente pela interface do navegador.

## Modo de demonstração

A faixa acadêmica já pertence ao modo de demonstração existente. Seu controle é `VITE_JURISSIM_DEMO_MODE`; o exemplo versionado permanece `false`. Sua ativação neste teste está em um lançador local ignorado pelo Git, assim como as configurações do banco descartável. O commit não ativa esse modo no ambiente publicado e não inclui contas ou registros de teste do banco local.
