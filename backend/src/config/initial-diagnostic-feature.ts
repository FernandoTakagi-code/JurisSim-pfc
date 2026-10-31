/** Controls whether students without the initial assessment are restricted. */
export function isInitialDiagnosticRequired(): boolean {
  return process.env.INITIAL_DIAGNOSTIC_REQUIRED?.trim().toLowerCase() === 'true';
}
