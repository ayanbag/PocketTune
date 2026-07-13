/**
 * The model registry: merges the curated catalog with models the user brought
 * themselves — pasted GGUF URLs and files sideloaded into models/ over adb.
 * Anything that lands here is tunable and chattable like a catalog model.
 */
import * as RNFS from '@dr.pogodin/react-native-fs';
import type { ModelInfo } from '../types';
import { MODELS_DIR, isValidGguf } from './models';

const CUSTOM_FILE = `${RNFS.DocumentDirectoryPath}/pockettune-custom-models.json`;

/**
 * Best-effort metadata from a GGUF filename, e.g.
 * "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf" → name, quant, params.
 */
export function parseGgufFilename(file: string): {
  name: string;
  quant: string;
  params: string;
} {
  const stem = file.replace(/\.gguf$/i, '');
  const quantMatch = stem.match(/(IQ\d+_[A-Z0-9]+|Q\d+(?:_[A-Z0-9]+)*|F16|F32|BF16)$/i);
  const quant = quantMatch ? quantMatch[1].toUpperCase() : '?';
  const nameStem = quantMatch
    ? stem.slice(0, stem.length - quantMatch[1].length).replace(/[-._]+$/, '')
    : stem;
  const paramsMatch = nameStem.match(/(\d+(?:\.\d+)?)\s*[bB](?![a-zA-Z0-9])/);
  return {
    name: nameStem.replace(/[-_]+/g, ' ').trim() || file,
    quant,
    params: paramsMatch ? `${paramsMatch[1]} B` : '?',
  };
}

/** Registry entry for a URL the user pasted. Returns null if it's not a GGUF URL. */
export function customModelFromUrl(rawUrl: string): ModelInfo | null {
  const url = rawUrl.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return null;
  const path = url.split(/[?#]/)[0];
  if (!/\.gguf$/i.test(path)) return null;
  const file = decodeURIComponent(path.split('/').pop() ?? '');
  if (!file) return null;
  const meta = parseGgufFilename(file);
  return {
    id: `custom-${file.toLowerCase()}`,
    ...meta,
    sizeBytes: 0,
    url,
    file,
    source: 'custom',
  };
}

/**
 * Finds .gguf files in models/ that no known entry claims — the adb-push
 * path. Validates the magic so a stray rename can't smuggle junk in.
 */
export async function scanSideloaded(knownFiles: string[]): Promise<ModelInfo[]> {
  try {
    const entries = await RNFS.readDir(MODELS_DIR);
    const known = new Set(knownFiles.map(f => f.toLowerCase()));
    const found: ModelInfo[] = [];
    for (const e of entries) {
      if (!e.isFile() || !/\.gguf$/i.test(e.name)) continue;
      if (known.has(e.name.toLowerCase())) continue;
      if (!(await isValidGguf(e.path))) continue;
      found.push({
        id: `sideload-${e.name.toLowerCase()}`,
        ...parseGgufFilename(e.name),
        sizeBytes: Number(e.size),
        file: e.name,
        source: 'sideloaded',
      });
    }
    return found;
  } catch {
    return [];
  }
}

export async function loadCustomModels(): Promise<ModelInfo[]> {
  try {
    const raw = await RNFS.readFile(CUSTOM_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.models)) return [];
    return parsed.models.filter(
      (m: ModelInfo) => m && typeof m.id === 'string' && typeof m.file === 'string' && m.url,
    );
  } catch {
    return [];
  }
}

export async function saveCustomModels(all: ModelInfo[]): Promise<void> {
  try {
    const models = all.filter(m => m.source === 'custom');
    await RNFS.writeFile(CUSTOM_FILE, JSON.stringify({ models }), 'utf8');
  } catch {
    // best-effort
  }
}
