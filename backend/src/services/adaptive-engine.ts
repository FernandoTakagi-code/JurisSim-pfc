import type { AdaptiveResult, AnsweredQuestion, Level, MetricType, PerformanceMetric } from '../types/diagnostic';

export function getLevel(percentage: number): Level {
  if (percentage <= 49) return 'BASICO';
  if (percentage <= 79) return 'INTERMEDIARIO';
  return 'AVANCADO';
}

function percentage(correctAnswers: number, totalQuestions: number): number {
  return Number(((correctAnswers / totalQuestions) * 100).toFixed(2));
}

function createMetric(metricType: MetricType, discipline: string, topic: string | null, difficulty: Level | null, questions: AnsweredQuestion[]): PerformanceMetric {
  const correctAnswers = questions.filter((question) => question.isCorrect).length;
  return { metricType, discipline, topic, difficulty, correctAnswers, totalQuestions: questions.length, percentage: percentage(correctAnswers, questions.length) };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  return items.reduce((groups, item) => {
    const groupKey = key(item);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), item]);
    return groups;
  }, new Map<string, T[]>());
}

function compareByWeakness(left: PerformanceMetric, right: PerformanceMetric): number {
  return left.percentage - right.percentage || left.discipline.localeCompare(right.discipline, 'pt-BR') || (left.topic ?? '').localeCompare(right.topic ?? '', 'pt-BR');
}

function recommendedQuantity(level: Level): number {
  if (level === 'BASICO') return 15;
  if (level === 'INTERMEDIARIO') return 10;
  return 5;
}

export function analyzeDiagnostic(questions: AnsweredQuestion[]): AdaptiveResult {
  if (questions.length === 0) throw new Error('Nao e possivel analisar um diagnostico sem respostas.');

  const disciplineMetrics = [...groupBy(questions, (question) => question.discipline)].map(([discipline, group]) => createMetric('DISCIPLINA', discipline, null, null, group));
  const topicMetrics = [...groupBy(questions, (question) => `${question.discipline}::${question.topic}`)].map(([key, group]) => {
    const [discipline, topic] = key.split('::');
    return createMetric('ASSUNTO', discipline, topic, null, group);
  });
  const difficultyMetrics = [...groupBy(questions, (question) => question.difficulty)].map(([difficulty, group]) => createMetric('NIVEL', 'TODAS', null, difficulty as Level, group));
  const topicAndDifficultyMetrics = [...groupBy(questions, (question) => `${question.discipline}::${question.topic}::${question.difficulty}`)].map(([key, group]) => {
    const [discipline, topic, difficulty] = key.split('::');
    return createMetric('ASSUNTO_E_NIVEL', discipline, topic, difficulty as Level, group);
  });

  const correctAnswers = questions.filter((question) => question.isCorrect).length;
  const overallPercentage = percentage(correctAnswers, questions.length);
  const weakestDiscipline = [...disciplineMetrics].sort(compareByWeakness)[0];
  const weakestTopic = [...topicMetrics].sort(compareByWeakness)[0];
  const focusTopic = weakestTopic?.discipline === weakestDiscipline.discipline ? weakestTopic : null;
  const focusPercentage = focusTopic?.percentage ?? weakestDiscipline.percentage;
  const focusDescription = focusTopic ? `${focusTopic.discipline} — ${focusTopic.topic}` : weakestDiscipline.discipline;
  const recommendedLevel = getLevel(focusPercentage);
  const reason = `Priorize ${focusDescription}: desempenho de ${focusPercentage}%.`;

  return {
    correctAnswers, totalQuestions: questions.length, overallPercentage, level: getLevel(overallPercentage),
    weakestDiscipline: weakestDiscipline.discipline, weakestTopic: focusTopic?.topic ?? null, recommendation: reason,
    trail: { priorityDiscipline: weakestDiscipline.discipline, priorityTopic: focusTopic?.topic ?? null, recommendedLevel, recommendedQuantity: recommendedQuantity(recommendedLevel), reason },
    performances: [...disciplineMetrics, ...topicMetrics, ...difficultyMetrics, ...topicAndDifficultyMetrics],
  };
}
