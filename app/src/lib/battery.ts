/**
 * Battery + power readings, layered by trustworthiness:
 *
 * 1. sysfs power_supply rails — the only source of instantaneous current, so
 *    tokens-per-joule depends on it. The node is probed (battery/bms/vendor
 *    names differ) instead of hardcoding /battery, and the result is cached.
 * 2. react-native-device-info (official BatteryManager API) — fallback for
 *    level/charging on devices whose SELinux policy hides sysfs from apps.
 * 3. Thermal zones — fallback for temperature when the battery node has none.
 *
 * Everything still degrades to null; the UI says "restricted" rather than
 * showing a blank.
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import type { BatteryState } from '../types';

// Optional native module: keep the app alive if the prebuilt isn't linked yet
// (e.g. metro reload before the next gradle build).
let DeviceInfo: {
  getBatteryLevel: () => Promise<number>;
  getPowerState: () => Promise<{ batteryState?: string }>;
} | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DeviceInfo = require('react-native-device-info').default;
} catch {
  DeviceInfo = null;
}

const PS_ROOT = '/sys/class/power_supply';

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

/** Probed once; null = no readable battery node on this device. */
let batteryBase: string | null | undefined;

async function findBatteryBase(): Promise<string | null> {
  if (batteryBase !== undefined) return batteryBase;
  // Fast path: the common names, cheapest check first.
  for (const name of ['battery', 'bms', 'Battery']) {
    if ((await readNum(`${PS_ROOT}/${name}/capacity`)) != null) {
      batteryBase = `${PS_ROOT}/${name}`;
      return batteryBase;
    }
  }
  // Slow path: enumerate and match type == "Battery".
  try {
    const entries = await RNFS.readDir(PS_ROOT);
    for (const e of entries) {
      if ((await readStr(`${e.path}/type`)) === 'Battery') {
        batteryBase = e.path;
        return batteryBase;
      }
    }
  } catch {
    // listing denied
  }
  batteryBase = null;
  return null;
}

/** Probed once; null = no battery-labeled thermal zone. */
let thermalZone: string | null | undefined;

async function findBatteryThermalZone(): Promise<string | null> {
  if (thermalZone !== undefined) return thermalZone;
  try {
    const entries = await RNFS.readDir('/sys/class/thermal');
    for (const e of entries) {
      if (!/^thermal_zone\d+$/.test(e.name)) continue;
      const zoneType = await readStr(`${e.path}/type`);
      if (zoneType && /batt/i.test(zoneType)) {
        thermalZone = `${e.path}/temp`;
        return thermalZone;
      }
    }
  } catch {
    // listing denied
  }
  thermalZone = null;
  return null;
}

/**
 * Instantaneous battery draw in watts.
 * current_now is µA on most kernels but mA on some MTK ones; values under
 * 20000 are assumed mA. Sign conventions differ per vendor, so use |I|.
 */
export async function readWatts(): Promise<number | null> {
  const base = await findBatteryBase();
  if (!base) return null;
  const [currentRaw, voltageRaw] = await Promise.all([
    readNum(`${base}/current_now`),
    readNum(`${base}/voltage_now`),
  ]);
  if (currentRaw == null || voltageRaw == null) return null;
  const amps = Math.abs(currentRaw) < 20000
    ? Math.abs(currentRaw) / 1e3
    : Math.abs(currentRaw) / 1e6;
  const volts = voltageRaw > 1e5 ? voltageRaw / 1e6 : voltageRaw / 1e3;
  const watts = amps * volts;
  return watts > 0 && watts < 50 ? watts : null;
}

async function readTempC(base: string | null): Promise<number | null> {
  // Battery node reports deci-°C.
  if (base) {
    const t = await readNum(`${base}/temp`);
    if (t != null && t > -300 && t < 900) return t / 10;
  }
  // Thermal zones report milli-°C.
  const zone = await findBatteryThermalZone();
  if (zone) {
    const t = await readNum(zone);
    if (t != null && t > -30000 && t < 90000) return t / 1000;
  }
  return null;
}

async function apiLevelPct(): Promise<number | null> {
  if (!DeviceInfo) return null;
  try {
    const level = await DeviceInfo.getBatteryLevel();
    return level >= 0 && level <= 1 ? Math.round(level * 100) : null;
  } catch {
    return null;
  }
}

async function apiCharging(): Promise<boolean | null> {
  if (!DeviceInfo) return null;
  try {
    const state = (await DeviceInfo.getPowerState()).batteryState;
    if (state === 'charging' || state === 'full') return true;
    if (state === 'unplugged') return false;
    return null;
  } catch {
    return null;
  }
}

export async function readBattery(): Promise<BatteryState> {
  const base = await findBatteryBase();
  const [level, temp, status, watts] = await Promise.all([
    base ? readNum(`${base}/capacity`) : Promise.resolve(null),
    readTempC(base),
    base ? readStr(`${base}/status`) : Promise.resolve(null),
    readWatts(),
  ]);
  return {
    levelPct: level ?? (await apiLevelPct()),
    temperatureC: temp,
    charging:
      status != null ? status.toLowerCase() === 'charging' : await apiCharging(),
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
