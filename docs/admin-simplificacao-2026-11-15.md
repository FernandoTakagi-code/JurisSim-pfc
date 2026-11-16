# Simplificação da navegação do ADMIN

15/11/2026. Ajuste solicitado diretamente na main, comparado com entrega-16-11 (9d1f963), sem integrar a entrega maior da equipe.

- Menu principal com sete entradas: Visão geral, Instituições, Solicitações de cadastro, Usuários, Logs e auditoria, Avisos e Estado do sistema.
- Professores são consultados pelo filtro de perfil em Usuários. A antiga URL /administracao/professores permanece funcional como consulta filtrada.
- A gestão de acesso administrativo fica em uma seção expansível da ficha de usuário elegível. As confirmações, justificativas, restrições da própria conta e autorização do backend continuam as mesmas. A segurança pessoal fica em Perfil e configurações; /administracao/seguranca permanece compatível como rota antiga.
- A operação excepcional de reutilização de e-mail foi retirada da consulta principal. O backend e o componente de manutenção não foram removidos nem ativados.
- Avisos explica que as mensagens são destinadas à conta, distinguindo-as de solicitações e de auditoria; o estado vazio não mostra paginação sem itens.
- Estado do sistema explica a conexão com a API, o recebimento ou pausa de solicitações e a disponibilidade dos painéis. Retiradas a promessa de um controle futuro e a indicação ambígua de monitoramento de e-mail. A verificação de saúde não é descrita como teste de entrega de mensagens.

Esta mudança não ativa cadastro institucional, convites, operações acadêmicas, exclusão de conta ou reutilização de e-mail; não altera banco ou permissões do servidor. ADMINISTRATION_ENABLED já foi habilitado separadamente por autorização expressa. INSTITUTIONS_ENABLED e INSTITUTION_REGISTRATION_ENABLED continuam desligados no ambiente conferido.

A entrega do João contém melhorias adicionais de indicadores e autenticação, além de atividades e migrations. Ao integrá-la, preservar esta navegação simplificada e conciliar os componentes compartilhados, sem restaurar menus duplicados ou descartar os indicadores novos. Não há garantia de merge automático de arquivos editados pelas duas entregas.

Validação: build do frontend e test:delivery-static aprovados; 16 verificações direcionadas de renderização administrativa, incluindo estados de erro/indisponibilidade, contratos de consulta e ausência de menus duplicados. Scripts de navegador existentes foram alinhados aos rótulos novos e passaram na análise sintática; sua execução por CLI não foi usada como evidência visual desta etapa.

## Ajuste posterior solicitado pelo responsável

Estado do sistema foi retirado do menu, que passa a ter seis entradas. A URL antiga de configurações permanece compatível. A descrição de Avisos esclarece que são mensagens automáticas para destinatários específicos, não recados entre usuários nem uma caixa global de todos os acontecimentos. A análise estática administrativa passou a incluir uma verificação dessa explicação e da ausência de paginação em caixa vazia.

Foi autorizada uma solicitação de instituição fictícia no site publicado para o titular analisar como ADMIN. O cadastro foi feito por manutenção com o serviço normal e validação de dados, vinculado a uma conta individual existente e confirmada. Nome e descrição identificam DEMONSTRAÇÃO, com o CNPJ alfanumérico de exemplo das fixtures, endereço/telefone sintéticos e contato example.invalid; não representam uma instituição real. Ficou PENDING, sem vínculo concedido nem envio de e-mail. A aprovação cabe ao titular na interface e não ativa automaticamente as operações institucionais desligadas. Nenhuma dispensa de validação ou regra de autorização foi adicionada ao código.
