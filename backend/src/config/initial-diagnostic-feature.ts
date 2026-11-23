/** Controla se alunos sem a avaliação inicial ficam restritos. */
export function isInitialDiagnosticRequired(): boolean {
  return process.env.INITIAL_DIAGNOSTIC_REQUIRED?.trim().toLowerCase() === 'true';
}
