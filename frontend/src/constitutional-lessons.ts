import type { StudyLesson } from "./study-content";

const cf = "https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm";
const senate = "https://www25.senado.leg.br/web/atividade/legislacao/constituicao-federal";
const source = (label: string, url: string) => ({ label, url });
const q = (question: string, answer: string, explanation: string, basis: string) => ({ question, answer, explanation, basis });
const mc = (id: string, prompt: string, correctLabel: string, basis: string, options: [string, string, string, string], explanations: [string, string, string, string]) => ({
  id, prompt, correctLabel, basis,
  options: options.map((text, i) => ({ label: String.fromCharCode(65 + i), text, explanation: explanations[i] })),
});

export const organizationOfStateLesson: StudyLesson = {
  sections: [
    {
      id: "federacao-autonomia",
      title: "1. Federação, autonomia e organização política",
      paragraphs: [
        "A Federação brasileira distribui poder político entre União, Estados, Distrito Federal e Municípios. O art. 18 os reconhece como entes autônomos dentro das competências e limites da Constituição; soberania pertence à República Federativa do Brasil, não a cada ente isoladamente. Autonomia envolve auto-organização, autogoverno, autolegislação e autoadministração, sempre conforme a Constituição.",
        "A Federação é indissolúvel (art. 1º, caput). Estados podem incorporar-se, subdividir-se ou desmembrar-se mediante consulta plebiscitária da população diretamente interessada e aprovação do Congresso por lei complementar (art. 18, § 3º). A criação, incorporação, fusão ou desmembramento de Municípios segue o art. 18, § 4º, com período definido em lei complementar federal, estudos de viabilidade e plebiscito das populações dos Municípios envolvidos, além de lei estadual.",
      ],
      table: { headers: ["Conceito", "Quem detém?", "Pista de prova"], rows: [
        ["Soberania", "República Federativa do Brasil", "A União é ente autônomo; não se confunde com o Estado federal soberano."],
        ["Autonomia", "União, Estados, DF e Municípios", "É poder dentro da repartição e dos limites constitucionais."],
        ["Indissolubilidade", "Federação", "Não existe direito de secessão de Estado ou Município."],
      ] },
      example: { title: "Exemplo autoral: autonomia não é soberania", facts: "Um Estado afirma que pode deixar a Federação por decisão de seus eleitores.", analysis: "A autonomia estadual não inclui poder de secessão. A Constituição estabelece a união indissolúvel (art. 1º) e descreve hipóteses de alteração territorial estadual no art. 18, § 3º, sem dissolução do vínculo federativo." },
    },
    {
      id: "entes-territorios",
      title: "2. Entes federativos, Territórios e vedações",
      paragraphs: [
        "A União, os Estados, o Distrito Federal e os Municípios são entes federativos (art. 18). Territórios Federais não são entes autônomos: integram a União; criação, transformação em Estado ou reintegração dependem de lei complementar federal (art. 18, § 2º). O Distrito Federal acumula competências legislativas reservadas aos Estados e aos Municípios, mas não pode ser dividido em Municípios (arts. 32 e 147).",
        "O art. 19 contém vedações constitucionais dirigidas aos entes: estabelecer ou subvencionar cultos, embaraçar seu funcionamento ou manter relações de dependência ou aliança, ressalvada colaboração de interesse público na forma da lei; recusar fé a documentos públicos; e criar distinções entre brasileiros ou preferências entre si. A leitura da ressalva evita transformar laicidade em proibição absoluta de toda cooperação pública com entidade religiosa.",
      ],
      points: ["Território integra a União; não é ente federativo autônomo (art. 18, § 2º).", "DF não se divide em Municípios (art. 32).", "Laicidade estatal admite a ressalva de colaboração de interesse público prevista no art. 19, I."],
      example: { title: "Exemplo autoral: Município no Distrito Federal", facts: "Uma lei propõe criar Municípios dentro do Distrito Federal, com prefeito e câmara próprios.", analysis: "O art. 32 veda a divisão do Distrito Federal em Municípios. Não se aplica a ele, nesse ponto, o mesmo arranjo municipal existente nos Estados." },
    },
    {
      id: "competencias-materiais",
      title: "3. Competências materiais: atuar, cuidar e executar",
      paragraphs: [
        "Competência material ou administrativa define quem executa políticas, presta serviços ou atua em determinada matéria. O art. 21 enumera competências administrativas da União, como manter relações com Estados estrangeiros e organizar serviços federais ali listados. O art. 23 prevê competências comuns da União, Estados, Distrito Federal e Municípios, que exigem atuação cooperativa nos termos constitucionais e da legislação complementar prevista no parágrafo único.",
        "Competência comum não significa que todos os entes devam praticar o mesmo ato da mesma forma em cada situação. Identifique o dever constitucional, a escala do problema, a atribuição administrativa e as regras de cooperação. Não confunda competência para executar uma política com competência para editar a lei principal sobre o tema.",
      ],
      table: { headers: ["Dispositivo", "Tipo de atuação", "Como reconhecer"], rows: [
        ["Art. 21", "Material da União", "A Constituição atribui à União ação ou organização de serviço federal."],
        ["Art. 23", "Comum", "Atribuição administrativa compartilhada entre os quatro níveis federativos."],
        ["Arts. 25, § 1º, e 30", "Atuação estadual e municipal", "A Constituição preserva competências estaduais remanescentes e atribuições locais municipais."],
      ] },
      example: { title: "Exemplo autoral: proteção ambiental", facts: "Uma questão descreve atuação de Município, Estado e União na proteção ambiental.", analysis: "O art. 23, VI e VII, prevê competência comum relacionada à proteção ambiental e à preservação de florestas, fauna e flora. A resposta deve examinar a atuação material e a cooperação, sem deduzir automaticamente qual ente pode legislar sobre cada aspecto." },
    },
    {
      id: "competencias-legislativas",
      title: "4. Competências legislativas: quem pode editar a norma",
      paragraphs: [
        "A Constituição também distribui poder para legislar. O art. 22 reserva à União as matérias privativas ali enumeradas, como direito civil, penal, processual, eleitoral e do trabalho; lei complementar pode autorizar os Estados a legislar sobre questões específicas dessas matérias (parágrafo único). Competência privativa não se converte em competência estadual plena pela simples ausência de lei federal.",
        "O art. 24 estabelece competência concorrente da União, Estados e Distrito Federal em matérias enumeradas. À União cabe editar normas gerais; os Estados e o DF suplementam essas normas. Na ausência de norma geral federal, os Estados exercem competência legislativa plena para atender a peculiaridades, e a superveniência de norma geral federal suspende a eficácia da lei estadual no que lhe for contrário (art. 24, §§ 1º a 4º). O Município não aparece no caput do art. 24, mas pode legislar sobre interesse local e suplementar legislação federal e estadual no que couber (art. 30, I e II).",
      ],
      table: { headers: ["Modelo", "Regra central", "Dispositivos"], rows: [
        ["Privativa da União", "Matéria enumerada; delegação específica aos Estados por LC", "Art. 22 e parágrafo único"],
        ["Concorrente", "União: normas gerais; Estado/DF: suplementação e, se faltar norma geral, competência plena nos limites constitucionais", "Art. 24, §§ 1º–4º"],
        ["Municipal", "Interesse local e suplementação no que couber", "Art. 30, I e II"],
        ["Residual estadual", "Competências não vedadas pela Constituição", "Art. 25, § 1º"],
      ] },
      example: { title: "Exemplo autoral: regra local suplementar", facts: "Município edita regra de organização de serviço de interesse predominantemente local, respeitando normas federais e estaduais aplicáveis.", analysis: "O ponto de partida é o art. 30, I e II: interesse local e suplementação no que couber. O rótulo ‘local’ não autoriza contrariar competência constitucional privativa da União nem ignorar normas gerais pertinentes." },
    },
    {
      id: "estados-municipios-df",
      title: "5. Estados, Municípios e Distrito Federal",
      paragraphs: [
        "Os Estados organizam-se e regem-se por suas Constituições e leis, observados os princípios da Constituição Federal (art. 25). A competência estadual remanescente do § 1º corresponde ao que não lhes seja vedado; não supera matérias expressamente atribuídas a outro ente. O art. 26 enumera bens estaduais, enquanto o art. 27 trata da composição das Assembleias Legislativas e do mandato dos Deputados Estaduais.",
        "Municípios regem-se por lei orgânica votada em dois turnos, com interstício mínimo de dez dias e aprovação por dois terços dos membros da Câmara Municipal, promulgada pela própria Câmara, observados os princípios constitucionais (art. 29). O art. 30 delimita atribuições municipais. O Distrito Federal rege-se por lei orgânica e reúne competências legislativas estaduais e municipais, ressalvadas as atribuições que a Constituição confia à União (arts. 32 e 147).",
      ],
      points: ["Estado: Constituição estadual, respeitados os princípios da Constituição Federal (art. 25).", "Município: lei orgânica com rito do art. 29; atribuições no art. 30.", "DF: lei orgânica e competências legislativas estaduais e municipais, sem divisão em Municípios (art. 32)."],
      example: { title: "Exemplo autoral: lei orgânica municipal", facts: "A Câmara aprova lei orgânica municipal em uma única votação.", analysis: "O procedimento do art. 29 exige dois turnos, interstício mínimo de dez dias e aprovação por dois terços dos membros, além de promulgação pela Câmara. A questão exige aplicar o procedimento constitucional, não o processo legislativo ordinário de lei municipal." },
    },
    {
      id: "intervencao-federativa",
      title: "6. Intervenção: medida excepcional e hipóteses taxativas",
      paragraphs: [
        "A intervenção restringe temporariamente a autonomia do ente atingido e só cabe nas hipóteses constitucionais. A União pode intervir nos Estados e no Distrito Federal nas situações do art. 34; Estado pode intervir em Município de seu território nas hipóteses do art. 35. Município localizado em Território Federal pode ser alcançado pela intervenção federal conforme art. 35, caput.",
        "Os arts. 36 e seguintes disciplinam iniciativa, decretação, execução, controle político e eventual nomeação de interventor. Algumas hipóteses dependem de solicitação, requisição ou provimento de representação pelo tribunal competente; portanto, não existe um rito único para toda intervenção. A prova costuma exigir reconhecer a hipótese e o órgão ou procedimento constitucional próprio.",
      ],
      table: { headers: ["Intervenção", "Quem intervém", "Base constitucional"], rows: [
        ["Federal", "União em Estado ou DF", "Art. 34; procedimento conforme art. 36"],
        ["Estadual", "Estado em Município do seu território", "Art. 35; procedimento conforme art. 36"],
        ["Excepcionalidade", "Preserva a autonomia como regra", "Somente hipóteses e formas previstas na Constituição"],
      ] },
      example: { title: "Exemplo autoral: hipótese não prevista", facts: "Autoridade propõe intervenção estadual em Município apenas porque discorda de uma política pública local, sem enquadramento nos incisos do art. 35.", analysis: "Discordância política, por si só, não autoriza intervenção. É necessário indicar uma hipótese constitucional e observar o procedimento aplicável." },
    },
    {
      id: "metodo-organizacao-estado",
      title: "7. Roteiro de prova e erros frequentes",
      paragraphs: ["Em questões de organização do Estado, identifique primeiro o ente envolvido e a natureza da atuação: legislar, executar serviço, administrar bem ou intervir. Em seguida, localize a regra constitucional específica e seus limites. Uma mesma área (saúde, ambiente, educação) pode envolver competências materiais e legislativas distintas."],
      points: ["Não confunda autonomia dos entes com soberania do Estado brasileiro.", "Não confunda competência comum administrativa (art. 23) com concorrente legislativa (art. 24).", "Na competência concorrente, separe normas gerais federais e suplementação estadual/DF.", "Municípios têm competência do art. 30; não são listados no caput do art. 24.", "Intervenção é excepcional: encontre a hipótese e o rito, não apenas o conflito político."],
      table: { headers: ["Se o enunciado pergunta…", "Comece por…"], rows: [["Quem executa uma política?", "Arts. 21, 23, 25 e 30: competência material."], ["Quem pode editar a lei?", "Arts. 22, 24, 25, § 1º, e 30: competência legislativa."], ["Como alterar limite ou criar ente?", "Art. 18 e seus parágrafos."], ["Pode haver intervenção?", "Hipóteses dos arts. 34 ou 35 e rito do art. 36."]] },
    },
  ],
  reviewQuestions: [
    q("1. Qual a diferença entre soberania e autonomia federativa?", "Soberania pertence à República Federativa do Brasil; os entes enumerados no art. 18 possuem autonomia nos limites constitucionais.", "A União não se confunde com a República soberana: ela é um ente federativo autônomo.", "CF, arts. 1º, caput, e 18."),
    q("2. Território Federal é ente autônomo?", "Não. Territórios integram a União.", "O art. 18, § 2º, prevê sua integração à União e disciplina criação, transformação e reintegração por lei complementar.", "CF, art. 18, § 2º."),
    q("3. Em que se distinguem competência comum e concorrente?", "Comum é administrativa/material; concorrente é legislativa.", "Os arts. 23 e 24 tratam de funções diferentes. A matéria pode exigir atuação administrativa compartilhada e disciplina legislativa distribuída, mas uma não substitui a outra.", "CF, arts. 21 a 24."),
    q("4. Na competência concorrente, o que ocorre se não houver norma geral federal?", "Os Estados exercem competência legislativa plena para atender a suas peculiaridades, nos termos constitucionais.", "A superveniência de norma geral federal suspende a eficácia da lei estadual no que lhe for contrário; não há revogação automática de todo o texto estadual.", "CF, art. 24, §§ 3º e 4º."),
    q("5. Município pode suplementar legislação federal e estadual?", "Sim, no que couber, além de legislar sobre assuntos de interesse local.", "A competência municipal está no art. 30; o Município não integra o rol do caput do art. 24.", "CF, art. 30, I e II."),
    q("6. Como se altera a organização territorial de Estado?", "Mediante aprovação da população diretamente interessada por plebiscito e aprovação do Congresso Nacional por lei complementar.", "O art. 18, § 3º, prevê os passos constitucionais; não basta lei estadual ou consulta sem a deliberação federal exigida.", "CF, art. 18, § 3º."),
    q("7. Intervenção pode ser decretada por simples divergência política?", "Não. Deve haver hipótese constitucional e respeito ao procedimento correspondente.", "Os arts. 34 e 35 enumeram situações; o art. 36 disciplina o procedimento, que varia conforme a hipótese.", "CF, arts. 34 a 36."),
    q("8. O Distrito Federal pode ser dividido em Municípios?", "Não.", "O art. 32 veda a divisão do Distrito Federal em Municípios; o DF acumula competências legislativas estaduais e municipais nos termos constitucionais.", "CF, art. 32, caput."),
  ],
  exercises: [
    mc("org-autonomia", "Um Estado anuncia que poderá sair da Federação após plebiscito local. Qual conclusão constitucional é adequada?", "B", "CF, arts. 1º, caput, e 18, § 3º.", ["A autonomia estadual inclui secessão mediante lei estadual.", "A Federação é indissolúvel; o art. 18, § 3º, permite alterações territoriais estaduais sob requisitos, não a secessão.", "A secessão depende apenas de aprovação do Senado.", "Municípios e Estados são soberanos e podem decidir sua saída."], ["Incorreta: autonomia não inclui romper o vínculo federativo.", "Correta: a união é indissolúvel e o § 3º disciplina alteração territorial dentro da Federação.", "Incorreta: o procedimento constitucional exige consulta plebiscitária e aprovação do Congresso por lei complementar.", "Incorreta: soberania é atributo da República Federativa do Brasil, não de cada ente." ]),
    mc("org-territorio", "Qual afirmação descreve corretamente Território Federal?", "C", "CF, art. 18, § 2º.", ["É ente federativo autônomo equivalente a Estado.", "Integra o Município que lhe faz divisa.", "Integra a União, e sua criação ou transformação é regulada por lei complementar.", "É criado por decreto estadual."], ["Incorreta: o texto constitucional não o inclui entre os entes autônomos do caput.", "Incorreta: o § 2º determina integração à União.", "Correta: o § 2º atribui à lei complementar a disciplina ali indicada.", "Incorreta: não é criado por decreto estadual." ]),
    mc("org-comum", "Uma questão pergunta quem tem dever administrativo de proteger o meio ambiente. Qual dispositivo é ponto de partida para competência comum?", "A", "CF, art. 23, VI e VII.", ["Art. 23, que prevê competência comum em matérias ambientais.", "Art. 24, que trata exclusivamente da execução administrativa compartilhada.", "Art. 22, que atribui toda atuação ambiental a um único ente.", "Art. 30, que exclui os demais entes de qualquer atuação."], ["Correta: os incisos VI e VII do art. 23 tratam de proteção ambiental e conservação de bens naturais.", "Incorreta: art. 24 versa sobre competência legislativa concorrente.", "Incorreta: art. 22 não contém a regra geral de execução ambiental exclusiva afirmada.", "Incorreta: competência municipal não exclui a atuação comum prevista no art. 23." ]),
    mc("org-concorrente", "Na ausência de norma geral federal sobre matéria do art. 24, como pode atuar o Estado?", "D", "CF, art. 24, §§ 2º a 4º.", ["Não pode legislar em hipótese alguma.", "Pode editar apenas decreto regulamentar de lei federal inexistente.", "Pode legislar sem limites constitucionais e impedir futura norma geral federal.", "Exerce competência legislativa plena para atender a peculiaridades, e norma geral federal superveniente suspende eficácia no que houver conflito."], ["Incorreta: o § 3º prevê competência plena na ausência de normas gerais federais.", "Incorreta: o texto trata de competência legislativa, não limita a atuação a decreto.", "Incorreta: a atuação permanece sujeita à Constituição e a superveniência federal produz o efeito do § 4º.", "Correta: resume os §§ 3º e 4º sem falar em revogação integral." ]),
    mc("org-municipal", "Qual fundamento permite ao Município legislar sobre assunto de interesse local e suplementar normas superiores no que couber?", "B", "CF, art. 30, I e II.", ["Art. 24, caput, que inclui os Municípios entre os entes da competência concorrente.", "Art. 30, I e II.", "Art. 22, parágrafo único, que delega automaticamente todas as competências da União aos Municípios.", "Art. 25, § 1º, que trata da competência remanescente municipal."], ["Incorreta: Municípios não aparecem no caput do art. 24.", "Correta: os incisos I e II do art. 30 contêm essas atribuições municipais.", "Incorreta: o parágrafo único do art. 22 prevê autorização por lei complementar aos Estados para questões específicas.", "Incorreta: o art. 25, § 1º, trata dos Estados." ]),
    mc("org-intervencao", "Um Estado pretende intervir em Município apenas por discordar de uma escolha política local. O que é necessário?", "A", "CF, arts. 35 e 36.", ["Enquadramento em hipótese constitucional de intervenção estadual e observância do procedimento correspondente.", "Apenas decisão política do Governador, sem hipótese constitucional.", "Autorização do Município atingido.", "A intervenção é automaticamente permitida quando há divergência entre partidos."], ["Correta: intervenção é excepcional e depende das hipóteses dos arts. 35 e 36.", "Incorreta: vontade política isolada não substitui os requisitos constitucionais.", "Incorreta: consentimento do ente não é requisito geral que substitua o enquadramento constitucional.", "Incorreta: divergência partidária não é hipótese autônoma de intervenção." ]),
  ],
};

export const powersOfRepublicLesson: StudyLesson = {
  sections: [
    {
      id: "poderes-art-2",
      title: "1. Separação, independência e harmonia",
      paragraphs: [
        "O art. 2º estabelece que Legislativo, Executivo e Judiciário são Poderes da União, independentes e harmônicos entre si. A separação distribui funções e competências; não cria compartimentos sem contato. A Constituição prevê mecanismos de controle recíproco para limitar exercício arbitrário do poder e manter cada órgão dentro de suas atribuições.",
        "Cada Poder exerce funções predominantes: legislar e fiscalizar, administrar e executar políticas, julgar conflitos. Também pode exercer funções atípicas quando a Constituição prevê, por exemplo, o Senado processando e julgando determinadas autoridades em crimes de responsabilidade (art. 52, I e II). A função atípica não transforma o Senado em Poder Judiciário.",
      ],
      table: { headers: ["Poder", "Função predominante", "Exemplo de função atípica prevista"], rows: [
        ["Legislativo", "Legislar e fiscalizar", "Senado julga autoridades em hipóteses do art. 52, I e II."],
        ["Executivo", "Administrar e executar políticas", "Presidente edita medida provisória nos limites do art. 62."],
        ["Judiciário", "Julgar conflitos", "Tribunais organizam seus serviços conforme competências constitucionais."],
      ] },
      example: { title: "Exemplo autoral: controle não é hierarquia", facts: "O Judiciário controla a legalidade de ato administrativo e determina que a Administração observe a lei.", analysis: "Controle judicial de legalidade decorre das garantias constitucionais e não cria hierarquia geral do Judiciário sobre o Executivo. A extensão do controle depende do pedido e dos limites constitucionais." },
    },
    {
      id: "legislativo-estrutura",
      title: "2. Poder Legislativo: Congresso e competências",
      paragraphs: [
        "No plano federal, o Poder Legislativo é exercido pelo Congresso Nacional, composto pela Câmara dos Deputados e pelo Senado Federal (art. 44). A Câmara representa o povo por sistema proporcional (art. 45); o Senado representa os Estados e o Distrito Federal, com três Senadores por unidade, eleitos pelo princípio majoritário (art. 46). Bicameralismo significa participação das duas Casas no processo legislativo federal, ressalvadas competências privativas de cada uma.",
        "O art. 48 enumera matérias sobre as quais o Congresso dispõe com sanção presidencial; o art. 49 lista competências exclusivas do Congresso, exercidas sem sanção. A Câmara e o Senado também têm competências privativas nos arts. 51 e 52. A distinção entre competência exclusiva do Congresso e competência privativa de uma Casa costuma ser decisiva para identificar iniciativa e procedimento.",
      ],
      points: ["Art. 49: competência exclusiva do Congresso, sem sanção presidencial.", "Arts. 51 e 52: competências privativas da Câmara e do Senado.", "Arts. 70 a 75: fiscalização contábil, financeira, orçamentária, operacional e patrimonial."],
      example: { title: "Exemplo autoral: competência exclusiva", facts: "Enunciado pergunta se determinada deliberação do art. 49 depende de sanção do Presidente.", analysis: "O art. 49 define competências exclusivas do Congresso, exercidas sem sanção. É preciso identificar se a matéria está nesse artigo ou se se trata de lei do art. 48, sujeita ao processo legislativo correspondente." },
    },
    {
      id: "processo-legislativo",
      title: "3. Processo legislativo e fiscalização",
      paragraphs: [
        "O art. 59 enumera espécies normativas: emendas à Constituição, leis complementares e ordinárias, leis delegadas, medidas provisórias, decretos legislativos e resoluções. Cada espécie tem iniciativa, quórum e procedimento próprios. Emenda constitucional segue o rito agravado do art. 60; lei complementar exige maioria absoluta (art. 69); lei ordinária, em regra, maioria dos votos com presença da maioria absoluta, observado o art. 47.",
        "O projeto de lei aprovado segue à sanção ou veto presidencial quando a Constituição prevê (art. 66). Veto pode ser jurídico ou político, total ou parcial, e é apreciado pelo Congresso. CPI tem poderes de investigação próprios das autoridades judiciais, além de outros previstos nos regimentos; deve apurar fato determinado e por prazo certo e suas conclusões podem ser encaminhadas ao Ministério Público (art. 58, § 3º). A fiscalização externa é exercida pelo Congresso com auxílio do Tribunal de Contas da União (arts. 70 e 71); auxílio não significa subordinação hierárquica do TCU.",
      ],
      table: { headers: ["Espécie/ato", "Regra de identificação", "Referência"], rows: [
        ["Emenda constitucional", "Rito qualificado e limites materiais/circunstanciais", "Art. 60"],
        ["Lei complementar", "Matéria reservada e aprovação por maioria absoluta", "Arts. 59, II, e 69"],
        ["Lei ordinária", "Matéria não reservada a espécie diversa; rito comum", "Arts. 47, 59, III, e 66"],
        ["Medida provisória", "Relevância e urgência, limites materiais e apreciação congressual", "Art. 62"],
      ] },
    },
    {
      id: "poder-executivo",
      title: "4. Poder Executivo: chefia e atribuições constitucionais",
      paragraphs: [
        "O Poder Executivo federal é exercido pelo Presidente da República, auxiliado pelos Ministros de Estado (art. 76). O Presidente acumula funções de Chefe de Estado e Chefe de Governo no arranjo brasileiro, mas a prova deve se apoiar na atribuição constitucional concreta, não apenas em rótulos doutrinários.",
        "O art. 84 lista atribuições presidenciais, como nomear e exonerar Ministros, exercer direção superior da Administração federal, iniciar processo legislativo nas hipóteses constitucionais, sancionar e promulgar leis, expedir decretos regulamentares dentro dos limites constitucionais e manter relações exteriores. O Presidente não pode usar decreto regulamentar para inovar livremente em matéria reservada à lei. A responsabilização presidencial distingue crimes comuns e crimes de responsabilidade e envolve competências e fases dos arts. 51, I, 52, I, e 86.",
      ],
      example: { title: "Exemplo autoral: decreto regulamentar", facts: "A Administração invoca decreto presidencial para criar obrigação primária sem base legal.", analysis: "O art. 84, IV, autoriza expedir decretos e regulamentos para fiel execução das leis. A questão é verificar se o ato regulamenta lei ou ultrapassa a função constitucional e legal do regulamento." },
    },
    {
      id: "poder-judiciario",
      title: "5. Poder Judiciário: organização, garantias e jurisdição",
      paragraphs: [
        "O art. 92 enumera órgãos do Poder Judiciário. O Supremo Tribunal Federal é o guardião da Constituição (art. 102); o Superior Tribunal de Justiça exerce competências constitucionais próprias, inclusive uniformização da interpretação da legislação federal em recurso especial nas hipóteses do art. 105. Os demais ramos e tribunais têm competências definidas pela Constituição, não por uma hierarquia indistinta entre todos os órgãos.",
        "As garantias da magistratura do art. 95 — vitaliciedade, inamovibilidade e irredutibilidade de subsídio, observadas as condições constitucionais — protegem a independência judicial. Há vedações correlatas no parágrafo único. A jurisdição e o acesso à Justiça devem ser lidos com as regras de competência, devido processo, juiz natural e recursos; autonomia não significa ausência de controles constitucionais.",
      ],
      points: ["STF: competências do art. 102; STJ: competências do art. 105.", "Garantias da magistratura protegem independência, não privilégios sem limites.", "Órgãos do Judiciário e suas competências estão enumerados e distribuídos na Constituição."],
      example: { title: "Exemplo autoral: STF e STJ", facts: "Uma parte invoca diretamente violação à Constituição e outra controvérsia envolve interpretação de lei federal infraconstitucional.", analysis: "A competência recursal depende dos requisitos e hipóteses constitucionais: recurso extraordinário no art. 102, III, e recurso especial no art. 105, III. A simples menção a uma lei ou à Constituição não basta sem os pressupostos de cabimento." },
    },
    {
      id: "freios-contrapesos",
      title: "6. Freios e contrapesos: controles com base constitucional",
      paragraphs: [
        "A Constituição atribui mecanismos de controle a mais de um Poder: veto e apreciação legislativa, fiscalização orçamentária, controle jurisdicional, julgamento de autoridades e controles parlamentares. Cada mecanismo tem objeto, órgão e procedimento definidos. Não se deve chamar toda interação de violação à separação de Poderes nem presumir que um Poder possa substituir livremente a decisão constitucionalmente atribuída a outro.",
        "O controle externo das contas é exercido pelo Congresso Nacional com auxílio do TCU (arts. 70 e 71). O Senado processa e julga autoridades específicas em crimes de responsabilidade, com a presidência do Presidente do STF nas hipóteses do art. 52, parágrafo único. Tribunais podem declarar inconstitucionalidade respeitando a reserva de plenário do art. 97 e o sistema de precedentes constitucionalmente previsto.",
      ],
      table: { headers: ["Mecanismo", "Quem atua", "Cuidado de prova"], rows: [
        ["Veto de projeto de lei", "Presidente veta; Congresso aprecia", "Veto não encerra necessariamente o processo (art. 66)."],
        ["Fiscalização externa", "Congresso com auxílio do TCU", "Auxílio técnico não equivale a subordinação hierárquica (arts. 70–71)."],
        ["Crime de responsabilidade presidencial", "Câmara autoriza; Senado processa e julga nos termos constitucionais", "Separar admissibilidade e julgamento (arts. 51, I; 52, I; 86)."],
      ] },
    },
    {
      id: "metodo-poderes",
      title: "7. Roteiro de prova e distinções frequentes",
      paragraphs: ["Para resolver questão sobre Poderes, localize o órgão e pergunte: qual função ou competência está sendo exercida? A Constituição atribui essa competência a quem? Há função atípica expressa? Qual controle e qual procedimento estão previstos? Essa sequência evita responder apenas pelo nome do órgão."],
      points: ["Independência e harmonia não significam isolamento nem hierarquia geral entre Poderes.", "Funções típicas e atípicas devem ter base constitucional.", "Competência exclusiva do Congresso (art. 49) não se confunde com matéria legislativa sujeita à sanção (art. 48).", "Câmara autoriza processo contra Presidente nos termos do art. 51, I; Senado julga nas hipóteses do art. 52, I.", "TCU auxilia o Congresso na fiscalização: não substitui o controle político-legislativo."],
      table: { headers: ["Pergunta", "Dispositivos iniciais"], rows: [["Quem exerce a função legislativa federal?", "Arts. 44–75."], ["Qual atribuição do Presidente está em discussão?", "Arts. 76–91, especialmente 84 e 86."], ["Qual tribunal tem competência?", "Arts. 92–126; STF no art. 102 e STJ no art. 105."], ["Que controle recíproco se aplica?", "Localize a competência constitucional específica e o procedimento." ]] },
    },
  ],
  reviewQuestions: [
    q("1. O que significa dizer que os Poderes são independentes e harmônicos?", "Exercem competências próprias, com mecanismos de interação e controle estabelecidos pela Constituição.", "A separação não cria isolamento; tampouco estabelece hierarquia geral de um Poder sobre os demais.", "CF, art. 2º."),
    q("2. Congresso Nacional é composto por quais Casas e como se distinguem?", "Câmara dos Deputados e Senado Federal; a primeira representa o povo e a segunda os Estados e o Distrito Federal.", "O bicameralismo organiza a deliberação federal; Câmara usa sistema proporcional e Senado, princípio majoritário.", "CF, arts. 44 a 46."),
    q("3. Competência do art. 49 depende de sanção presidencial?", "Não. O art. 49 prevê competências exclusivas do Congresso exercidas sem sanção.", "É necessário distinguir essas competências de leis do art. 48, que seguem processo legislativo com participação presidencial quando aplicável.", "CF, arts. 48 e 49."),
    q("4. CPI pode investigar qualquer assunto sem delimitação?", "Não. A Constituição exige fato determinado e prazo certo, além dos requisitos de criação.", "Os poderes de investigação não tornam uma CPI tribunal nem eliminam direitos e limites constitucionais.", "CF, art. 58, § 3º."),
    q("5. Decreto regulamentar pode criar livremente obrigações primárias?", "Não. A atribuição regulamentar presidencial serve à fiel execução das leis, dentro dos limites constitucionais.", "A questão exige comparar o conteúdo do decreto, a lei que regulamenta e a reserva legal aplicável.", "CF, art. 84, IV."),
    q("6. Qual a distinção inicial entre recurso extraordinário e especial?", "O extraordinário tem hipóteses constitucionais ligadas a matéria constitucional no STF; o especial trata das hipóteses constitucionais de legislação federal no STJ.", "Não basta nomear a norma. É necessário demonstrar os pressupostos específicos de admissibilidade de cada recurso.", "CF, arts. 102, III, e 105, III."),
    q("7. Como ocorre o controle externo das contas da União?", "O Congresso Nacional o exerce com auxílio do Tribunal de Contas da União.", "A palavra ‘auxílio’ não significa que o TCU seja subordinado hierarquicamente ao Congresso; as competências estão nos arts. 70 e 71.", "CF, arts. 70 e 71."),
    q("8. Câmara e Senado desempenham o mesmo papel no processo de responsabilização do Presidente?", "Não. A Constituição distingue autorização da Câmara e processamento/julgamento pelo Senado nas hipóteses previstas.", "Separar as fases evita atribuir a uma Casa competência constitucional da outra.", "CF, arts. 51, I, 52, I, e 86."),
  ],
  exercises: [
    mc("poder-art2", "Uma autoridade sustenta que a separação dos Poderes impede qualquer controle judicial de ato administrativo. Qual resposta é adequada?", "C", "CF, arts. 2º, 5º, XXXV, e competências constitucionais do Judiciário.", ["Está correta: os Poderes não podem interagir em nenhuma hipótese.", "Está correta: controle judicial sempre viola independência administrativa.", "Está incorreta: independência convive com controles constitucionais; é preciso respeitar competência e limites do caso.", "Está incorreta apenas porque o Judiciário é superior hierárquico ao Executivo."], ["Incorreta: a Constituição prevê mecanismos de interação e controle.", "Incorreta: o controle de legalidade não implica automaticamente substituição da Administração.", "Correta: separação não significa imunidade a controle, nem autoriza atuação ilimitada do Judiciário.", "Incorreta: não há hierarquia geral entre Poderes." ]),
    mc("poder-congresso", "Qual órgão exerce o Poder Legislativo federal e qual é sua composição?", "A", "CF, art. 44.", ["Congresso Nacional, composto pela Câmara dos Deputados e pelo Senado Federal.", "Câmara dos Deputados, composta por representantes dos Estados e Municípios.", "Senado Federal, composto por representantes proporcionais do povo.", "Presidência da República, com participação consultiva das Casas."], ["Correta: é a definição expressa do art. 44.", "Incorreta: a Câmara representa o povo por sistema proporcional; não substitui o Congresso.", "Incorreta: o Senado representa Estados e DF pelo princípio majoritário.", "Incorreta: o Executivo não exerce o Poder Legislativo federal." ]),
    mc("poder-art49", "Um ato está expressamente previsto como competência exclusiva do Congresso no art. 49. Qual consequência processual geral se aplica?", "D", "CF, arts. 48 e 49.", ["O Presidente deve sancionar o ato para produzir efeitos.", "A Câmara decide sozinha e envia o ato ao STF.", "A competência passa automaticamente ao Senado.", "O art. 49 prevê competência exclusiva do Congresso sem sanção presidencial."], ["Incorreta: o art. 49 é justamente distinto das matérias do art. 48 sujeitas à sanção.", "Incorreta: não é regra geral do art. 49.", "Incorreta: a competência é atribuída ao Congresso, não automaticamente ao Senado.", "Correta: identifica a regra geral do art. 49." ]),
    mc("poder-cpi", "Qual requisito está expressamente associado à CPI no texto constitucional?", "B", "CF, art. 58, § 3º.", ["Investigar sem fato delimitado e por tempo indefinido.", "Apurar fato determinado e por prazo certo, observados os requisitos de criação.", "Julgar criminalmente os investigados e aplicar pena.", "Substituir permanentemente a atuação do Ministério Público."], ["Incorreta: a Constituição exige fato determinado e prazo certo.", "Correta: reproduz os requisitos expressos no § 3º.", "Incorreta: CPI investiga; não exerce jurisdição penal.", "Incorreta: suas conclusões podem ser encaminhadas ao Ministério Público, que mantém suas atribuições." ]),
    mc("poder-tcu", "Qual afirmação descreve o papel constitucional do TCU na fiscalização externa?", "A", "CF, arts. 70 e 71.", ["O Congresso exerce o controle externo com auxílio do TCU, cujas competências são definidas constitucionalmente.", "O TCU é órgão do Poder Judiciário e profere sentenças judiciais.", "O Congresso não participa da fiscalização de contas.", "O TCU substitui integralmente o Congresso em toda decisão orçamentária."], ["Correta: corresponde ao modelo dos arts. 70 e 71.", "Incorreta: o TCU não integra o rol de órgãos judiciais do art. 92 nem exerce jurisdição judicial.", "Incorreta: o controle externo é atribuído ao Congresso.", "Incorreta: auxílio não significa substituição integral do Congresso." ]),
    mc("poder-decreto", "Presidente expede decreto para executar uma lei. Qual limite constitucional deve ser observado?", "C", "CF, art. 84, IV.", ["O decreto pode contrariar a lei se houver urgência política.", "O decreto pode criar qualquer obrigação sem base legal.", "O decreto regulamentar deve servir à fiel execução da lei, sem ultrapassar sua função constitucional.", "Decretos regulamentares são aprovados pelo STF antes da publicação."], ["Incorreta: ato regulamentar não pode contrariar a lei que executa.", "Incorreta: não é autorização geral para inovar em matéria reservada à lei.", "Correta: resume o art. 84, IV, e o limite regulamentar.", "Incorreta: a Constituição não prevê aprovação prévia geral pelo STF." ]),
  ],
  sources: [source("Constituição Federal — texto compilado oficial", cf), source("Senado Federal — Constituição Federal", senate)],
};

export const constitutionalReviewLesson: StudyLesson = {
  sections: [
    {
      id: "supremacia-parametro",
      title: "1. Supremacia constitucional e parâmetro de controle",
      paragraphs: [
        "Controle de constitucionalidade é a verificação de compatibilidade entre atos normativos e a Constituição, feita por órgãos competentes segundo procedimentos previstos. A Constituição ocupa posição superior no ordenamento; atos inferiores devem respeitar limites formais (competência, iniciativa e procedimento) e materiais (conteúdo compatível com as normas constitucionais).",
        "O parâmetro e o objeto variam conforme a modalidade. No controle federal, o STF exerce a guarda da Constituição (art. 102); nos Estados, o art. 125, § 2º, permite aos Tribunais de Justiça instituir representação de inconstitucionalidade de leis ou atos estaduais ou municipais em face da Constituição estadual, vedada a legitimação de um único órgão. Não trate toda controvérsia como ação direta perante o STF.",
      ],
      table: { headers: ["Problema", "Pergunta de controle"], rows: [["Formal", "O órgão tinha competência? A iniciativa e o procedimento foram observados?"], ["Material", "O conteúdo da norma é compatível com a Constituição?"], ["Parâmetro", "Qual Constituição e qual dispositivo servem de referência para esta via?" ]] },
      example: { title: "Exemplo autoral: vício formal", facts: "Lei estadual pretende disciplinar matéria que a Constituição atribui privativamente à União.", analysis: "A análise começa pela repartição legislativa, inclusive art. 22 e eventual autorização por lei complementar. O problema pode ser formal-orgânico, ainda que o conteúdo pareça razoável." },
    },
    {
      id: "difuso-concentrado",
      title: "2. Controle difuso e controle concentrado",
      paragraphs: [
        "No controle difuso, a questão constitucional surge em caso concreto submetido ao Judiciário e é relevante para resolver a demanda. A análise ocorre incidentalmente, observadas as competências recursais e a reserva de plenário quando aplicável. Em regra, a decisão resolve o caso entre as partes; efeitos mais amplos podem decorrer de mecanismos constitucionais próprios e não devem ser presumidos sem verificar a hipótese.",
        "No controle concentrado, ações específicas levam a discussão abstrata ao tribunal constitucionalmente competente, com objeto e legitimidade definidos. No plano federal, ADI, ADC, ADO e ADPF têm disciplina constitucional e legal própria. A existência de uma norma questionada não basta para escolher a via: observe o tipo de ato, o parâmetro, a omissão alegada, a subsidiariedade e a competência.",
      ],
      table: { headers: ["Critério", "Difuso/incidental", "Concentrado/abstrato"], rows: [["Contexto", "Caso concreto; questão constitucional influencia a solução", "Ação objetiva própria, nos termos constitucionais"], ["Órgão", "Juízes e tribunais dentro de suas competências", "Tribunal indicado pela Constituição e pela via"], ["Efeitos", "Não generalizar; conferir decisão e mecanismos constitucionais", "A Constituição e as leis preveem eficácia e vinculação para hipóteses específicas" ]] },
    },
    {
      id: "controle-preventivo-repressivo",
      title: "3. Momentos e formas de controle",
      paragraphs: [
        "O controle preventivo procura evitar que proposta incompatível se converta em norma; pode ocorrer no processo legislativo por órgãos competentes e em situações jurisdicionais delimitadas. O controle repressivo examina norma já editada. A classificação não autoriza concluir que todo agente político ou tribunal possa impedir qualquer proposição: competência, legitimidade e cabimento precisam ser conferidos.",
        "Também se distingue controle formal e material; controle concreto e abstrato; e controle incidental e principal. Essas classificações se cruzam, mas respondem a perguntas diferentes. Em prova, descreva primeiro o estágio do ato e a via, depois a espécie de vício alegado.",
      ],
      points: ["Preventivo: antes de a norma completar sua formação, nos limites de competência.", "Repressivo: depois da edição do ato normativo.", "Formal: competência ou procedimento; material: conteúdo incompatível com parâmetro constitucional."],
      example: { title: "Exemplo autoral: espécie normativa", facts: "Uma proposta legislativa é questionada por ter sido apresentada por autoridade sem iniciativa constitucional para aquele tema.", analysis: "O argumento aponta possível vício formal de iniciativa. A análise deve localizar a regra constitucional de iniciativa e o estágio do processo; não basta afirmar genericamente que a proposta é injusta." },
    },
    {
      id: "adi-adc-ado-adpf",
      title: "4. Ações do controle concentrado federal",
      paragraphs: [
        "A ação direta de inconstitucionalidade (ADI) questiona lei ou ato normativo federal ou estadual em face da Constituição Federal (art. 102, I, a). A ação declaratória de constitucionalidade (ADC) tem objeto e requisitos próprios, voltados a lei ou ato normativo federal. A legitimidade para ambas é a do art. 103, cuja lista não deve ser ampliada por analogia.",
        "A ação direta por omissão (ADO) busca enfrentar omissão inconstitucional que inviabiliza norma constitucional; o art. 103, § 2º, prevê ciência ao Poder competente e, tratando-se de órgão administrativo, prazo constitucional para providências. A ADPF (art. 102, § 1º) é disciplinada pela Lei 9.882/1999 e possui requisito de subsidiariedade: não será admitida quando houver outro meio eficaz de sanar a lesividade. A adequação depende do objeto e da lesão a preceito fundamental, conforme a Constituição e a lei.",
      ],
      table: { headers: ["Via", "Questão central", "Base"], rows: [["ADI", "Compatibilidade de lei/ato normativo federal ou estadual com CF", "Art. 102, I, a; Lei 9.868/1999"], ["ADC", "Declaração de constitucionalidade de lei/ato federal, nos requisitos legais", "Art. 102, I, a; Lei 9.868/1999"], ["ADO", "Omissão inconstitucional", "Art. 103, § 2º; Lei 9.868/1999"], ["ADPF", "Lesão ou ameaça a preceito fundamental, observada subsidiariedade", "Art. 102, § 1º; Lei 9.882/1999"]] },
    },
    {
      id: "reserva-plenario-efeitos",
      title: "5. Reserva de plenário, efeitos e vinculação",
      paragraphs: [
        "O art. 97 estabelece a cláusula de reserva de plenário: somente pelo voto da maioria absoluta dos membros do tribunal ou do respectivo órgão especial pode ser declarada a inconstitucionalidade de lei ou ato normativo do poder público. O dispositivo se dirige a tribunais e não significa que todo juiz singular precise remeter qualquer questão constitucional ao plenário.",
        "Decisões definitivas de mérito em ADI e ADC produzem eficácia contra todos e efeito vinculante nos termos do art. 102, § 2º. A Lei 9.868/1999 disciplina medidas cautelares e admite, em condições legais, modulação temporal por maioria qualificada e razões de segurança jurídica ou excepcional interesse social (art. 27). Não atribua os mesmos efeitos a toda decisão difusa sem identificar o mecanismo aplicável.",
      ],
      points: ["Art. 97: maioria absoluta do tribunal ou órgão especial para declaração de inconstitucionalidade.", "Art. 102, § 2º: eficácia contra todos e efeito vinculante nas decisões definitivas de mérito em ADI e ADC.", "Lei 9.868/1999, art. 27: modulação exige requisitos e quórum legal; não é automática."],
      example: { title: "Exemplo autoral: órgão fracionário", facts: "Câmara de tribunal pretende afastar lei por inconstitucionalidade sem observar o art. 97 nem hipótese de aplicação de entendimento já firmado.", analysis: "É necessário conferir a reserva de plenário e a disciplina constitucional aplicável. A questão não se resolve apenas pelo fato de o órgão ser composto por magistrados." },
    },
    {
      id: "omissao-subsidiariedade",
      title: "6. Omissão constitucional, ADPF e escolha da via",
      paragraphs: [
        "O controle da omissão pergunta se a Constituição impõe providência normativa ou administrativa e se a inércia impede concretizar seu comando. A ADO integra o controle objetivo. Mandado de injunção, por sua vez, é remédio constitucional voltado à inviabilidade do exercício de direitos e prerrogativas por falta de norma regulamentadora; não confunda o processo subjetivo/coletivo do MI com a ação objetiva de omissão.",
        "A ADPF protege preceitos fundamentais, conforme a Lei 9.882/1999, e tem subsidiariedade legal. Antes de escolher, identifique se o objeto é lei ou ato normativo, ato do poder público ou omissão; qual parâmetro se invoca; se há ação própria; e qual tribunal tem competência. A lei federal e a Constituição delimitam a via, não uma preferência intuitiva do autor.",
      ],
      table: { headers: ["Problema", "Instrumento a examinar", "Distinção-chave"], rows: [["Omissão em processo objetivo", "ADO", "Art. 103, § 2º; controle concentrado"], ["Falta de norma inviabiliza direito do titular", "Mandado de injunção", "Art. 5º, LXXI e Lei 13.300/2016"], ["Lesão a preceito fundamental sem outro meio eficaz", "ADPF", "Art. 102, § 1º e Lei 9.882/1999"]] },
    },
    {
      id: "metodo-controle",
      title: "7. Roteiro de prova e erros comuns",
      paragraphs: ["Em um problema de constitucionalidade, organize cinco dados: ato questionado, parâmetro, vício (formal/material ou omissão), via de controle e órgão competente. Só depois analise legitimidade, procedimento e efeitos. Essa sequência reduz confusões entre controle concreto, ação objetiva e remédio constitucional."],
      points: ["ADI não serve indistintamente para qualquer ato ou conflito.", "ADC tem objeto federal e pressupostos próprios; não é pedido abstrato genérico de parecer.", "ADO (ação objetiva) e mandado de injunção (remédio) não são sinônimos.", "Reserva de plenário dirige-se aos tribunais (art. 97).", "Efeitos contra todos e vinculantes têm base constitucional/legal específica; não generalize."],
      table: { headers: ["Se a questão relata…", "Pergunte primeiro…"], rows: [["Lei já editada e incompatibilidade constitucional", "Controle difuso no caso ou via objetiva adequada?"], ["Ausência de norma regulamentadora", "Omissão objetiva ou inviabilidade do direito de titular?"], ["Tribunal fracionário afastando norma", "Há questão de art. 97 e precedente aplicável?"], ["Pedido de efeitos gerais", "Qual via e dispositivo atribuem esse efeito?"]] },
    },
  ],
  reviewQuestions: [
    q("1. O que se compara no controle de constitucionalidade?", "A compatibilidade formal e material de ato normativo com parâmetro constitucional aplicável.", "É preciso identificar objeto, parâmetro e órgão competente; não basta dizer que uma lei parece injusta.", "CF, arts. 97, 102, 125, § 2º, e  constitucionalidade como sistema."),
    q("2. Qual a diferença inicial entre controle difuso e concentrado?", "No difuso, a questão aparece em caso concreto; no concentrado, ação objetiva específica é proposta perante o órgão competente.", "Efeitos e legitimidade dependem da via e do mecanismo constitucional; evite generalizar consequências.", "CF, arts. 97, 102 e 103."),
    q("3. Quais são os requisitos constitucionais da CPI e da ação abstrata?", "Não relacionados: CPI exige fato determinado e prazo certo; ações objetivas seguem competências e legitimados constitucionais próprios.", "A pergunta serve para distinguir investigação parlamentar de controle judicial; a CPI não é modalidade de controle de constitucionalidade.", "CF, art. 58, § 3º; para ações do controle concentrado, art. 103."),
    q("4. Qual é a finalidade da ADO?", "Enfrentar omissão inconstitucional que impede tornar efetiva norma constitucional, conforme a via objetiva e o art. 103, § 2º.", "Não se confunde com mandado de injunção, que protege exercício inviabilizado de direitos nas condições do art. 5º, LXXI.", "CF, art. 103, § 2º; Lei 9.868/1999; art. 5º, LXXI."),
    q("5. Para que serve a reserva de plenário?", "Exigir maioria absoluta do tribunal ou órgão especial para declarar inconstitucionalidade de lei ou ato normativo do poder público.", "A regra do art. 97 não exige que todo juiz singular remeta a questão ao plenário.", "CF, art. 97."),
    q("6. Qual é o papel da subsidiariedade na ADPF?", "A ADPF não será admitida quando houver outro meio eficaz de sanar a lesividade, segundo a Lei 9.882/1999.", "A adequação também exige examinar preceito fundamental, objeto e competência; subsidiariedade não é o único requisito.", "CF, art. 102, § 1º; Lei 9.882/1999, art. 4º, § 1º."),
    q("7. Decisão de mérito em ADI e ADC pode vincular órgãos públicos?", "Sim, a Constituição prevê eficácia contra todos e efeito vinculante para decisões definitivas de mérito nessas ações.", "Não se deve transferir automaticamente esse regime a qualquer decisão incidental.", "CF, art. 102, § 2º."),
    q("8. Em qual hipótese a lei prevê modulação temporal em ação direta?", "Em condições excepcionais previstas em lei, por razões de segurança jurídica ou excepcional interesse social, com quórum de dois terços.", "A modulação não é consequência automática de toda declaração de inconstitucionalidade.", "Lei 9.868/1999, art. 27."),
  ],
  exercises: [
    mc("controle-concreto", "Em uma demanda individual, a validade constitucional de uma lei é questão necessária à solução do pedido. Qual modalidade deve ser inicialmente identificada?", "A", "CF, arts. 97, 102 e regras de competência aplicáveis.", ["Controle difuso/incidental no caso concreto.", "ADC obrigatória proposta por qualquer parte.", "ADPF automaticamente, sem verificar subsidiariedade.", "Controle preventivo, embora a lei já esteja em vigor."], ["Correta: a questão constitucional surge como incidente necessário à solução do caso.", "Incorreta: ADC é ação objetiva com legitimados e pressupostos constitucionais específicos.", "Incorreta: ADPF exige adequação e subsidiariedade legal.", "Incorreta: a norma já foi editada; o relato descreve controle repressivo." ]),
    mc("controle-ado-mi", "A falta de norma regulamentadora torna inviável o exercício de direito constitucional por seu titular. Qual instrumento individual/coletivo deve ser examinado?", "C", "CF, art. 5º, LXXI; Lei 13.300/2016, arts. 2º e seguintes.", ["ADI, porque toda omissão é discutida apenas em ação direta.", "Habeas data, por existir omissão normativa.", "Mandado de injunção, conforme os pressupostos constitucionais e legais.", "Ação popular, sem relação com lesão a patrimônio público ou valores constitucionais do inciso."], ["Incorreta: a ADO é via objetiva; a pergunta descreve inviabilidade de exercício de direito por titular.", "Incorreta: habeas data tem objeto de acesso/retificação/anotação de dados pessoais.", "Correta: o art. 5º, LXXI, e a Lei 13.300 disciplinam o MI.", "Incorreta: ação popular possui finalidade e legitimidade próprias." ]),
    mc("controle-reserva", "Uma turma de tribunal pretende declarar inconstitucionalidade de lei sem observar deliberação exigida pelo art. 97. Qual regra é central?", "D", "CF, art. 97.", ["A reserva de plenário só se aplica ao Congresso.", "O art. 97 exige unanimidade dos ministros do STF em todos os casos.", "Qualquer servidor pode declarar a lei inválida para todos.", "Tribunal só pode declarar inconstitucionalidade pelo voto da maioria absoluta de seus membros ou do órgão especial."], ["Incorreta: a regra dirige-se aos tribunais.", "Incorreta: o texto não exige unanimidade nem se limita ao STF.", "Incorreta: servidor não recebe essa competência judicial do art. 97.", "Correta: corresponde ao quórum e órgãos previstos no dispositivo." ]),
    mc("controle-adi-competencia", "Qual órgão julga, em regra, ADI de lei federal em face da Constituição Federal?", "B", "CF, art. 102, I, a.", ["Tribunal de Justiça de qualquer Estado.", "Supremo Tribunal Federal, na competência constitucional do art. 102.", "Congresso Nacional em procedimento de CPI.", "Tribunal de Contas da União."], ["Incorreta: TJ pode ter representação em face da Constituição estadual conforme art. 125, § 2º, não é regra para ADI federal contra CF.", "Correta: o art. 102, I, a, atribui ao STF processar e julgar ADI nos termos ali previstos.", "Incorreta: CPI investiga, não julga ADI.", "Incorreta: TCU exerce controle externo de contas, não jurisdição constitucional abstrata." ]),
    mc("controle-adpf", "Há alegação de lesão a preceito fundamental e outro meio eficaz pode sanar a lesividade. Qual requisito legal deve ser analisado para ADPF?", "A", "Lei 9.882/1999, art. 4º, § 1º; CF, art. 102, § 1º.", ["Subsidiariedade: ADPF não será admitida se houver outro meio eficaz de sanar a lesão.", "A ADPF sempre prevalece sobre qualquer outra ação.", "A ADPF exige autorização prévia do Congresso.", "A ADPF só pode ser proposta pelo cidadão individualmente."], ["Correta: é a regra expressa de subsidiariedade da lei.", "Incorreta: a lei prevê subsidiariedade, não preferência automática.", "Incorreta: esse requisito não aparece na lei.", "Incorreta: legitimidade segue o rol legal/constitucional pertinente, não apenas cidadão individual." ]),
    mc("controle-efeitos", "Qual efeito a Constituição atribui às decisões definitivas de mérito em ADI e ADC?", "C", "CF, art. 102, § 2º.", ["Efeito apenas consultivo, sem eficácia judicial.", "Efeito vinculante apenas para o Congresso e somente no caso concreto.", "Eficácia contra todos e efeito vinculante perante os órgãos indicados no art. 102, § 2º.", "Revogação automática de toda norma semelhante em qualquer ordenamento estrangeiro."], ["Incorreta: a Constituição define eficácia judicial própria.", "Incorreta: o texto abrange órgãos do Judiciário e Administração direta e indireta nas esferas indicadas.", "Correta: resume o art. 102, § 2º.", "Incorreta: a eficácia é delimitada pelo ordenamento brasileiro, não se estende a ordenamentos estrangeiros." ]),
  ],
  sources: [source("Constituição Federal — texto compilado oficial", cf), source("Lei 9.868/1999 — ADI e ADC", "https://www.planalto.gov.br/ccivil_03/leis/l9868.htm"), source("Lei 9.882/1999 — ADPF", "https://www.planalto.gov.br/ccivil_03/leis/l9882.htm"), source("STF — Constituição e legislação infraconstitucional", "https://portal.stf.jus.br/constituicao-supremo/")],
};

export const constitutionalRemediesLesson: StudyLesson = {
  sections: [
    {
      id: "mapa-remedios",
      title: "1. Como escolher um remédio constitucional",
      paragraphs: [
        "Remédios constitucionais são garantias processuais voltadas a situações definidas na Constituição. A escolha não depende apenas de identificar que houve injustiça: observe qual direito está ameaçado, quem é titular, qual ato ou omissão ocorreu, quem o praticou, qual prova está disponível e qual pedido se pretende formular.",
        "Os instrumentos têm objetos que não se substituem livremente: habeas corpus protege locomoção; mandado de segurança protege direito líquido e certo não amparado por HC ou HD; mandado de injunção enfrenta inviabilidade por falta de norma regulamentadora; habeas data trata de dados pessoais em registros; ação popular permite ao cidadão impugnar atos lesivos aos bens e valores constitucionais. Cada via também tem legitimidade, procedimento e requisitos próprios.",
      ],
      table: { headers: ["Problema principal", "Via constitucional a examinar", "Dispositivo"], rows: [
        ["Violência ou coação ilegal contra locomoção", "Habeas corpus", "Art. 5º, LXVIII"],
        ["Direito líquido e certo contra ilegalidade/abuso, fora HC/HD", "Mandado de segurança", "Art. 5º, LXIX e LXX"],
        ["Falta de norma que inviabiliza direito constitucional", "Mandado de injunção", "Art. 5º, LXXI"],
        ["Conhecer/retificar dado pessoal em registro público", "Habeas data", "Art. 5º, LXXII"],
        ["Cidadão busca anular ato lesivo a bens enumerados", "Ação popular", "Art. 5º, LXXIII"],
      ] },
    },
    {
      id: "habeas-corpus",
      title: "2. Habeas corpus: liberdade de locomoção",
      paragraphs: [
        "O habeas corpus é concedido sempre que alguém sofrer ou se achar ameaçado de sofrer violência ou coação em sua liberdade de locomoção por ilegalidade ou abuso de poder (art. 5º, LXVIII). A Constituição prevê impetração por qualquer pessoa em favor próprio ou alheio, bem como pelo Ministério Público, sem necessidade de capacidade postulatória de advogado para a impetração, nos termos do art. 654 do CPP.",
        "Pode ser preventivo quando há ameaça concreta, com possibilidade de salvo-conduto, ou repressivo/liberatório quando a coação já se efetivou. O foco é liberdade de ir, vir e permanecer; discussão patrimonial ou simples desacordo administrativo, sem repercussão direta na locomoção, não se converte automaticamente em HC. O art. 5º, LXXVII, declara gratuitas as ações de habeas corpus e habeas data.",
      ],
      example: { title: "Exemplo autoral: ameaça à locomoção", facts: "Uma pessoa recebe ordem de prisão cuja legalidade é questionada e existe risco concreto de cumprimento.", analysis: "O enunciado apresenta ameaça à liberdade de locomoção, matéria do art. 5º, LXVIII. A adequação depende da ilegalidade ou abuso alegado e dos elementos do caso; não se deve presumir o resultado do pedido." },
    },
    {
      id: "mandado-seguranca",
      title: "3. Mandado de segurança: direito líquido e certo",
      paragraphs: [
        "O art. 5º, LXIX, prevê mandado de segurança para proteger direito líquido e certo, não amparado por habeas corpus ou habeas data, diante de ilegalidade ou abuso de poder praticado por autoridade pública ou agente no exercício de atribuições públicas. ‘Líquido e certo’ diz respeito à possibilidade de demonstrar os fatos essenciais por prova pré-constituída, sem dilação probatória incompatível com o rito.",
        "A Lei 12.016/2009 disciplina a ação individual e coletiva. O prazo para impetração é de 120 dias contados da ciência, pelo interessado, do ato impugnado (art. 23), ressalvadas as análises jurídicas próprias sobre a natureza da situação. O inciso LXX prevê MS coletivo por partido político com representação no Congresso e por organização sindical, entidade de classe ou associação que preencha requisitos constitucionais. Não exige autorização especial dos associados para a substituição processual prevista no texto.",
      ],
      table: { headers: ["Pergunta", "Mandado de segurança"], rows: [["Qual direito?", "Líquido e certo; excluídos objetos próprios de HC e HD."], ["Qual prova?", "Fatos essenciais demonstráveis documentalmente, em regra sem instrução probatória extensa."], ["Contra quem?", "Autoridade ou agente que exerça atribuição pública, nos termos da Constituição e da Lei 12.016."], ["Prazo legal?", "120 dias da ciência do ato impugnado (Lei 12.016, art. 23)."]] },
    },
    {
      id: "mandado-injuncao",
      title: "4. Mandado de injunção: omissão que inviabiliza direito",
      paragraphs: [
        "O mandado de injunção é cabível quando a falta total ou parcial de norma regulamentadora torna inviável o exercício dos direitos e liberdades constitucionais e das prerrogativas inerentes à nacionalidade, soberania e cidadania (art. 5º, LXXI; Lei 13.300/2016, art. 2º). Não basta apontar que uma lei seria conveniente: é necessário relacionar o dever de regulamentar, a omissão e a inviabilidade concreta do exercício protegido.",
        "A Lei 13.300 disciplina as modalidades individual e coletiva, define legitimados e prevê efeitos da decisão. Em regra, reconhecida a mora, o órgão competente é comunicado para editar a norma; se persistir a omissão e as condições legais estiverem presentes, a decisão pode estabelecer condições para exercício do direito. O tratamento depende dos arts. 8º e seguintes e não deve ser reduzido à criação judicial geral de uma lei para todos os casos.",
      ],
      points: ["Omissão total ou parcial de norma regulamentadora.", "A falta deve tornar inviável exercício de direito ou prerrogativa constitucional descrita.", "Lei 13.300/2016 disciplina MI individual e coletivo e os efeitos da decisão."],
      example: { title: "Exemplo autoral: norma ausente e direito inviabilizado", facts: "A Constituição assegura uma prerrogativa cujo exercício depende de regulamentação, mas a omissão impede seu exercício pelo titular.", analysis: "A situação orienta análise de mandado de injunção, desde que se demonstrem o dever de regulamentar e a inviabilidade. ADO também pode tratar omissão em controle objetivo, mas sua natureza e legitimidade são distintas." },
    },
    {
      id: "habeas-data",
      title: "5. Habeas data: informação pessoal em registro",
      paragraphs: [
        "O art. 5º, LXXII, prevê habeas data para assegurar conhecimento de informações relativas à pessoa do impetrante constantes de registros ou bancos de dados de entidades governamentais ou de caráter público; também permite retificação, quando não se prefira fazê-la por processo sigiloso judicial ou administrativo. A Lei 9.507/1997 inclui ainda a anotação de contestação ou explicação sobre dado verdadeiro, mas justificável e pendente.",
        "A finalidade é pessoal e delimitada pelo inciso. Pedido genérico de informação pública sobre atividade estatal é analisado à luz de outros instrumentos constitucionais e legais, como o art. 5º, XXXIII e a Lei de Acesso à Informação, não automaticamente como habeas data. A lei disciplina pedido prévio ao depositário e hipóteses de cabimento; examine sua redação antes de concluir sobre interesse processual.",
      ],
      table: { headers: ["Pretensão", "Instrumento a comparar", "Base"], rows: [["Conhecer dado sobre o próprio impetrante em registro governamental/público", "Habeas data", "CF, art. 5º, LXXII, a"], ["Retificar dado pessoal", "Habeas data ou processo sigiloso indicado pelo texto constitucional", "CF, art. 5º, LXXII, b; Lei 9.507/1997"], ["Acessar informação geral sobre atuação pública", "Direito de informação e legislação de acesso", "CF, art. 5º, XXXIII; Lei 12.527/2011"]] },
    },
    {
      id: "acao-popular",
      title: "6. Ação popular: cidadania e tutela de bens coletivos",
      paragraphs: [
        "O art. 5º, LXXIII, legitima qualquer cidadão a propor ação popular para anular ato lesivo ao patrimônio público ou de entidade de que o Estado participe, à moralidade administrativa, ao meio ambiente e ao patrimônio histórico e cultural. A Lei 4.717/1965 disciplina o procedimento. Cidadão, nessa via, é titular de direitos políticos, não qualquer pessoa física ou jurídica indistintamente.",
        "A Constituição isenta o autor de custas judiciais e do ônus da sucumbência, salvo comprovada má-fé. A ação popular não é substituto geral da ação civil pública nem instrumento para discutir qualquer ilegalidade sem vínculo com os bens tutelados. O Ministério Público acompanha a ação e exerce atribuições previstas na lei, sem assumir a defesa do ato impugnado.",
      ],
      example: { title: "Exemplo autoral: ato lesivo ao patrimônio público", facts: "Eleitor pretende impugnar contratação pública que, segundo os fatos documentados, causou prejuízo ao patrimônio público.", analysis: "A situação pode se enquadrar na finalidade da ação popular, desde que presentes cidadania, ato impugnável, lesividade e os requisitos da Lei 4.717/1965. A mera discordância política não substitui os pressupostos legais." },
    },
    {
      id: "escolha-remedio",
      title: "7. Comparação final e erros frequentes",
      paragraphs: ["A forma mais segura de escolher a via é começar pelo objeto do pedido e pelo tipo de direito. Depois confira legitimidade, autoridade/ente, prova, prazo e procedimento. Não escolha o remédio apenas pela palavra ‘ilegal’ no enunciado."],
      table: { headers: ["Instrumento", "Protege/atende", "Não confundir com"], rows: [["HC", "Locomoção contra violência/coação ilegal ou abusiva", "Qualquer controvérsia sem impacto na liberdade de ir e vir"], ["MS", "Direito líquido e certo fora do campo de HC/HD", "Ação que depende de ampla produção de prova"], ["MI", "Exercício inviabilizado por falta de norma regulamentadora", "ADO, ação objetiva de controle da omissão"], ["HD", "Conhecimento/retificação/anotação de dado pessoal em registro", "Pedido geral de informação pública"], ["Ação popular", "Anular ato lesivo a bens e valores constitucionais por cidadão", "Ação universal contra qualquer ilegalidade sem lesividade pertinente"]] },
      points: ["HC: liberdade de locomoção.", "MS: direito líquido e certo, prova adequada e prazo legal.", "MI: omissão normativa que inviabiliza direito constitucional.", "HD: dado relativo ao próprio impetrante em banco governamental ou de caráter público.", "Ação popular: cidadão e lesividade a bens enumerados no texto."],
    },
  ],
  reviewQuestions: [
    q("1. Qual direito é protegido pelo habeas corpus?", "A liberdade de locomoção contra violência ou coação ilegal ou abusiva.", "O vínculo com ir, vir ou permanecer é central; outros direitos podem ter instrumento diverso.", "CF, art. 5º, LXVIII; CPP, arts. 647 e seguintes."),
    q("2. O que significa direito líquido e certo para o mandado de segurança?", "Direito cujos fatos essenciais podem ser demonstrados de plano por prova pré-constituída, sem dilação probatória incompatível com o rito.", "A expressão não significa que a tese jurídica seja simples; refere-se à demonstração dos fatos necessários na via mandamental.", "CF, art. 5º, LXIX; Lei 12.016/2009, art. 1º."),
    q("3. Qual é o prazo legal de impetração do mandado de segurança?", "120 dias contados da ciência, pelo interessado, do ato impugnado, conforme a lei.", "A contagem e a natureza do ato exigem análise do caso; não confundir com prazo de outros remédios.", "Lei 12.016/2009, art. 23."),
    q("4. Quando cabe mandado de injunção?", "Quando falta norma regulamentadora e essa falta torna inviável o exercício de direito, liberdade ou prerrogativa constitucional especificada.", "A ausência precisa produzir inviabilidade nos termos da Constituição e da Lei 13.300; mera conveniência normativa não basta.", "CF, art. 5º, LXXI; Lei 13.300/2016, art. 2º."),
    q("5. Habeas data protege qualquer pedido de informação pública?", "Não. Seu objeto constitucional envolve informação relativa à pessoa do impetrante em registro governamental ou de caráter público e as demais hipóteses do inciso.", "Pedido geral de informação pública tem disciplina própria, inclusive art. 5º, XXXIII e Lei 12.527/2011.", "CF, art. 5º, XXXIII e LXXII; Lei 9.507/1997."),
    q("6. Quem pode propor ação popular?", "Qualquer cidadão, nos termos do art. 5º, LXXIII.", "A legitimidade não é atribuída indistintamente a qualquer pessoa jurídica; a Lei 4.717 detalha a comprovação e o procedimento.", "CF, art. 5º, LXXIII; Lei 4.717/1965, art. 1º."),
    q("7. A gratuidade da ação popular afasta sempre custas e sucumbência?", "O texto isenta o autor de custas e sucumbência, salvo comprovada má-fé.", "A exceção constitucional impede tratar a isenção como absoluta em toda situação.", "CF, art. 5º, LXXIII."),
    q("8. Qual é a diferença básica entre MI e ADO?", "MI protege a viabilidade do exercício de direitos de titular diante da omissão normativa; ADO é ação objetiva do controle concentrado para enfrentar omissão inconstitucional.", "As vias diferem em natureza, legitimidade, processo e efeitos, ainda que ambas possam envolver omissão normativa.", "CF, arts. 5º, LXXI, e 103, § 2º; Lei 13.300/2016; Lei 9.868/1999."),
  ],
  exercises: [
    mc("remedio-hc", "Uma pessoa sofre ameaça ilegal e concreta de prisão que restringiria sua liberdade de locomoção. Qual remédio deve ser examinado?", "B", "CF, art. 5º, LXVIII.", ["Habeas data.", "Habeas corpus.", "Ação popular.", "Mandado de injunção."], ["Incorreta: habeas data trata de dados pessoais em registros.", "Correta: o art. 5º, LXVIII, protege a liberdade de locomoção contra violência ou coação ilegal/abusiva.", "Incorreta: ação popular tutela bens e valores específicos por cidadão.", "Incorreta: MI trata de omissão normativa que inviabiliza direito constitucional." ]),
    mc("remedio-ms", "Uma autoridade pratica ato ilegal que viola direito demonstrável documentalmente, sem questão de locomoção ou dado pessoal. Qual via pode ser adequada, observados os requisitos?", "A", "CF, art. 5º, LXIX; Lei 12.016/2009, arts. 1º e 23.", ["Mandado de segurança.", "Habeas corpus.", "Habeas data.", "Ação direta de inconstitucionalidade proposta pelo interessado individual."], ["Correta: o MS protege direito líquido e certo não amparado por HC ou HD, presentes os requisitos legais.", "Incorreta: não há relato de lesão ou ameaça à locomoção.", "Incorreta: não se trata de conhecer ou retificar dado pessoal em cadastro público.", "Incorreta: ADI tem legitimados do art. 103 e objeto de controle abstrato." ]),
    mc("remedio-mi", "A ausência de norma regulamentadora torna inviável o exercício de prerrogativa constitucional de titular identificado. Qual instrumento deve ser examinado?", "D", "CF, art. 5º, LXXI; Lei 13.300/2016, art. 2º.", ["Ação popular, por qualquer omissão estatal.", "Habeas corpus, porque toda omissão ameaça liberdade.", "Habeas data, porque a norma ainda não existe.", "Mandado de injunção, verificados os pressupostos constitucionais e legais."], ["Incorreta: ação popular tem finalidade específica e legitimidade cidadã.", "Incorreta: o enunciado não trata necessariamente de locomoção.", "Incorreta: ausência de norma não é, por si, questão de dado pessoal.", "Correta: MI enfrenta falta de norma que inviabilize direito ou prerrogativa constitucional." ]),
    mc("remedio-hd", "Uma pessoa busca conhecer informação pessoal sobre si em banco de dados governamental. Qual garantia é prevista especificamente?", "C", "CF, art. 5º, LXXII; Lei 9.507/1997, art. 7º.", ["Ação popular.", "Mandado de injunção.", "Habeas data.", "Habeas corpus."], ["Incorreta: ação popular trata de ato lesivo a bens e valores constitucionalmente enumerados.", "Incorreta: MI trata de omissão normativa que inviabiliza direito.", "Correta: habeas data protege conhecimento e retificação de dados pessoais nas hipóteses constitucionais.", "Incorreta: habeas corpus protege locomoção." ]),
    mc("remedio-popular", "Eleitor pretende impugnar ato lesivo ao patrimônio público e à moralidade administrativa. Qual instrumento constitucional pode ser proposto por cidadão?", "B", "CF, art. 5º, LXXIII; Lei 4.717/1965.", ["Mandado de injunção.", "Ação popular, presentes cidadania, lesividade e demais requisitos legais.", "Habeas corpus.", "Habeas data."], ["Incorreta: MI relaciona-se à falta de norma regulamentadora.", "Correta: a Constituição autoriza cidadão a buscar anulação de ato lesivo aos bens e valores enumerados.", "Incorreta: HC tutela locomoção.", "Incorreta: HD tutela dados pessoais em registros." ]),
    mc("remedio-ms-coletivo", "Qual alternativa corresponde à legitimidade prevista constitucionalmente para mandado de segurança coletivo?", "A", "CF, art. 5º, LXX, a e b; Lei 12.016/2009, art. 21.", ["Partido político com representação no Congresso, ou organização sindical, entidade de classe ou associação que atenda aos requisitos constitucionais.", "Qualquer empresa, sem relação com grupo ou direito defendido.", "Apenas o Ministério Público, em toda hipótese.", "Somente associação criada para um processo e sem requisito temporal legal."], ["Correta: reproduz as categorias e requisitos constitucionais essenciais, com exame da pertinência e demais condições legais.", "Incorreta: empresa não aparece nessa lista constitucional de legitimados coletivos.", "Incorreta: o art. 5º, LXX, não restringe legitimidade ao MP.", "Incorreta: associação deve observar requisitos constitucionais e legais, inclusive o requisito temporal aplicável." ]),
  ],
  sources: [source("Constituição Federal — texto compilado oficial", cf), source("Lei 12.016/2009 — Mandado de Segurança", "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2009/lei/l12016.htm"), source("Lei 13.300/2016 — Mandado de Injunção", "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/lei/l13300.htm"), source("Lei 9.507/1997 — Habeas Data", "https://www.planalto.gov.br/ccivil_03/leis/l9507.htm"), source("Lei 4.717/1965 — Ação Popular", "https://www.planalto.gov.br/ccivil_03/leis/l4717.htm"), source("Lei 12.527/2011 — Acesso à Informação", "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12527.htm")],
};
