# Building the llama.cpp benchmark variants

Every performance number PocketTune publishes comes from `llama-bench` binaries built from the
**same llama.cpp source, configured different ways**. That is the whole method: if only the build
flags change, the difference between two runs is attributable to those flags and nothing else.

This page is the missing half of [Reproduce the published numbers](../README.md#reproduce-the-published-numbers-headless-harness).
It gives the exact, copy-pasteable configuration for each variant, recovered from the
`CMakeCache.txt` of the builds that produced the committed [results](../results/) — not
reconstructed from memory. Once these are built, [`harness/bench.py`](../harness/bench.py) drives
them over adb.

You do **not** need this to run the app. The app gets its native code prebuilt from llama.rn via
`npm install`. This page is only for reproducing or extending the published benchmarks.

## Prerequisites

| Need | Version used | Notes |
|---|---|---|
| Android NDK | **30.0.15729638** | Any recent NDK should work. `ANDROID_NDK_HOME` must point at it. |
| CMake | 4.1.2 | The NDK's bundled CMake is fine. |
| Git | any | |
| A physical arm64 Android phone | — | No emulator: an x86 host cannot run arm64 images usably, and every published number is from real silicon. |

The NDK cross-compiles arm64 from an x86 host, so a Windows/macOS/Linux laptop is all you need to
*build*. Only the *benchmarking* needs the phone.

## 1. Get llama.cpp at the pinned commit

The published results were built from **commit `e3546c7`** (tag `b9976`) — the `build_commit` field
in every `results/*.json` records this, so a rerun can be compared like-for-like.

```bash
# from the repo root
git clone https://github.com/ggml-org/llama.cpp vendor/llama.cpp
cd vendor/llama.cpp
git checkout e3546c7          # matches build_commit in results/*.json
```

The harness resolves binaries at `vendor/llama.cpp/build-android-<dir>/bin/llama-bench`, so the
build directory names below matter — `bench.py` looks for them literally.

## 2. The flags every variant shares

```
-DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake"
-DANDROID_ABI=arm64-v8a       # the only ABI PocketTune targets
-DANDROID_PLATFORM=android-28
-DCMAKE_BUILD_TYPE=Release
-DBUILD_SHARED_LIBS=ON        # harness pushes the .so files alongside llama-bench
-DGGML_NATIVE=OFF             # CRITICAL when cross-compiling: ON would tune for the x86 build host
-DGGML_OPENMP=OFF
-DLLAMA_CURL=OFF
```

`GGML_NATIVE=OFF` is the one that bites: left ON, ggml probes the *build machine's* CPU (x86) rather
than the target, which is meaningless here. Everything below assumes it is off, so `-march` is the
only thing choosing instructions.

## 3. The variants

Each row changes exactly one thing from the row above it, which is what makes the attribution ladder
in `bench.py` meaningful.

| `--variants` name | Build directory | `CMAKE_C_FLAGS` / `CMAKE_CXX_FLAGS` | `GGML_CPU_KLEIDIAI` | `GGML_CPU_REPACK` | Runs on |
|---|---|---|---|---|---|
| `generic` | `build-android-base` | *(none)* | OFF | ON | any arm64 |
| `v82` | `build-android-v82` | `-march=armv8.2-a` | OFF | ON | pre-dotprod chips |
| `dp-arch-clean` | `build-android-dp-arch-clean` | `-march=armv8.2a+dotprod` | OFF | ON | dotprod, no i8mm |
| `dp-kleidiai` | `build-android-dp-kai` | `-march=armv8.2a+dotprod` | **ON** | ON | dotprod, no i8mm |
| `arch` | `build-android-arch` | `-march=armv8.2a+i8mm+dotprod` | OFF | ON | **i8mm only** |
| `kleidiai` | `build-android-kai` | `-march=armv8.2a+i8mm+dotprod` | **ON** | ON | **i8mm only** |

**Pick the ladder that matches the chip.** Check it first:

```bash
adb shell grep -m1 Features /proc/cpuinfo
```

- has `i8mm` → `generic arch kleidiai`
- has `asimddp` but no `i8mm` → `generic dp-arch-clean dp-kleidiai` — the `+i8mm` builds **SIGILL** here
- neither → `generic v82` — every `+dotprod` build SIGILLs; expect ≈1.00×, there is nothing to unlock

A SIGILL (exit 132) is not a bug in the harness. It is the chip telling you the instruction does not
exist, and it is how the Realme 5 Pro's pre-dotprod floor was established by execution rather than
by reading a spec sheet.

## 4. Build them

```bash
# from vendor/llama.cpp
NDK_TC="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake"
COMMON="-DCMAKE_TOOLCHAIN_FILE=$NDK_TC -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-28 \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DLLAMA_CURL=OFF"

# generic — the unoptimized baseline every speedup is measured against
cmake -B build-android-base $COMMON \
  -DGGML_CPU_KLEIDIAI=OFF -DGGML_CPU_REPACK=ON
cmake --build build-android-base --target llama-bench -j

# v82 — pre-dotprod chips (arch-aware, but no ISA extension)
cmake -B build-android-v82 $COMMON \
  -DCMAKE_C_FLAGS="-march=armv8.2-a" -DCMAKE_CXX_FLAGS="-march=armv8.2-a" \
  -DGGML_CPU_KLEIDIAI=OFF -DGGML_CPU_REPACK=ON
cmake --build build-android-v82 --target llama-bench -j

# dp-arch-clean — dotprod-only chips, KleidiAI genuinely off
cmake -B build-android-dp-arch-clean $COMMON \
  -DCMAKE_C_FLAGS="-march=armv8.2a+dotprod" -DCMAKE_CXX_FLAGS="-march=armv8.2a+dotprod" \
  -DGGML_CPU_KLEIDIAI=OFF -DGGML_CPU_REPACK=ON
cmake --build build-android-dp-arch-clean --target llama-bench -j

# dp-kleidiai — same flags, KleidiAI on: isolates the microkernel library
cmake -B build-android-dp-kai $COMMON \
  -DCMAKE_C_FLAGS="-march=armv8.2a+dotprod" -DCMAKE_CXX_FLAGS="-march=armv8.2a+dotprod" \
  -DGGML_CPU_KLEIDIAI=ON -DGGML_CPU_REPACK=ON
cmake --build build-android-dp-kai --target llama-bench -j

# arch — i8mm chips only
cmake -B build-android-arch $COMMON \
  -DCMAKE_C_FLAGS="-march=armv8.2a+i8mm+dotprod" -DCMAKE_CXX_FLAGS="-march=armv8.2a+i8mm+dotprod" \
  -DGGML_CPU_KLEIDIAI=OFF -DGGML_CPU_REPACK=ON
cmake --build build-android-arch --target llama-bench -j

# kleidiai — i8mm chips only, KleidiAI on
cmake -B build-android-kai $COMMON \
  -DCMAKE_C_FLAGS="-march=armv8.2a+i8mm+dotprod" -DCMAKE_CXX_FLAGS="-march=armv8.2a+i8mm+dotprod" \
  -DGGML_CPU_KLEIDIAI=ON -DGGML_CPU_REPACK=ON
cmake --build build-android-kai --target llama-bench -j
```

Each produces `build-android-*/bin/` containing `llama-bench` plus `libggml*.so`, `libllama.so`,
`libllama-common.so`, `libllama-bench-impl.so`. The harness pushes all of them.

## 5. Verify the configuration took — do not skip this

**This project shipped a bug that this one check would have caught.** Four builds were configured
through a shell wrapper that passed an *unexpanded* variable:

```
GGML_CPU_KLEIDIAI:BOOL=$kai        # literally the string "$kai"
GGML_CPU_REPACK:BOOL=$repack       # literally the string "$repack"
```

CMake treats any non-empty string that isn't `0`/`OFF`/`FALSE`/`N` as **truthy**. So every build
meant to have KleidiAI *off* silently had it **on** — including `dp-arch`, which existed purely to
be KleidiAI's control group. It was compared against `dp-kleidiai` and the two agreed to four
decimal places, because they were the same binary. `build-android-dp-arch-clean` is the honest
rebuild; the historical `build-android-dp-arch` directory is kept only so the contaminated numbers
in `results/` stay traceable to something.

The same `$repack` expansion voided the `arch-norepack` / `kleidiai-norepack` experiment — both have
repack **on** despite their names, so they measure nothing. They are not in the table above and
should be rebuilt with `-DGGML_CPU_REPACK=OFF` if anyone wants that comparison.

So, after configuring, read the cache back:

```bash
grep -E "GGML_CPU_(KLEIDIAI|REPACK)" build-android-dp-arch-clean/CMakeCache.txt
# GGML_CPU_KLEIDIAI:BOOL=OFF
# GGML_CPU_REPACK:BOOL=ON
```

If either side of the `=` is anything other than a literal `ON` or `OFF` — a `$name`, an empty
string — **the build is not what its directory says it is.** Delete it and reconfigure.

The general lesson, and the reason this section exists: *two builds that should differ producing
identical numbers is not a null result, it's a bug report.* Treat suspiciously exact agreement as
evidence that you are benchmarking one binary twice.

## 6. Run the sweep

```bash
# back at the repo root; put a GGUF in models/ first
python harness/bench.py --model models/Llama-3.2-1B-Instruct-Q4_0.gguf \
  --variants generic dp-arch-clean dp-kleidiai
```

`bench.py --list` shows connected devices. Results land in `results/<device>-<timestamp>.json`.
Methodology (5 reps, fixed prompt/gen lengths, cooldowns between variants, airplane mode) and the
per-phone specifics are in [testing-on-a-new-phone.md](testing-on-a-new-phone.md); the output schema
is in [benchmark-schema.md](benchmark-schema.md).
