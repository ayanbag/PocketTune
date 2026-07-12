/**
 * The tuner: builds a sweep plan from the device profile, runs it through the
 * engine, scores the points, and persists applied config + history.
 *
 * Methodology mirrors the adb harness (harness/bench.py): fixed prefill/gen
 * token counts, repetitions, and the same summary shape — so in-app numbers
 * and published numbers are directly comparable.
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import type { DeviceProfile, SweepPoint, TuneConfig, TuneRun } from '../types';
import { bench, loadEngine } from './llama';
import { PowerSampler } from './battery';

const STATE_FILE = `${RNFS.DocumentDirectoryPath}/pockettune-state.json`;

/** llama.cpp's out-of-the-box default: 4 threads, no flash attention, f16 KV. */
export const BASELINE_CONFIG: TuneConfig = {
  nThreads: 4,
  flashAttn: 'off',
  kvCache: 'f16',
};

export function configLabel(c: TuneConfig): string {
  const fa = c.flashAttn === 'on' ? 'FA on' : c.flashAttn === 'off' ? 'FA off' : 'FA auto';
  const kv = c.kvCache === 'q8_0' ? ' · KV q8' : '';
  return `${c.nThreads} thr · ${fa}${kv}`;
}

function sameConfig(a: TuneConfig, b: TuneConfig): boolean {
  return a.nThreads === b.nThreads && a.flashAttn === b.flashAttn && a.kvCache === b.kvCache;
}

/**
 * Thread candidates derived from topology: the big cluster alone, big+mid,
 * and a near-full spread. Little-core-heavy counts lose on big.LITTLE — the
 * sweep proves it rather than assuming it.
 */
export function threadCandidates(profile: DeviceProfile): number[] {
  const big = Math.max(profile.bigCoreIds.length, 1);
  const total = Math.max(profile.totalCores, 4);
  const set = new Set<number>([2, big, big + 2, Math.min(6, total - 2), 4]);
  return [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
}

export function buildPlan(profile: DeviceProfile, mode: 'quick' | 'full'): TuneConfig[] {
  const threads = threadCandidates(profile);
  const plan: TuneConfig[] = [{ ...BASELINE_CONFIG }];
  for (const nThreads of threads) {
    plan.push({ nThreads, flashAttn: 'on', kvCache: 'f16' });
    if (mode === 'full') {
      plan.push({ nThreads, flashAttn: 'off', kvCache: 'f16' });
    }
  }
  if (mode === 'full') {
    // Quantized KV cache halves KV memory; measure what it costs (or saves).
    for (const nThreads of threads) {
      plan.push({ nThreads, flashAttn: 'on', kvCache: 'q8_0' });
    }
  }
  // De-duplicate against the baseline entry.
  return plan.filter(
    (c, i) => plan.findIndex(o => sameConfig(o, c)) === i,
  );
}

export interface SweepProgress {
  index: number;
  total: number;
  current: TuneConfig;
  points: SweepPoint[];
}

/**
 * Runs the plan point by point. Yields after every config so the UI can
 * animate results arriving. Bench sizes: quick 64/24×2, full 128/48×3.
 */
export async function* runSweep(
  modelPath: string,
  plan: TuneConfig[],
  mode: 'quick' | 'full',
): AsyncGenerator<SweepProgress> {
  const pp = mode === 'quick' ? 64 : 128;
  const tg = mode === 'quick' ? 24 : 48;
  const reps = mode === 'quick' ? 2 : 3;
  const points: SweepPoint[] = [];

  for (let i = 0; i < plan.length; i++) {
    const config = plan[i];
    yield { index: i, total: plan.length, current: config, points: [...points] };

    await loadEngine(modelPath, config);
    const sampler = new PowerSampler();
    sampler.start();
    const result = await bench(pp, tg, reps);
    const power = sampler.stop();

    const tokensPerJoule =
      power.watts != null && result.decodeTps > 0
        ? result.decodeTps / power.watts
        : null;

    points.push({
      config,
      label: configLabel(config),
      prefillTps: result.prefillTps,
      decodeTps: result.decodeTps,
      watts: power.watts,
      tokensPerJoule,
      isBaseline: sameConfig(config, BASELINE_CONFIG),
    });
    yield { index: i + 1, total: plan.length, current: config, points: [...points] };
  }
}

/** Score balances decode (what chat feels like) over prefill (TTFT). */
export function scorePoint(p: SweepPoint, maxTg: number, maxPp: number): number {
  const tg = maxTg > 0 ? p.decodeTps / maxTg : 0;
  const pp = maxPp > 0 ? p.prefillTps / maxPp : 0;
  return 0.65 * tg + 0.35 * pp;
}

export function finishRun(
  points: SweepPoint[],
  modelId: string,
  modelFile: string,
  mode: 'quick' | 'full',
): TuneRun {
  const maxTg = Math.max(...points.map(p => p.decodeTps));
  const maxPp = Math.max(...points.map(p => p.prefillTps));
  const best = [...points].sort(
    (a, b) => scorePoint(b, maxTg, maxPp) - scorePoint(a, maxTg, maxPp),
  )[0];
  const baseline = points.find(p => p.isBaseline) ?? points[0];
  return {
    timestamp: new Date().toISOString(),
    modelId,
    modelFile,
    mode,
    points,
    best,
    baseline,
    decodeGain: baseline.decodeTps > 0 ? best.decodeTps / baseline.decodeTps : 1,
    prefillGain: baseline.prefillTps > 0 ? best.prefillTps / baseline.prefillTps : 1,
  };
}

// ---------------------------------------------------------------- persistence

interface PersistedState {
  appliedConfig: TuneConfig | null;
  appliedModelId: string | null;
  history: TuneRun[];
}

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await RNFS.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      appliedConfig: parsed.appliedConfig ?? null,
      appliedModelId: parsed.appliedModelId ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return { appliedConfig: null, appliedModelId: null, history: [] };
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  try {
    await RNFS.writeFile(STATE_FILE, JSON.stringify(state), 'utf8');
  } catch {
    // persistence is best-effort; never crash the app for it
  }
}
