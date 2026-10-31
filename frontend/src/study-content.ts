import { constitutionalRemediesLesson, constitutionalReviewLesson, organizationOfStateLesson, powersOfRepublicLesson } from "./constitutional-lessons";

export type StudyModule = {
  id: string;
  discipline: string;
  title: string;
  objectives: string[];
  theory: string[];
  concepts: string[];
  example: string;
  summary: string[];
  review: string[];
  sources: { label: string; url: string }[];
  lesson?: StudyLesson;
};

export type StudyLesson = {
  summary?: string[];
  sections: {
    id: string;
    title: string;
    paragraphs: string[];
    points?: string[];
    table?: { headers: string[]; rows: string[][] };
    example?: { title: string; facts: string; analysis: string };
  }[];
  reviewQuestions: { question: string; answer: string; explanation: string; basis: string }[];
  exercises: { id: string; prompt: string; options: { label: string; text: string; explanation: string }[]; correctLabel: string; basis: string }[];
  sources?: { label: string; url: string }[];
};

const constitution = [{ label: "Constituição Federal — texto compilado", url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm" }];
const civilCode = [{ label: "Código Civil — Lei 10.406/2002", url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm" }];
const penalCode = [{ label: "Código Penal — Decreto-Lei 2.848/1940", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm" }];
const adminLaw = [{ label: "Constituição Federal — texto compilado", url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm" }, { label: "Lei 9.784/1999 — processo administrativo federal", url: "https://www.planalto.gov.br/ccivil_03/leis/l9784.htm" }];
const laborLaw = [{ label: "CLT — texto compilado", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm" }, { label: "Constituição Federal — texto compilado", url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm" }];
const procurement = { label: "Lei 14.133/2021 — Licitações e Contratos Administrativos", url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm" };

const fundamentalRightsLesson: StudyLesson = {
  sections: [
    {
      id: "mapa-titulo-ii",
      title: "1. Onde ficam os direitos fundamentais na Constituição",
      paragraphs: [
        "O Título II da Constituição Federal reúne os direitos e garantias fundamentais nos arts. 5º a 17. O art. 5º concentra direitos e deveres individuais e coletivos; os demais capítulos tratam de direitos sociais, nacionalidade, direitos políticos e partidos políticos.",
        "Para resolver um caso, comece localizando a matéria: uma liberdade individual pode estar no art. 5º; um direito social, nos arts. 6º a 11; nacionalidade, nos arts. 12 e 13; participação política, nos arts. 14 a 16; partidos, no art. 17. O enunciado pode envolver mais de um dispositivo.",
      ],
      table: {
        headers: ["Parte do Título II", "Dispositivos", "Pergunta inicial de estudo"],
        rows: [
          ["Direitos e deveres individuais e coletivos", "Art. 5º", "Qual direito foi afetado e qual garantia pode protegê-lo?"],
          ["Direitos sociais", "Arts. 6º a 11", "Qual prestação ou proteção social está em discussão?"],
          ["Nacionalidade", "Arts. 12 e 13", "Qual é o vínculo jurídico da pessoa com o Estado brasileiro?"],
          ["Direitos políticos", "Arts. 14 a 16", "Como se exerce a participação política e quais são seus limites?"],
          ["Partidos políticos", "Art. 17", "Quais são as garantias e os limites constitucionais dos partidos?"],
        ],
      },
    },
    {
      id: "direito-garantia",
      title: "2. Direito, garantia e aplicação",
      paragraphs: [
        "Direito é a posição ou liberdade protegida pela Constituição. Garantia é o mecanismo constitucional que protege ou torna exigível essa posição. A distinção ajuda a identificar o que a pessoa pretende obter e qual instrumento pode responder ao problema.",
        "Exemplo simples: o acesso a informação pessoal mantida em banco de dados público é um direito; o habeas data, previsto no art. 5º, LXXII, é um instrumento constitucional para conhecer ou retificar esses dados nas hipóteses do inciso.",
        "O art. 5º, § 1º, determina a aplicação imediata das normas definidoras de direitos e garantias fundamentais. Isso orienta a interpretação e a atuação dos poderes públicos, mas não significa que todo direito tenha sempre conteúdo completo ou dispense as condições e leis que a própria Constituição menciona. Leia o dispositivo concreto.",
        "O § 2º esclarece que o catálogo expresso não exclui outros direitos decorrentes do regime, dos princípios constitucionais ou de tratados de que o Brasil seja parte. Já o § 3º prevê uma forma específica de aprovação para tratados e convenções de direitos humanos: dois turnos em cada Casa do Congresso e três quintos dos votos dos respectivos membros, com equivalência às emendas constitucionais.",
      ],
      table: {
        headers: ["Pergunta", "Direito", "Garantia"],
        rows: [
          ["O que é?", "O bem, liberdade ou posição protegida.", "O mecanismo que previne ou corrige a lesão."],
          ["Exemplo constitucional", "Conhecer informação pessoal em registro público.", "Habeas data, art. 5º, LXXII, nas hipóteses constitucionais."],
          ["Como usar na prova?", "Identifique o conteúdo pretendido.", "Verifique se há instrumento específico e seus requisitos."],
        ],
      },
    },
    {
      id: "igualdade-legalidade-liberdades",
      title: "3. Igualdade, legalidade e liberdades",
      paragraphs: [
        "O caput do art. 5º enuncia a igualdade perante a lei e protege vida, liberdade, igualdade, segurança e propriedade. O inciso I explicita a igualdade de direitos e obrigações entre homens e mulheres, nos termos da Constituição. Em um caso, compare as situações e a justificativa jurídica do tratamento; não conclua apenas porque pessoas receberam resultados diferentes.",
        "O inciso II consagra a legalidade: uma obrigação de fazer ou deixar de fazer depende de lei. Na prova, diferencie a exigência dirigida ao particular da atuação estatal: a autoridade também está vinculada às competências e aos limites que o ordenamento lhe atribui.",
        "Os incisos IV e V protegem a manifestação do pensamento, vedam o anonimato e asseguram resposta proporcional ao agravo, além de indenização por danos material, moral ou à imagem. Os incisos VI a VIII tratam da consciência, crença, culto e objeção de consciência, com a condição expressa no inciso VIII sobre obrigação legal geral e prestação alternativa fixada em lei.",
        "O inciso IX protege a expressão intelectual, artística, científica e de comunicação independentemente de censura ou licença. O inciso X protege intimidade, vida privada, honra e imagem e prevê reparação por dano decorrente de violação. A leitura conjunta ajuda a perceber que liberdade de expressão e proteção da pessoa estão ambas no texto constitucional.",
      ],
      points: [
        "Art. 5º, I: igualdade de direitos e obrigações entre homens e mulheres.",
        "Art. 5º, II: obrigação ou proibição deve ter fundamento legal.",
        "Art. 5º, IV e V: manifestação sem anonimato; resposta proporcional e reparação quando cabíveis.",
        "Art. 5º, VI a VIII: liberdade de consciência e crença; atenção à prestação alternativa prevista no inciso VIII.",
        "Art. 5º, IX e X: expressão e proteção à intimidade, vida privada, honra e imagem devem ser analisadas nos fatos concretos.",
      ],
      example: {
        title: "Exemplo autoral: manifestação e identificação",
        facts: "Uma pessoa publica crítica a um serviço público, identificando-se. A publicação reproduz também dado íntimo de terceiro sem relação com a crítica.",
        analysis: "A análise deve separar a liberdade de manifestação do inciso IV e a proteção à intimidade e à imagem do inciso X. O enunciado não permite presumir automaticamente abuso ou imunidade: identifique o conteúdo, o dano alegado e a regra aplicável. O exemplo é didático, não é questão oficial nem substitui análise jurídica do caso real.",
      },
    },
    {
      id: "privacidade-locomocao-associacao",
      title: "4. Casa, comunicações, circulação, reunião e associação",
      paragraphs: [
        "O inciso XI protege a casa e enumera exceções expressas à entrada sem consentimento: flagrante delito ou desastre, prestação de socorro e, durante o dia, determinação judicial. Memorize a estrutura e observe que a autorização judicial aparece acompanhada do recorte temporal previsto no texto.",
        "O inciso XII protege o sigilo da correspondência e das comunicações nele descritas; sua parte final trata da comunicação telefônica, que pode ser afastada por ordem judicial nas hipóteses e na forma legal para investigação criminal ou instrução processual penal. Não transforme a redação específica em regra genérica sem examinar o meio de comunicação e a norma aplicável.",
        "O inciso XV assegura a locomoção no território nacional em tempo de paz, nos termos da lei. O inciso XVI protege reunião pacífica, sem armas, em local aberto ao público, sem autorização, desde que não frustre reunião anteriormente convocada para o mesmo local; exige prévio aviso à autoridade competente.",
        "Os incisos XVII a XXI protegem associação para fins lícitos e estabelecem limites e garantias próprios. A criação de associações independe de autorização, é vedada a interferência estatal no funcionamento; ninguém é obrigado a associar-se ou permanecer associado. A suspensão de atividades e a dissolução compulsória dependem de decisão judicial, sendo exigido trânsito em julgado para a dissolução (inciso XIX).",
      ],
      table: {
        headers: ["Instituto", "Regra constitucional", "Atenção ao requisito"],
        rows: [
          ["Entrada em casa", "Art. 5º, XI", "Consentimento é a regra; confira cada exceção textual e o recorte diurno da ordem judicial."],
          ["Reunião", "Art. 5º, XVI", "Pacífica, sem armas, local aberto, sem frustrar reunião anterior e com prévio aviso; não exige autorização."],
          ["Associação", "Art. 5º, XVII a XXI", "Finalidade lícita; não se exige autorização para criar; associação e permanência são voluntárias."],
          ["Dissolução", "Art. 5º, XIX", "A dissolução compulsória exige decisão judicial transitada em julgado."],
        ],
      },
      example: {
        title: "Exemplo autoral: reunião em praça",
        facts: "Um grupo pretende realizar manifestação pacífica em praça pública, sem armas. Outra reunião já foi convocada para o mesmo local e horário.",
        analysis: "A liberdade de reunião não depende de autorização, mas o inciso XVI também exige que a reunião não frustre outra anteriormente convocada para o mesmo local e que haja prévio aviso. A questão é aplicar os requisitos juntos, sem reduzir o aviso a pedido de permissão.",
      },
    },
    {
      id: "propriedade-acesso-justica",
      title: "5. Propriedade, acesso à Justiça e devido processo",
      paragraphs: [
        "Os incisos XXII a XXV reconhecem o direito de propriedade e determinam que ela atenda à função social. A Constituição também disciplina desapropriação e requisição em hipóteses específicas. Em questão prática, identifique qual medida estatal ocorreu e confira o fundamento, a hipótese e as consequências constitucionais aplicáveis.",
        "O inciso XXXV dispõe que a lei não excluirá da apreciação do Poder Judiciário lesão ou ameaça a direito. Não é necessário que o dano já tenha se consumado para que exista a garantia de acesso à Justiça; o próprio texto menciona ameaça.",
        "Os incisos LIII a LV estabelecem garantias processuais: autoridade competente; devido processo legal antes da privação de liberdade ou bens; contraditório e ampla defesa em processos judiciais e administrativos e para acusados em geral. O inciso LVI veda provas obtidas por meios ilícitos. Separe cada garantia: competência, procedimento, possibilidade de reação e licitude da prova são perguntas distintas.",
        "Os incisos XXXIII e XXXIV asseguram, entre outros pontos, acesso a informações de interesse particular, coletivo ou geral (com a ressalva constitucional de sigilo imprescindível à segurança da sociedade e do Estado) e o direito de petição e de obtenção de certidões nas condições constitucionais. O inciso LXXIX reconhece a proteção de dados pessoais, inclusive nos meios digitais.",
      ],
      points: [
        "Art. 5º, XXII e XXIII: propriedade e função social aparecem lado a lado.",
        "Art. 5º, XXXV: a proteção judicial alcança lesão e ameaça a direito.",
        "Art. 5º, LIII a LVI: competência, devido processo, contraditório/ampla defesa e prova ilícita são garantias diferentes.",
        "Art. 5º, XXXIII, XXXIV e LXXIX: informação, petição/certidões e proteção de dados têm textos e requisitos próprios.",
      ],
    },
    {
      id: "remedios-constitucionais",
      title: "6. Remédios constitucionais: escolha pela finalidade",
      paragraphs: [
        "Os remédios constitucionais são garantias processuais com objetos próprios. Para identificar a via em uma questão, pergunte: há ameaça à locomoção? Direito líquido e certo não protegido por habeas corpus ou habeas data? O exercício de direito constitucional está inviabilizado por falta de norma? A pessoa quer conhecer ou retificar dado pessoal em registro público? Um cidadão pretende impugnar ato lesivo aos bens indicados na Constituição?",
        "A tabela resume a finalidade constitucional; legitimidade, procedimento, prazo e demais requisitos devem ser conferidos na Constituição e na legislação própria. A tabela não substitui o estudo processual completo.",
      ],
      table: {
        headers: ["Instrumento", "Previsão", "Finalidade constitucional resumida"],
        rows: [
          ["Habeas corpus", "Art. 5º, LXVIII", "Proteger a liberdade de locomoção contra violência ou coação ilegal ou abusiva, atual ou ameaçada."],
          ["Mandado de segurança", "Art. 5º, LXIX e LXX", "Proteger direito líquido e certo não amparado por HC ou HD diante de ilegalidade ou abuso de poder público; há modalidade coletiva."],
          ["Mandado de injunção", "Art. 5º, LXXI", "Enfrentar falta de norma regulamentadora que inviabilize o exercício dos direitos e prerrogativas descritos no inciso."],
          ["Habeas data", "Art. 5º, LXXII", "Conhecer informação relativa ao impetrante em registro governamental ou público e, na hipótese constitucional, retificá-la."],
          ["Ação popular", "Art. 5º, LXXIII", "Permitir que cidadão busque anular ato lesivo aos bens e valores enumerados no inciso."],
        ],
      },
      example: {
        title: "Exemplo autoral: informação pessoal em cadastro público",
        facts: "Uma pessoa afirma que um cadastro de caráter público mantém informação sobre ela e pretende conhecê-la ou retificá-la.",
        analysis: "O art. 5º, LXXII, menciona habeas data para assegurar o conhecimento de informações relativas à pessoa do impetrante em registros ou bancos de dados governamentais ou de caráter público e para retificação, nos termos do inciso. O enunciado deve ser conferido quanto ao objeto e aos requisitos legais. Não confundir esse objetivo com pedido genérico de informação pública do inciso XXXIII.",
      },
    },
    {
      id: "pontos-atencao-oab",
      title: "7. Como organizar a resposta em uma questão da OAB",
      paragraphs: [
        "Não há aqui estatísticas de incidência. O roteiro abaixo é uma técnica de leitura do enunciado: localizar o direito, identificar o ato e o agente, conferir os requisitos do inciso, distinguir eventual garantia processual e só então formular a consequência jurídica.",
      ],
      points: [
        "Localize o dispositivo: caput, inciso ou parágrafo — não responda apenas com o nome amplo do direito.",
        "Leia requisitos e exceções no mesmo inciso. Reunião (XVI), ingresso em casa (XI) e objeção de consciência (VIII) têm condições expressas.",
        "Separe o direito material da garantia processual: acesso à Justiça (XXXV) não é sinônimo de um remédio constitucional específico.",
        "Em remédios constitucionais, escolha pela finalidade e confira legitimidade e requisitos legais; não trate as ações como intercambiáveis.",
        "Use o texto constitucional vigente. A aula é um roteiro inicial, não certifica cobertura integral do edital nem substitui conferência legislativa.",
      ],
      table: {
        headers: ["Se o enunciado destacar…", "Comece conferindo…"],
        rows: [
          ["Obrigação imposta pelo Estado", "Legalidade, art. 5º, II, e competência da autoridade."],
          ["Manifestação e anonimato", "Art. 5º, IV e V; examine também direitos da personalidade, art. 5º, X."],
          ["Entrada em residência", "Exceções taxativas descritas no art. 5º, XI e requisitos temporais."],
          ["Manifestação coletiva em praça", "Requisitos cumulativos do art. 5º, XVI; aviso não é autorização."],
          ["Sanção ou processo administrativo", "Devido processo, contraditório e ampla defesa, art. 5º, LIV e LV."],
          ["Ameaça a direito", "Garantia de acesso à Justiça, art. 5º, XXXV, e eventual instrumento adequado."],
        ],
      },
    },
  ],
  reviewQuestions: [
    {
      question: "1. Como distinguir direito fundamental de garantia?",
      answer: "Direito é a posição ou liberdade protegida; garantia é o mecanismo constitucional que a protege ou permite sua tutela.",
      explanation: "A distinção é funcional e ajuda a escolher a norma e a providência. Nem toda garantia é um remédio processual: devido processo legal também é garantia constitucional.",
      basis: "CF, art. 5º, caput e incisos LIV, LXVIII a LXXIII.",
    },
    {
      question: "2. A reunião pacífica em local aberto ao público depende de autorização?",
      answer: "Não. O art. 5º, XVI dispensa autorização, mas exige reunião pacífica e sem armas, ausência de frustração de reunião anterior no mesmo local e prévio aviso à autoridade competente.",
      explanation: "Atenção à diferença entre aviso e autorização e à presença conjunta dos demais requisitos expressos.",
      basis: "CF, art. 5º, XVI.",
    },
    {
      question: "3. O que deve ser verificado na hipótese de entrada em casa sem consentimento?",
      answer: "Se ocorre flagrante delito ou desastre, prestação de socorro, ou determinação judicial durante o dia, conforme a redação do inciso.",
      explanation: "O inciso XI protege a casa e enumera as exceções. A resposta deve se ater à hipótese narrada e aos requisitos temporais do texto.",
      basis: "CF, art. 5º, XI.",
    },
    {
      question: "4. O inciso XXXV protege somente contra lesão já consumada?",
      answer: "Não. O texto menciona lesão ou ameaça a direito.",
      explanation: "Essa formulação impede reduzir a garantia de acesso ao Judiciário a situações em que o dano já se concretizou.",
      basis: "CF, art. 5º, XXXV.",
    },
    {
      question: "5. Qual garantia processual exige contraditório e ampla defesa em processo administrativo?",
      answer: "O art. 5º, LV assegura contraditório e ampla defesa aos litigantes em processo judicial ou administrativo e aos acusados em geral.",
      explanation: "Não confundir com devido processo legal, previsto no inciso LIV: são garantias relacionadas, mas enunciadas separadamente.",
      basis: "CF, art. 5º, LIV e LV.",
    },
    {
      question: "6. Qual instrumento constitucional trata de conhecer ou retificar informação pessoal em registro governamental ou de caráter público?",
      answer: "Habeas data, conforme o art. 5º, LXXII.",
      explanation: "Observe o vínculo dos dados com a pessoa impetrante e o tipo de registro descrito pelo inciso. O acesso genérico à informação tem previsão distinta no inciso XXXIII.",
      basis: "CF, art. 5º, XXXIII e LXXII.",
    },
    {
      question: "7. Qual remédio protege a liberdade de locomoção contra violência ou coação ilegal ou abusiva?",
      answer: "Habeas corpus.",
      explanation: "O inciso LXVIII abrange quem sofre ou está ameaçado de sofrer violência ou coação em sua liberdade de locomoção por ilegalidade ou abuso de poder.",
      basis: "CF, art. 5º, LXVIII.",
    },
    {
      question: "8. A aplicação imediata do art. 5º, § 1º, torna desnecessária qualquer análise de regulamentação?",
      answer: "Não. O § 1º determina aplicação imediata das normas definidoras de direitos e garantias, mas o dispositivo concreto pode mencionar condições legais ou depender de regulamentação para aspectos de exercício.",
      explanation: "Leia a norma específica e não converta a regra geral do parágrafo em afirmação de que toda norma constitucional tem conteúdo autoexecutável idêntico.",
      basis: "CF, art. 5º, § 1º e dispositivos que contêm remissão legal, como incisos VI, VIII e XII.",
    },
  ],
  exercises: [
    {
      id: "reuniao-aviso",
      prompt: "Um grupo pretende realizar reunião pacífica, sem armas, em praça aberta ao público. Não há reunião anteriormente convocada para o mesmo local. Qual afirmação corresponde ao art. 5º, XVI?",
      options: [
        { label: "A", text: "A reunião depende de autorização prévia da autoridade competente.", explanation: "Incorreta. O inciso XVI dispensa autorização; exige prévio aviso, que não se confunde com pedido de permissão." },
        { label: "B", text: "A reunião independe de autorização, observados os requisitos constitucionais, inclusive prévio aviso à autoridade competente.", explanation: "Correta. O texto assegura reunião pacífica, sem armas, em local aberto ao público, sem frustrar reunião anterior no mesmo local e com prévio aviso." },
        { label: "C", text: "A reunião pode ocorrer sem aviso, pois o caráter pacífico é o único requisito expresso.", explanation: "Incorreta. O inciso também exige prévio aviso e ausência de frustração de reunião anteriormente convocada para o mesmo local." },
        { label: "D", text: "A reunião somente é protegida se organizada por associação formalmente registrada.", explanation: "Incorreta. O inciso XVI não condiciona a reunião à organização por associação registrada." },
      ],
      correctLabel: "B",
      basis: "Constituição Federal, art. 5º, XVI.",
    },
    {
      id: "entrada-domicilio",
      prompt: "Durante a tarde, um agente público pretende entrar em residência contra a vontade do morador, sem situação de flagrante, desastre ou necessidade de socorro. Qual hipótese constitucional pode autorizar a entrada?",
      options: [
        { label: "A", text: "A simples conveniência da investigação administrativa.", explanation: "Incorreta. Conveniência administrativa não aparece entre as exceções constitucionais à inviolabilidade da casa." },
        { label: "B", text: "Determinação judicial, pois a entrada ocorre durante o dia.", explanation: "Correta. O inciso XI permite entrada durante o dia por determinação judicial, além das exceções de flagrante delito, desastre ou prestação de socorro." },
        { label: "C", text: "Ordem verbal de qualquer superior hierárquico, em qualquer horário.", explanation: "Incorreta. A Constituição prevê determinação judicial diurna, não uma autorização hierárquica genérica." },
        { label: "D", text: "A apresentação de identificação funcional, independentemente de outra hipótese.", explanation: "Incorreta. Identificação funcional, por si só, não constitui exceção à proteção constitucional da casa." },
      ],
      correctLabel: "B",
      basis: "Constituição Federal, art. 5º, XI.",
    },
    {
      id: "habeas-data",
      prompt: "Uma pessoa quer conhecer informação relativa a ela própria que consta de banco de dados governamental. Qual instrumento tem previsão constitucional específica para essa finalidade?",
      options: [
        { label: "A", text: "Habeas corpus, por se tratar de informação mantida pelo Estado.", explanation: "Incorreta. Habeas corpus tutela a liberdade de locomoção contra violência ou coação ilegal ou abusiva." },
        { label: "B", text: "Mandado de injunção, ainda que não exista omissão normativa que inviabilize direito.", explanation: "Incorreta. Mandado de injunção trata da falta de norma regulamentadora que inviabilize o exercício de direitos e prerrogativas descritos na Constituição." },
        { label: "C", text: "Habeas data, observados o objeto e os requisitos legais aplicáveis.", explanation: "Correta. O inciso LXXII prevê habeas data para assegurar conhecimento de informações relativas à pessoa do impetrante em registros governamentais ou de caráter público, entre outras hipóteses do inciso." },
        { label: "D", text: "Ação popular, que serve para acessar qualquer registro público individual.", explanation: "Incorreta. A ação popular tem objeto constitucional próprio: impugnar ato lesivo aos bens e valores indicados no inciso LXXIII." },
      ],
      correctLabel: "C",
      basis: "Constituição Federal, art. 5º, LXXII; distinguir do direito de acesso à informação do inciso XXXIII.",
    },
    {
      id: "ameaca-direito",
      prompt: "Uma pessoa enfrenta ameaça concreta a um direito, embora a lesão ainda não tenha ocorrido. O princípio da inafastabilidade da jurisdição alcança essa situação?",
      options: [
        { label: "A", text: "Não; a apreciação judicial só é possível após dano consumado.", explanation: "Incorreta. O texto constitucional menciona expressamente lesão ou ameaça a direito." },
        { label: "B", text: "Sim; a Constituição se refere a lesão ou ameaça a direito, sem dispensar a análise dos requisitos processuais pertinentes.", explanation: "Correta. O inciso XXXV inclui ameaça a direito e preserva a necessidade de verificar os requisitos da medida processual adequada." },
        { label: "C", text: "Sim, mas apenas quando a ameaça vier de particular, nunca do poder público.", explanation: "Incorreta. O inciso não faz essa limitação quanto à origem da lesão ou ameaça." },
        { label: "D", text: "Não; o inciso XXXV trata exclusivamente de conflitos já julgados por outro órgão.", explanation: "Incorreta. O dispositivo assegura apreciação pelo Poder Judiciário e não se limita à revisão de decisão anterior." },
      ],
      correctLabel: "B",
      basis: "Constituição Federal, art. 5º, XXXV.",
    },
    {
      id: "processo-administrativo",
      prompt: "Em processo administrativo que pode afetar a situação jurídica de uma pessoa, qual garantia constitucional assegura oportunidade de participação e defesa nos termos da lei?",
      options: [
        { label: "A", text: "Contraditório e ampla defesa, com os meios e recursos a ela inerentes.", explanation: "Correta. O inciso LV assegura contraditório e ampla defesa aos litigantes em processo judicial ou administrativo e aos acusados em geral." },
        { label: "B", text: "Apenas a publicidade do processo, pois a defesa só existe em juízo.", explanation: "Incorreta. O inciso LV inclui expressamente processos administrativos." },
        { label: "C", text: "A vedação de prova ilícita, que substitui a oportunidade de resposta da pessoa interessada.", explanation: "Incorreta. A vedação de prova ilícita está no inciso LVI e não substitui contraditório e ampla defesa." },
        { label: "D", text: "A garantia de que toda decisão administrativa será favorável ao interessado.", explanation: "Incorreta. A garantia assegura participação e defesa, não resultado favorável automático." },
      ],
      correctLabel: "A",
      basis: "Constituição Federal, art. 5º, LV; relacionado ao devido processo legal do inciso LIV.",
    },
    {
      id: "expressao-resposta",
      prompt: "Uma pessoa manifesta publicamente uma opinião e é identificável. A Constituição também prevê resposta proporcional e indenização quando cabíveis. Qual alternativa articula corretamente esses pontos?",
      options: [
        { label: "A", text: "A manifestação do pensamento é livre, inclusive de forma anônima, e exclui qualquer responsabilização.", explanation: "Incorreta. O inciso IV veda o anonimato, e o inciso V prevê direito de resposta proporcional ao agravo, além de indenização quando cabível." },
        { label: "B", text: "A manifestação do pensamento é livre, vedado o anonimato; o direito de resposta e a indenização são garantidos nos termos constitucionais.", explanation: "Correta. A alternativa reúne a regra do inciso IV e as garantias do inciso V, sem presumir automaticamente o resultado de um caso concreto." },
        { label: "C", text: "A Constituição exige licença prévia para toda manifestação pública de opinião.", explanation: "Incorreta. O inciso IX protege a expressão intelectual, artística, científica e de comunicação independentemente de censura ou licença." },
        { label: "D", text: "O direito de resposta afasta sempre a possibilidade de indenização.", explanation: "Incorreta. O inciso V prevê direito de resposta proporcional ao agravo e indenização por danos material, moral ou à imagem, conforme o caso." },
      ],
      correctLabel: "B",
      basis: "Constituição Federal, art. 5º, IV, V e IX.",
    },
  ],
};

export const studyModules: StudyModule[] = [
  { id: "constitucional-direitos", discipline: "Direito Constitucional", title: "Direitos e garantias fundamentais", objectives: ["Distinguir direitos individuais, coletivos e sociais.", "Reconhecer a função das garantias constitucionais."], theory: ["A Constituição protege posições jurídicas essenciais e também organiza meios para torná-las efetivas. Direitos fundamentais aparecem em diferentes partes do texto constitucional e devem ser interpretados em conjunto com os fatos e com os limites previstos na própria Constituição.", "Em uma questão, identifique primeiro quem é titular do direito, qual conduta estatal ou privada está em debate e qual garantia pode proteger a situação. A existência de um direito não resolve sozinha conflitos entre direitos: é preciso justificar a leitura constitucional adequada ao caso."], concepts: ["Direito: posição protegida; garantia: instrumento de proteção.", "Direitos fundamentais não são absolutos em toda situação.", "A Constituição prevê direitos individuais, coletivos e sociais."], example: "Uma pessoa impedida de acessar informação pública pode ter um direito material em discussão e, conforme os requisitos legais, buscar um instrumento próprio para protegê-lo.", summary: ["Localize o direito invocado e a garantia pertinente.", "Leia o texto constitucional junto às circunstâncias do caso."], review: ["Qual é a diferença entre direito e garantia?", "Por que a análise não termina ao encontrar um direito constitucional?"], sources: constitution, lesson: fundamentalRightsLesson },
  { id: "constitucional-estado", discipline: "Direito Constitucional", title: "Organização do Estado", objectives: ["Identificar entes federativos e competências.", "Diferenciar autonomia política de soberania."], theory: ["A Constituição estrutura a Federação e distribui competências entre União, Estados, Distrito Federal e Municípios. A autonomia dos entes se manifesta nos limites constitucionais; soberania pertence à República Federativa do Brasil no plano internacional.", "Para resolver situações práticas, identifique o assunto e procure a regra constitucional de competência correspondente. A distribuição pode envolver competências materiais, legislativas, comuns ou concorrentes, cada qual com lógica própria."], concepts: ["Federação e repartição constitucional de competências.", "Autonomia dos entes não equivale a soberania.", "Competência deve ser identificada pela matéria e pelo tipo de atuação."], example: "Uma lei municipal sobre interesse local exige verificar a competência municipal e também se existe norma geral federal ou estadual aplicável.", summary: ["Identifique o ente e a matéria antes de concluir quem pode agir.", "Consulte os dispositivos constitucionais de competência."], review: ["Quais são os entes federativos?", "Como autonomia difere de soberania?"], sources: constitution, lesson: organizationOfStateLesson },
  { id: "constitucional-poderes", discipline: "Direito Constitucional", title: "Poderes da República", objectives: ["Compreender separação e harmonia entre os Poderes.", "Reconhecer controles recíprocos previstos na Constituição."], theory: ["Legislativo, Executivo e Judiciário exercem funções predominantes distintas, sem isolamento absoluto. A Constituição distribui competências e prevê controles recíprocos para limitar concentrações de poder e manter a atuação institucional dentro de suas atribuições.", "Em questões, não basta associar um órgão a uma função típica. Verifique a competência expressa, o procedimento e a possibilidade de controle, inclusive quando um Poder exerce função atípica autorizada."], concepts: ["Separação funcional e independência com harmonia.", "Funções típicas e atípicas.", "Controles recíprocos dependem de previsão constitucional."], example: "A edição de um ato pelo Executivo pode estar sujeita a controle judicial de legalidade, sem que o Judiciário substitua livremente a decisão administrativa legítima.", summary: ["Use a competência constitucional concreta, não apenas o nome do Poder.", "Diferencie controle de substituição do mérito permitido."], review: ["O que são funções atípicas?", "Qual o limite do controle judicial sobre um ato de outro Poder?"], sources: constitution, lesson: powersOfRepublicLesson },
  { id: "constitucional-controle", discipline: "Direito Constitucional", title: "Controle de constitucionalidade", objectives: ["Identificar a ideia de supremacia constitucional.", "Distinguir, em nível introdutório, controle difuso e concentrado."], theory: ["O controle de constitucionalidade verifica a compatibilidade de normas e atos com a Constituição, segundo procedimentos e competências próprios. No controle difuso, a questão constitucional surge em um caso concreto; no concentrado, ações específicas podem levar a análise principal ao tribunal competente.", "A resposta depende do objeto questionado, da via processual, do órgão julgador e dos efeitos juridicamente previstos. Este módulo introduz a estrutura e não substitui o estudo das ações e dos precedentes aplicáveis."], concepts: ["Supremacia da Constituição.", "Controle concreto/difuso e abstrato/concentrado.", "Competência, legitimidade e efeitos devem ser analisados separadamente."], example: "Em uma demanda individual, a parte pode suscitar incompatibilidade constitucional relevante à solução do caso; isso não transforma automaticamente a ação em controle abstrato.", summary: ["Pergunte qual norma é questionada, por quem e em qual procedimento.", "Não generalize efeitos sem verificar a via de controle."], review: ["Qual a diferença básica entre controle difuso e concentrado?", "Quais dados processuais precisam ser identificados?"], sources: constitution, lesson: constitutionalReviewLesson },
  { id: "constitucional-remedios", discipline: "Direito Constitucional", title: "Remédios constitucionais", objectives: ["Relacionar lesão ou ameaça a instrumento constitucional adequado.", "Reconhecer que cada ação possui requisitos próprios."], theory: ["Remédios constitucionais são instrumentos destinados a proteger direitos em situações definidas pela Constituição e pela legislação. A escolha exige comparar o direito afetado, a natureza do ato, a existência de informação ou dado pessoal, a legitimidade e os requisitos específicos da medida.", "Evite tratar os instrumentos como intercambiáveis. Em provas, palavras do enunciado — como liberdade de locomoção, acesso a informação ou omissão normativa — ajudam a identificar a hipótese, mas os requisitos legais ainda precisam ser conferidos."], concepts: ["Adequação da via constitucional.", "Legitimidade e requisitos variam conforme o instrumento.", "A finalidade da medida delimita seu alcance."], example: "Uma negativa de acesso a informação pessoal mantida em cadastro pode exigir análise de instrumento distinto daquele voltado à proteção da liberdade de locomoção.", summary: ["Defina o direito e o tipo de violação antes de escolher a ação.", "Confira legitimidade, prova e requisitos legais."], review: ["Por que os remédios constitucionais não são substituíveis entre si?", "Que elementos do enunciado ajudam a escolher a via?"], sources: constitution, lesson: constitutionalRemediesLesson },

  { id: "civil-pessoas", discipline: "Direito Civil", title: "Pessoas naturais e jurídicas", objectives: ["Distinguir personalidade, capacidade e representação.", "Reconhecer a autonomia patrimonial da pessoa jurídica e seus limites legais."], theory: ["A Parte Geral do Código Civil disciplina pessoas naturais e jurídicas como sujeitos de direitos e deveres. Personalidade indica aptidão para titularizar relações jurídicas; capacidade de exercício diz respeito à prática pessoal de atos, observadas as regras legais e eventual representação ou assistência.", "Pessoas jurídicas possuem organização e patrimônio próprios nos termos da lei. A separação patrimonial é regra, mas não impede medidas excepcionais quando presentes pressupostos legais, que devem ser demonstrados no caso concreto."], concepts: ["Personalidade e capacidade são conceitos diferentes.", "Representação e assistência têm funções jurídicas próprias.", "Autonomia patrimonial admite exceções legalmente delimitadas."], example: "Uma pessoa que não pode praticar determinado ato sozinha pode precisar de representação ou assistência conforme sua situação jurídica e a regra aplicável.", summary: ["Identifique quem é sujeito da relação e quem pode agir em seu nome.", "Não confunda autonomia patrimonial com imunidade absoluta."], review: ["Como personalidade difere de capacidade de exercício?", "Quando a representação pode ser relevante?"], sources: civilCode },
  { id: "civil-negocios", discipline: "Direito Civil", title: "Negócios jurídicos", objectives: ["Analisar existência, validade e eficácia em etapas distintas.", "Reconhecer elementos que podem afetar a declaração de vontade."], theory: ["O negócio jurídico é instrumento pelo qual a vontade produz efeitos reconhecidos pelo ordenamento. A análise costuma separar seus elementos de existência, os requisitos de validade previstos em lei e a produção de efeitos no caso concreto.", "Defeitos da vontade, forma, capacidade e objeto podem alterar a validade ou permitir consequências específicas. Não se deve concluir automaticamente pela nulidade sem identificar o defeito, a norma aplicável e a consequência jurídica prevista."], concepts: ["Existência, validade e eficácia são planos analíticos distintos.", "Capacidade, objeto e forma podem ser requisitos legais.", "Defeitos e consequências dependem da hipótese legal."], example: "Antes de concluir que um contrato é inválido, verifique a capacidade dos agentes, o objeto, a forma exigida e eventual defeito na manifestação de vontade.", summary: ["Use uma sequência de análise em vez de saltar à consequência.", "Vincule cada defeito à regra legal pertinente."], review: ["Por que validade e eficácia não são sinônimos?", "Quais elementos devem ser verificados em um negócio?"], sources: civilCode },
  { id: "civil-obrigacoes", discipline: "Direito Civil", title: "Obrigações", objectives: ["Reconhecer credor, devedor e prestação.", "Relacionar inadimplemento às consequências previstas em lei e contrato."], theory: ["A obrigação vincula sujeitos em torno de uma prestação. A classificação da prestação e o conteúdo do vínculo ajudam a determinar como ocorre o adimplemento e quais efeitos podem surgir diante de atraso, impossibilidade ou descumprimento.", "A análise deve considerar o que foi prometido, quando e como deveria ser cumprido, se houve justificativa juridicamente relevante e quais danos ou consequências estão comprovados. Regras contratuais e legais devem ser lidas em conjunto."], concepts: ["Sujeitos, vínculo e prestação.", "Adimplemento extingue a obrigação conforme o cumprimento devido.", "Mora e inadimplemento possuem pressupostos e efeitos próprios."], example: "Se uma prestação vence em data determinada e não é realizada, é necessário examinar o termo, a causa do atraso e os efeitos aplicáveis antes de calcular qualquer consequência.", summary: ["Defina prestação, vencimento e forma de cumprimento.", "Diferencie atraso, impossibilidade e descumprimento definitivo."], review: ["Quais são os elementos básicos da relação obrigacional?", "O que verificar antes de atribuir consequências ao atraso?"], sources: civilCode },
  { id: "civil-contratos", discipline: "Direito Civil", title: "Contratos", objectives: ["Identificar formação, interpretação e cumprimento contratual.", "Aplicar boa-fé e função social sem ignorar a lei e o texto pactuado."], theory: ["Contratos organizam interesses e obrigações das partes dentro dos limites legais. Sua análise considera formação, conteúdo, interpretação, execução e possíveis formas de extinção. O Código Civil estabelece parâmetros que orientam a liberdade contratual e a leitura do pacto.", "Boa-fé objetiva orienta condutas leais e cooperativas durante a relação; não é autorização para apagar cláusulas ou criar obrigações sem fundamento. A solução depende do tipo contratual, das circunstâncias e das normas específicas."], concepts: ["Autonomia privada dentro dos limites legais.", "Boa-fé objetiva como padrão de conduta.", "Interpretação contextual e função social do contrato."], example: "Na execução de um contrato de prestação de serviços, informar um impedimento relevante e cooperar para reduzir prejuízos pode ser pertinente à análise da boa-fé.", summary: ["Leia o contrato e a norma específica aplicável.", "Use princípios para interpretar e integrar, não para dispensar fundamentação."], review: ["Como a boa-fé objetiva se manifesta na execução?", "Quais limites restringem a liberdade contratual?"], sources: civilCode },
  { id: "civil-responsabilidade", discipline: "Direito Civil", title: "Responsabilidade civil", objectives: ["Investigar conduta, dano e nexo causal.", "Distinguir responsabilidade subjetiva e hipóteses legais objetivas."], theory: ["A responsabilidade civil busca disciplinar a reparação de danos conforme requisitos legais. Em uma análise introdutória, organize os fatos: conduta atribuída, dano demonstrado, relação causal e eventual elemento subjetivo quando exigido.", "Existem hipóteses legais em que a responsabilidade independe de culpa, mas isso não elimina a necessidade de verificar dano, nexo e pressupostos específicos. Excludentes e regime aplicável precisam ser analisados com cuidado."], concepts: ["Conduta, dano e nexo causal.", "Culpa é relevante em regimes subjetivos.", "Responsabilidade objetiva depende de previsão ou fundamento legal."], example: "Um prejuízo ocorrido após um serviço não prova, isoladamente, que o prestador causou o dano; é necessário examinar o nexo e o regime jurídico aplicável.", summary: ["Estruture a análise pelos elementos do regime aplicável.", "Não confunda sequência temporal com nexo causal."], review: ["Quais elementos aparecem na análise básica da responsabilidade?", "O que muda entre responsabilidade subjetiva e objetiva?"], sources: civilCode },
  { id: "civil-familia-sucessoes", discipline: "Direito Civil", title: "Famílias e sucessões", objectives: ["Reconhecer relações familiares e efeitos jurídicos patrimoniais.", "Organizar os primeiros passos da sucessão legítima ou testamentária."], theory: ["Direito das famílias trata de relações pessoais e patrimoniais reconhecidas pelo ordenamento. Sucessões disciplina a transmissão patrimonial decorrente da morte, observando a existência de herdeiros, disposições testamentárias e limites legais.", "O caso exige atenção às datas, vínculos juridicamente reconhecidos, regime de bens, patrimônio e documentos. Regras sucessórias possuem ordem e exceções; não se deve atribuir quinhões sem mapear esses elementos."], concepts: ["Vínculo familiar e efeitos patrimoniais.", "Abertura da sucessão e identificação do acervo.", "Sucessão legítima e testamentária sujeitas a limites legais."], example: "Para analisar uma partilha, primeiro identifique o patrimônio, o regime de bens e as pessoas chamadas à sucessão, antes de calcular parcelas.", summary: ["Organize fatos familiares e patrimoniais em separado.", "Confira a ordem sucessória e as disposições válidas."], review: ["Quais informações são essenciais antes de propor uma partilha?", "Por que regime de bens pode afetar a análise sucessória?"], sources: civilCode },

  { id: "penal-teoria-crime", discipline: "Direito Penal", title: "Teoria do crime", objectives: ["Usar uma sequência analítica para examinar fato típico, ilicitude e culpabilidade.", "Separar elementos do fato de consequências penais."], theory: ["A teoria analítica do crime organiza o estudo do fato punível em categorias. Em abordagem introdutória, primeiro se examina a tipicidade, depois a ilicitude e então a culpabilidade, sem esquecer que cada categoria possui elementos e debates próprios.", "A sequência é ferramenta de raciocínio, não uma fórmula automática. Os fatos devem ser comparados com a descrição legal e com as hipóteses que excluem ou modificam a responsabilidade."], concepts: ["Tipicidade: correspondência entre fato e descrição penal, conforme análise aplicável.", "Ilicitude: contrariedade ao direito, sujeita a justificantes.", "Culpabilidade: juízo pessoal de reprovação segundo requisitos legais."], example: "Uma conduta aparentemente correspondente a um tipo penal ainda exige verificar se existe causa legal de justificação e se os requisitos de culpabilidade estão presentes.", summary: ["Examine cada categoria na ordem e com base nos fatos provados.", "Não conclua pela responsabilidade apenas pela descrição do resultado."], review: ["Qual é a sequência analítica tradicional?", "Por que tipicidade não encerra a análise?"], sources: penalCode },
  { id: "penal-tipicidade-ilicitude-culpabilidade", discipline: "Direito Penal", title: "Tipicidade, ilicitude e culpabilidade", objectives: ["Distinguir os três planos de análise.", "Identificar a função das causas legais de exclusão."], theory: ["Tipicidade compara a conduta com a norma penal; ilicitude examina a contrariedade ao ordenamento e suas justificantes; culpabilidade avalia a possibilidade de censura pessoal conforme os critérios legais. A resposta correta depende da localização do problema na estrutura.", "Uma causa de justificação não é igual a uma causa que exclui culpabilidade: cada uma afeta um plano diferente e pode produzir consequências distintas. Leia o enunciado procurando fatos sobre necessidade, defesa, capacidade e possibilidade de compreensão, sempre conferindo a lei."], concepts: ["Planos diferentes levam a perguntas diferentes.", "Justificantes se relacionam à ilicitude.", "Culpabilidade exige exame pessoal conforme a lei."], example: "Se a questão informa uma agressão atual e uma reação para afastá-la, o primeiro ponto é avaliar a justificante alegada e seus requisitos, não presumir automaticamente a conclusão.", summary: ["Localize o elemento jurídico questionado.", "Confira os requisitos da causa legal invocada."], review: ["Em que plano atua uma causa de justificação?", "Por que uma excludente deve ser analisada pelos requisitos legais?"], sources: penalCode },
  { id: "penal-concurso-pessoas", discipline: "Direito Penal", title: "Concurso de pessoas", objectives: ["Analisar a contribuição de cada agente.", "Distinguir participação e coautoria em nível introdutório."], theory: ["Quando mais de uma pessoa contribui para uma infração, a análise penal considera a atuação e o vínculo subjetivo de cada uma segundo a lei. Nem toda presença no local ou relação com os envolvidos basta para atribuir responsabilidade.", "O estudo deve identificar contribuição relevante, contexto, intenção e regras legais de imputação. A extensão da responsabilidade não é presumida de forma coletiva: deve ser fundamentada em relação a cada agente."], concepts: ["Pluralidade de agentes e contribuição.", "Vínculo subjetivo conforme a hipótese.", "Responsabilidade individualizada."], example: "Quem apenas presencia um fato não se torna automaticamente coautor; é preciso verificar se houve contribuição juridicamente relevante e os demais requisitos.", summary: ["Descreva o que cada pessoa fez ou deixou de fazer.", "Não substitua prova individual por associação ou proximidade."], review: ["Por que a presença no local não basta?", "O que deve ser individualizado para cada agente?"], sources: penalCode },
  { id: "penal-penas", discipline: "Direito Penal", title: "Penas", objectives: ["Reconhecer espécies de pena e etapas gerais de aplicação.", "Verificar limites legais e fundamentação da resposta penal."], theory: ["O Código Penal prevê espécies e critérios para aplicação das penas. A individualização procura relacionar a sanção ao caso concreto dentro dos parâmetros legais e de decisão fundamentada.", "Em questões, identifique a espécie de pena discutida, o momento da aplicação e as condições legais para substituição, regime ou outros efeitos. A consequência não deve ser deduzida apenas da gravidade intuitiva do fato."], concepts: ["Legalidade e individualização da pena.", "Espécies e critérios legais de aplicação.", "Substituição e regime dependem de requisitos próprios."], example: "Uma alternativa que propõe substituição da pena deve ser conferida pelos requisitos legais concretos, e não somente pela afirmação de que o crime foi sem violência.", summary: ["Diferencie espécie, cálculo e execução da pena.", "Cheque requisitos legais antes de afirmar uma consequência."], review: ["Qual é a função da individualização da pena?", "Por que a substituição não pode ser presumida?"], sources: penalCode },
  { id: "penal-crimes-especie", discipline: "Direito Penal", title: "Crimes em espécie", objectives: ["Localizar o tipo penal e seus elementos.", "Comparar fatos do problema com a descrição legal vigente."], theory: ["O estudo dos crimes em espécie começa pela leitura do tipo penal: sujeito, conduta, objeto, elemento subjetivo e circunstâncias relevantes. A classificação jurídica exige correspondência entre os fatos narrados e a lei vigente no momento juridicamente relevante.", "Como a legislação penal pode mudar, consulte sempre a redação oficial atualizada e observe regras de aplicação da lei penal no tempo. Este módulo ensina um método de leitura; não substitui o estudo dos tipos previstos no programa da prova."], concepts: ["Elementos objetivos e subjetivos do tipo.", "Consumação e tentativa conforme previsão legal.", "Legalidade e lei penal no tempo."], example: "Em uma hipótese de subtração, identifique a conduta e as circunstâncias descritas, depois compare cada elemento com o tipo legal sem acrescentar fatos não narrados.", summary: ["Não responda por associação de palavras: compare elemento por elemento.", "Confira a legislação atual e a lei aplicável no tempo."], review: ["Que elementos do tipo devem ser identificados?", "Por que não se deve completar fatos ausentes no enunciado?"], sources: penalCode },

  { id: "administrativo-principios", discipline: "Direito Administrativo", title: "Princípios da Administração Pública", objectives: ["Reconhecer princípios constitucionais expressos da Administração.", "Aplicar princípios aos fatos com fundamentação, sem tratá-los como respostas automáticas."], theory: ["A atuação administrativa está submetida à Constituição e às leis. O art. 37 da Constituição explicita princípios que orientam a Administração direta e indireta, além de outros parâmetros constitucionais e legais.", "Em situações concretas, identifique o agente, a finalidade, a forma de atuação e o tratamento dado às pessoas. O nome de um princípio não basta: explique qual conduta o viola ou concretiza e evite afirmar que princípios autorizam afastar regras legais sem fundamento."], concepts: ["Legalidade, impessoalidade, moralidade, publicidade e eficiência.", "Finalidade pública e motivação conforme a situação.", "Princípios orientam interpretação dentro do sistema jurídico."], example: "Conceder benefício a pessoas em situação equivalente com critérios diferentes e sem justificativa pode suscitar análise de impessoalidade e igualdade, conforme os fatos e a norma aplicável.", summary: ["Relacione princípio a um fato específico.", "Considere Constituição, lei e finalidade da atuação."], review: ["Quais princípios estão expressos no caput do art. 37?", "Por que citar o princípio sem relacioná-lo ao fato é insuficiente?"], sources: adminLaw },
  { id: "administrativo-atos", discipline: "Direito Administrativo", title: "Atos administrativos", objectives: ["Identificar elementos usados na análise do ato.", "Distinguir controle de legalidade de conveniência administrativa."], theory: ["O ato administrativo é manifestação submetida a regime jurídico público e deve respeitar competência, finalidade, forma, motivo e objeto conforme a classificação tradicional. A validade depende da conformidade com a lei e com os requisitos aplicáveis.", "Anulação e revogação não são sinônimos: a primeira se relaciona a ilegalidade; a segunda, nos limites legais, à avaliação de conveniência e oportunidade. A autoridade, o procedimento, os efeitos e a proteção da confiança precisam ser verificados no caso."], concepts: ["Elementos: competência, finalidade, forma, motivo e objeto.", "Anulação por ilegalidade; revogação ligada ao mérito administrativo, com limites.", "Motivação e controle dependem do ato e da legislação."], example: "Se um ato foi praticado por autoridade sem competência legal, a questão central é de legalidade; não se resolve apenas afirmando que o ato deixou de ser conveniente.", summary: ["Identifique o elemento questionado.", "Separe ilegalidade de avaliação de mérito e confira os limites legais."], review: ["Quais são os elementos tradicionalmente analisados?", "Como anulação difere de revogação?"], sources: adminLaw },
  { id: "administrativo-poderes", discipline: "Direito Administrativo", title: "Poderes administrativos", objectives: ["Reconhecer poderes como instrumentos vinculados a competências legais.", "Identificar abuso por excesso ou desvio, conforme o caso."], theory: ["Poderes administrativos são instrumentos jurídicos para cumprir funções públicas, exercidos nos limites de competência, finalidade e procedimento previstos. Não são privilégios pessoais do agente; seu uso deve permanecer vinculado ao interesse público definido em lei.", "O controle da atuação examina se houve excesso em relação à competência ou desvio da finalidade legal, além de outros vícios. A classificação do poder — hierárquico, disciplinar, regulamentar ou de polícia — ajuda a organizar a análise, mas não substitui a verificação dos limites."], concepts: ["Poder-dever funcional e legalidade.", "Excesso de poder e desvio de finalidade.", "Cada espécie tem âmbito e limites próprios."], example: "Uma autoridade pode fiscalizar atividade sujeita à regulação, mas a medida concreta deve ter base legal, finalidade adequada e respeitar garantias aplicáveis.", summary: ["Localize a base legal e o objetivo do ato.", "Verifique competência, proporcionalidade quando cabível e procedimento."], review: ["Por que poder administrativo não é prerrogativa pessoal?", "Como diferenciar excesso e desvio em termos gerais?"], sources: adminLaw },
  { id: "administrativo-licitacoes", discipline: "Direito Administrativo", title: "Licitações e contratos", objectives: ["Compreender a licitação como procedimento sujeito a princípios e lei.", "Localizar etapas e regras na Lei 14.133/2021."], theory: ["A Lei 14.133/2021 estabelece normas gerais para licitações e contratos administrativos em seu âmbito de aplicação. O procedimento busca selecionar proposta conforme critérios previamente definidos, com igualdade de condições e observância dos princípios e etapas legais.", "A solução de um caso exige identificar o ente, o objeto, a fase e a regra vigente, além de verificar hipóteses legais de contratação direta e seus requisitos. Não se deve tratar dispensa e inexigibilidade como liberdade sem processo ou justificativa."], concepts: ["Planejamento, edital e julgamento conforme lei.", "Dispensa e inexigibilidade têm hipóteses legais distintas.", "Contrato e fiscalização seguem regime jurídico específico."], example: "Diante de contratação direta, procure a hipótese legal e os documentos de instrução e justificativa exigidos, em vez de concluir que a Administração pode simplesmente ignorar o procedimento.", summary: ["Identifique a lei aplicável, fase e hipótese.", "Consulte a redação atualizada e os requisitos da contratação."], review: ["Qual diferença metodológica há entre dispensa e inexigibilidade?", "Quais elementos do caso orientam a busca na Lei 14.133?"], sources: [procurement, ...adminLaw] },
  { id: "administrativo-estado", discipline: "Direito Administrativo", title: "Responsabilidade civil do Estado", objectives: ["Examinar dano, atuação estatal e nexo causal.", "Verificar regime constitucional e possíveis excludentes no caso."], theory: ["A Constituição prevê disciplina própria para danos causados por agentes públicos nessa qualidade, sem dispensar a análise dos pressupostos aplicáveis. O exame deve identificar a atuação, o dano, o nexo causal e o contexto funcional, além de avaliar fatos que possam afastar ou modificar a responsabilidade.", "A responsabilidade do Estado e eventual regresso contra o agente são questões distintas e dependem de requisitos próprios. Não se deve presumir responsabilidade apenas porque o dano ocorreu em serviço público ou porque um agente estava presente."], concepts: ["Dano e nexo causal.", "Atuação do agente nessa qualidade.", "Responsabilidade estatal e ação regressiva são planos distintos."], example: "Se um veículo oficial se envolve em acidente, apure o dano, a conexão com a atuação pública e as circunstâncias causais antes de analisar eventual responsabilidade.", summary: ["Estruture o nexo entre atuação e dano.", "Separe a posição da vítima da eventual responsabilização interna do agente."], review: ["Quais fatos são necessários para analisar responsabilidade estatal?", "Por que ação regressiva é questão distinta?"], sources: constitution },

  { id: "trabalho-emprego", discipline: "Direito do Trabalho", title: "Relação de emprego", objectives: ["Distinguir relação de trabalho em sentido amplo de emprego.", "Examinar fatos relevantes para identificar os requisitos da relação empregatícia."], theory: ["A CLT define as figuras de empregado e empregador e disciplina a relação de emprego. A análise é feita a partir da prestação concreta: pessoalidade, continuidade nos termos legais, remuneração e subordinação são elementos tradicionalmente estudados, cuja presença deve ser aferida pelos fatos e pela legislação aplicável.", "O rótulo do contrato ou a forma de pagamento não resolve sozinho a classificação. Examine a realidade da prestação, sem ignorar regimes legais específicos e alterações legislativas."], concepts: ["Relação de trabalho é gênero; emprego é modalidade regulada.", "Requisitos devem ser analisados em conjunto com os fatos.", "Primazia da realidade não autoriza ignorar regimes legais específicos."], example: "Um contrato chamado de prestação autônoma não encerra a análise se os fatos indicarem rotina, pessoalidade e direção; a conclusão depende da prova e dos requisitos legais.", summary: ["Leia os fatos além do nome dado ao contrato.", "Verifique cada requisito e possíveis regimes especiais."], review: ["Por que a denominação contratual não basta?", "Quais elementos devem ser investigados?"], sources: laborLaw },
  { id: "trabalho-contrato", discipline: "Direito do Trabalho", title: "Contrato de trabalho", objectives: ["Identificar forma, duração e condições do contrato.", "Relacionar cláusulas contratuais às normas trabalhistas aplicáveis."], theory: ["O contrato de trabalho organiza a prestação pessoal e remunerada dentro dos limites da legislação trabalhista e de outras fontes aplicáveis. Sua análise considera forma, duração, alterações, deveres recíprocos e compatibilidade das cláusulas com normas imperativas.", "A vontade das partes tem espaço, mas não pode ser tratada como autorização irrestrita para afastar direitos legalmente protegidos. Em uma questão, identifique qual regra disciplina a condição discutida e se a alteração observou requisitos e limites."], concepts: ["Contrato individual e condições de trabalho.", "Alterações contratuais sujeitas a limites legais.", "Normas coletivas e individuais devem ser situadas no contexto jurídico aplicável."], example: "Uma mudança de horário pode exigir verificar a regra legal, o contrato, eventual instrumento coletivo e o impacto concreto previsto na legislação.", summary: ["Separe condição contratual, fonte normativa e alteração.", "Não conclua pela validade apenas porque houve concordância formal."], review: ["Quais fontes podem disciplinar uma condição de trabalho?", "O que verificar diante de alteração contratual?"], sources: laborLaw },
  { id: "trabalho-jornada", discipline: "Direito do Trabalho", title: "Jornada e descanso", objectives: ["Organizar fatos sobre jornada, intervalos e repouso.", "Consultar os limites legais aplicáveis ao regime concreto."], theory: ["Jornada e períodos de descanso são regulados pela Constituição, pela CLT e por normas específicas, com variações conforme a atividade e o regime. Para resolver um caso, reconstrua horários, dias trabalhados, intervalos, controles e eventual norma coletiva.", "Evite decorar uma regra isolada sem identificar exceções, categoria e período. A legislação trabalhista muda; confira o texto vigente e diferencie duração contratual, jornada efetivamente prestada e tempo legalmente computável."], concepts: ["Jornada efetiva, intervalos e repousos.", "Regras podem variar conforme regime e atividade.", "Prova dos horários é relevante para a solução."], example: "Se a pessoa relata trabalho contínuo durante o dia, organize horários de entrada, saída e pausas antes de avaliar eventual violação de intervalo.", summary: ["Construa a linha do tempo da prestação.", "Confira a regra vigente para o regime e a categoria."], review: ["Que dados são necessários para analisar jornada?", "Por que a regra geral não deve ser aplicada sem examinar o regime?"], sources: laborLaw },
  { id: "trabalho-remuneracao", discipline: "Direito do Trabalho", title: "Remuneração", objectives: ["Distinguir salário e demais parcelas remuneratórias conforme a lei.", "Analisar natureza, frequência e base de cálculo das parcelas."], theory: ["A remuneração envolve parcelas disciplinadas pela legislação trabalhista, mas a natureza jurídica de cada pagamento depende de sua causa, forma e regra legal. A nomenclatura usada no contracheque não substitui a análise do fato gerador e da norma.", "Para calcular efeitos, identifique a parcela, sua habitualidade quando relevante, sua natureza legal e a base de incidência aplicável. Evite generalizações sobre benefícios, prêmios ou reembolsos sem conferir a redação vigente da CLT."], concepts: ["Salário e remuneração não são sempre equivalentes.", "Natureza da parcela orienta reflexos e incidências.", "A lei vigente e os fatos concretos devem ser conferidos."], example: "Um valor chamado de ajuda de custo exige examinar finalidade, documentação e requisitos legais antes de definir se integra ou não determinada base de cálculo.", summary: ["Analise causa e natureza, não apenas o nome da verba.", "Confira a regra atual antes de concluir sobre reflexos."], review: ["Que elementos ajudam a classificar uma parcela?", "Por que a denominação contábil não é suficiente?"], sources: laborLaw },
  { id: "trabalho-rescisao", discipline: "Direito do Trabalho", title: "Rescisão contratual", objectives: ["Identificar forma de término do contrato.", "Relacionar modalidade rescisória a verbas e procedimentos aplicáveis."], theory: ["A extinção do contrato pode ocorrer por modalidades diferentes, com consequências próprias para aviso, saldo de parcelas, documentos e eventuais indenizações. A classificação depende de quem tomou a iniciativa, dos fatos e da regra vigente.", "Organize a data, a modalidade, o tempo de serviço e as parcelas já pagas. Não atribua automaticamente todos os efeitos de uma modalidade a outra; consulte a CLT e os instrumentos aplicáveis ao caso."], concepts: ["Modalidade de ruptura determina consequências.", "Datas e valores pagos são dados essenciais.", "Verbas rescisórias dependem da hipótese legal concreta."], example: "Em uma alegação de pedido de demissão contestado, a iniciativa e a prova da manifestação de vontade influenciam a análise das verbas devidas.", summary: ["Classifique primeiro a forma de extinção.", "Depois confira verbas, prazos e documentos na lei vigente."], review: ["Por que a modalidade da ruptura altera as consequências?", "Quais dados devem ser organizados para revisar verbas?"], sources: laborLaw },
  { id: "trabalho-direitos", discipline: "Direito do Trabalho", title: "Direitos trabalhistas", objectives: ["Localizar direitos constitucionais e legais relevantes.", "Resolver casos por fonte normativa, fatos e consequência jurídica."], theory: ["Direitos trabalhistas têm fundamento constitucional, legal e, em certos temas, coletivo. Para analisar uma questão, identifique o direito invocado, os fatos que acionam sua proteção e a fonte normativa aplicável. Regras podem ter requisitos, limites e exceções.", "A leitura deve ser sistemática: Constituição e CLT, normas coletivas quando pertinentes e legislação especial. Este módulo é um roteiro de estudo, não uma lista exaustiva nem uma confirmação de cobertura integral do edital."], concepts: ["Direitos constitucionais e regulamentação legal.", "Fontes coletivas têm âmbito e vigência próprios.", "Requisitos e exceções devem ser conferidos no texto atual."], example: "Ao avaliar uma alegação de estabilidade, identifique a hipótese protegida, o período, os fatos exigidos e a fonte normativa antes de concluir sobre reintegração ou indenização.", summary: ["Identifique o direito, fato gerador e fonte.", "Confira vigência, requisitos e alcance da norma coletiva ou legal."], review: ["Como organizar a análise de um direito trabalhista?", "Por que verificar vigência e âmbito da fonte coletiva?"], sources: laborLaw },
];

export const studyDisciplines = ["Direito Constitucional", "Direito Civil", "Direito Penal", "Direito Administrativo", "Direito do Trabalho"] as const;
