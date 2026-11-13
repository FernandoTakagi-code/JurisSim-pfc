# Segurança e privacidade — revisão de 13/11/2026

## Controles entregues

- Proxy: `TRUST_PROXY_HOPS` aceita de 0 a 5. Sem configuração, usa 0 localmente e 1 quando `RENDER=true`. O número deve corresponder à cadeia real do serviço; não equivale a confiar em todos os valores de `X-Forwarded-For`. A topologia de produção deve ser verificada quando houver mudança de CDN ou proxy.
- Login: teto de 300 requisições por IP em 15 minutos e 30 falhas por e-mail normalizado em 15 minutos. Sucessos devolvem a reserva da cota por conta. O cadastro permite 60 requisições por IP/hora. Redes compartilhadas continuam sujeitas ao teto por IP. Os contadores são limitados em memória e não são compartilhados entre processos nem sobrevivem a reinícios; escalar exige armazenamento compartilhado.
- Respostas autenticadas, inclusive negações, usam `Cache-Control: no-store`. A API remove `X-Powered-By`, impede interpretação de tipos e enquadramento em páginas de terceiros. O frontend tem cabeçalhos de enquadramento, permissões de dispositivos e referência configurados na Vercel.
- O nome é validado também no backend: espaços externos removidos e limite de 120 caracteres.
- Feedback Groq tem prazo de 4 segundos, sem repetição automática e com limite de saída. Erros continuam usando o feedback local, sem registrar a resposta privada do provedor.

## Dados da própria conta

`GET /auth/dados?page=1` exige sessão válida e retorna somente o titular identificado no JWT. Não aceita outro usuário como alvo. Pagina até 100 itens por coleção, com `nextPage`; o perfil informa quando há outros arquivos a baixar. Inclui perfil, tentativas, respostas, resultados, trilhas, metas, revisões e eventos pessoais. Não inclui hashes, tokens, dados de outras contas ou gabarito de tentativa em andamento. A exportação não é uma cópia integral do banco; outros pedidos podem ser feitos ao canal do grupo.

## Exclusão existente na outra branch

A branch `entrega0911`, revisada no commit `532214d`, já prepara a exclusão H4.24, confirmação de identidade, política de reutilização de e-mail, revogação de sessões, regras institucionais e interface. A disponibilidade está fixada em false até homologação do banco. Esta entrega reutiliza o mesmo arquivo de disponibilidade e bloqueia o endpoint legado com 503, sem duplicar o fluxo nem ativar exclusão. Pedidos de exclusão são encaminhados ao canal da equipe; a implementação H4.24 deve ser integrada e validada antes de disponibilizar o botão.

A validação visual da exportação ocorreu na conta do titular; nenhuma conta real foi excluída. Os testes de banco usam somente PostgreSQL temporário e contas sintéticas.

## Responsabilidade do grupo

A equipe do projeto assume a responsabilidade pelo tratamento. O canal autorizado para publicação é `jurissimplataforma@gmail.com`. O grupo precisa acompanhar esse canal, verificar identidade proporcionalmente, registrar e responder aos pedidos sem solicitar senha. A equipe deve manter os nomes dos responsáveis e a indicação do encarregado, se aplicável, documentados. Não há dispensa automática por ser projeto acadêmico.

O aviso identifica Supabase, Render, Vercel, Brevo, Groq e Google e descreve o envio de indicadores de estudo à IA sem alegar anonimato. As versões dos documentos foram atualizadas para `2026-11-13.1`; os aceites antigos não são sobrescritos.

Ainda exigem decisão e rotina do grupo: prazos fundamentados por categoria de histórico e auditoria, descarte em backups, transferências internacionais e contratos dos fornecedores, avaliação das bases legais e atendimento a solicitações além do recorte da exportação. O prazo padrão de 180 dias do comando de manutenção cobre auditoria administrativa, não todas as tabelas; o comando exige execução operacional autorizada. Não existe expiração automática geral. Não publicar promessas de apagamento ou de conformidade integral sem implementar e validar a rotina correspondente.

## Dependências

`npm audit fix --ignore-scripts` atualizou versões compatíveis no lockfile do backend. Os alertas corrigíveis sem migração principal incluíam body-parser, Zod, Nodemailer e qs. A consulta posterior manteve um aviso de deepmerge-ts refletido também em @prisma/config e Prisma (três entradas para a mesma cadeia). Trata-se de ferramenta de configuração/CLI; não há passagem de objetos HTTP para sua operação de merge no código revisado. O npm propõe migração principal para Prisma 7; não foi forçada durante esta correção. Deve ser tratada em migração própria e acompanhada, não ocultada. A consulta das dependências de produção do frontend não apontou alertas nesta data.

## Referências

- Express, proxy: https://expressjs.com/en/guide/behind-proxies/
- Render, identificação do ambiente: https://render.com/docs/environment-variables
- ANPD, canal de titular e encarregado: https://www.gov.br/anpd/pt-br/canais_atendimento/cidadao-titular-de-dados/denuncia-peticao-de-titular-referente-lgpd
- Advisory body-parser: https://github.com/advisories/GHSA-27r3-jxmh-p828
- Advisory Zod: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- Advisory deepmerge-ts: https://github.com/advisories/GHSA-ggr8-5vv4-36mx

Esta revisão reduz riscos verificados; não constitui certificação de segurança ou parecer de conformidade LGPD.

## Validação desta entrega

- Backend: 1.072 testes unitários/de rotas aprovados; build e lint aprovados. Frontend: build aprovado.
- Navegador local: exportação da própria conta concluída; aviso atualizado conferido; versão final sem formulário de exclusão duplicado. Nenhuma conta real foi excluída.
- A execução ampliada em PostgreSQL temporário validou migrações, sessões, histórico, turmas, relatórios, fotos e exportação; terminou com falha no teste de navegador institucional. Não é apresentada como suíte integral aprovada. A suíte focal de privacidade pode ser executada sem iniciar automação de navegador: `node scripts/test-migrations-local.cjs <PostgreSQL-bin> --account-privacy-only`.
- As correções nas expectativas de autorização de turmas e relatórios reutilizam as atualizações da branch `entrega0911`; o ADMIN global continua sem permissão acadêmica.

A suíte focal de privacidade foi concluída com sucesso: nove cenários de foto/exportação e verificação das 24 migrações, sem drift nos bancos temporários. Inclui isolamento de contas, paginação sem repetição, ausência de hashes e ocultação da correção durante tentativas em andamento.
