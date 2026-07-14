/**
 * Model file management: download from any direct GGUF URL with progress,
 * plus adb sideload support.
 *
 * Models live under the app's external files dir
 * (/sdcard/Android/data/<pkg>/files/models) so a developer can also
 * `adb push model.gguf` there and skip the download — the reproducibility
 * path documented in the README.
 *
 * Downloads run through react-native-background-downloader rather than an
 * in-process HTTP fetch: a GGUF is ~700 MB, and an in-process transfer stalls
 * the moment the screen goes off (Android suspends the app's network). The
 * background downloader hands the transfer to a foreground service, so it
 * survives screen-off, backgrounding, and app death, and resumes by HTTP Range
 * when the server allows it.
 *
 * Completeness is verified by the GGUF magic bytes rather than a catalog
 * size guess, so user-pasted URLs (unknown size) verify the same way as
 * curated ones.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  completeHandler,
  createDownloadTask,
  getExistingDownloadTasks,
  setConfig,
  type DownloadTask,
} from '@kesha-antonov/react-native-background-downloader';
import type { CatalogModel } from '../types';

setConfig({
  isLogsEnabled: false,
  // The progress notification is what keeps the transfer in the foreground
  // while the screen is off.
  showNotificationsEnabled: true,
});

export const MODELS_DIR = `${RNFS.ExternalDirectoryPath ?? RNFS.DocumentDirectoryPath}/models`;

/** Any .gguf under ~2MB is a truncated stub, not a model. */
const MIN_PLAUSIBLE_BYTES = 2_000_000;

export function modelPath(model: Pick<CatalogModel, 'file'>): string {
  return `${MODELS_DIR}/${model.file}`;
}

export async function ensureModelsDir(): Promise<void> {
  try {
    await RNFS.mkdir(MODELS_DIR);
  } catch {
    // exists
  }
}

/** True when the file starts with the GGUF magic and isn't a truncated stub. */
export async function isValidGguf(path: string): Promise<boolean> {
  try {
    const stat = await RNFS.stat(path);
    if (Number(stat.size) < MIN_PLAUSIBLE_BYTES) return false;
    const head = await RNFS.read(path, 4, 0, 'ascii');
    return head === 'GGUF';
  } catch {
    return false;
  }
}

export async function isDownloaded(model: Pick<CatalogModel, 'file'>): Promise<boolean> {
  return isValidGguf(modelPath(model));
}

/** Actual on-disk size, for registry entries created with an unknown size. */
export async function downloadedSize(model: Pick<CatalogModel, 'file'>): Promise<number | null> {
  try {
    const stat = await RNFS.stat(modelPath(model));
    return Number(stat.size);
  } catch {
    return null;
  }
}

export interface DownloadHandle {
  promise: Promise<void>;
  cancel: () => void;
}

/** Thrown on user cancel; the store treats it as a silent stop, not an error. */
const ABORTED = 'aborted';

const partPath = (dest: string): string => `${dest}.part`;

/**
 * Promotes a finished `.part` to the real model path, rejecting anything that
 * isn't actually a GGUF (a 404 HTML body downloads perfectly happily).
 */
async function finalize(dest: string): Promise<void> {
  const tmp = partPath(dest);
  if (!(await isValidGguf(tmp))) {
    throw new Error(
      'Downloaded file is not a valid GGUF — check the URL points at a raw .gguf (on Hugging Face, use the "resolve" link).',
    );
  }
  try {
    await RNFS.unlink(dest);
  } catch {
    // no previous file
  }
  await RNFS.moveFile(tmp, dest);
}

async function discardPart(dest: string): Promise<void> {
  try {
    await RNFS.unlink(partPath(dest));
  } catch {
    // nothing partial to clean
  }
}

/**
 * Wires a task's callbacks to a promise. Shared by fresh downloads and by
 * tasks re-attached after the app was killed mid-transfer.
 */
function wire(
  task: DownloadTask,
  dest: string,
  expectedBytes: number,
  onProgress: (fraction: number, bytesWritten: number) => void,
): DownloadHandle {
  let cancelled = false;
  const promise = new Promise<void>((resolve, reject) => {
    task
      .progress(({ bytesDownloaded, bytesTotal }) => {
        const total = bytesTotal > 0 ? bytesTotal : expectedBytes;
        onProgress(total > 0 ? Math.min(bytesDownloaded / total, 1) : 0, bytesDownloaded);
      })
      .done(() => {
        // Tells the OS the background job is finished and the service can stop.
        completeHandler(task.id);
        finalize(dest).then(resolve, async err => {
          await discardPart(dest);
          reject(err);
        });
      })
      .error(async ({ error }) => {
        completeHandler(task.id);
        await discardPart(dest);
        reject(new Error(cancelled ? ABORTED : String(error)));
      });
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      task.stop().catch(() => {});
      discardPart(dest);
    },
  };
}

/**
 * Asks for the notification permission the download's progress notification
 * needs on Android 13+. Fire-and-forget: a denial costs visibility, not the
 * transfer, so it never blocks the download.
 */
function requestNotificationPermission(): void {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  ).catch(() => {});
}

export function downloadModel(
  model: Pick<CatalogModel, 'id' | 'file' | 'url' | 'sizeBytes'>,
  onProgress: (fraction: number, bytesWritten: number) => void,
): DownloadHandle {
  if (!model.url) {
    return {
      promise: Promise.reject(new Error('No download URL for this model')),
      cancel: () => {},
    };
  }
  requestNotificationPermission();
  const dest = modelPath(model);
  const task = createDownloadTask({
    // Stable across app restarts, so a killed app can re-attach to this task.
    id: model.id,
    url: model.url,
    destination: partPath(dest),
    isAllowedOverMetered: true,
    metadata: { file: model.file },
  });
  const handle = wire(task, dest, model.sizeBytes, onProgress);
  task.start();
  return handle;
}

/**
 * Re-attaches to transfers the foreground service kept running while the app
 * was backgrounded or killed. Progress events only fire while the app is
 * alive, so without this a download that completed in the background would
 * never be promoted out of its `.part` file.
 */
export async function reattachDownloads(
  resolve: (id: string) => Pick<CatalogModel, 'file' | 'sizeBytes'> | undefined,
  onProgress: (id: string, fraction: number, bytesWritten: number) => void,
): Promise<{ id: string; handle: DownloadHandle }[]> {
  let tasks: DownloadTask[];
  try {
    tasks = await getExistingDownloadTasks();
  } catch {
    return [];
  }
  const attached: { id: string; handle: DownloadHandle }[] = [];
  for (const task of tasks) {
    const model = resolve(task.id);
    if (!model) {
      // A task for a model we no longer know about — don't leave it running.
      task.stop().catch(() => {});
      continue;
    }
    const dest = modelPath(model);
    attached.push({
      id: task.id,
      handle: wire(task, dest, model.sizeBytes, (fraction, bytes) =>
        onProgress(task.id, fraction, bytes),
      ),
    });
    // A transfer paused by the OS (metered network, low storage) stays paused
    // until asked to continue.
    if (task.state === 'PAUSED') task.resume().catch(() => {});
  }
  return attached;
}

export function isAborted(err: unknown): boolean {
  return String((err as Error)?.message ?? err).includes(ABORTED);
}

export async function deleteModel(model: Pick<CatalogModel, 'file'>): Promise<void> {
  try {
    await RNFS.unlink(modelPath(model));
  } catch {
    // already gone
  }
}

export async function freeSpaceBytes(): Promise<number | null> {
  try {
    const info = await RNFS.getFSInfo();
    return info.freeSpace;
  } catch {
    return null;
  }
}
