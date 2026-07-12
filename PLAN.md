# PocketTune — Arm Create: AI Optimization Challenge 2026

> Device-aware on-device LLM optimizer for Android. Mobile AI track entry.
> **Deadline: July 20, 2026 (set by Ayan — earlier than Devpost's Aug 14).** · [Challenge page](https://arm-ai-optimization-challenge.devpost.com/)

## ⚠️ Compressed schedule — 7 days left as of 2026-07-13

The 9-week plan below is superseded. Remaining work, in priority order:

| Day | Work |
|---|---|
| **1 (Jul 13)** | ✅ **llama.rn audit done** — prebuilts ship 6 arm64 variants with runtime dispatch (`v8_2_dotprod_i8mm` on the 2a) but **no KleidiAI**; fallback path taken as planned. App built same day: 4 tabs (Device/Tune/Chat/Lab), in-app sweep via llama.rn `bench()` turned out cheap so it's IN (threads × flash-attn × KV-quant), tokens-per-joule sampled from the battery rail. |
| **2–4** | On-device verification of the app on both phones; fix what breaks; polish visuals. |
| **5** | Quantization sweep (models downloaded) + error-bar reruns so the KleidiAI claim is defensible. |
| **6** | README with one-command reproduction, results write-up, site polish. |
| **7 (Jul 19)** | Demo video (<3 min) + Devpost submission. Buffer. |

**Cut if time runs short** (in this order): big.LITTLE speculative decoding → energy-per-token → LiteRT comparison → in-app sweep UI. **Never cut**: reproducible harness, raw results in repo, working README, the 4.94× finding.

---
*Original plan below (schedule superseded, substance still valid).*

## Context

The Arm AI Optimization Challenge ($8,000 prizes) requires a public MIT/Apache-2.0 repo demonstrating **measurable AI optimization on Arm**, with setup docs and an optional <3 min demo video. Judging: **Technological Implementation 40 pts** (must "clearly leverage Arm platforms"), **Wow factor 25**, **Potential Impact 20** ("reusable artifacts"), **Developer Experience 15**.

Builder profile: solo, Python/ML + Web/TypeScript skills (no C++ or Kotlin authoring — native pieces are prebuilt libraries or compiled from existing sources by following documented steps). Hardware: **x86 Windows laptop only** (all dev; the Android NDK cross-compiles arm64 from x86) plus two phones. No emulator (x86 hosts can't run arm64 images usably) — all testing on the physical phones over USB. The two phones have different Arm feature levels = a built-in A/B story for feature-aware optimization.

### Test devices — feature-verified on-device 2026-07-12 via adb

| | **Nothing Phone 2a** | **Pixel 7a** |
|---|---|---|
| SoC | MediaTek MT6886 (Dimensity 7200 Pro) | Google Tensor G2 (GS201) |
| `asimddp` (dotprod) | ✅ | ✅ |
| **`i8mm`** | **✅ — KleidiAI int8 fast path** | **❌ absent** |
| `sve` / `sve2` / `svei8mm` / `bf16` | ✅ | ❌ absent |
| `sme` / `sme2` | ❌ | ❌ |
| Cores | 6× A510 @ 2.0 GHz (cpu0–5) + 2× A715 @ 2.8 GHz (**cpu6–7**) | 4× A55 @ 1.80 (cpu0–3) + 2× A78 @ 2.35 (cpu4–5) + 2× X1 @ 2.85 (**cpu6–7**) |
| RAM | 7.24 GiB usable | 7.29 GiB usable |
| Android | 16, arm64-v8a | 16, arm64-v8a |

**Both phones put the big cores at the high indices (cpu6–7)** — affinity masks must target those, easy to get backwards. The Pixel is a **tri-cluster** (three tiers), giving extra affinity options for the speculative-decoding experiment.

## The Project

**PocketTune** answers "what's the fastest local LLM setup for *your* phone?" in one tap. An Android app that:

1. **Detects** the phone's Arm CPU features (dotprod / i8mm / SVE2 / SME2) and SoC details.
2. **Benchmarks** a sweep of configurations on-device: quantization formats (Q4_0, Q4_K_M, Q8_0, …) × llama.cpp KleidiAI kernels on/off × thread counts — measuring prefill t/s, decode t/s, peak RAM, and an energy proxy (battery temp/drain).
3. **Recommends & installs** the optimal model + config for that device, then provides a working **offline chat/assistant** using it — a useful product, not just a harness.
4. **Measures energy, not just speed**: tokens-per-joule per config via Android `BatteryManager`/`dumpsys battery` — "battery awareness" is named in the track text, and no public per-config energy dataset exists.
5. **Novelty headline — big.LITTLE speculative decoding**: draft model on the little cores, target model verifying on the big cores (llama.cpp's existing speculative support + thread affinity — config-level, no C++). No public per-phone data on this exists.
6. **(Stretch) Cross-runtime comparison**: the same model via LiteRT (also KleidiAI-accelerated) vs llama.cpp — the track text names LiteRT/ONNX Runtime/ExecuTorch explicitly.

**Positioning** (a benchmark app with a leaderboard already exists — PocketPal AI, 500K+ installs, built on the same RN + llama.rn stack, which conveniently proves our stack works): *PocketPal tells you a number; PocketTune makes your phone faster.* The differentiator is the closed loop — detect → sweep → recommend → **apply** — plus energy and speculative-decoding data nobody publishes. No leaderboard: PocketPal owns that space.

Why this wins on the rubric: the optimization *is* the product (Tech 40), i8mm-phone vs non-i8mm-phone side-by-side numbers make a compelling video (Wow 25), the benchmark harness + published per-SoC results are reusable artifacts (Impact 20), and one-tap tuning is the DX story (15).

## How the optimization happens (mapped to Arm's listed categories)

| Lever | What we do | Arm's category |
|---|---|---|
| KleidiAI kernels | Build llama.cpp with `GGML_CPU_KLEIDIAI=ON`; microkernels dispatch on dotprod/i8mm/SVE2 | Arm-specific optimization |
| Per-arch builds + feature dispatch | `-mcpu=armv9-a` vs `armv8.2-a+dotprod` splits; runtime feature detection picks the kernel path | Arm-specific optimization |
| Quantization sweep | Q8_0 → Q4_K_M → Q4_0 → Q3_K, measuring size vs speed vs quality | Model size |
| imatrix-calibrated quants | Importance-matrix quantization: lower perplexity at the same file size vs naive quant; recommender scores perplexity, not just tok/s | Model quality |
| KV-cache quantization | q8_0/q4_0 KV cache to cut runtime RAM on 8GB phones | Model size (in memory) |
| Weight repacking | llama.cpp online repacking into i8mm/dotprod-friendly layouts | Model speed / Arm-specific |
| Thread + core affinity tuning | Sweep thread counts; favor big cores on big.LITTLE (Dimensity 7200: 2×A715 + 6×A510) | Model speed |
| Big.LITTLE speculative decoding | Draft model on little cores, verify on big cores — llama.cpp speculative mode + affinity, config-only | Model speed |
| Tokens-per-joule measurement | Battery current via `BatteryManager`; recommend configs by answers-per-charge, not just tok/s | Battery awareness |
| Prompt/session caching + flash attention | Cut time-to-first-token; measured as TTFT metric | Model speed (TTFT) |
| One-tap tuner + headless harness + docs | Reproducible harness anyone can run on their phone | Developer experience |

Headline claims for the writeup: (a) same phone, stock llama.cpp build vs PocketTune-optimized config (target 1.5–2×+ decode/prefill), (b) same APK on the 2a (i8mm) vs Pixel 7a (no i8mm) proving feature-aware dispatch, (c) quality-at-size chart showing imatrix quants beating naive quants at equal MB.

## Architecture & Stack

- **Core inference**: `llama.cpp` built with `-DGGML_CPU_KLEIDIAI=ON` (KleidiAI microkernels auto-dispatch on dotprod/i8mm/SME2). Reference: [Arm learning path — KleidiAI + llama.cpp on Android](https://learn.arm.com/learning-paths/mobile-graphics-and-gaming/performance_llama_cpp_sme2/introduction/).
- **App shell**: **React Native** using [`llama.rn`](https://github.com/mybigday/llama.rn) — all app logic in TypeScript; no C++ or Kotlin authoring. **Key risk/first task**: verify llama.rn's prebuilt binaries include KleidiAI; if not, enabling it is a build-config change (CMake/Gradle flags, following [Arm's build steps](https://learn.arm.com/learning-paths/mobile-graphics-and-gaming/performance_llama_cpp_sme2/build_llama_cpp/)), not new native code. **Fallback**: run stock `llama-bench`/`llama-cli` arm64 binaries via `adb shell` for the harness while the app uses llama.rn as-is.
- **Feature detection**: parse `/proc/cpuinfo` `Features` line (`asimddp`, `i8mm`, `sve` flags) + core topology; no native module needed.
- **Benchmark harness**: JSON-driven sweep runner inside the app; also a headless variant runnable via `adb shell` for reproducibility. `llama-bench` methodology: fixed prompt lengths, fixed n_gen, repetitions, median.
- **Models**: small permissive models (Llama 3.2 1B/3B, Qwen2.5 1.5B, Phi-3-mini) pre-quantized to multiple GGUF formats (Python + llama.cpp Windows-release tools on the laptop; GGUF files are portable); downloaded in-app from Hugging Face.
- **Cross-runtime stretch**: same model on LiteRT (KleidiAI-accelerated) vs llama.cpp, one device, published comparison.
- **Dev environment**: Windows laptop with Android Studio (SDK + NDK cross-compile arm64 from x86); no emulator — iteration and benchmarks on the two physical phones over USB.

## Milestones (~9 weeks to Aug 14)

1. **Week 1 — Feasibility spike**: ~~toolchain + device verification~~ ✅ **done 2026-07-12** (Android SDK/NDK 30/CMake installed on Windows; both phones authorized over adb; CPU features confirmed — see table above). Remaining: build llama.cpp with KleidiAI for Android (NDK, `armv8.2-a+dotprod` / `armv9-a` targets); run `llama-bench` on both phones via adb; confirm measurable KleidiAI speedup on the 2a vs Pixel 7a. *De-risks the whole project before any app code.*
2. **Weeks 2–3 — App skeleton**: RN app with llama.rn (or fallback), model download manager, chat screen working with one model.
3. **Weeks 4–5 — Optimization lab**: CPU feature detection, benchmark sweep runner, results screen with charts, "apply best config" flow.
4. **Week 6 — Measurement rigor**: repeatability (thermal throttling handling: cooldown intervals, median-of-N), RAM/energy metrics, headless mode, baseline-vs-optimized comparison tables for both phones.
5. **Week 7 — Stretch + polish**: speculative-decoding experiment + LiteRT comparison, UI polish, app icon, README with full reproduction instructions, MIT license.
6. **Week 8 — Submission assets**: <3 min demo video (side-by-side phones, airplane-mode demo, benchmark charts), Devpost write-up, final benchmark report in repo.
7. **Buffer week** before Aug 14.

## Benchmark methodology

- Ground truth on **both physical phones** via `adb`; never publish emulator numbers.
- Each config: 5 runs, report median decode + prefill tok/s (llama-bench style), fixed device state (screen on, airplane mode, >30% battery, 2-min cooldown between runs).
- App E2E check: fresh install from README instructions on a clean device profile — rules require it "installs and runs consistently."

## Submission checklist (from official rules)

- [ ] Public GitHub repo, MIT or Apache-2.0 LICENSE file at root
- [ ] Project new/significantly updated during submission period
- [ ] Text description: overview, functionality, setup instructions
- [ ] Demo video <3 min on YouTube (optional but worth 25 wow points)
- [ ] Register on Devpost + join Arm Developer Program Discord (workshops/office hours with Arm engineers)
