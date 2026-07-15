/**
 * Device-aware model recommendation.
 *
 * Heuristics, honestly labeled as such in the UI: RAM headroom decides what
 * fits (weights are mmap'd but the KV cache, app, and OS still need room),
 * the ISA decides which quant hits the fast kernels (Q4_0 repacks into
 * i8mm/dotprod layouts at load), and the parameter count sets the speed
 * expectation for the core class. The Tune sweep is the ground truth — this
 * just picks a sensible starting point.
 */
import type { DeviceProfile, ModelInfo } from '../types';

export type FitLevel = 'great' | 'ok' | 'tight' | 'too-big';

export interface ModelFit {
  level: FitLevel;
  /** short human reason, shown on the model row */
  reason: string;
  score: number;
}

function paramsB(m: ModelInfo): number | null {
  const n = parseFloat(m.params);
  return Number.isFinite(n) ? n : null;
}

export function assessFit(m: ModelInfo, profile: DeviceProfile | null): ModelFit {
  if (!profile) {
    return { level: 'ok', reason: 'Device profile unavailable', score: 0 };
  }
  const memGb = profile.memTotalMb / 1024;
  const sizeGb = m.sizeBytes > 0 ? m.sizeBytes / 1e9 : null;

  if (sizeGb != null && sizeGb > memGb * 0.5) {
    return {
      level: 'too-big',
      reason: `${sizeGb.toFixed(1)} GB weights on a ${memGb.toFixed(0)} GB phone — no room left for the KV cache`,
      score: -100,
    };
  }

  let score = 0;
  const why: string[] = [];

  if (m.quant === 'Q4_0') {
    if (profile.hasI8mm) {
      score += 3;
      why.push('Q4_0 repacks into i8mm kernels here');
    } else if (profile.hasDotprod) {
      score += 2;
      why.push('Q4_0 repacks onto dotprod kernels here');
    }
  } else if (m.quant.startsWith('Q8')) {
    score += 1;
    why.push('8-bit quality');
  }

  const b = paramsB(m);
  // Params budget by RAM class: what decodes at a comfortable reading pace.
  const budget = memGb >= 10 ? 3.5 : memGb >= 6 ? 2 : 1.3;
  if (b != null) {
    if (b <= budget) {
      // Proportional, not flat: within budget, the largest (most capable)
      // model wins — a 12 GB phone should get 3B, not the same 1B a 4 GB
      // phone gets.
      score += 2 * (b / budget);
    } else {
      score -= 1;
      why.push(`${b.toFixed(1)}B params will decode slowly on this CPU`);
    }
    // Capability still matters — an over-tiny model wastes the silicon.
    if (b >= 1 && b <= budget) score += 1;
  }

  let level: FitLevel = 'ok';
  if (sizeGb != null && sizeGb > memGb * 0.35) {
    level = 'tight';
    why.unshift('leaves little RAM headroom');
    score -= 1;
  } else if (score >= 4) {
    level = 'great';
  }

  return {
    level,
    reason: why.length ? why.join(' · ') : 'Fits comfortably in memory',
    score,
  };
}

/** The single best starting model for this phone, or null when nothing fits. */
export function pickRecommended(
  list: ModelInfo[],
  profile: DeviceProfile | null,
): ModelInfo | null {
  let best: ModelInfo | null = null;
  let bestScore = -Infinity;
  for (const m of list) {
    const fit = assessFit(m, profile);
    if (fit.level === 'too-big') continue;
    if (fit.score > bestScore) {
      bestScore = fit.score;
      best = m;
    }
  }
  return best;
}
