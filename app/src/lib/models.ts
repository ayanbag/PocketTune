/**
 * Model file management: download from Hugging Face with progress, resume
 * awareness, and adb sideload support.
 *
 * Models live under the app's external files dir
 * (/sdcard/Android/data/<pkg>/files/models) so a developer can also
 * `adb push model.gguf` there and skip the download — the reproducibility
 * path documented in the README.
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import type { CatalogModel } from '../types';

export const MODELS_DIR = `${RNFS.ExternalDirectoryPath ?? RNFS.DocumentDirectoryPath}/models`;

export function modelPath(model: CatalogModel): string {
  return `${MODELS_DIR}/${model.file}`;
}

export async function ensureModelsDir(): Promise<void> {
  try {
    await RNFS.mkdir(MODELS_DIR);
  } catch {
    // exists
  }
}

/** True when the file exists and is plausibly complete (>= 95% of catalog size). */
export async function isDownloaded(model: CatalogModel): Promise<boolean> {
  try {
    const stat = await RNFS.stat(modelPath(model));
    return Number(stat.size) >= model.sizeBytes * 0.95;
  } catch {
    return false;
  }
}

export interface DownloadHandle {
  promise: Promise<void>;
  cancel: () => void;
}

export function downloadModel(
  model: CatalogModel,
  onProgress: (fraction: number, bytesWritten: number) => void,
): DownloadHandle {
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
      onProgress(Math.min(p.bytesWritten / total, 1), p.bytesWritten);
    },
  });

  const promise = (async () => {
    const res = await task.promise;
    if (res.statusCode && res.statusCode >= 400) {
      throw new Error(`Download failed (HTTP ${res.statusCode})`);
    }
    const stat = await RNFS.stat(tmp);
    if (Number(stat.size) < model.sizeBytes * 0.95) {
      throw new Error('Download incomplete — check your connection and retry.');
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

export async function deleteModel(model: CatalogModel): Promise<void> {
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
