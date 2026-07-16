/**
 * Arm CPU + device detection, entirely from JS.
 *
 * Everything comes from world-readable kernel interfaces (/proc/cpuinfo,
 * /sys/devices/system/cpu) plus React Native's Platform constants — no native
 * module needed. This is the same data the harness (harness/bench.py) records,
 * so app numbers and harness numbers describe the same silicon.
 */
import { Platform } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import type { CoreCluster, DeviceProfile } from '../types';

/** Arm Ltd. part numbers → core names (mobile cores, 2017+). */
const ARM_PARTS: Record<string, string> = {
  '0xd03': 'Cortex-A53',
  '0xd05': 'Cortex-A55',
  '0xd07': 'Cortex-A57',
  '0xd08': 'Cortex-A72',
  '0xd09': 'Cortex-A73',
  '0xd0a': 'Cortex-A75',
  '0xd0b': 'Cortex-A76',
  '0xd0d': 'Cortex-A77',
  '0xd41': 'Cortex-A78',
  '0xd44': 'Cortex-X1',
  '0xd46': 'Cortex-A510',
  '0xd47': 'Cortex-A710',
  '0xd48': 'Cortex-X2',
  '0xd4d': 'Cortex-A715',
  '0xd4e': 'Cortex-X3',
  '0xd80': 'Cortex-A520',
  '0xd81': 'Cortex-A720',
  '0xd82': 'Cortex-X4',
  '0xd85': 'Cortex-X925',
  '0xd87': 'Cortex-A725',
  '0xd88': 'Cortex-A520AE',
};

/** Marketing names for devices we can't derive a SoC string for. */
const KNOWN_DEVICES: Record<string, { name: string; soc: string }> = {
  A142: { name: 'Nothing Phone (2a)', soc: 'MediaTek Dimensity 7200 Pro' },
  'SM-A346E': { name: 'Samsung Galaxy A34 5G', soc: 'MediaTek Dimensity 1080' },
  'Pixel 7a': { name: 'Google Pixel 7a', soc: 'Google Tensor G2' },
  RMX1971: { name: 'Realme 5 Pro', soc: 'Qualcomm Snapdragon 710' },
};

/** Marketing name for a Platform model code, when we know it. */
export function knownDeviceName(model: string): string | null {
  return KNOWN_DEVICES[model]?.name ?? null;
}

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await RNFS.readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function readIntSafe(path: string): Promise<number | null> {
  const raw = await readFileSafe(path);
  if (raw == null) return null;
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function parseFeatures(cpuinfo: string): string[] {
  const m = cpuinfo.match(/^Features\s*:\s*(.+)$/m);
  return m ? m[1].trim().split(/\s+/) : [];
}

/** Map each processor index to its Arm part code. */
function parseParts(cpuinfo: string): Map<number, string> {
  const parts = new Map<number, string>();
  let current = -1;
  for (const line of cpuinfo.split('\n')) {
    const proc = line.match(/^processor\s*:\s*(\d+)/);
    if (proc) current = parseInt(proc[1], 10);
    const part = line.match(/^CPU part\s*:\s*(0x[0-9a-fA-F]+)/);
    if (part && current >= 0) parts.set(current, part[1].toLowerCase());
  }
  return parts;
}

export async function detectDevice(): Promise<DeviceProfile> {
  const cpuinfo = (await readFileSafe('/proc/cpuinfo')) ?? '';
  const features = parseFeatures(cpuinfo);
  const parts = parseParts(cpuinfo);

  // Per-core max frequency from cpufreq; offline cores read as null.
  const coreCount = Math.max(parts.size, 8);
  const freqs: (number | null)[] = [];
  for (let i = 0; i < coreCount; i++) {
    freqs.push(
      await readIntSafe(`/sys/devices/system/cpu/cpu${i}/cpufreq/cpuinfo_max_freq`),
    );
  }
  while (freqs.length && freqs[freqs.length - 1] == null) freqs.pop();

  // Group cores into clusters by (part, maxFreq).
  const clusterMap = new Map<string, CoreCluster>();
  for (let i = 0; i < freqs.length; i++) {
    const khz = freqs[i] ?? 0;
    const part = parts.get(i) ?? '?';
    const key = `${part}@${khz}`;
    const existing = clusterMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.cpuIds.push(i);
    } else {
      clusterMap.set(key, {
        name: ARM_PARTS[part] ?? (part === '?' ? 'Arm core' : part),
        count: 1,
        maxMhz: Math.round(khz / 1000),
        cpuIds: [i],
      });
    }
  }
  const clusters = [...clusterMap.values()].sort((a, b) => a.maxMhz - b.maxMhz);
  const maxMhz = clusters.length ? Math.max(...clusters.map(c => c.maxMhz)) : 0;
  const bigCoreIds = clusters.find(c => c.maxMhz === maxMhz)?.cpuIds ?? [];

  const meminfo = (await readFileSafe('/proc/meminfo')) ?? '';
  const memMatch = meminfo.match(/MemTotal:\s*(\d+)\s*kB/);
  const memTotalMb = memMatch ? Math.round(parseInt(memMatch[1], 10) / 1024) : 0;

  const constants = Platform.OS === 'android' ? (Platform.constants as any) : {};
  const model: string = constants.Model ?? 'Unknown';
  const manufacturer: string = constants.Manufacturer ?? '';
  const known = KNOWN_DEVICES[model];

  // SoC: MTK kernels expose a Hardware line; otherwise fall back to the map.
  const hw = cpuinfo.match(/^Hardware\s*:\s*(.+)$/m)?.[1]?.trim();
  const soc = known?.soc ?? hw ?? 'Arm SoC';

  const hasDotprod = features.includes('asimddp');
  const hasI8mm = features.includes('i8mm');

  // Mirror llama.rn's runtime dispatch order (see its CMake variants).
  const kernelPath = hasI8mm && hasDotprod
    ? 'v8.2 + dotprod + i8mm'
    : hasDotprod
      ? 'v8.2 + dotprod'
      : hasI8mm
        ? 'v8.2 + i8mm'
        : 'armv8 baseline';

  return {
    manufacturer,
    model,
    marketingName: known?.name ?? null,
    soc,
    androidVersion: String(constants.Release ?? ''),
    abi: 'arm64-v8a',
    features,
    hasDotprod,
    hasI8mm,
    hasSve: features.includes('sve'),
    hasSve2: features.includes('sve2'),
    hasSme: features.includes('sme') || features.includes('sme2'),
    clusters,
    totalCores: freqs.length,
    bigCoreIds,
    memTotalMb,
    kernelPath,
  };
}
