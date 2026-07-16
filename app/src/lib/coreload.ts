/**
 * Live per-core load from PocketTune's own inference threads.
 *
 * The source is /proc/self/task — our own process. Self-proc stays readable
 * whatever SELinux thinks of system-wide /proc/stat or the battery rails the
 * Device tab has to report as unmeasurable, so this needs no native module and
 * no permission. Each thread's stat line carries CPU time (utime + stime, in
 * USER_HZ ticks) and field 39, the core it last ran on; summing per-thread
 * deltas by that core gives load per core attributable to *us*, never
 * system-wide use — which is exactly what the UI claims and no more.
 *
 * The attribution is an approximation: a thread that migrated mid-interval has
 * its whole delta charged to wherever it happened to land. llama.cpp's workers
 * stay put for the length of a config, so the error is small and self-corrects
 * on the next sample.
 *
 * Cost matters here because this polls *during* the benchmark it is watching.
 * One readDir plus one small read per thread every SAMPLE_MS is cheap, and it
 * lands on whatever core the scheduler picks for our JS/IO work — typically an
 * idle little core, not the big cores under measurement. Keep the cadence
 * identical across every config so it stays a constant offset rather than a
 * per-config bias.
 */
import { useEffect, useState } from 'react';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { parseThreadStat, ThreadTime } from './procstat';

/** Kernel USER_HZ on Android arm64 — stat CPU times are in these ticks. */
const USER_HZ = 100;
const TASK_DIR = '/proc/self/task';

/** 2.5 Hz: fast enough to read as live, coarse enough to stay cheap. */
export const SAMPLE_MS = 400;

/** Weight of each new sample in the EMA. */
const SMOOTHING = 0.5;

/** Load at or above this reads as "this core is working". */
export const BUSY = 0.5;

export { formatCpuRanges } from './procstat';

async function readThread(tid: string): Promise<ThreadTime | null> {
  try {
    return parseThreadStat(await RNFS.readFile(`${TASK_DIR}/${tid}/stat`, 'utf8'));
  } catch {
    // Threads come and go mid-sweep; a tid that vanished between readDir and
    // readFile is normal, not a failure.
    return null;
  }
}

export class CoreLoadSampler {
  private prev = new Map<string, number>();
  private prevAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sampling = false;
  private smooth: number[];

  constructor(
    private coreCount: number,
    private onSample: (load: number[], supported: boolean) => void,
  ) {
    this.smooth = new Array(coreCount).fill(0);
  }

  start(): void {
    // tick() swallows its own failures, so nothing can escape the interval.
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.tick();
      }, SAMPLE_MS);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    // A slow sample must never stack up behind the next tick.
    if (this.sampling) return;
    this.sampling = true;
    try {
      const entries = await RNFS.readDir(TASK_DIR);
      const samples = await Promise.all(
        entries.map(async e => [e.name, await readThread(e.name)] as const),
      );

      const now = Date.now();
      const elapsed = this.prevAt ? (now - this.prevAt) / 1000 : 0;
      const next = new Map<string, number>();
      const raw = new Array(this.coreCount).fill(0);
      let parsed = 0;

      for (const [tid, sample] of samples) {
        if (!sample) continue;
        parsed++;
        next.set(tid, sample.ticks);
        const before = this.prev.get(tid);
        if (before == null || elapsed <= 0) continue;
        const delta = sample.ticks - before;
        if (delta > 0 && sample.cpu >= 0 && sample.cpu < this.coreCount) {
          raw[sample.cpu] += delta / USER_HZ / elapsed;
        }
      }
      this.prev = next;
      this.prevAt = now;

      if (!parsed) {
        this.onSample(this.smooth, false);
        return;
      }
      // Raw scheduler placement flickers hard at this rate; unsmoothed tiles
      // read as broken rather than busy.
      for (let i = 0; i < this.coreCount; i++) {
        this.smooth[i] += (Math.min(1, raw[i]) - this.smooth[i]) * SMOOTHING;
      }
      this.onSample([...this.smooth], true);
    } catch {
      // readDir on /proc/self/task is the one call that could be denied.
      this.onSample(this.smooth, false);
    } finally {
      this.sampling = false;
    }
  }
}

export interface CoreLoadState {
  /** load 0..1 indexed by cpu id */
  load: number[];
  /** false once we know this kernel won't hand us per-thread stats */
  supported: boolean;
}

export function useCoreLoad(coreCount: number): CoreLoadState {
  const [state, setState] = useState<CoreLoadState>(() => ({
    load: new Array(coreCount).fill(0),
    supported: true,
  }));

  useEffect(() => {
    if (coreCount <= 0) return;
    const sampler = new CoreLoadSampler(coreCount, (load, supported) =>
      setState({ load, supported }),
    );
    sampler.start();
    return () => sampler.stop();
  }, [coreCount]);

  return state;
}
