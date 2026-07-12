/**
 * Battery + power readings from sysfs.
 *
 * PocketTune's differentiator is treating tokens-per-joule as first-class.
 * Power comes from /sys/class/power_supply/battery current/voltage rails,
 * which most Android kernels expose world-readable. Everything degrades to
 * null gracefully — some devices hide these nodes.
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import type { BatteryState } from '../types';

const BASE = '/sys/class/power_supply/battery';

async function readNum(path: string): Promise<number | null> {
  try {
    const raw = await RNFS.readFile(path, 'utf8');
    const n = parseInt(raw.trim(), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function readStr(path: string): Promise<string | null> {
  try {
    return (await RNFS.readFile(path, 'utf8')).trim();
  } catch {
    return null;
  }
}

/**
 * Instantaneous battery draw in watts.
 * current_now is µA on most kernels but mA on some MTK ones; values under
 * 20000 are assumed mA. Sign conventions differ per vendor, so use |I|.
 */
export async function readWatts(): Promise<number | null> {
  const [currentRaw, voltageRaw] = await Promise.all([
    readNum(`${BASE}/current_now`),
    readNum(`${BASE}/voltage_now`),
  ]);
  if (currentRaw == null || voltageRaw == null) return null;
  const amps = Math.abs(currentRaw) < 20000
    ? Math.abs(currentRaw) / 1e3
    : Math.abs(currentRaw) / 1e6;
  const volts = voltageRaw > 1e5 ? voltageRaw / 1e6 : voltageRaw / 1e3;
  const watts = amps * volts;
  return watts > 0 && watts < 50 ? watts : null;
}

export async function readBattery(): Promise<BatteryState> {
  const [level, temp, status, watts] = await Promise.all([
    readNum(`${BASE}/capacity`),
    readNum(`${BASE}/temp`),
    readStr(`${BASE}/status`),
    readWatts(),
  ]);
  return {
    levelPct: level,
    temperatureC: temp != null ? temp / 10 : null,
    charging: status != null ? status.toLowerCase() === 'charging' : null,
    watts,
  };
}

/**
 * Samples power draw on an interval until stopped; used to compute the
 * energy cost of a benchmark window.
 */
export class PowerSampler {
  private samples: number[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  start(intervalMs = 400): void {
    this.samples = [];
    this.startedAt = Date.now();
    this.timer = setInterval(async () => {
      const w = await readWatts();
      if (w != null) this.samples.push(w);
    }, intervalMs);
  }

  /** @returns average watts over the window, or null if the rail is unreadable */
  stop(): { watts: number | null; seconds: number } {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const seconds = (Date.now() - this.startedAt) / 1000;
    if (!this.samples.length) return { watts: null, seconds };
    const watts = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    return { watts, seconds };
  }
}
