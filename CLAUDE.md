# CLAUDE.md — PocketTune

## What this project is

**PocketTune**: an Android app that finds and applies the fastest local-LLM configuration for the specific phone it runs on, built for the **Arm Create: AI Optimization Challenge 2026** (Mobile AI track, deadline **July 20, 2026, 4 PM PDT**). Full plan, architecture, optimization levers, and milestones live in [PLAN.md](PLAN.md) — **read it before doing anything**.

One-line pitch: detect the phone's Arm CPU features (dotprod/i8mm/SVE2) → sweep quantization × KleidiAI kernels × threads on-device → recommend + apply the best config → give the user a working offline chat app, with a reproducible benchmark harness.

Differentiators (decided 2026-07-12 after scouting the landscape): **tokens-per-joule is a first-class metric** (Android `BatteryManager`), **big.LITTLE speculative decoding** (draft on little cores, verify on big — config-level via llama.cpp) is the novelty headline, and a **LiteRT cross-runtime comparison** is the stretch goal. **No community leaderboard** — PocketPal AI (same RN + llama.rn stack, 500K+ installs) already owns that; our positioning line: "PocketPal tells you a number; PocketTune makes your phone faster."

## Hard constraints — do not violate

- **The user writes only TypeScript and Python.** Never ask them to write or debug C++, Kotlin, Java, or Swift. Native components (llama.cpp, llama.rn) are used prebuilt or compiled from existing sources via documented, copy-pasteable build commands. If a native code change seems unavoidable, stop and propose an alternative first.
- **Dev machine**: this Windows laptop (**x86, AMD Ryzen 4600H**) is the ONLY machine — the user decided against using a Mac (2026-07-12). All builds happen here: the Android NDK cross-compiles arm64 from x86, and Android Studio for Windows builds the RN app. **Never use an emulator** (x86 hosts can't run arm64 images usably); all testing and benchmarking happens on the physical phones over `adb`/USB.
- **Test device** (feature-verified on-device 2026-07-12 — do not re-derive):
  - **Nothing Phone 2a** — MediaTek MT6886 (Dimensity 7200 Pro), Android 16. Has `asimddp`, **`i8mm`**, `sve`/`sve2`/`svei8mm`/`bf16`. No SME2. Cores: 6× A510 @2.0 GHz (cpu0–5) + 2× A715 @2.8 GHz (**cpu6–7**). 7.24 GiB RAM. Big cores sit at **high indices** — affinity masks must target cpu6–7.
  - **This is the only phone tested so far.** Never name or characterize another device in the repo, the site, the README, or the docs until it has actually been run — no "queued", no "detection verified", no illustrative device examples. When the user tests a new phone, its `results/*.json` is the trigger to add it (site `DEVICES` array, README table, app evidence).
  - Published benchmark numbers come from physical phones only, never an emulator.
- **Hackathon rules**: repo must be public with an MIT or Apache-2.0 LICENSE at root; project must install and run from the README instructions alone; optimization gains must be measurable and reproducible.

## Current status (2026-07-13)

- **Spike done**: llama.cpp cross-compiled (7 variants in `vendor/llama.cpp/build-android-*`), harness `harness/bench.py` works, raw results in `results/`. Headline: **4.94× prefill** from arch flags on the 2a; KleidiAI ≈ arch-flags for Q4_0 (llama.cpp's own aarch64 repack already covers it) — reported honestly as an attribution ladder.
- **App built**: RN 0.86 + TypeScript in `app/` — four tabs (Device / Tune / Chat / Lab), llama.rn 0.12.5 **prebuilts** (no KleidiAI inside; runtime-dispatches by CPU feature — `v8_2_dotprod_i8mm` on the 2a, `v8_2_dotprod` on a dotprod-only chip). In-app tuner sweeps threads × flash-attn × KV-quant via llama.rn `bench()`, applies the best config; chat shows measured tok/s. Lab tab bundles `app/src/data/evidence.json` (regenerate: `uv run tools/make_app_evidence.py` after results change).
- **Windows build gotchas**: llama.rn's postinstall spawns `tar` — Git's GNU tar fails on `C:\` paths; prepend a dir containing only System32's `tar.exe` to PATH before `npm install`. Gradle needs `JAVA_HOME=D:\Softwares\Android Studio\jbr`. `reactNativeArchitectures=arm64-v8a` is set in `app/android/gradle.properties` — do not re-add other ABIs.
- Remaining (see PLAN.md compressed schedule): on-device app verification, quantization-sweep reruns, demo video, Devpost submission.

## Local toolchain (verified 2026-07-12, Windows x86)

All installed and on PATH — do not re-check existence, just use:
- Git 2.45, Node 22.18, npm 10.2, Python 3.11, uv 0.11 — all on PATH
- Android Studio at `D:\Softwares\Android Studio` (bundled JDK 21 at `…\jbr`)
- Android SDK: `C:\Users\AYAN\AppData\Local\Android\Sdk` (= `ANDROID_HOME` / `ANDROID_SDK_ROOT`)
  - platform-tools (adb v1.0.41) — on PATH
  - NDK **30.0.15729638** (= `ANDROID_NDK_HOME`) — newer than RN's pinned NDK 27; for the RN app in Week 2, install NDK 27.x alongside or set `ndkVersion` in build.gradle. Fine as-is for the standalone llama.cpp spike.
  - CMake 4.1.2, Build-Tools 36.1/37.0, Platform android-36
- No emulator, no cmdline-tools/sdkmanager installed (use SDK Manager GUI for more packages)
- Env vars (`ANDROID_HOME`, `ANDROID_SDK_ROOT`, `ANDROID_NDK_HOME`, PATH+=platform-tools) are set at **User scope** — active in new terminals; a tool session started before 2026-07-12 setup must reference adb by full path.

## What to do when resuming (first session)

1. Scaffold the repo: `git init`, MIT `LICENSE`, `README.md` (project pitch + placeholder setup section), `.gitignore` (Node + Android + Python + `*.gguf`), folders: `app/` (React Native), `harness/` (adb-driven benchmark scripts, TS or Python), `tools/` (Python quantization scripts), `docs/`, `results/`.
2. Run the **feasibility spike** (this de-risks everything — do it before any app code):
   - ~~Check `adb`~~ ✅ done 2026-07-12: both phones connect and are authorized; CPU features confirmed (see Test devices above).
   - Cross-compile llama.cpp for Android on this Windows machine with the NDK (CMake + NDK toolchain file) and `-DGGML_CPU_KLEIDIAI=ON`, two targets: `armv9-a` (the 2a) and `armv8.2-a+dotprod` (a dotprod-only chip). Base the steps on Arm's learning path (it assumes macOS/Linux — adapt paths and shell for Windows): https://learn.arm.com/learning-paths/mobile-graphics-and-gaming/performance_llama_cpp_sme2/
   - Script pushing `llama-bench` + a small GGUF (Llama 3.2 1B Q4_0) to `/data/local/tmp` via adb and running it with KleidiAI on vs off, capturing JSON output into `results/`.
   - Success criterion: measurable KleidiAI speedup on the 2a; numbers recorded for both phones.
3. Only after the spike passes, start the RN app skeleton with `llama.rn` (verify whether its prebuilt binaries enable KleidiAI; if not, it's a Gradle/CMake flag change — never new native code).

## Conventions

- App: React Native + TypeScript. State simple (Zustand or React context) — no heavy frameworks.
- Benchmark data: JSON files in `results/`, one per device+config run, schema documented in `docs/benchmark-schema.md` (create when first needed).
- Benchmark rigor (non-negotiable, judges will scrutinize): median of 5 runs, fixed prompt/n_gen, airplane mode, >30% battery, 2-minute cooldown between configs; record device temp when available.
- Python tooling in `tools/` uses `uv`; keep scripts single-purpose.
- Every optimization claim in docs must link to the raw JSON in `results/` that backs it.

## Key references

- Challenge: https://arm-ai-optimization-challenge.devpost.com/ (rules, judging: Tech 40 / Wow 25 / Impact 20 / DX 15)
- Arm learning path (KleidiAI + llama.cpp on Android): https://learn.arm.com/learning-paths/mobile-graphics-and-gaming/performance_llama_cpp_sme2/
- llama.rn (React Native llama.cpp bindings): https://github.com/mybigday/llama.rn
- llama.cpp KleidiAI flag: `GGML_CPU_KLEIDIAI=ON`; SME2 kernels gated by `GGML_KLEIDIAI_SME` env var
