import type { CatalogModel } from '../types';

/**
 * Curated GGUF catalog — small, permissively licensed instruct models with
 * quants that exercise different points of the size/speed/quality curve.
 * Q4_0 is the headline format: llama.cpp repacks it online into
 * dotprod/i8mm-friendly layouts, which is where Arm-specific gains live.
 *
 * sizeBytes are approximate (display + free-space hints only); completeness
 * is verified by GGUF magic, and the registry replaces these with the actual
 * on-disk size after download.
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
    id: 'qwen25-05b-q8',
    name: 'Qwen 2.5 0.5B',
    quant: 'Q8_0',
    params: '0.49 B',
    sizeBytes: 531_066_880,
    url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q8_0.gguf',
    file: 'Qwen2.5-0.5B-Instruct-Q8_0.gguf',
    blurb: 'Half a billion parameters — snappy even on little cores.',
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
  {
    id: 'smollm2-17b-q4_0',
    name: 'SmolLM2 1.7B',
    quant: 'Q4_0',
    params: '1.71 B',
    sizeBytes: 985_000_000,
    url: 'https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_0.gguf',
    file: 'SmolLM2-1.7B-Instruct-Q4_0.gguf',
    blurb: 'HuggingFace’s open-data small model at the 4-bit sweet spot.',
  },
  {
    id: 'gemma2-2b-q4_0',
    name: 'Gemma 2 2B',
    quant: 'Q4_0',
    params: '2.61 B',
    sizeBytes: 1_630_000_000,
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_0.gguf',
    file: 'gemma-2-2b-it-Q4_0.gguf',
    blurb: 'Google’s 2B instruct model — noticeably smarter, still mobile-sized.',
  },
  {
    id: 'llama32-3b-q4_0',
    name: 'Llama 3.2 3B',
    quant: 'Q4_0',
    params: '3.21 B',
    sizeBytes: 1_920_000_000,
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_0.gguf',
    file: 'Llama-3.2-3B-Instruct-Q4_0.gguf',
    blurb: 'The quality pick when RAM allows — expect single-digit tok/s.',
  },
  {
    id: 'qwen25-3b-q4_0',
    name: 'Qwen 2.5 3B',
    quant: 'Q4_0',
    params: '3.09 B',
    sizeBytes: 1_820_000_000,
    url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_0.gguf',
    file: 'Qwen2.5-3B-Instruct-Q4_0.gguf',
    blurb: 'Strong multilingual 3B — the big-phone alternative to Llama 3B.',
  },
];
