/**
 * Pure parsing of Linux /proc stat lines. Deliberately dependency-free: the
 * field offsets below are the one part of the core-load feature that can be
 * silently wrong — a bad index yields plausible numbers rather than an error —
 * so this module must stay runnable outside React Native to be checkable
 * against real /proc output.
 */

/**
 * Field indices *after* the comm field. comm is parenthesised and may itself
 * contain spaces or ')' (thread names are attacker-ish data: "Binder:1_2",
 * "(anon)"), so everything is counted from the LAST ')': the first token after
 * it is field 3 (state), hence `field N → index N - 3`.
 */
const F_UTIME = 11; // field 14
const F_STIME = 12; // field 15
const F_PROCESSOR = 36; // field 39

export interface ThreadTime {
  /** utime + stime, in USER_HZ ticks */
  ticks: number;
  /** field 39: the core this thread last ran on */
  cpu: number;
}

export function parseThreadStat(raw: string): ThreadTime | null {
  const close = raw.lastIndexOf(')');
  if (close < 0) return null;
  const f = raw.slice(close + 1).trim().split(/\s+/);
  const ticks = Number(f[F_UTIME]) + Number(f[F_STIME]);
  const cpu = Number(f[F_PROCESSOR]);
  if (!Number.isFinite(ticks) || !Number.isFinite(cpu)) return null;
  return { ticks, cpu };
}

/** Compact cpu list for prose: [0, 1, 6, 7] → "cpu0–1, 6–7". */
export function formatCpuRanges(cpus: number[]): string {
  const sorted = [...cpus].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j + 1;
  }
  return `cpu${parts.join(', ')}`;
}
