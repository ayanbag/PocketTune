/** Shared domain types for PocketTune. */

export interface CoreCluster {
  /** e.g. "Cortex-A715" or "0xd4d" when unknown */
  name: string;
  count: number;
  maxMhz: number;
  cpuIds: number[];
}

export interface DeviceProfile {
  manufacturer: string;
  model: string;
  marketingName: string | null;
  soc: string;
  androidVersion: string;
  abi: string;
  features: string[];
  hasDotprod: boolean;
  hasI8mm: boolean;
  hasSve: boolean;
  hasSve2: boolean;
  hasSme: boolean;
  clusters: CoreCluster[];
  totalCores: number;
  bigCoreIds: number[];
  memTotalMb: number;
  /** which llama.rn prebuilt variant the runtime dispatch will pick */
  kernelPath: string;
}

export interface BatteryState {
  levelPct: number | null;
  temperatureC: number | null;
  charging: boolean | null;
  /** instantaneous draw in watts, when the kernel exposes it */
  watts: number | null;
}

export interface CatalogModel {
  id: string;
  name: string;
  quant: string;
  params: string;
  /** expected bytes for catalog entries; 0 = unknown until downloaded */
  sizeBytes: number;
  /** absent for sideloaded files — nothing to re-download from */
  url?: string;
  file: string;
  blurb?: string;
}

export type ModelSource = 'catalog' | 'custom' | 'sideloaded';

/** A model the registry knows about, wherever it came from. */
export interface ModelInfo extends CatalogModel {
  source: ModelSource;
}

export type ModelStatus = 'none' | 'downloading' | 'ready';

export interface ModelState {
  status: ModelStatus;
  /** 0..1 while downloading */
  progress: number;
  bytesWritten: number;
  path: string | null;
  error: string | null;
}

export interface TuneConfig {
  nThreads: number;
  flashAttn: 'auto' | 'on' | 'off';
  kvCache: 'f16' | 'q8_0';
}

export interface SweepPoint {
  config: TuneConfig;
  label: string;
  prefillTps: number;
  decodeTps: number;
  /** tokens per joule during decode, null when power rails unreadable */
  tokensPerJoule: number | null;
  watts: number | null;
  isBaseline: boolean;
}

export interface TuneRun {
  /** stable identity of this sweep — what "applied" points at */
  id: string;
  timestamp: string;
  modelId: string;
  modelFile: string;
  mode: 'quick' | 'full';
  points: SweepPoint[];
  best: SweepPoint;
  baseline: SweepPoint;
  decodeGain: number;
  prefillGain: number;
}

/**
 * A config the user applied, remembered per model. A sweep measures one model
 * on one phone, so its winner is only meaningful for that model — Qwen's best
 * thread count is not SmolLM2's.
 */
export interface AppliedConfig {
  config: TuneConfig;
  /** the sweep this came from, so a fresh sweep isn't shown as already applied */
  runId: string;
  at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** ISO timestamp when the message was committed */
  at?: string;
  /** decode tok/s reported by the engine for this reply */
  tps?: number;
  prefillTps?: number;
  /** tokens generated in this reply */
  tokens?: number;
  /** wall-clock generation time in ms */
  ms?: number;
}

/** A persisted conversation plus the context it was generated under. */
export interface ChatSession {
  id: string;
  startedAt: string;
  updatedAt: string;
  modelId: string;
  modelFile: string;
  /** engine config the session ran with; null = untuned defaults */
  config: TuneConfig | null;
  tuned: boolean;
  messages: ChatMessage[];
}
