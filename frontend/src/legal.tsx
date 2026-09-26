import { useEffect, useState, type ReactNode } from 'react';
import versions from '../../backend/src/legal-versions.json';

export const legalAcceptance = {
  accepted: true,
  termsVersion: versions.termsVersion,
  privacyVersion: versions.privacyVersion,
};

export function LegalLinks() {
  return <div className="legal-links"><a href="#/termos">Termos de Uso</a><span aria-hidden="true"> | </span><a href="#/privacidade">Política de Privacidade</a></div>;
}

const terms = [
  ['Finalidade educacional', 'O JurisSim é uma plataforma de preparação para o Exame da OAB, desenvolvida como projeto acadêmico. Oferece questões, simulados diagnósticos, resultados e trilhas adaptativas de estudo. Não representa a OAB e não oferece consultoria jurídica ou garantia de aprovação.'],
  ['Criação e utilização da conta', 'Informe nome e e-mail corretos, escolha o perfil adequado (ALUNO ou PROFESSOR) e mantenha seus dados atualizados. O perfil ADMIN destina-se à administração. A conta é pessoal. O cadastro exige a leitura e o aceite destes Termos e da Política de Privacidade; a data e as versões aceitas são registradas.'],
  ['Responsabilidades e regras de uso', 'Utilize a plataforma para estudar ou apoiar atividades educacionais. Respeite outros usuários e os direitos sobre os conteúdos. Não tente acessar contas ou dados de terceiros, burlar permissões, manipular resultados, sobrecarregar o serviço ou inserir conteúdo ilícito. Evite incluir dados pessoais de terceiros nos enunciados e materiais.'],
  ['Questões, simulados e resultados', 'Alunos respondem questões e acompanham resultados. Professores e administradores podem gerenciar questões conforme as permissões disponíveis. Quem insere materiais deve ter autorização para utilizá-los e revisar sua exatidão. Enunciados, gabaritos e fundamentações podem conter erros ou ficar desatualizados. Consulte fontes oficiais ao estudar legislação.'],
  ['Trilhas de estudo', 'Os acertos e erros ajudam a calcular percentuais por disciplina, assunto e nível, e a recomendar exercícios. Essas recomendações são apoio ao estudo e não uma avaliação profissional ou previsão de aprovação no Exame da OAB.'],
  ['Segurança da conta', 'Escolha uma senha exclusiva, mantenha-a em sigilo e não compartilhe sua sessão. Ao usar um dispositivo compartilhado, encerre a sessão de navegação. Comunique suspeitas de acesso indevido ao responsável pela disponibilização do JurisSim; o canal oficial de contato ainda precisa ser definido.'],
  ['Limitações do serviço', 'A disponibilidade depende da infraestrutura e pode ser afetada por manutenção e falhas. Por ser um projeto acadêmico, funcionalidades podem estar em desenvolvimento. Os recursos de Google, recuperação de senha e outras opções apenas visuais não devem ser interpretados como serviços já operacionais. Essas limitações não afastam direitos previstos na legislação aplicável.'],
  ['Alterações dos termos', 'Atualizações serão identificadas por nova versão e data nesta página. O aceite no cadastro é vinculado às versões apresentadas naquele momento. O procedimento de comunicação de alterações e de novo aceite para contas existentes deverá ser definido pelo responsável antes de alterações relevantes.'],
  ['Responsável e revisão', 'A identificação do responsável legal pelo JurisSim e seu canal oficial de atendimento estão pendentes de revisão antes da disponibilização pública. Este documento descreve a implementação atual do projeto.'],
];

const privacy = [
  ['Dados de cadastro e acesso', 'Tratamos nome, e-mail, identificador da conta, perfil (ALUNO, PROFESSOR ou ADMIN), data de criação e, quando calculado, nível de aprendizagem. Esses dados identificam sua conta e controlam o acesso aos recursos. A senha é usada na autenticação e armazenada como hash bcrypt, nunca em texto puro. O token de sessão fica no sessionStorage do navegador, junto com a indicação da próxima etapa de estudo.'],
  ['Atividades de estudo e autoria', 'Registramos simulados, datas de início e conclusão, questões apresentadas, alternativas escolhidas, acertos e erros e datas de resposta. O modelo também prevê tempo de resposta e limite do simulado quando informados. Percentuais por disciplina, assunto e nível são usados para resultados e trilhas adaptativas, com justificativas e quantidade de exercícios recomendada. Questões criadas ficam vinculadas ao autor. O banco também prevê vínculos com turmas e metas diárias (data, quantidade prevista, resolvida e cumprimento), conforme os recursos utilizados.'],
  ['Aceite e auditoria', 'No novo cadastro guardamos data e hora do aceite e as versões dos dois documentos. Um registro de auditoria associa o identificador da conta à ação ACEITE_TERMOS_E_PRIVACIDADE, à data e às versões, para permitir rastreabilidade. Esse registro não contém senha, hash da senha, token, corpo da requisição, endereço IP ou identificação do dispositivo. Contas anteriores à implantação não recebem um aceite retroativo.'],
  ['Finalidades e bases legais', 'Os dados são utilizados para criar e autenticar contas, permitir estudo, calcular desempenho, personalizar exercícios e comprovar o aceite. A definição e documentação das bases legais aplicáveis a cada finalidade ainda precisam de revisão pelo responsável. O aceite dos documentos não é uma autorização genérica para qualquer uso dos dados e não substitui essa avaliação.'],
  ['Google e serviços externos', 'O botão de acesso com Google ainda não implementa autenticação: não coletamos perfil ou credenciais do Google por esse botão. A interface carrega a fonte Manrope pelo Google Fonts, o que gera requisições do navegador a esse fornecedor, que recebe dados técnicos da conexão, como IP. Isso não integra o registro de auditoria do JurisSim. Os operadores de hospedagem e banco, suas localidades e eventuais transferências internacionais precisam ser identificados pelo responsável.'],
  ['Armazenamento, acesso e compartilhamento', 'Os registros da plataforma são armazenados em banco PostgreSQL. A aplicação utiliza hash de senha e autenticação por token para recursos protegidos. Dados e conteúdos são acessados conforme os recursos e permissões da plataforma; questões podem ser públicas ou associadas a turmas. Não há integração de publicidade ou venda de dados implementada no código analisado. Acesso administrativo, fornecedores, cópias de segurança e compartilhamentos legais devem ser documentados pelo responsável. Não há garantia de segurança absoluta.'],
  ['Retenção', 'O código atual não estabelece prazo de expiração nem rotina automática de exclusão dos dados de conta, estudo e auditoria. Os prazos e procedimentos de eliminação ou anonimização estão pendentes de definição. Devem considerar a necessidade educacional, manutenção da conta, obrigações legais e exercício de direitos, evitando conservação desnecessária.'],
  ['Direitos do titular', 'Nos termos da LGPD, você pode solicitar confirmação e acesso, correção, informação sobre compartilhamento e sobre a possibilidade de negar consentimento e suas consequências, anonimização, bloqueio ou eliminação de dados inadequados ou desnecessários, portabilidade conforme regulamentação e eliminação de dados tratados com consentimento, respeitadas as exceções legais. Pode também revogar consentimento, apresentar oposição nas hipóteses legais e solicitar revisão de decisões exclusivamente automatizadas que afetem seus interesses, como a classificação de aprendizagem.'],
  ['Como solicitar providências', 'Solicite acesso, correção ou outras providências à pessoa ou instituição que disponibilizou seu acesso ao JurisSim, indicando a conta e o pedido, sem enviar sua senha. Atenção: a identificação do controlador, o contato oficial e o procedimento de atendimento ainda não foram definidos no projeto e precisam ser preenchidos antes da disponibilização pública. Não existe formulário automático para esses pedidos nesta versão. Você também pode peticionar à ANPD nos termos da LGPD.'],
  ['Atualizações', 'A versão e a data desta política identificam o texto apresentado no cadastro. Alterações nas funcionalidades e nos tratamentos exigem revisão deste documento. Os responsáveis devem definir como comunicar mudanças aos usuários.'],
];

export function LegalPage({ kind, onBack }: { kind: 'terms' | 'privacy'; onBack: () => void }) {
  const title = kind === 'terms' ? 'Termos de Uso' : 'Política de Privacidade';
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
      <p className="muted">Versão {kind === 'terms' ? versions.termsVersion : versions.privacyVersion} · {versions.date}</p>
      <p className="legal-notice">Informações do responsável e de atendimento pendentes de revisão antes da disponibilização pública.</p>
      {(kind === 'terms' ? terms : privacy).map(([heading, content]) => <section key={heading}><h2>{heading}</h2><p>{content}</p></section>)}
      {kind === 'privacy' && <p>Referência: <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm" target="_blank" rel="noreferrer">Lei Geral de Proteção de Dados Pessoais</a>.</p>}
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
