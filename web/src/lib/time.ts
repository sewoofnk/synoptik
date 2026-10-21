// Formátovanie časov pre UI. Meteorológia pracuje v UTC, lokálny čas je doplnkový.

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];

/** "21.10. 09 UTC" – krátke označenie behu */
export function formatRun(d: Date): string {
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}. ${pad(d.getUTCHours())} UTC`;
}

/** "2026-10-21 12:00 UTC" */
export function formatUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** "St 22.10. 12:00 UTC" */
export function formatValidUtc(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}. ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** "St 14:00" v lokálnom čase prehliadača */
export function formatLocal(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "St 22.10." – UTC deň (pre značky na časovej osi) */
export function formatDayUtc(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}

/** Predstih predpovede v hodinách, napr. "+30 h" */
export function formatLead(valid: Date, run: Date): string {
  return `+${Math.round((valid.getTime() - run.getTime()) / 3_600_000)} h`;
}

/** Vek dát v hodinách (zaokrúhlený nadol) */
export function ageHours(d: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - d.getTime()) / 3_600_000);
}
