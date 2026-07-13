/**
 * App-wide state (zustand). All async flows live here so screens stay
 * declarative; every native-touching action is wrapped so a failure surfaces
 * as state, never as an unhandled rejection.
 */
import { create } from 'zustand';
import type {
  BatteryState,
  ChatMessage,
  ChatSession,
  DeviceProfile,
  ModelInfo,
  ModelState,
  SweepPoint,
  TuneConfig,
  TuneRun,
} from './types';
import { detectDevice } from './lib/cpu';
import { readBattery } from './lib/battery';
import { CATALOG } from './data/catalog';
import { loadChats, saveChats } from './lib/chats';
import {
  DownloadHandle,
  deleteModel,
  downloadModel,
  downloadedSize,
  ensureModelsDir,
  isDownloaded,
  modelPath,
} from './lib/models';
import {
  customModelFromUrl,
  loadCustomModels,
  saveCustomModels,
  scanSideloaded,
} from './lib/registry';
import { pickRecommended } from './lib/recommend';
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
export type TabId = 'device' | 'models' | 'tune' | 'chat' | 'lab';

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
  tab: TabId;
  profile: DeviceProfile | null;
  battery: BatteryState | null;

  /** every model the app knows: catalog + pasted URLs + adb-pushed files */
  modelList: ModelInfo[];
  models: Record<string, ModelState>;
  selectedModelId: string;

  appliedConfig: TuneConfig | null;
  appliedModelId: string | null;
  history: TuneRun[];

  tune: TuneState;

  engineStatus: EngineStatus;
  engineError: string | null;
  /** live transcript of the active session */
  chatMessages: ChatMessage[];
  /** persisted archive, newest first */
  chatSessions: ChatSession[];
  activeChatId: string | null;
  generating: boolean;

  boot: () => Promise<void>;
  setTab: (tab: TabId) => void;
  refreshBattery: () => Promise<void>;
  selectModel: (id: string) => void;
  startDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  removeModel: (id: string) => Promise<void>;
  /** @returns an error message to show inline, or null on success */
  addCustomModel: (url: string) => Promise<string | null>;
  /** re-checks the models dir for sideloaded files and stale statuses */
  rescanModels: () => Promise<void>;
  startTune: (mode: 'quick' | 'full') => Promise<void>;
  applyBest: () => Promise<void>;
  ensureChatEngine: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  stopGeneration: () => void;
  newChat: () => void;
  openChat: (id: string) => void;
  deleteChat: (id: string) => void;
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

const findModel = (list: ModelInfo[], id: string): ModelInfo | undefined =>
  list.find(m => m.id === id);

export const useStore = create<AppState>((set, get) => ({
  booted: false,
  tab: 'device',
  profile: null,
  battery: null,
  modelList: [],
  models: {},
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
  chatSessions: [],
  activeChatId: null,
  generating: false,

  boot: async () => {
    try {
      await ensureModelsDir();
      const [profile, battery, persisted, chatSessions, custom] = await Promise.all([
        detectDevice().catch(() => null),
        readBattery().catch(() => null),
        loadState(),
        loadChats(),
        loadCustomModels(),
      ]);
      let modelList: ModelInfo[] = [
        ...CATALOG.map(m => ({ ...m, source: 'catalog' as const })),
        ...custom,
      ];
      const sideloaded = await scanSideloaded(modelList.map(m => m.file));
      modelList = [...modelList, ...sideloaded];

      const models: Record<string, ModelState> = {};
      for (const m of modelList) {
        const ready = await isDownloaded(m);
        if (ready && m.sizeBytes === 0) {
          m.sizeBytes = (await downloadedSize(m)) ?? 0;
        }
        models[m.id] = {
          ...emptyModel(),
          status: ready ? 'ready' : 'none',
          path: ready ? modelPath(m) : null,
        };
      }
      const selected =
        persisted.appliedModelId && models[persisted.appliedModelId]?.status === 'ready'
          ? persisted.appliedModelId
          : modelList.find(m => models[m.id].status === 'ready')?.id ??
            pickRecommended(modelList, profile)?.id ??
            CATALOG[0].id;
      set({
        booted: true,
        profile,
        battery,
        modelList,
        models,
        selectedModelId: selected,
        appliedConfig: persisted.appliedConfig,
        appliedModelId: persisted.appliedModelId,
        history: persisted.history,
        chatSessions,
        tune: { ...get().tune, lastRun: persisted.history[0] ?? null },
      });
    } catch {
      // Boot must never leave the app on a blank screen.
      set({ booted: true });
    }
  },

  setTab: tab => set({ tab }),

  refreshBattery: async () => {
    const battery = await readBattery().catch(() => null);
    if (battery) set({ battery });
  },

  selectModel: id => set({ selectedModelId: id }),

  startDownload: id => {
    const model = findModel(get().modelList, id);
    if (!model || !model.url || downloads.has(id)) return;
    const update = (patch: Partial<ModelState>) =>
      set(s => ({ models: { ...s.models, [id]: { ...(s.models[id] ?? emptyModel()), ...patch } } }));
    update({ status: 'downloading', progress: 0, error: null });
    const handle = downloadModel(model, (fraction, bytesWritten) =>
      update({ progress: fraction, bytesWritten }),
    );
    downloads.set(id, handle);
    handle.promise
      .then(async () => {
        // Trust the disk over the catalog guess.
        const actual = await downloadedSize(model);
        if (actual) {
          set(s => ({
            modelList: s.modelList.map(m =>
              m.id === id ? { ...m, sizeBytes: actual } : m,
            ),
          }));
        }
        update({ status: 'ready', progress: 1, path: modelPath(model) });
      })
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
      models: {
        ...s.models,
        [id]: { ...(s.models[id] ?? emptyModel()), status: 'none', progress: 0 },
      },
    }));
  },

  removeModel: async id => {
    const model = findModel(get().modelList, id);
    if (!model) return;
    await releaseEngine().catch(() => {});
    await deleteModel(model);
    if (model.source === 'sideloaded') {
      // Nothing to re-download from — drop the entry entirely.
      set(s => {
        const models = { ...s.models };
        delete models[id];
        return {
          engineStatus: 'idle',
          modelList: s.modelList.filter(m => m.id !== id),
          models,
        };
      });
    } else {
      set(s => ({
        engineStatus: 'idle',
        models: { ...s.models, [id]: emptyModel() },
      }));
    }
  },

  addCustomModel: async url => {
    const info = customModelFromUrl(url);
    if (!info) {
      return 'That doesn’t look like a direct .gguf link. On Hugging Face, use the file’s “resolve” URL (Files tab → download link).';
    }
    const existing = get().modelList.find(
      m => m.file.toLowerCase() === info.file.toLowerCase(),
    );
    if (existing) {
      if (get().models[existing.id]?.status === 'ready') {
        set({ selectedModelId: existing.id });
        return 'Already in your library — selected it for tuning.';
      }
      get().startDownload(existing.id);
      return null;
    }
    set(s => ({
      modelList: [...s.modelList, info],
      models: { ...s.models, [info.id]: emptyModel() },
    }));
    await saveCustomModels(get().modelList);
    get().startDownload(info.id);
    return null;
  },

  rescanModels: async () => {
    const { modelList } = get();
    const sideloaded = await scanSideloaded(modelList.map(m => m.file));
    const merged = [...modelList, ...sideloaded];
    const models = { ...get().models };
    for (const m of merged) {
      if (models[m.id]?.status === 'downloading') continue;
      const ready = await isDownloaded(m);
      if (ready && m.sizeBytes === 0) {
        m.sizeBytes = (await downloadedSize(m)) ?? 0;
      }
      models[m.id] = {
        ...(models[m.id] ?? emptyModel()),
        status: ready ? 'ready' : 'none',
        path: ready ? modelPath(m) : null,
      };
    }
    set({ modelList: merged, models });
  },

  startTune: async mode => {
    const { profile, selectedModelId, models, modelList } = get();
    const model = findModel(modelList, selectedModelId);
    const state = models[selectedModelId];
    if (!profile || !model || state?.status !== 'ready' || get().tune.running) return;

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
    // Start a fresh session under the new config; the old transcript stays
    // in the archive rather than being wiped.
    set({
      appliedConfig: run.best.config,
      appliedModelId: run.modelId,
      selectedModelId: run.modelId,
      chatMessages: [],
      activeChatId: null,
    });
    await saveState({
      appliedConfig: run.best.config,
      appliedModelId: run.modelId,
      history: get().history,
    });
  },

  ensureChatEngine: async () => {
    const { selectedModelId, models, modelList, appliedConfig, appliedModelId, profile } =
      get();
    const modelId =
      appliedModelId && models[appliedModelId]?.status === 'ready'
        ? appliedModelId
        : selectedModelId;
    const model = findModel(modelList, modelId);
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
    const now = new Date().toISOString();
    const user: ChatMessage = {
      id: `u${Date.now()}`,
      role: 'user',
      text: trimmed,
      at: now,
    };
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
        at: new Date().toISOString(),
        tps: result.decodeTps,
        prefillTps: result.prefillTps,
        tokens: result.tokens,
        ms: result.ms,
      });
    } catch (err) {
      patchAssistant({ text: `Something went wrong: ${(err as Error)?.message ?? err}` });
    } finally {
      activeStream = null;
      set({ generating: false });
      persistActiveSession(set, get);
      get().refreshBattery();
    }
  },

  stopGeneration: () => {
    activeStream?.stop();
  },

  // Switching transcripts mid-stream would orphan the reply being generated,
  // so session navigation waits for generation to finish.
  newChat: () => {
    if (get().generating) return;
    set({ chatMessages: [], activeChatId: null });
  },

  openChat: id => {
    if (get().generating) return;
    const session = get().chatSessions.find(s => s.id === id);
    if (!session) return;
    set({ activeChatId: id, chatMessages: session.messages });
  },

  deleteChat: id => {
    if (get().generating && get().activeChatId === id) return;
    const sessions = get().chatSessions.filter(s => s.id !== id);
    set(s => ({
      chatSessions: sessions,
      ...(s.activeChatId === id ? { activeChatId: null, chatMessages: [] } : null),
    }));
    saveChats(sessions);
  },
}));

/**
 * Folds the live transcript into the archive (creating the session on first
 * exchange) and writes it to disk. Metadata reflects what the engine is
 * actually running: model + applied config at the time of the last reply.
 */
function persistActiveSession(
  set: (fn: (s: AppState) => Partial<AppState>) => void,
  get: () => AppState,
): void {
  const {
    chatMessages,
    activeChatId,
    appliedConfig,
    appliedModelId,
    selectedModelId,
    models,
    modelList,
  } = get();
  if (!chatMessages.length) return;
  const modelId =
    appliedModelId && models[appliedModelId]?.status === 'ready'
      ? appliedModelId
      : selectedModelId;
  const model = findModel(modelList, modelId);
  const now = new Date().toISOString();
  const id = activeChatId ?? `c${Date.now()}`;
  set(s => {
    const existing = s.chatSessions.find(x => x.id === id);
    const session: ChatSession = {
      id,
      startedAt: existing?.startedAt ?? chatMessages[0].at ?? now,
      updatedAt: now,
      modelId,
      modelFile: model?.file ?? modelId,
      config: appliedConfig,
      tuned: appliedConfig != null,
      messages: chatMessages,
    };
    const rest = s.chatSessions.filter(x => x.id !== id);
    return { activeChatId: id, chatSessions: [session, ...rest] };
  });
  saveChats(get().chatSessions);
}
