# PocketTune

**The fastest local-LLM setup for *your* phone — found and applied in one tap.**

PocketTune is an Android app that detects your phone's Arm CPU features, benchmarks a sweep of
LLM inference configurations **on the device itself**, then recommends and applies the fastest
one — and gives you a fully offline chat app running on it.

Built for the [Arm Create: AI Optimization Challenge 2026](https://arm-ai-optimization-challenge.devpost.com/) (Mobile AI track).

> Every Arm phone is different silicon. Some cores have `i8mm` matrix instructions, some only
> `dotprod`. The right quantization, kernel path, and thread layout differ per device — and
> almost nobody tunes for it. PocketTune closes the loop: **detect → sweep → recommend → apply.**

## Headline result

**4.94× faster prompt processing** on a Nothing Phone (2a) — same phone, same Llama 3.2 1B Q4_0
model, same llama.cpp source — purely from Arm-aware build flags (`armv8.2-a+dotprod+i8mm`) and
llama.cpp's Q4_0 repack into i8mm-friendly layouts (20.5 → 101.4 prefill t/s). Decode improves
1.34× (12.7 → 17.0 t/s). Raw data: [results/](results/). The app then finds the best *runtime*
config (threads × flash attention × KV-cache quant) per device on top of that.

## The app

Four tabs, all TypeScript (React Native + [llama.rn](https://github.com/mybigday/llama.rn)):

| Tab | What it does |
|---|---|
| **Device** | Reads `/proc/cpuinfo` + cpufreq topology: dotprod/i8mm/SVE2/SME2 checklist, big.LITTLE core map, which arm64 kernel variant the runtime dispatch selects |
| **Tune** | Downloads a GGUF, runs a llama-bench-style sweep on-device (thread counts × flash attention × quantized KV cache), charts every config, recommends the winner, applies it in one tap |
| **Chat** | Offline assistant running the applied config, with measured tok/s on every reply |
| **Lab** | The published harness evidence (attribution ladder, thread-scaling curves) plus this phone's own tuning history — every number traceable to raw JSON in `results/` |

Where the kernel exposes the battery rails (`/sys/class/power_supply/battery`), the sweep also
reports **tokens per joule** per config — energy is a first-class metric, not an afterthought.

llama.rn ships six arm64 kernel builds and picks one at runtime by CPU feature — a Nothing 2a
gets `v8_2_dotprod_i8mm`, a Pixel 7a gets `v8_2_dotprod`. Feature-aware dispatch is the same
story our harness measures with explicit per-arch builds.

## Quick start — run the app

Prereqs: Node ≥ 22, JDK 17+, Android SDK (a stock Android Studio install is fine), a phone with
USB debugging enabled.

```bash
git clone https://github.com/ayanbag/pockettune   # this repo
cd pockettune/app
npm install
npm run android          # builds and installs the debug app on the connected phone
```

Release APK: `cd app/android && ./gradlew assembleRelease` → `app/android/app/build/outputs/apk/release/app-release.apk`
(signed with the debug keystore — fine for sideloading).

Then in the app: **Tune tab → download a model → Run tuning sweep → Apply → Chat.**
No account, no network needed after the model download — airplane mode is the demo.

Tip: skip the in-app download by pushing a GGUF you already have:
`adb push model.gguf /sdcard/Android/data/com.pockettune/files/models/`

## Reproduce the published numbers (headless harness)

The numbers in `results/` come from `llama-bench` builds driven over adb — no app involved, so
anyone can verify them:

```bash
# 1. Cross-compile llama.cpp for Android (Windows/macOS/Linux; needs Android NDK + CMake)
#    Variants and exact flags are documented in docs/ — the key ones:
#      generic:  no arch flags (what a non-optimized app ships)
#      arch:     -march=armv8.2-a+dotprod+i8mm
#      kleidiai: arch flags + -DGGML_CPU_KLEIDIAI=ON

# 2. Run the sweep (pushes binaries + model, benchmarks, writes results/*.json)
python harness/bench.py --model models/Llama-3.2-1B-Instruct-Q4_0.gguf --variants generic arch kleidiai
```

Methodology: 5 repetitions per point, fixed prompt (128) and generation (64) lengths, 2-minute
cooldowns between variants, battery level and temperature recorded before and after each variant.

## Test devices (CPU features verified on-device)

| | Nothing Phone 2a | Pixel 7a |
|---|---|---|
| SoC | MediaTek MT6886 (Dimensity 7200 Pro) | Google Tensor G2 (GS201) |
| `asimddp` (dotprod) | ✅ | ✅ |
| **`i8mm`** | **✅ int8 matmul fast path** | **❌ absent** |
| `sve2` / `bf16` | ✅ | ❌ |
| Cores | 6× A510 @ 2.0 GHz + 2× A715 @ 2.8 GHz | 4× A55 + 2× A78 + 2× X1 @ 2.85 GHz |
| RAM | 7.24 GiB | 7.29 GiB |

The `i8mm` split is the point: the same APK takes the int8 matrix-multiply fast path on one
phone and cannot on the other — which is exactly what feature-aware dispatch has to handle.

## An honest finding

On the 2a, KleidiAI microkernels land **within noise of the plain arch-flags build** for Q4_0:
llama.cpp's own aarch64 repack path already exploits dotprod/i8mm well. The 4.94× headline is
attributable to arch-aware codegen + repacking, not to any single library — the attribution
ladder in `results/` isolates each lever. We report it that way.

## Repository layout

```
app/       React Native app (TypeScript) — the product
harness/   adb-driven benchmark harness — reproduce every published number
tools/     Python utilities (uv): evidence distillation for the app
results/   Raw benchmark JSON — every published claim links here
docs/      Project brief and benchmark schema
site/      Project site
```

## License

[MIT](LICENSE)
