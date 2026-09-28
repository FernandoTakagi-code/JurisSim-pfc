import { useEffect, useState, type ReactNode } from 'react';
import versions from '../../backend/src/legal-versions.json';

export const legalAcceptance = {
  accepted: true,
  termsVersion: versions.termsVersion,
  privacyVersion: versions.privacyVersion,
};

export function LegalLinks() {
  return <div className="legal-links"><a href="#/termos">Termos de Uso</a><span aria-hidden="true"> | </span><a href="#/privacidade">Aviso de Privacidade</a></div>;
}

const terms = [
  ['1. Sobre o JurisSim', 'O JurisSim é uma plataforma educacional de apoio à preparação para a primeira fase do Exame de Ordem. Reúne questões, simulados, resultados de desempenho e recomendações de exercícios. O serviço é independente e não representa a Ordem dos Advogados do Brasil (OAB), não presta consultoria jurídica e não garante aprovação.'],
  ['2. Aceitação e acesso', 'Ao criar uma conta, você declara que leu e aceita estes Termos de Uso e o Aviso de Privacidade. O sistema registra a data e hora e as versões aceitas. Esse aceite formaliza as regras de uso; por si só, não constitui consentimento genérico para todo tratamento de dados pessoais. O cadastro pode ser realizado como aluno ou professor, e os recursos são liberados conforme o perfil e as permissões da conta.'],
  ['3. Conta e segurança', 'Forneça nome e endereço de e-mail corretos, mantenha seus dados atualizados e proteja suas credenciais. A conta é pessoal; não compartilhe senha nem sessão. Você responde pelas atividades realizadas por sua conta, ressalvadas as responsabilidades que a legislação atribui ao serviço. Avise o responsável pelo JurisSim se suspeitar de uso não autorizado.'],
  ['4. Uso permitido', 'Use a plataforma para fins educacionais e de acordo com estes Termos e a legislação. Não tente acessar contas, dados ou áreas sem autorização; contornar controles de acesso; interferir no funcionamento; enviar código malicioso; explorar falhas; manipular resultados; ou publicar conteúdo ilícito, ofensivo ou que viole direitos de terceiros. Não inclua dados pessoais de terceiros em questões ou materiais sem fundamento e autorização adequados.'],
  ['5. Questões e conteúdos enviados', 'Questões, alternativas e fundamentações podem ser disponibilizadas publicamente ou em contexto de turma, conforme as permissões aplicáveis. Ao cadastrar conteúdo, você declara ter direito de fazê-lo e autoriza sua utilização na plataforma para disponibilização e funcionamento dos recursos educacionais. Você mantém os direitos que possuir sobre o material. O conteúdo deve respeitar direitos autorais e demais direitos de terceiros.'],
  ['6. Resultados e recomendações', 'As respostas e o desempenho podem ser utilizados para calcular resultados por disciplina, assunto e nível e recomendar exercícios. Essas recomendações apoiam a organização do estudo; não constituem avaliação profissional, diagnóstico de capacidade, decisão sobre acesso a oportunidades ou previsão de aprovação. Confira a legislação e fontes oficiais: questões e fundamentações podem conter imprecisões ou deixar de refletir alterações normativas.'],
  ['7. Propriedade intelectual', 'A plataforma, sua organização, marca, interface e componentes próprios são protegidos pela legislação aplicável. Você pode utilizar os recursos nos limites destes Termos. Não copie, distribua, explore comercialmente ou remova avisos de titularidade de conteúdos sem autorização ou outra base legal. Conteúdos de terceiros permanecem sujeitos aos direitos de seus respectivos titulares.'],
  ['8. Disponibilidade e responsabilidade', 'O JurisSim é fornecido para apoio educacional e sua disponibilidade pode sofrer interrupções por manutenção, falhas técnicas ou fatores externos. Empregamos esforços razoáveis para manter os recursos acessíveis e corrigir problemas. Na extensão permitida pela lei, o serviço não responde por indisponibilidade causada por fatores fora de seu controle, nem por decisões de estudo tomadas exclusivamente com base em resultados ou recomendações da plataforma. Nada nestes Termos exclui direitos ou responsabilidades que não possam ser afastados por lei.'],
  ['9. Suspensão e encerramento', 'O acesso poderá ser restringido quando necessário para proteger a plataforma, usuários ou terceiros, apurar violação destes Termos ou cumprir obrigação legal. Sempre que razoável, a medida será proporcional à situação. O encerramento da conta não elimina dados cuja conservação seja necessária para cumprir obrigação legal, exercer direitos ou atender outra hipótese permitida pela legislação; os detalhes constam no Aviso de Privacidade.'],
  ['10. Alterações', 'Estes Termos podem ser atualizados para refletir mudanças no serviço ou na legislação. A versão e sua data de vigência são indicadas neste documento. Quando uma alteração exigir novo aceite, ele será solicitado antes de continuar o uso dos recursos correspondentes.'],
  ['11. Lei aplicável', 'Aplicam-se as leis da República Federativa do Brasil, observadas as regras legais de competência e os direitos do consumidor, quando aplicáveis.'],
];

const privacy = [
  ['1. Quem trata os dados', 'O controlador do JurisSim é o agente que define as finalidades e os meios essenciais do tratamento de dados pessoais. Prestadores de serviços podem atuar como operadores, tratando dados sob as instruções do controlador e para a execução de suas funções.'],
  ['2. Dados tratados e finalidades', 'Para criar e administrar a conta, são tratados nome, e-mail, identificador, perfil de acesso (aluno, professor ou administrador), senha e data de criação. A senha é armazenada em forma de hash e utilizada para autenticar o acesso. O sistema também mantém um token de sessão no armazenamento de sessão do navegador, além de informações de navegação necessárias à etapa de estudo. Esses dados permitem autenticação, controle de acesso e prestação dos recursos da plataforma.'],
  ['3. Dados de estudo e conteúdo', 'Quando você utiliza simulados e exercícios, são registrados simulados iniciados e concluídos, questões apresentadas, respostas e alternativas escolhidas, correção, datas e resultados. O sistema calcula indicadores por disciplina, assunto e nível, classificação de aprendizagem e recomendações de exercícios para exibir resultados e organizar trilhas adaptativas. Questões cadastradas por professores ou administradores ficam vinculadas ao autor e podem conter enunciado, alternativas, fundamentação e associação a uma turma.'],
  ['4. Registros de auditoria', 'A plataforma registra eventos necessários à segurança, operação e rastreabilidade, incluindo criação de conta, logins bem-sucedidos ou malsucedidos, aceite das versões dos documentos, início e conclusão de diagnósticos e operações de criação, atualização ou exclusão de questões. Os registros incluem identificador de usuário quando disponível, tipo de evento, data e, conforme o evento, referência ao recurso ou versão documental. O fluxo de auditoria analisado não registra senha, token, endereço IP ou identificação do dispositivo.'],
  ['5. Bases legais', 'As operações são realizadas conforme sua finalidade e a hipótese legal aplicável, nos termos da LGPD. A criação e manutenção da conta e a disponibilização das funções solicitadas podem ser necessárias à execução dos Termos e procedimentos relacionados à prestação do serviço. Registros de segurança, prevenção de uso indevido e rastreabilidade podem se apoiar no legítimo interesse, após avaliação de necessidade, expectativas e direitos dos titulares, ou em outra hipótese legal pertinente. Obrigações legais ou regulatórias e o exercício regular de direitos também podem justificar tratamentos específicos. O aceite dos Termos não é tratado como consentimento para finalidades distintas. Se alguma função depender de consentimento, ele será solicitado de forma específica, informada e revogável.'],
  ['6. Autenticação e sessão', 'O acesso atual à conta utiliza e-mail e senha, com senha protegida por hash, e token de autenticação com validade limitada. O token e informações de continuidade da navegação ficam em armazenamento de sessão do navegador, e não em cookie de autenticação persistente. O JurisSim não recebe a senha da sua conta Google. Se você optar por autenticação por Google quando disponível, o processo poderá receber do Google os dados de perfil e identificação necessários à autenticação, como nome, endereço de e-mail e identificador da conta; o Google autentica a conta e não transmite sua senha ao JurisSim. Confirmação de e-mail e recuperação de senha, quando oferecidas, usarão o endereço de e-mail da conta para validação e proteção de acesso.'],
  ['7. Compartilhamento e fornecedores', 'Os dados podem ser acessados por pessoas autorizadas a operar e administrar o serviço e por fornecedores de infraestrutura, banco de dados, autenticação ou comunicação, na medida necessária às respectivas funções e sujeitos às instruções e salvaguardas aplicáveis. Também poderão ser comunicados quando exigido por lei, ordem válida ou necessário ao exercício regular de direitos. A interface solicita ao Google Fonts a fonte Manrope; essa requisição pode transmitir ao fornecedor dados técnicos da conexão, como endereço IP, conforme as práticas próprias do fornecedor. O JurisSim não utiliza os dados para venda nem para publicidade comportamental.'],
  ['8. Armazenamento, retenção e transferência', 'Os registros da plataforma são mantidos em banco de dados PostgreSQL. Os dados são conservados pelo período necessário às finalidades informadas e para atender obrigações legais, proteger direitos ou solucionar disputas, observados os prazos legais e a necessidade de cada categoria. Quando a finalidade se encerrar e não houver fundamento para conservação, os dados serão eliminados ou anonimizados conforme a legislação. Fornecedores e locais de hospedagem podem envolver tratamento fora do Brasil; nesse caso, serão observadas as regras da LGPD para transferência internacional e as garantias aplicáveis.'],
  ['9. Cookies e armazenamento no navegador', 'O fluxo de autenticação examinado não utiliza cookie para manter a sessão: utiliza sessionStorage, que permanece no navegador durante a sessão de navegação. A aplicação carrega a fonte Manrope por Google Fonts. O navegador também pode manter registros técnicos estritamente necessários ao funcionamento da própria conexão. Você pode gerenciar dados de sessão pelas configurações do navegador; removê-los encerra a sessão local, mas não elimina os registros mantidos no servidor.'],
  ['10. Segurança', 'São adotadas medidas técnicas e administrativas compatíveis com a natureza dos dados e os riscos do serviço, incluindo proteção de senha por hash, autenticação por token, controle de acesso por perfil e registros de auditoria de eventos relevantes. Nenhuma medida torna um sistema absolutamente seguro. Mantenha suas credenciais protegidas e comunique qualquer suspeita de acesso indevido ao controlador.'],
  ['11. Decisões automatizadas', 'Regras computacionais calculam indicadores de desempenho e sugerem exercícios a partir das respostas e dos resultados. Essas recomendações servem ao estudo e não produzem, por si, decisão com efeito jurídico ou que afete significativamente seus interesses. Você pode solicitar informações e, quando aplicável nos termos da LGPD, revisão de decisão tomada unicamente com base em tratamento automatizado que afete seus interesses.'],
  ['12. Direitos do titular', 'Nos termos do art. 18 da LGPD, você pode solicitar: confirmação da existência de tratamento e acesso aos dados; correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade; portabilidade, observada a regulamentação e os segredos comercial e industrial; eliminação dos dados tratados com consentimento, ressalvadas as hipóteses legais de conservação; informação sobre entidades públicas e privadas com as quais houve uso compartilhado; informação sobre a possibilidade de não fornecer consentimento e suas consequências; e revogação do consentimento. Também pode apresentar oposição a tratamento realizado em desconformidade com a LGPD e pedir revisão de decisões automatizadas nas condições legais. O atendimento pode exigir confirmação de identidade e está sujeito às hipóteses e exceções previstas em lei.'],
  ['13. Como exercer seus direitos', 'Para exercer seus direitos ou esclarecer dúvidas sobre este Aviso, entre em contato com o controlador do JurisSim. Informe o e-mail associado à conta e descreva o pedido; nunca envie sua senha. Você também pode apresentar petição à Autoridade Nacional de Proteção de Dados (ANPD), observadas as regras aplicáveis.'],
  ['14. Atualizações e vigência', 'Este Aviso poderá ser atualizado para refletir alterações no tratamento ou na legislação. A versão e a data de vigência identificam o texto aplicável. Mudanças relevantes serão comunicadas por meio adequado, e eventual consentimento será solicitado separadamente quando exigido.'],
];

export function LegalPage({ kind, onBack }: { kind: 'terms' | 'privacy'; onBack: () => void }) {
  const title = kind === 'terms' ? 'Termos de Uso' : 'Aviso de Privacidade';
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — JurisSim`;
    window.scrollTo(0, 0);
    return () => { document.title = previous; };
  }, [title]);
  return <main className="legal-page">
    <button className="legal-back" onClick={onBack}>← Voltar ao JurisSim</button>
    <article className="legal-document">
      <p className="gold">JURISSIM · DOCUMENTOS</p>
      <h1>{title} — JurisSim</h1>
      <p className="muted">Versão {kind === 'terms' ? versions.termsVersion : versions.privacyVersion} · Vigência: {versions.date}</p>
      {(kind === 'terms' ? terms : privacy).map(([heading, content]) => <section key={heading}><h2>{heading}</h2><p>{content}</p></section>)}
      {kind === 'privacy' && <p>Referências: <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm" target="_blank" rel="noreferrer">Lei Geral de Proteção de Dados Pessoais</a> e orientações da <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares" target="_blank" rel="noreferrer">ANPD sobre direitos dos titulares</a>.</p>}
      <LegalLinks />
    </article>
  </main>;
}

// Keep the underlying form/simulation mounted while a public document is read.
export function LegalBoundary({ children }: { children: ReactNode }) {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const kind = hash === '#/termos' ? 'terms' : hash === '#/privacidade' ? 'privacy' : null;
  return <><div hidden={!!kind}>{children}</div>{kind && <LegalPage kind={kind} onBack={() => { window.location.hash = ''; }} />}</>;
}
