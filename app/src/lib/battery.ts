/**
 * Battery + power readings, layered by trustworthiness:
 *
 * 1. PocketTunePower (our ~40-line Kotlin module) — instantaneous current via
 *    the official BatteryManager API, the only channel SELinux leaves open to
 *    apps. Tokens-per-joule depends on this on modern Android.
 * 2. sysfs power_supply rails — fallback for current on devices that still
 *    expose the node, and the source for temperature. Probed (battery/bms/
 *    vendor names differ) instead of hardcoding /battery, result cached.
 * 3. react-native-device-info (level/charging) and thermal zones (temp) —
 *    fallbacks when sysfs is hidden.
 *
 * Everything still degrades to null; the UI says "restricted" rather than
 * showing a blank.
 */
import { NativeModules } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import type { BatteryState } from '../types';

/** Our own PowerModule.kt; absent on a stale build that predates it. */
const Power: { read: () => Promise<{ currentUa: number | null; voltageMv: number | null }> } | null =
  NativeModules.PocketTunePower ?? null;

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
 * Current is µA per the docs (and most kernels) but mA on some MTK devices;
 * values under 20000 are assumed mA. Sign conventions differ per vendor
 * (negative usually means discharging), so use |I|.
 */
function toWatts(currentRaw: number, volts: number): number | null {
  const amps =
    Math.abs(currentRaw) < 20000
      ? Math.abs(currentRaw) / 1e3
      : Math.abs(currentRaw) / 1e6;
  const watts = amps * volts;
  return watts > 0 && watts < 50 ? watts : null;
}

/** Instantaneous draw via the official BatteryManager API (PowerModule.kt). */
async function apiWatts(): Promise<number | null> {
  if (!Power) return null;
  try {
    const r = await Power.read();
    if (r?.currentUa == null || r?.voltageMv == null) return null;
    return toWatts(r.currentUa, r.voltageMv / 1e3);
  } catch {
    return null;
  }
}

/** Instantaneous battery draw in watts: BatteryManager first, sysfs fallback. */
export async function readWatts(): Promise<number | null> {
  const api = await apiWatts();
  if (api != null) return api;
  const base = await findBatteryBase();
  if (!base) return null;
  const [currentRaw, voltageRaw] = await Promise.all([
    readNum(`${base}/current_now`),
    readNum(`${base}/voltage_now`),
  ]);
  if (currentRaw == null || voltageRaw == null) return null;
  const volts = voltageRaw > 1e5 ? voltageRaw / 1e6 : voltageRaw / 1e3;
  return toWatts(currentRaw, volts);
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
