// Formátovanie časov pre UI. Meteorológia pracuje v UTC, lokálny čas je doplnkový.

const pad = (n: number) => String(n).padStart(2, "0");

/** "21.10. 09 UTC" – krátke označenie behu */
export function formatRun(d: Date): string {
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}. ${pad(d.getUTCHours())} UTC`;
}

/** "2026-10-21 12:00 UTC" */
export function formatUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** Vek dát v hodinách (zaokrúhlený nadol) */
export function ageHours(d: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - d.getTime()) / 3_600_000);
}
