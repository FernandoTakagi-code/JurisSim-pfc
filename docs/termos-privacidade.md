# Documentos jurídicos do JurisSim

Os Termos de Uso e o Aviso de Privacidade ficam publicamente disponíveis em `/#/termos` e `/#/privacidade`, com links no acesso, cadastro e rodapé das telas autenticadas. As páginas compartilham o componente `frontend/src/legal.tsx`. As versões e a data são mantidas em `backend/src/legal-versions.json`.

## Aceite no cadastro

O cadastro exige aceite afirmativo das versões vigentes dos dois documentos. O backend valida as versões e registra a data/hora, os números das versões e evento de auditoria. O aceite dos Termos não é apresentado como consentimento geral para o tratamento de dados pessoais.

## Levantamento do serviço

Os documentos refletem os fluxos de conta por e-mail e senha, perfis, sessão em `sessionStorage`, questões e autoria, simulados, respostas, resultados, recomendações adaptativas e eventos de auditoria existentes no projeto. A interface solicita a fonte Manrope ao Google Fonts. A autenticação Google, confirmação de e-mail e recuperação de senha são descritas apenas em caráter condicional, sem afirmar que estejam operacionais nem atribuir fornecedores de e-mail.

O Aviso usa o título “Aviso de Privacidade”, expressão adequada para a comunicação externa de práticas de tratamento; o termo “Política de Privacidade” permanece reconhecível nos links e no fluxo de aceite.

## Revisão para disponibilização

Antes de disponibilizar os documentos ao público, o grupo responsável deve completar e validar as informações institucionais que o repositório não permite identificar:

- nome ou razão social, identificação e endereço do controlador;
- canal oficial para solicitações de titulares e contato do encarregado, se indicado;
- confirmação das bases legais por finalidade, inclusive a avaliação documentada de legítimo interesse, se adotado;
- fornecedores efetivamente contratados para aplicação, banco de dados, hospedagem, backups, autenticação e comunicação, suas funções e localidades;
- existência e mecanismo de transferência internacional;
- critérios ou prazos de retenção e procedimentos de eliminação/anonimização;
- validação de que o processo de Google Login, confirmação de e-mail e recuperação de senha entregue na publicação corresponde ao texto condicional do Aviso.

As páginas não contêm campos fictícios para essas informações. Sem identificação do controlador e um canal de atendimento funcional, o titular não consegue encaminhar solicitações diretamente, e o dever de transparência fica incompleto.

## Fontes consultadas

- Lei nº 13.709/2018 (LGPD), Planalto: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm — bases legais, princípios, agentes, direitos, segurança e transferência internacional.
- ANPD, Direitos do Titular: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares — conteúdo e limites da seção de direitos e exercício perante controlador/ANPD.
- ANPD, Titular de Dados: https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados — definições de titular, controlador, operador e encarregado.
- ANPD, Guia Orientativo Hipóteses Legais de Tratamento de Dados Pessoais — Legítimo Interesse: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf — necessidade de análise concreta de finalidade, necessidade, balanceamento e salvaguardas para eventual uso dessa hipótese.
- ANPD, Guia Orientativo Cookies e Proteção de Dados Pessoais: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_de_cookies.pdf — transparência e análise de tecnologias de armazenamento/acesso no navegador.
- ANPD, Guia Orientativo sobre Segurança da Informação para Agentes de Tratamento de Pequeno Porte: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_orientat-_seg_da_inf_p_atpp.pdf — referência para descrição proporcional de medidas de segurança.
- Governo Digital, Guia Termo de Uso e Política de Privacidade: https://www.gov.br/governodigital/pt-br/privacidade-e-seguranca/ppsi/guia_termo_uso_politica_privacidade.pdf — estrutura e distinção entre regras do serviço e aviso externo de privacidade.
- Governo Federal, Termo de Uso e Aviso de Privacidade do gov.br: https://www.gov.br/pt-br/termos-de-uso — referência de organização para regras, responsabilidades, tratamento, compartilhamento e contato, sem reprodução de texto.
