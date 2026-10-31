import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadTypeScriptModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const localRequire = specifier => {
    if (specifier === "./constitutional-lessons") return loadTypeScriptModule("../src/constitutional-lessons.ts");
    if (specifier === "./civil-lessons") return loadTypeScriptModule("../src/civil-lessons.ts");
    if (specifier === "./penal-lessons") return loadTypeScriptModule("../src/penal-lessons.ts");
    if (specifier === "./administrative-lessons") return loadTypeScriptModule("../src/administrative-lessons.ts");
    if (specifier === "./labor-lessons") return loadTypeScriptModule("../src/labor-lessons.ts");
    return require(specifier);
  };
  vm.runInNewContext(compiled, { exports: module.exports, module, require: localRequire });
  return module.exports;
}
const { studyModules, studyDisciplines } = loadTypeScriptModule("../src/study-content.ts");
const constitutional = studyModules.find(item => item.id === "constitucional-direitos");

test("mantém os 27 módulos e as cinco disciplinas", () => {
  assert.equal(studyModules.length, 27);
  assert.equal(studyDisciplines.length, 5);
  for (const discipline of studyDisciplines) assert.ok(studyModules.some(item => item.discipline === discipline), `no modules for ${discipline}`);
});

test("preserva a aula aprovada e associa as quatro novas aulas aos módulos constitucionais corretos", () => {
  assert.ok(constitutional?.lesson);
  assert.equal(studyModules.filter(item => item.lesson).length, 5);
  assert.equal(constitutional.discipline, "Direito Constitucional");
  assert.equal(constitutional.lesson.sections.length, 7);
  assert.equal(constitutional.lesson.reviewQuestions.length, 8);
  assert.equal(constitutional.lesson.exercises.length, 6);
  for (const id of ["constitucional-estado", "constitucional-poderes", "constitucional-controle", "constitucional-remedios"]) {
    const item = studyModules.find(module => module.id === id);
    assert.equal(item?.discipline, "Direito Constitucional");
    assert.ok(item?.lesson, `missing lesson for ${id}`);
    assert.equal(item.lesson.sections.length, 7);
  }
  assert.equal(studyModules.find(module => module.id === "civil-pessoas")?.lesson, undefined);
  assert.equal(new Set(constitutional.lesson.sections.map(section => section.id)).size, constitutional.lesson.sections.length);
  for (const section of constitutional.lesson.sections) {
    assert.ok(section.title.length > 8);
    assert.ok(section.paragraphs.length > 0);
  }
});

test("inclui fundamentos constitucionais específicos e referência oficial", () => {
  const text = JSON.stringify(constitutional.lesson);
  const normalized = text.toLocaleLowerCase("pt-BR");
  for (const reference of ["arts. 5º a 17", "art. 5º, § 1º", "art. 5º, xvi", "art. 5º, xxxv", "art. 5º, lxxii", "lxxix"]) assert.ok(normalized.includes(reference), `missing ${reference}`);
  assert.ok(constitutional.sources.some(source => source.url === "https://www.planalto.gov.br/ccivil_03/constituicao/constituicaocompilado.htm"));
});

test("perguntas de revisão possuem resposta, comentário e fundamento", () => {
  assert.equal(constitutional.lesson.reviewQuestions.length, 8);
  for (const item of constitutional.lesson.reviewQuestions) {
    assert.ok(item.question.trim());
    assert.ok(item.answer.trim());
    assert.ok(item.explanation.trim());
    assert.ok(item.basis.trim());
  }
  assert.ok(constitutional.lesson.sections.some(section => section.example?.title.includes("autoral")));
});

test("exercícios são autorais, têm quatro alternativas explicadas e um único gabarito", () => {
  for (const module of studyModules.filter(item => item.lesson)) {
    const questions = module.lesson.exercises;
    assert.equal(questions.length, 6, module.id);
    assert.equal(new Set(questions.map(item => item.id)).size, questions.length);
    for (const item of questions) {
      assert.equal(JSON.stringify(item.options.map(option => option.label).sort()), JSON.stringify(["A", "B", "C", "D"]));
      assert.equal(item.options.filter(option => option.label === item.correctLabel).length, 1);
      assert.ok(item.options.every(option => option.explanation.trim()));
      assert.ok(item.basis.includes("CF,") || item.basis.includes("Constituição Federal"));
    }
  }
});

test("cada aula constitucional possui oito revisões completas e referências oficiais", () => {
  for (const module of studyModules.filter(item => item.lesson)) {
    assert.equal(module.lesson.reviewQuestions.length, 8, module.id);
    assert.ok((module.lesson.sources ?? module.sources).some(item => item.url.includes("planalto.gov.br")), module.id);
    assert.ok(module.lesson.sections.every(section => section.paragraphs.length > 0), module.id);
    assert.ok(module.lesson.reviewQuestions.every(item => item.answer && item.explanation && item.basis), module.id);
  }
});

test("os seis módulos de Direito Civil mantêm seus IDs e ordem no catálogo original", () => {
  const civilIds = Array.from(studyModules.filter(item => item.discipline === "Direito Civil"), item => item.id);
  assert.equal(JSON.stringify(civilIds), JSON.stringify(["civil-pessoas", "civil-negocios", "civil-obrigacoes", "civil-contratos", "civil-responsabilidade", "civil-familia-sucessoes"]));
  const { civilLessons } = loadTypeScriptModule("../src/civil-lessons.ts");
  assert.equal(JSON.stringify(Object.keys(civilLessons)), JSON.stringify(civilIds));
  assert.equal(studyModules.length, 27);
  assert.equal(JSON.stringify(Array.from(studyModules.filter(item => item.discipline === "Direito Civil"), item => item.title)), JSON.stringify([
    "Pessoas naturais e jurídicas", "Negócios jurídicos", "Obrigações", "Contratos", "Responsabilidade civil", "Famílias e sucessões",
  ]));
});

test("cada aula civil tem sete tópicos aprofundados, oito revisões e seis exercícios completos", () => {
  const { civilLessons } = loadTypeScriptModule("../src/civil-lessons.ts");
  for (const [id, lesson] of Object.entries(civilLessons)) {
    assert.equal(lesson.sections.length, 7, id);
    assert.equal(new Set(lesson.sections.map(section => section.id)).size, 7, `${id}: section IDs`);
    assert.ok(lesson.sections.every(section => section.paragraphs.length >= 2 && section.paragraphs.every(text => text.length > 60)), `${id}: substantive topics`);
    assert.ok(lesson.sections.some(section => section.example?.title.includes("autoral")), `${id}: authored examples`);
    assert.equal(lesson.reviewQuestions.length, 8, id);
    assert.ok(lesson.reviewQuestions.every(item => item.question && item.answer && item.explanation && item.basis), `${id}: complete review questions`);
    assert.equal(lesson.exercises.length, 6, id);
    assert.equal(new Set(lesson.exercises.map(item => item.id)).size, 6, `${id}: exercise IDs`);
    for (const exercise of lesson.exercises) {
      assert.equal(JSON.stringify(Array.from(exercise.options, option => option.label)), JSON.stringify(["A", "B", "C", "D"]), `${id}: labels`);
      assert.equal(exercise.options.filter(option => option.label === exercise.correctLabel).length, 1, `${id}: answer key`);
      assert.ok(exercise.options.every(option => option.text && option.explanation), `${id}: explanations for each option`);
      assert.match(exercise.basis, /(?:CC|Código Civil|CF|Constituição Federal|CPC),/i, `${id}: statutory basis`);
    }
    assert.ok(lesson.sources.some(source => source.url.includes("planalto.gov.br")), `${id}: official legislation source`);
    assert.ok(lesson.sources.every(source => source.url.startsWith("https://")), `${id}: HTTPS references`);
  }
});

const remainingIds = {
  "Direito Penal": ["penal-teoria-crime", "penal-tipicidade-ilicitude-culpabilidade", "penal-concurso-pessoas", "penal-penas", "penal-crimes-especie"],
  "Direito Administrativo": ["administrativo-principios", "administrativo-atos", "administrativo-poderes", "administrativo-licitacoes", "administrativo-estado"],
  "Direito do Trabalho": ["trabalho-emprego", "trabalho-contrato", "trabalho-jornada", "trabalho-remuneracao", "trabalho-rescisao", "trabalho-direitos"],
};
const remainingTitles = {
  "Direito Penal": ["Teoria do crime", "Tipicidade, ilicitude e culpabilidade", "Concurso de pessoas", "Penas", "Crimes em espécie"],
  "Direito Administrativo": ["Princípios da Administração Pública", "Atos administrativos", "Poderes administrativos", "Licitações e contratos", "Responsabilidade civil do Estado"],
  "Direito do Trabalho": ["Relação de emprego", "Contrato de trabalho", "Jornada e descanso", "Remuneração", "Rescisão contratual", "Direitos trabalhistas"],
};

test("preserves IDs, titles and order of the 16 Penal, Administrative and Labor modules", () => {
  for (const [discipline, ids] of Object.entries(remainingIds)) {
    const modules = studyModules.filter(item => item.discipline === discipline);
    assert.equal(JSON.stringify(modules.map(item => item.id)), JSON.stringify(ids));
    assert.equal(JSON.stringify(modules.map(item => item.title)), JSON.stringify(remainingTitles[discipline]));
  }
  assert.equal(studyModules.length, 27);
});

test("the 16 remaining modules have seven substantive topics, eight reviews and six complete exercises", () => {
  const lessonMaps = {
    "Direito Penal": loadTypeScriptModule("../src/penal-lessons.ts").penalLessons,
    "Direito Administrativo": loadTypeScriptModule("../src/administrative-lessons.ts").administrativeLessons,
    "Direito do Trabalho": loadTypeScriptModule("../src/labor-lessons.ts").laborLessons,
  };
  for (const [discipline, ids] of Object.entries(remainingIds)) {
    const lessons = lessonMaps[discipline];
    assert.deepEqual(Object.keys(lessons), ids, `${discipline}: lesson order`);
    for (const id of ids) {
      const module = studyModules.find(item => item.id === id);
      const lesson = lessons[id];
      assert.equal(module?.discipline, discipline, `${id}: catalog discipline`);
      assert.equal(lesson.sections.length, 7, `${id}: topics`);
      assert.equal(new Set(lesson.sections.map(section => section.id)).size, 7, `${id}: unique topic IDs`);
      assert.ok(lesson.sections.every(section => section.id.startsWith(`${id}-topico-`) && section.paragraphs.length >= 2 && section.paragraphs.every(paragraph => paragraph.length > 60)), `${id}: substantive topics`);
      assert.ok(lesson.sections.some(section => section.example?.title.includes("autoral") && section.example.facts.length > 30 && section.example.analysis.length > 50), `${id}: practical examples`);
      assert.equal(lesson.summary.length, 5, `${id}: review summary`);
      assert.equal(lesson.reviewQuestions.length, 8, `${id}: review questions`);
      assert.ok(lesson.reviewQuestions.every(item => item.question && item.answer && item.explanation.trim() && item.basis), `${id}: complete review comments`);
      assert.equal(lesson.exercises.length, 6, `${id}: exercises`);
      assert.equal(new Set(lesson.exercises.map(item => item.id)).size, 6, `${id}: unique exercise IDs`);
      for (const item of lesson.exercises) {
        assert.equal(JSON.stringify(item.options.map(option => option.label)), JSON.stringify(["A", "B", "C", "D"]), `${id}/${item.id}: alternatives`);
        assert.equal(item.options.filter(option => option.label === item.correctLabel).length, 1, `${id}/${item.id}: one correct option`);
        assert.ok(item.options.every(option => option.text && option.explanation.trim().length > 0), `${id}/${item.id}: all alternative comments`);
        assert.ok(item.basis.length > 8, `${id}/${item.id}: legal basis`);
      }
      assert.ok(lesson.sources.some(source => source.url.startsWith("https://www.planalto.gov.br/")), `${id}: official source`);
      assert.ok(lesson.sources.every(source => source.url.startsWith("https://")), `${id}: HTTPS source URLs`);
    }
  }
});
