/**
 * Thin, serialized wrapper around llama.rn.
 *
 * One llama context lives at a time (phones don't have RAM for two), and all
 * engine operations are funneled through a queue so a mid-benchmark tab
 * switch can never interleave native calls.
 */
import { initLlama, LlamaContext, toggleNativeLog } from 'llama.rn';
import type { ChatMessage, TuneConfig } from '../types';

toggleNativeLog(false).catch(() => {});

export interface BenchNumbers {
  prefillTps: number;
  decodeTps: number;
}

export interface CompletionStats {
  text: string;
  decodeTps: number;
  prefillTps: number;
  /** tokens generated */
  tokens: number;
  /** decode wall time in ms */
  ms: number;
}

let context: LlamaContext | null = null;
let contextKey: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(op: () => Promise<T>): Promise<T> {
  const next = queue.then(op, op);
  queue = next.catch(() => {});
  return next;
}

function keyFor(modelPath: string, cfg: TuneConfig): string {
  return `${modelPath}|${cfg.nThreads}|${cfg.flashAttn}|${cfg.kvCache}`;
}

async function initContext(modelPath: string, cfg: TuneConfig): Promise<LlamaContext> {
  // Quantized V-cache requires flash attention in llama.cpp.
  const flashAttn = cfg.kvCache === 'q8_0' ? 'on' : cfg.flashAttn;
  return initLlama({
    model: modelPath,
    n_ctx: 2048,
    n_batch: 512,
    n_threads: cfg.nThreads,
    flash_attn_type: flashAttn,
    cache_type_k: cfg.kvCache,
    cache_type_v: cfg.kvCache,
    use_mlock: false,
    use_mmap: true,
    n_gpu_layers: 0,
  });
}

/** Loads (or reuses) a context for the given model + config. */
export function loadEngine(modelPath: string, cfg: TuneConfig): Promise<void> {
  return serialize(async () => {
    const key = keyFor(modelPath, cfg);
    if (context && contextKey === key) return;
    if (context) {
      await context.release().catch(() => {});
      context = null;
      contextKey = null;
    }
    context = await initContext(modelPath, cfg);
    contextKey = key;
  });
}

export function releaseEngine(): Promise<void> {
  return serialize(async () => {
    if (context) {
      await context.release().catch(() => {});
      context = null;
      contextKey = null;
    }
  });
}

export function isLoaded(): boolean {
  return context != null;
}

/** llama-bench-style measurement on the live context. */
export function bench(pp: number, tg: number, reps: number): Promise<BenchNumbers> {
  return serialize(async () => {
    if (!context) throw new Error('Engine not loaded');
    const r = await context.bench(pp, tg, 1, reps);
    return { prefillTps: r.speedPp, decodeTps: r.speedTg };
  });
}

export interface StreamHandle {
  promise: Promise<CompletionStats>;
  stop: () => void;
}

const SYSTEM_PROMPT =
  'You are PocketTune, a helpful assistant running fully on-device on this ' +
  "phone's Arm CPU — no network, no cloud. Be concise and friendly. " +
  'Format answers in Markdown. Always put code in a fenced block with its ' +
  'language tag (```python), and use `backticks` for file names, commands and ' +
  'identifiers inline.';

export function chat(
  history: ChatMessage[],
  onToken: (accumulated: string) => void,
): StreamHandle {
  const ctx = context;
  if (!ctx) {
    return {
      promise: Promise.reject(new Error('Engine not loaded')),
      stop: () => {},
    };
  }
  let acc = '';
  const promise = serialize(async () => {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...history.map(m => ({ role: m.role, content: m.text })),
    ];
    const result = await ctx.completion(
      {
        messages,
        n_predict: 512,
        temperature: 0.7,
        top_p: 0.9,
      },
      data => {
        if (data.token) {
          acc += data.token;
          onToken(acc);
        }
      },
    );
    const t = result.timings;
    return {
      text: result.text || acc,
      decodeTps: t?.predicted_per_second ?? 0,
      prefillTps: t?.prompt_per_second ?? 0,
      tokens: t?.predicted_n ?? 0,
      ms: t?.predicted_ms ?? 0,
    };
  });
  return {
    promise,
    stop: () => {
      // Do not simplify this to `ctx.stopCompletion().catch(...)`. llama.rn
      // types stopCompletion as Promise<void>, but unlike its siblings it is
      // not declared `async`, so it hands back its JSI binding's return value
      // unchanged — and that binding ends in `jsi::Value::undefined()`.
      // Calling .catch() on undefined throws TypeError synchronously, inside
      // the stop button's onPress, which closes a release build outright.
      // Promise.resolve absorbs either shape if llama.rn ever adds `async`.
      try {
        Promise.resolve(ctx.stopCompletion()).catch(() => {});
      } catch {
        // The same binding throws "Context not found" synchronously once its
        // context is gone, and this closure captured ctx at chat() time — a
        // model switch mid-stream releases it out from under us. Nothing left
        // to interrupt, so there is nothing to report either.
      }
    },
  };
}
