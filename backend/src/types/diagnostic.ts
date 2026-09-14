export type Level = 'BASICO' | 'INTERMEDIARIO' | 'AVANCADO';
export type MetricType = 'DISCIPLINA' | 'ASSUNTO' | 'NIVEL' | 'ASSUNTO_E_NIVEL';

export interface AnsweredQuestion {
  discipline: string;
  topic: string;
  difficulty: Level;
  isCorrect: boolean;
}

export interface PerformanceMetric {
  metricType: MetricType;
  discipline: string;
  topic: string | null;
  difficulty: Level | null;
  correctAnswers: number;
  totalQuestions: number;
  percentage: number;
}

export interface AdaptiveResult {
  correctAnswers: number;
  totalQuestions: number;
  overallPercentage: number;
  level: Level;
  weakestDiscipline: string;
  weakestTopic: string | null;
  recommendation: string;
  trail: {
    priorityDiscipline: string;
    priorityTopic: string | null;
    recommendedLevel: Level;
    recommendedQuantity: number;
    reason: string;
  };
  performances: PerformanceMetric[];
}

export interface TrailFilter {
  disciplina: string;
  assunto: string | null;
  nivel: Level | null;
}