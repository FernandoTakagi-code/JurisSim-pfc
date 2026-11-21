// Lista explícita de lotes privados permitidos. Uma lista malformada não autoriza nenhum lote privado.
export function pilotBatchIds(prefix: string): string[] {
  if (process.env[`${prefix}_PILOT_ENABLED`] !== 'true') return [];
  const value = process.env[`${prefix}_PILOT_BATCH_IDS`]?.trim()
    || process.env[`${prefix}_PILOT_BATCH_ID`]?.trim();
  if (!value) return [];
  const ids = value.split(',').map(id => id.trim().toLowerCase());
  if (ids.length > 10 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))) return [];
  return [...new Set(ids)];
}
