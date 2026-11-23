import { ApiError } from '../../errors/api-error';

export type GroupBy = 'day' | 'week' | 'month';
export type SummaryPeriod = { from: string; to: string; groupBy: GroupBy; startUtc: Date; endUtcExclusive: Date };

const TIME_ZONE = 'America/Sao_Paulo';
const MIN_DAY = '2000-01-01';
const DAY_LIMIT = 366;
const WEEK_LIMIT = 366;
const DAY_SUGGESTION_LIMIT = 62;
const DAY_MS = 86_400_000;

function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Data (AAAA-MM-DD) do instante informado no fuso de São Paulo. */
function saoPauloDay(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Diferença em minutos entre o horário de São Paulo e UTC no instante informado. */
function offsetMinutes(instant: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(instant).map(p => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Instante UTC da meia-noite do dia informado em São Paulo (considera o horário de verão histórico). */
export function saoPauloDayStartUtc(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d);
  let guess = naive - offsetMinutes(new Date(naive)) * 60_000;
  guess = naive - offsetMinutes(new Date(guess)) * 60_000;
  return new Date(guess);
}

function daysBetween(from: string, to: string) {
  const [a, b] = [from, to].map(day => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / DAY_MS) + 1;
}

function nextDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Interpreta o período do resumo administrativo. Sem from/to, retorna null (comportamento atual). */
export function parseSummaryPeriod(query: Record<string, unknown>, now = new Date()): SummaryPeriod | null {
  const { from, to, groupBy } = query;
  if (from === undefined && to === undefined) return null;
  if (!isDay(from) || !isDay(to)) throw new ApiError(400, 'Informe as datas inicial e final no formato AAAA-MM-DD.');
  if (from < MIN_DAY) throw new ApiError(400, 'A data inicial deve ser a partir de 01/01/2000.');
  if (from > to) throw new ApiError(400, 'A data inicial deve ser anterior ou igual à data final.');
  if (to > saoPauloDay(now)) throw new ApiError(400, 'A data final não pode estar no futuro.');
  const days = daysBetween(from, to);
  if (groupBy !== undefined && groupBy !== 'day' && groupBy !== 'week' && groupBy !== 'month') {
    throw new ApiError(400, 'Agrupamento inválido. Use dia, semana ou mês.');
  }
  const resolved: GroupBy = groupBy ?? (days <= DAY_SUGGESTION_LIMIT ? 'day' : days <= WEEK_LIMIT ? 'week' : 'month');
  if (resolved === 'day' && days > DAY_LIMIT) throw new ApiError(400, 'Para períodos acima de 1 ano, agrupe por semana ou mês.');
  return { from, to, groupBy: resolved, startUtc: saoPauloDayStartUtc(from), endUtcExclusive: saoPauloDayStartUtc(nextDay(to)) };
}
