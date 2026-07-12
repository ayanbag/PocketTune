import type { CatalogModel } from '../types';

/**
 * Curated GGUF catalog — small, permissively licensed instruct models with
 * quants that exercise different points of the size/speed/quality curve.
 * Q4_0 is the headline format: llama.cpp repacks it online into
 * dotprod/i8mm-friendly layouts, which is where Arm-specific gains live.
 */
export const CATALOG: CatalogModel[] = [
  {
    id: 'llama32-1b-q4_0',
    name: 'Llama 3.2 1B',
    quant: 'Q4_0',
    params: '1.24 B',
    sizeBytes: 773_025_920,
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_0.gguf',
    file: 'Llama-3.2-1B-Instruct-Q4_0.gguf',
    blurb: 'The tuning default. Q4_0 repacks into Arm i8mm/dotprod layouts at load.',
    recommendedWhen: 'any',
  },
  {
    id: 'llama32-1b-q4km',
    name: 'Llama 3.2 1B',
    quant: 'Q4_K_M',
    params: '1.24 B',
    sizeBytes: 807_694_464,
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    blurb: 'K-quant variant — slightly better quality, no Arm repack path.',
  },
  {
    id: 'llama32-1b-q8',
    name: 'Llama 3.2 1B',
    quant: 'Q8_0',
    params: '1.24 B',
    sizeBytes: 1_321_082_880,
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q8_0.gguf',
    file: 'Llama-3.2-1B-Instruct-Q8_0.gguf',
    blurb: 'Near-lossless 8-bit — the quality reference point.',
  },
  {
    id: 'qwen25-15b-q4_0',
    name: 'Qwen 2.5 1.5B',
    quant: 'Q4_0',
    params: '1.54 B',
    sizeBytes: 938_218_496,
    url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_0.gguf',
    file: 'Qwen2.5-1.5B-Instruct-Q4_0.gguf',
    blurb: 'A stronger small model, still phone-friendly at 4-bit.',
  },
  {
    id: 'smollm2-360m-q8',
    name: 'SmolLM2 360M',
    quant: 'Q8_0',
    params: '0.36 B',
    sizeBytes: 386_404_352,
    url: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q8_0.gguf',
    file: 'SmolLM2-360M-Instruct-Q8_0.gguf',
    blurb: 'Tiny and quick to download — good for a first spin.',
  },
];

export function catalogById(id: string): CatalogModel | undefined {
  return CATALOG.find(m => m.id === id);
}
