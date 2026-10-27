import { apiRequest } from "./api";

export type InitialDiagnosticStatus = "IN_PROGRESS" | "COMPLETED";
export type InitialDiagnosticLevel = "BASICO" | "INTERMEDIARIO" | "AVANCADO";
export type InitialDiagnosticOrigin = "IA" | "OAB_OFICIAL";
export type InitialDiagnosticLetter = "A" | "B" | "C" | "D";

export type InitialDiagnosticShortage = {
  discipline: string;
  level: InitialDiagnosticLevel;
  origin: InitialDiagnosticOrigin;
  required: number;
  available: number;
};

export type InitialDiagnosticStartResponse = {
  attemptId: string;
  status: InitialDiagnosticStatus;
  created: boolean;
};

export type InitialDiagnosticQuestionResponse = {
  id: string;
  position: number;
  statement: string;
  discipline: string;
  topic: string;
  difficulty: InitialDiagnosticLevel;
  alternatives: { id: string; letter: InitialDiagnosticLetter; text: string }[];
  selectedOptionId: string | null;
};

export type InitialDiagnosticQuestionsResponse = { questions: InitialDiagnosticQuestionResponse[] };
export type InitialDiagnosticAnswer = { questionId: string; selectedOptionId: string; respondedAt: string | null };
export type InitialDiagnosticAnswersResponse = { attemptId: string; answered: number; total: 30; answers: InitialDiagnosticAnswer[] };
export type InitialDiagnosticSavedAnswerResponse = { questionId: string; selectedOptionId: string | null; respondedAt: string | null };

export type InitialDiagnosticPerformance = {
  id: string;
  tipo: "DISCIPLINA" | "ASSUNTO" | "NIVEL" | "ASSUNTO_E_NIVEL";
  disciplina: string;
  assunto: string | null;
  nivel: InitialDiagnosticLevel | null;
  acertos: number;
  totalQuestoes: number;
  percentual: number;
};

export type InitialDiagnosticResult = {
  id: string;
  finalizedAt: string;
  correctAnswers: number;
  totalQuestions: number;
  answeredQuestions: number;
  incorrectAnswers: number;
  unansweredQuestions: number;
  overallPercentage: number;
  level: InitialDiagnosticLevel;
  weakestDiscipline: string;
  weakestTopic: string | null;
  recommendation: string;
  performances: InitialDiagnosticPerformance[];
  trail: {
    id: string;
    disciplinaPrioritaria: string;
    assuntoPrioritario: string | null;
    nivelRecomendado: InitialDiagnosticLevel;
    quantidadeRecomendada: number;
    justificativa: string;
  };
};

export const initialDiagnosticUiEnabled =
  import.meta.env.VITE_INITIAL_DIAGNOSTIC_UI_ENABLED?.trim().toLowerCase() === "true";

export function startOrRecoverInitialDiagnostic() {
  return apiRequest<InitialDiagnosticStartResponse>("/initial-diagnostic", { method: "POST", body: "{}" });
}

export function getInitialDiagnosticQuestions(attemptId: string) {
  return apiRequest<InitialDiagnosticQuestionsResponse>(`/initial-diagnostic/${encodeURIComponent(attemptId)}/questions`);
}

export function getInitialDiagnosticAnswers(attemptId: string) {
  return apiRequest<InitialDiagnosticAnswersResponse>(`/initial-diagnostic/${encodeURIComponent(attemptId)}/answers`);
}

export function saveInitialDiagnosticAnswer(attemptId: string, questionId: string, selectedOptionId: string) {
  return apiRequest<InitialDiagnosticSavedAnswerResponse>(
    `/initial-diagnostic/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(questionId)}`,
    { method: "PUT", body: JSON.stringify({ selectedOptionId }) },
  );
}

export function finalizeInitialDiagnostic(attemptId: string) {
  return apiRequest<InitialDiagnosticResult>(`/initial-diagnostic/${encodeURIComponent(attemptId)}/finalize`, { method: "POST" });
}

export function getInitialDiagnosticResult(attemptId: string) {
  return apiRequest<InitialDiagnosticResult>(`/initial-diagnostic/${encodeURIComponent(attemptId)}/result`);
}
