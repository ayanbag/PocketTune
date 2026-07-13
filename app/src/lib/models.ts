/**
 * Model file management: download from any direct GGUF URL with progress,
 * plus adb sideload support.
 *
 * Models live under the app's external files dir
 * (/sdcard/Android/data/<pkg>/files/models) so a developer can also
 * `adb push model.gguf` there and skip the download — the reproducibility
 * path documented in the README.
 *
 * Completeness is verified by the GGUF magic bytes rather than a catalog
 * size guess, so user-pasted URLs (unknown size) verify the same way as
 * curated ones.
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import type { CatalogModel } from '../types';

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

export function downloadModel(
  model: Pick<CatalogModel, 'file' | 'url' | 'sizeBytes'>,
  onProgress: (fraction: number, bytesWritten: number) => void,
): DownloadHandle {
  if (!model.url) {
    return {
      promise: Promise.reject(new Error('No download URL for this model')),
      cancel: () => {},
    };
  }
  const dest = modelPath(model);
  const tmp = `${dest}.part`;
  const task = RNFS.downloadFile({
    fromUrl: model.url,
    toFile: tmp,
    background: false,
    discretionary: false,
    progressInterval: 500,
    progress: (p: RNFS.DownloadProgressCallbackResultT) => {
      const total = p.contentLength > 0 ? p.contentLength : model.sizeBytes;
      onProgress(total > 0 ? Math.min(p.bytesWritten / total, 1) : 0, p.bytesWritten);
    },
  });

  const promise = (async () => {
    const res = await task.promise;
    if (res.statusCode && res.statusCode >= 400) {
      throw new Error(`Download failed (HTTP ${res.statusCode})`);
    }
    if (!(await isValidGguf(tmp))) {
      throw new Error('Downloaded file is not a valid GGUF — check the URL points at a raw .gguf (on Hugging Face, use the "resolve" link).');
    }
    try {
      await RNFS.unlink(dest);
    } catch {
      // no previous file
    }
    await RNFS.moveFile(tmp, dest);
  })().catch(async err => {
    try {
      await RNFS.unlink(tmp);
    } catch {
      // nothing partial to clean
    }
    throw err;
  });

  return {
    promise,
    cancel: () => RNFS.stopDownload(task.jobId),
  };
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
