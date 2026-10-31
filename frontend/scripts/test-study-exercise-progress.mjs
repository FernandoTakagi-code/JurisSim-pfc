import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/study-exercise-progress.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports, module, require });
const { activityMetrics, clearReviewAnswer, emptyExerciseProgress, exerciseStorageKey, questionsForReview, recordExerciseAnswer } = module.exports;
const exercises = [{ id: "q1", correctLabel: "B" }, { id: "q2", correctLabel: "D" }];

test("separa respondidas, acertos e erros", () => {
  const progress = recordExerciseAnswer(recordExerciseAnswer(emptyExerciseProgress(), "q1", "B", false), "q2", "A", false);
  assert.deepEqual({ ...activityMetrics(exercises, progress) }, { answered: 2, correct: 1, incorrect: 1, reviewable: 1, reviewed: 0 });
});

test("revisar erro não sobrescreve a resposta nem a pontuação original", () => {
  let progress = recordExerciseAnswer(emptyExerciseProgress(), "q2", "A", false);
  assert.equal(questionsForReview(exercises, progress).length, 1);
  progress = recordExerciseAnswer(progress, "q2", "D", true);
  assert.equal(progress.answers.q2, "A");
  assert.equal(progress.reviewAnswers.q2, "D");
  assert.deepEqual({ ...activityMetrics(exercises, progress) }, { answered: 1, correct: 0, incorrect: 1, reviewable: 1, reviewed: 1 });
});

test("não substitui resposta inicial e permite tentar novamente o erro", () => {
  let progress = recordExerciseAnswer(emptyExerciseProgress(), "q1", "A", false);
  progress = recordExerciseAnswer(progress, "q1", "B", false);
  assert.equal(progress.answers.q1, "A");
  progress = recordExerciseAnswer(progress, "q1", "A", true);
  progress = clearReviewAnswer(progress, "q1");
  assert.equal(progress.answers.q1, "A");
  assert.equal(progress.reviewAnswers.q1, undefined);
});

test("chave local é isolada por usuário e módulo", () => {
  assert.notEqual(exerciseStorageKey("student-1", "constitucional-direitos"), exerciseStorageKey("student-2", "constitucional-direitos"));
  assert.notEqual(exerciseStorageKey("student-1", "constitucional-direitos"), exerciseStorageKey("student-1", "civil-contratos"));
});
