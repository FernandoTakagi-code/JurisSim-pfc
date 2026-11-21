// Funções puras do filtro por período da Visão geral do ADMIN (as mesmas regras do backend).
export type GroupBy = "day" | "week" | "month";
export type SummaryPeriod = { from: string; to: string; groupBy: GroupBy };

const DAY_MS = 86_400_000;
const groupLabels: Record<GroupBy, string> = { day: "dia", week: "semana", month: "mês" };

const utc = (day: string) => { const [y, m, d] = day.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS) + 1;
const isDay = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function suggestGroupBy(from: string, to: string): GroupBy {
  const days = daysBetween(from, to);
  return days <= 62 ? "day" : days <= 366 ? "week" : "month";
}

export const dayDisabled = (from: string, to: string) => daysBetween(from, to) > 366;

/** Início do bucket que contém o dia (semana começa na segunda-feira, como o date_trunc do PostgreSQL). */
function bucketStart(day: string, groupBy: GroupBy): string {
  if (groupBy === "day") return day;
  if (groupBy === "month") return `${day.slice(0, 7)}-01`;
  const time = utc(day);
  const weekday = (new Date(time).getUTCDay() + 6) % 7;
  return iso(time - weekday * DAY_MS);
}

function nextBucket(bucket: string, groupBy: GroupBy): string {
  if (groupBy === "day") return iso(utc(bucket) + DAY_MS);
  if (groupBy === "week") return iso(utc(bucket) + 7 * DAY_MS);
  const [y, m] = bucket.split("-").map(Number);
  return iso(Date.UTC(y, m, 1));
}

/** Completa com zero os buckets sem registros, para o eixo dos gráficos ficar contínuo. */
export function fillBuckets<T extends object>(items: (T & { bucket: string })[], from: string, to: string, groupBy: GroupBy, zero: T): (T & { bucket: string })[] {
  const byBucket = new Map(items.map(item => [item.bucket, item]));
  const result: (T & { bucket: string })[] = [];
  for (let bucket = bucketStart(from, groupBy); bucket <= to; bucket = nextBucket(bucket, groupBy)) {
    result.push(byBucket.get(bucket) ?? { ...zero, bucket });
  }
  return result;
}

export function bucketLabel(bucket: string, groupBy: GroupBy): string {
  const [y, m, d] = bucket.split("-");
  return groupBy === "day" ? d : groupBy === "week" ? `${d}/${m}` : `${m}/${y.slice(2)}`;
}

export function readPeriodFromUrl(search: string): SummaryPeriod | null {
  const params = new URLSearchParams(search);
  const from = params.get("de"), to = params.get("ate"), groupBy = params.get("agrupar");
  if (!isDay(from) || !isDay(to) || (groupBy !== "day" && groupBy !== "week" && groupBy !== "month")) return null;
  return { from, to, groupBy };
}

export const periodSearch = (period: SummaryPeriod) =>
  `?${new URLSearchParams({ de: period.from, ate: period.to, agrupar: period.groupBy })}`;

export const summaryPath = (period: SummaryPeriod | null) =>
  "/institutions/admin/summary" + (period ? `?${new URLSearchParams({ from: period.from, to: period.to, groupBy: period.groupBy })}` : "");

const brDate = (day: string) => day.split("-").reverse().join("/");
export const periodTitle = (period: SummaryPeriod) => `${brDate(period.from)} a ${brDate(period.to)} · por ${groupLabels[period.groupBy]}`;
