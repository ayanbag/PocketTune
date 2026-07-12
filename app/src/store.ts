/**
 * App-wide state (zustand). All async flows live here so screens stay
 * declarative; every native-touching action is wrapped so a failure surfaces
 * as state, never as an unhandled rejection.
 */
import { create } from 'zustand';
import type {
  BatteryState,
  CatalogModel,
  ChatMessage,
  DeviceProfile,
  ModelState,
  SweepPoint,
  TuneConfig,
  TuneRun,
} from './types';
import { detectDevice } from './lib/cpu';
import { readBattery } from './lib/battery';
import { CATALOG, catalogById } from './data/catalog';
import {
  DownloadHandle,
  deleteModel,
  downloadModel,
  ensureModelsDir,
  isDownloaded,
  modelPath,
} from './lib/models';
import { chat, loadEngine, releaseEngine, StreamHandle } from './lib/llama';
import {
  BASELINE_CONFIG,
  buildPlan,
  finishRun,
  loadState,
  runSweep,
  saveState,
} from './lib/tuner';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TuneState {
  running: boolean;
  mode: 'quick' | 'full';
  progress: number;
  currentLabel: string | null;
  livePoints: SweepPoint[];
  lastRun: TuneRun | null;
  error: string | null;
}

interface AppState {
  booted: boolean;
  profile: DeviceProfile | null;
  battery: BatteryState | null;

  models: Record<string, ModelState>;
  selectedModelId: string;

  appliedConfig: TuneConfig | null;
  appliedModelId: string | null;
  history: TuneRun[];

  tune: TuneState;

  engineStatus: EngineStatus;
  engineError: string | null;
  chatMessages: ChatMessage[];
  generating: boolean;

  boot: () => Promise<void>;
  refreshBattery: () => Promise<void>;
  selectModel: (id: string) => void;
  startDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  removeModel: (id: string) => Promise<void>;
  startTune: (mode: 'quick' | 'full') => Promise<void>;
  applyBest: () => Promise<void>;
  ensureChatEngine: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  stopGeneration: () => void;
  clearChat: () => void;
}

const downloads = new Map<string, DownloadHandle>();
let activeStream: StreamHandle | null = null;

const emptyModel = (): ModelState => ({
  status: 'none',
  progress: 0,
  bytesWritten: 0,
  path: null,
  error: null,
});

export const useStore = create<AppState>((set, get) => ({
  booted: false,
  profile: null,
  battery: null,
  models: Object.fromEntries(CATALOG.map(m => [m.id, emptyModel()])),
  selectedModelId: CATALOG[0].id,
  appliedConfig: null,
  appliedModelId: null,
  history: [],
  tune: {
    running: false,
    mode: 'quick',
    progress: 0,
    currentLabel: null,
    livePoints: [],
    lastRun: null,
    error: null,
  },
  engineStatus: 'idle',
  engineError: null,
  chatMessages: [],
  generating: false,

  boot: async () => {
    try {
      await ensureModelsDir();
      const [profile, battery, persisted] = await Promise.all([
        detectDevice().catch(() => null),
        readBattery().catch(() => null),
        loadState(),
      ]);
      const models: Record<string, ModelState> = {};
      for (const m of CATALOG) {
        const ready = await isDownloaded(m);
        models[m.id] = {
          ...emptyModel(),
          status: ready ? 'ready' : 'none',
          path: ready ? modelPath(m) : null,
        };
      }
      const selected =
        persisted.appliedModelId && models[persisted.appliedModelId]?.status === 'ready'
          ? persisted.appliedModelId
          : CATALOG.find(m => models[m.id].status === 'ready')?.id ?? CATALOG[0].id;
      set({
        booted: true,
        profile,
        battery,
        models,
        selectedModelId: selected,
        appliedConfig: persisted.appliedConfig,
        appliedModelId: persisted.appliedModelId,
        history: persisted.history,
        tune: { ...get().tune, lastRun: persisted.history[0] ?? null },
      });
    } catch (err) {
      // Boot must never leave the app on a blank screen.
      set({ booted: true });
    }
  },

  refreshBattery: async () => {
    const battery = await readBattery().catch(() => null);
    if (battery) set({ battery });
  },

  selectModel: id => set({ selectedModelId: id }),

  startDownload: id => {
    const model = catalogById(id);
    if (!model || downloads.has(id)) return;
    const update = (patch: Partial<ModelState>) =>
      set(s => ({ models: { ...s.models, [id]: { ...s.models[id], ...patch } } }));
    update({ status: 'downloading', progress: 0, error: null });
    const handle = downloadModel(model, (fraction, bytesWritten) =>
      update({ progress: fraction, bytesWritten }),
    );
    downloads.set(id, handle);
    handle.promise
      .then(() => update({ status: 'ready', progress: 1, path: modelPath(model) }))
      .catch(err =>
        update({
          status: 'none',
          progress: 0,
          error: err?.message?.includes('aborted') ? null : String(err?.message ?? err),
        }),
      )
      .finally(() => downloads.delete(id));
  },

  cancelDownload: id => {
    downloads.get(id)?.cancel();
    downloads.delete(id);
    set(s => ({
      models: { ...s.models, [id]: { ...s.models[id], status: 'none', progress: 0 } },
    }));
  },

  removeModel: async id => {
    const model = catalogById(id);
    if (!model) return;
    await releaseEngine().catch(() => {});
    await deleteModel(model);
    set(s => ({
      engineStatus: 'idle',
      models: { ...s.models, [id]: emptyModel() },
    }));
  },

  startTune: async mode => {
    const { profile, selectedModelId, models } = get();
    const model = catalogById(selectedModelId);
    const state = models[selectedModelId];
    if (!profile || !model || state.status !== 'ready' || get().tune.running) return;

    set({
      engineStatus: 'loading',
      tune: {
        running: true,
        mode,
        progress: 0,
        currentLabel: null,
        livePoints: [],
        lastRun: get().tune.lastRun,
        error: null,
      },
    });
    try {
      const plan = buildPlan(profile, mode);
      for await (const p of runSweep(modelPath(model), plan, mode)) {
        set(s => ({
          tune: {
            ...s.tune,
            progress: p.index / p.total,
            currentLabel:
              p.index < p.total ? `${p.current.nThreads} threads` : null,
            livePoints: p.points,
          },
        }));
      }
      const points = get().tune.livePoints;
      if (!points.length) throw new Error('Sweep produced no results');
      const run = finishRun(points, model.id, model.file, mode);
      const history = [run, ...get().history].slice(0, 20);
      set(s => ({
        history,
        engineStatus: 'ready',
        tune: { ...s.tune, running: false, progress: 1, lastRun: run },
      }));
      await saveState({
        appliedConfig: get().appliedConfig,
        appliedModelId: get().appliedModelId,
        history,
      });
    } catch (err) {
      set(s => ({
        engineStatus: 'idle',
        tune: {
          ...s.tune,
          running: false,
          error: String((err as Error)?.message ?? err),
        },
      }));
    }
  },

  applyBest: async () => {
    const { tune } = get();
    const run = tune.lastRun;
    if (!run) return;
    set({
      appliedConfig: run.best.config,
      appliedModelId: run.modelId,
      selectedModelId: run.modelId,
      chatMessages: [],
    });
    await saveState({
      appliedConfig: run.best.config,
      appliedModelId: run.modelId,
      history: get().history,
    });
  },

  ensureChatEngine: async () => {
    const { selectedModelId, models, appliedConfig, appliedModelId, profile } = get();
    const modelId =
      appliedModelId && models[appliedModelId]?.status === 'ready'
        ? appliedModelId
        : selectedModelId;
    const model = catalogById(modelId);
    if (!model || models[modelId]?.status !== 'ready') {
      set({ engineStatus: 'idle' });
      return;
    }
    const config: TuneConfig =
      appliedConfig ??
      (profile
        ? { nThreads: Math.max(profile.bigCoreIds.length, 4), flashAttn: 'auto', kvCache: 'f16' }
        : BASELINE_CONFIG);
    set({ engineStatus: 'loading', engineError: null });
    try {
      await loadEngine(modelPath(model), config);
      set({ engineStatus: 'ready' });
    } catch (err) {
      set({ engineStatus: 'error', engineError: String((err as Error)?.message ?? err) });
    }
  },

  sendMessage: async text => {
    const trimmed = text.trim();
    if (!trimmed || get().generating) return;
    if (get().engineStatus !== 'ready') {
      await get().ensureChatEngine();
      if (get().engineStatus !== 'ready') return;
    }
    const user: ChatMessage = { id: `u${Date.now()}`, role: 'user', text: trimmed };
    const assistantId = `a${Date.now()}`;
    const history = [...get().chatMessages, user];
    set({
      chatMessages: [...history, { id: assistantId, role: 'assistant', text: '' }],
      generating: true,
    });
    const patchAssistant = (patch: Partial<ChatMessage>) =>
      set(s => ({
        chatMessages: s.chatMessages.map(m =>
          m.id === assistantId ? { ...m, ...patch } : m,
        ),
      }));
    try {
      activeStream = chat(history, acc => patchAssistant({ text: acc }));
      const result = await activeStream.promise;
      patchAssistant({
        text: result.text.trim() || '…',
        tps: result.decodeTps,
        prefillTps: result.prefillTps,
      });
    } catch (err) {
      patchAssistant({ text: `Something went wrong: ${(err as Error)?.message ?? err}` });
    } finally {
      activeStream = null;
      set({ generating: false });
      get().refreshBattery();
    }
  },

  stopGeneration: () => {
    activeStream?.stop();
  },

  clearChat: () => set({ chatMessages: [] }),
}));
