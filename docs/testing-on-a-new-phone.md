# Testing PocketTune on a new phone

How to get PocketTune onto any Android phone and produce numbers you can trust.
Written from the actual bring-up on a Nothing Phone (2a) and a Samsung Galaxy
A34 5G — the gotchas below are ones we hit, not hypotheticals.

Everything here runs from a Windows, macOS, or Linux laptop. You need `adb` on
PATH (ships with Android SDK platform-tools) and the phone on USB.

---

## 1. Prepare the phone

1. **Enable Developer options**: Settings → About phone → tap *Build number* 7×.
2. **Enable USB debugging**: Settings → System → Developer options → USB debugging.
3. Plug in over USB and accept the *Allow USB debugging?* prompt on the phone.

Confirm the laptop sees it:

```bash
adb devices
# List of devices attached
# 00078348T000682   device        ← "device", not "unauthorized"
```

`unauthorized` means the on-phone prompt wasn't accepted. `no permissions` on
Linux means you need a udev rule.

If more than one phone is attached, pass `-s <serial>` to every `adb` command
below.

## 2. Build, install, and launch

Prerequisites for building: Node ≥ 22, the Android SDK, and a JDK 17+ — the
easiest JDK is the one bundled with Android Studio (`jbr`), pointed to via
`JAVA_HOME` as shown below. Adjust the Android Studio path to your install.
If you only have a prebuilt `app-release.apk`, skip straight to the
`adb install` line.

The commands differ by shell — pick your terminal:

**Windows — Command Prompt (cmd.exe):**

```bat
cd app
npm install
cd android
set "JAVA_HOME=D:\Softwares\Android Studio\jbr"
gradlew.bat assembleRelease
adb install -r app\build\outputs\apk\release\app-release.apk
```

> `./gradlew` does **not** work in cmd (`'.' is not recognized …`) — the
> wrapper on Windows is the batch file `gradlew.bat`.

**Windows — PowerShell:**

```powershell
cd app
npm install
cd android
$env:JAVA_HOME = 'D:\Softwares\Android Studio\jbr'
.\gradlew.bat assembleRelease
adb install -r app\build\outputs\apk\release\app-release.apk
```

**macOS / Linux / Git Bash on Windows:**

```bash
cd app
npm install
cd android
# macOS:            export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
# Linux:            export JAVA_HOME="$HOME/android-studio/jbr"
# Git Bash (Win):   export JAVA_HOME="D:/Softwares/Android Studio/jbr"
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

> **Windows `npm install` gotcha (any shell)**: llama.rn's postinstall spawns
> `tar`, and Git's GNU tar chokes on `C:\` paths. If the install fails there,
> put a folder containing only `C:\Windows\System32\tar.exe` first on PATH for
> that one command.

The APK is arm64-only — it will refuse to install on an x86 emulator, which is
intentional (we never publish emulator numbers).

Launch it (same on every OS):

```bash
adb shell am start -n com.pockettune/.MainActivity
```

## 3. Get a model onto the phone

**Option A — in-app download.** Models tab → tap the ⤓ next to a model, or use
the *Recommended for this phone* card. Needs Wi-Fi; a 1B Q4_0 is ~770 MB.

**Option B — paste a URL.** Models tab → *Bring your own* → paste any direct
`.gguf` link (on Hugging Face, the file's `…/resolve/main/….gguf` URL). The app
verifies the GGUF header after download, so a wrong link fails loudly instead
of producing a broken model.

**Option C — sideload over USB** (fastest, and what we use for benchmarking):

```bash
adb shell mkdir -p /sdcard/Android/data/com.pockettune/files/models
adb push models/Llama-3.2-1B-Instruct-Q4_0.gguf \
         /sdcard/Android/data/com.pockettune/files/models/
```

Then in the app: Models tab → tap the refresh icon (or restart the app). Any
valid `.gguf` in that directory is detected and registered — the filename does
**not** need to match a catalog entry; unknown files show up with a
"Sideloaded" badge and are tunable like any other model.

> **Windows/Git-Bash note**: MSYS rewrites `/sdcard/...` into a Windows path and
> the push fails with `mkdir: 'D:': Read-only file system`. Prefix the command
> with `MSYS_NO_PATHCONV=1`, or run it from cmd/PowerShell where paths pass
> through untouched.

## 4. Set up trustworthy measurement conditions

The sweep measures real silicon, so the phone's *state* is part of the
experiment. Before running anything that you intend to publish:

- [ ] **Battery > 30%**, and ideally unplugged (charging heats the phone and
      makes the power-rail reading meaningless).
- [ ] **Airplane mode on** — no background sync stealing cores.
- [ ] **Phone cool.** Let it sit ~2 minutes after any heavy work. A hot phone
      throttles and every number drops.
- [ ] **Screen stays on.** ← *the one that bit us.*

**The screen-sleep trap.** If the display sleeps mid-sweep, Android parks the
app's threads and one config will come back absurdly slow (we measured a
`2 thr · FA off` point at 6.0 t/s against ~14 t/s for its neighbours — pure
artifact). The recommendation is then chosen from poisoned data.

Prevent it:

```bash
adb shell svc power stayon usb     # screen stays awake while on USB
```

Or set Settings → Display → Screen timeout to 10 minutes. If a sweep result has
one wildly low outlier, assume the screen slept and rerun it.

## 5. Run the sweep

In the app: **Models → select a downloaded model**, then **Tune → Quick
(~2 min) or Full (~6 min) → Run tuning sweep.**

- **Quick** sweeps thread counts against the llama.cpp default config.
- **Full** sweeps threads × flash attention × quantized KV cache. It runs the
  phone hot — do the cooldown first.

Watch the bar chart fill in per config. When it finishes, the recommendation
card shows decode/prefill gain vs. the stock llama.cpp default, plus
tokens-per-joule where the kernel exposes the battery rails. Tap **Apply this
config**, then use the Chat tab — every reply reports its measured tok/s.

Results persist on-device and appear under *This phone's tuning history* in the
Lab tab.

## 6. Sanity-check what the Device tab reports

Cross-check the app's detection against the kernel directly:

```bash
adb shell "grep -m1 Features /proc/cpuinfo"   # expect asimddp, maybe i8mm, sve2…
adb shell "for c in /sys/devices/system/cpu/cpu[0-9]*; do \
             cat \$c/cpufreq/cpuinfo_max_freq; done"   # per-core max clock
```

The Device tab should agree: same ISA features, same cluster split, big cores at
the same indices. Don't assume cpu0 is the fastest — on **both** phones measured
so far the big cores sit at **cpu6–7**, and getting that backwards silently
benchmarks the little cores.

If the phone reports **no i8mm**, that's not a failure — it's the interesting
case, and it's now a measured one. The Galaxy A34 (`dotprod`, no `i8mm`) gets
**3.88×** prefill from arch flags where the i8mm-capable 2a gets 4.94×: a lower
ceiling, because there are no matrix-multiply instructions to unlock. Thread
placement matters more there, not less — on the A34 the best thread count *flips*
between the generic build (6 threads) and the arch build (2 threads). Publish the
ladder it produces.

**Pick the ladder that matches the chip.** The `arch` / `kleidiai` builds are
compiled `-march=armv8.2-a+dotprod+i8mm` and will **SIGILL** on a phone without
i8mm. Use the `dp-` variants there:

```bash
# i8mm phone:
python harness/bench.py --model models/Llama-3.2-1B-Instruct-Q4_0.gguf \
                        --variants generic arch kleidiai
# dotprod-only phone (dp-arch-clean is the corrected KleidiAI-free control —
# the original dp-arch/dp-kleidiai pair both contained KleidiAI via a build bug):
python harness/bench.py --model models/Llama-3.2-1B-Instruct-Q4_0.gguf \
                        --variants generic dp-arch-clean dp-kleidiai
# pre-dotprod phone (no asimddp in the Features line — e.g. Snapdragon 710):
# every +dotprod build SIGILLs; v82 is plain -march=armv8.2-a
python harness/bench.py --model models/Llama-3.2-1B-Instruct-Q4_0.gguf \
                        --variants generic v82
```

A phone with **no `asimddp` at all** is the floor case: on the one measured (Realme 5 Pro,
Snapdragon 710), `v82` landed within noise of `generic` (1.00×) — there is nothing for the flags
to unlock below dotprod. Expect the interesting number there to be the thread count, not the build.

## 7. Check nothing crashed

```bash
adb logcat -d | grep -E "FATAL|AndroidRuntime"     # expect no output
```

A clean run prints nothing.

## 8. (Optional) Reproduce the published harness numbers

The app tunes *runtime* config. The `results/*.json` numbers in this repo come
from a separate, app-free path: `llama-bench` binaries built at different
optimization levels and driven over adb. That's the reproducibility artifact:

```bash
python harness/bench.py --list          # confirm the phone is visible
python harness/bench.py --model models/Llama-3.2-1B-Instruct-Q4_0.gguf \
                        --variants generic arch kleidiai
```

It pushes the binaries and model, benchmarks each variant with cooldowns between
them, records battery level and temperature, and writes a
`pockettune.bench.v1` JSON into `results/`. See
[benchmark-schema.md](benchmark-schema.md) for the shape of that file.

To surface a new phone's numbers inside the app's Lab tab, regenerate the
bundled evidence and rebuild:

```bash
uv run tools/make_app_evidence.py
```

## 9. Publish the phone's numbers

Almost nothing about a device is hardcoded in prose — every phone the project
talks about lives in data, in three places. Adding a phone means editing those
three, plus a grep pass for the handful of narrative lines that cite a phone by
name.

**1. The site** — `site/index.html`, the `DEVICES` array at the top of the
`<script>` block. Append one object; the evidence panel, the attribution bars,
the carousel (it appears automatically once there are two phones), the "devices
benchmarked" count and the terminal demo all rebuild from it. Copy the values
straight out of the run's `results/*.json` (`runs.<variant>.summary`, at the
thread count that won), and paste them at **full precision** — the speedup
labels are computed, not typed, so rounding early makes them disagree with the
published figures.

```js
{
  status: "measured",              // the only legal value: a phone that actually ran
  soc: "…", phone: "…", abi: "arm64-v8a", date: "…",
  dotprod: true, i8mm: false, sve2: false,     // from the Features line
  bigCores: [6, 7], cores: "…",
  model: "Llama 3.2 1B · Q4_0",
  source: "results/<file>.json",
  builds: [
    { name: "generic",    flag: "generic arm64-v8a",            pp: …, ppThreads: 6, tg: …, tgThreads: 6 },
    { name: "arch flags", flag: "-march=…",                     pp: …, ppThreads: 6, tg: …, tgThreads: 2, vs: 0 },
    { name: "+ KleidiAI", flag: "arch flags + KLEIDIAI=ON",     pp: …, ppThreads: 6, tg: …, tgThreads: 2, vs: 1 }
  ],
  note: "What this chip's ladder actually says — including if it disagrees."
}
```

`vs` is the index of the build a row is compared against, so each bar reports
the gain from *its own* lever rather than a cumulative total.

**2. The app** — `uv run tools/make_app_evidence.py` (above), which folds the
new `results/*.json` into `app/src/data/evidence.json`. If the phone's marketing
SoC name can't be derived from `ro.soc.model`, add it to `KNOWN_DEVICES` in
`app/src/lib/cpu.ts`, keyed by `ro.product.model`.

**3. The README** — the *Devices covered so far* table.

**Then grep.** A few lines of prose cite a phone by name (the headline gain, the
KleidiAI negative, the "devices measured so far" notes in `site/index.html` and
`README.md`). Search for the phone names and the headline figures, and make sure
none of them still claim a phone is the only one measured.

Publish the ladder whatever it says. A phone where the arch flags buy little, or
where KleidiAI finally wins, is more interesting than another confirmation — and
a project whose entire claim is "measure, don't assume" cannot quietly drop the
runs that came out flat.

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `INSTALL_FAILED_NO_MATCHING_ABIS` | The APK is arm64-only. You're on an emulator or a 32-bit device — use a real arm64 phone. |
| Model missing after a push | It landed in the wrong directory, or the file isn't a valid GGUF (the app checks the magic bytes). Check `adb shell ls /sdcard/Android/data/com.pockettune/files/models/`, then tap refresh on the Models tab. |
| `gradlew` / `./gradlew` not recognized | Shell mismatch: cmd needs `gradlew.bat`, PowerShell needs `.\gradlew.bat`, bash needs `./gradlew`. See §2. |
| Gradle fails with a Java/JDK error | `JAVA_HOME` not set for this shell session — set it as shown in §2 (it doesn't persist across new terminals unless you export it globally). |
| One sweep point is drastically slower than its neighbours | The screen slept. `adb shell svc power stayon usb` and rerun. |
| All numbers lower than a previous run | Phone is hot, or battery saver is on. Cool down 2 minutes and retry. |
| Efficiency (tokens/joule) missing | No power-supply node exposes `current_now` to apps (the app probes `battery`, `bms`, and every node typed "Battery"). Speed metrics still work; energy is omitted rather than guessed. |
| Battery %/temp show "restricted" on the Device tab | SELinux hides sysfs battery nodes on this device. Level/charging fall back to the Android API; temperature needs a battery-labeled thermal zone. Harmless for speed tuning. |
| Engine fails to load | Not enough free RAM for the model + KV cache. Try a smaller quant (SmolLM2 360M Q8_0). |
