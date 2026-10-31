export type ExerciseProgress = { answers: Record<string, string>; reviewAnswers: Record<string, string> };
export type ExerciseDefinition = { id: string; correctLabel: string };

export const emptyExerciseProgress = (): ExerciseProgress => ({ answers: {}, reviewAnswers: {} });
export const exerciseStorageKey = (userId: string, moduleId: string) => `jurissim-study-exercises:${encodeURIComponent(userId)}:${encodeURIComponent(moduleId)}`;

export function activityMetrics(exercises: ExerciseDefinition[], progress: ExerciseProgress) {
  const answered = exercises.filter(item => Boolean(progress.answers[item.id])).length;
  const correct = exercises.filter(item => progress.answers[item.id] === item.correctLabel).length;
  const reviewable = exercises.filter(item => Boolean(progress.answers[item.id]) && progress.answers[item.id] !== item.correctLabel);
  const reviewed = reviewable.filter(item => Boolean(progress.reviewAnswers[item.id])).length;
  return { answered, correct, incorrect: answered - correct, reviewable: reviewable.length, reviewed };
}

export function recordExerciseAnswer(progress: ExerciseProgress, exerciseId: string, label: string, reviewMode: boolean): ExerciseProgress {
  if (reviewMode) return { ...progress, reviewAnswers: { ...progress.reviewAnswers, [exerciseId]: label } };
  if (progress.answers[exerciseId]) return progress;
  return { ...progress, answers: { ...progress.answers, [exerciseId]: label } };
}

export function clearReviewAnswer(progress: ExerciseProgress, exerciseId: string): ExerciseProgress {
  const reviewAnswers = { ...progress.reviewAnswers };
  delete reviewAnswers[exerciseId];
  return { ...progress, reviewAnswers };
}

export function questionsForReview<T extends ExerciseDefinition>(exercises: T[], progress: ExerciseProgress) {
  return exercises.filter(item => progress.answers[item.id] && progress.answers[item.id] !== item.correctLabel);
}
