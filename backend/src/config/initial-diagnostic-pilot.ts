import { parseInitialDiagnosticCompositionMode } from '../services/initial-diagnostic-composition';

export function initialDiagnosticPilotBatchId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.INITIAL_DIAGNOSTIC_PILOT_ENABLED?.trim().toLowerCase() !== 'true') return undefined;
  const batchId = env.INITIAL_DIAGNOSTIC_PILOT_BATCH_ID?.trim();
  if (parseInitialDiagnosticCompositionMode(env.INITIAL_DIAGNOSTIC_COMPOSITION_MODE) !== 'AUTORAL_30'
    || !batchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId)) {
    throw new Error('Piloto exige AUTORAL_30 e um identificador de lote válido.');
  }
  return batchId;
}
