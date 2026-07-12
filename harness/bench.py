"""PocketTune benchmark harness.

Pushes llama-bench (KleidiAI ON and OFF builds) plus a GGUF model to an Android
phone over adb, runs the benchmark, and writes raw JSON results to results/.

This is the reproducibility path: anyone with an Android phone and the two builds
can rerun every number PocketTune publishes.

Usage:
    python harness/bench.py --list
    python harness/bench.py --model models/Llama-3.2-1B-Instruct-Q4_0.gguf
    python harness/bench.py --model ... --device <serial> --threads 4 6 --reps 5
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RESULTS = REPO / "results"
DEVICE_DIR = "/data/local/tmp/pockettune"

# Build variants — each isolates one optimization lever, so consecutive comparisons
# attribute the gain to a specific cause.
#
#   generic          plain arm64-v8a, no Arm feature flags. Runs on ANY arm64 phone.
#   arch             -march=armv8.2a+i8mm+dotprod           (i8mm phones only — SIGILLs elsewhere)
#   kleidiai         arch flags + KleidiAI microkernels
#   arch-norepack    arch flags, llama.cpp's Q4_0 repack disabled
#   kleidiai-norepack  arch flags + KleidiAI, repack disabled  → KleidiAI's true standalone value
#   dp-arch          -march=armv8.2a+dotprod  (NO i8mm — the Pixel 7a target)
#   dp-kleidiai      dotprod-only + KleidiAI
BUILDS = {
    "generic":           "build-android-base",
    "arch":              "build-android-arch",
    "kleidiai":          "build-android-kai",
    "arch-norepack":     "build-android-arch-norepack",
    "kleidiai-norepack": "build-android-kai-norepack",
    "dp-arch":           "build-android-dp-arch",
    "dp-kleidiai":       "build-android-dp-kai",
}
# Default ladder for an i8mm-capable device.
DEFAULT_VARIANTS = ["generic", "arch", "kleidiai"]

VARIANTS: dict[str, Path] = {}  # populated from --variants at runtime


def adb_path() -> str:
    """Locate adb: PATH first, then the standard SDK location."""
    found = shutil.which("adb")
    if found:
        return found
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if sdk:
        candidate = Path(sdk) / "platform-tools" / "adb.exe"
        if candidate.exists():
            return str(candidate)
    sys.exit("adb not found. Install platform-tools and set ANDROID_HOME.")


ADB = adb_path()


def adb(*args: str, serial: str | None = None, check: bool = True) -> str:
    cmd = [ADB] + (["-s", serial] if serial else []) + list(args)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        sys.exit(f"adb failed: {' '.join(args)}\n{proc.stderr.strip()}")
    return proc.stdout.strip()


def sh(command: str, serial: str) -> str:
    """Run a shell command on the device."""
    return adb("shell", command, serial=serial)


def list_devices() -> list[str]:
    out = adb("devices")
    return [
        line.split("\t")[0]
        for line in out.splitlines()[1:]
        if line.strip() and line.endswith("device")
    ]


def device_profile(serial: str) -> dict:
    """Capture everything needed to interpret a benchmark run."""
    props = {
        key: sh(f"getprop {key}", serial)
        for key in (
            "ro.product.manufacturer",
            "ro.product.model",
            "ro.soc.manufacturer",
            "ro.soc.model",
            "ro.build.version.release",
            "ro.product.cpu.abi",
        )
    }
    features = sh("grep -m1 '^Features' /proc/cpuinfo", serial)
    features = features.split(":", 1)[1].split() if ":" in features else []

    freqs = sh(
        "for c in /sys/devices/system/cpu/cpu[0-9]*; do "
        "cat $c/cpufreq/cpuinfo_max_freq 2>/dev/null || echo 0; done",
        serial,
    )
    max_khz = [int(f) for f in freqs.split() if f.isdigit()]

    mem = sh("grep MemTotal /proc/meminfo", serial)
    mem_kb = int(re.search(r"(\d+)", mem).group(1)) if re.search(r"(\d+)", mem) else 0

    return {
        "serial": serial,
        "manufacturer": props["ro.product.manufacturer"],
        "model": props["ro.product.model"],
        "soc": f'{props["ro.soc.manufacturer"]} {props["ro.soc.model"]}'.strip(),
        "android": props["ro.build.version.release"],
        "abi": props["ro.product.cpu.abi"],
        "cpu_features": features,
        "has_i8mm": "i8mm" in features,
        "has_dotprod": "asimddp" in features,
        "has_sve2": "sve2" in features,
        "cpu_max_khz": max_khz,
        "big_cores": [i for i, f in enumerate(max_khz) if f == max(max_khz)] if max_khz else [],
        "mem_total_kb": mem_kb,
    }


def battery(serial: str) -> dict:
    """Battery level and temperature — thermal state affects every number here."""
    dump = sh("dumpsys battery", serial)
    def field(name: str) -> int | None:
        m = re.search(rf"^\s*{name}:\s*(-?\d+)", dump, re.M)
        return int(m.group(1)) if m else None
    temp = field("temperature")
    return {
        "level_pct": field("level"),
        "temperature_c": temp / 10 if temp is not None else None,
    }


def push_payload(serial: str, model: Path) -> None:
    print(f"  staging on device at {DEVICE_DIR} …")
    sh(f"mkdir -p {DEVICE_DIR}", serial)

    remote_model = f"{DEVICE_DIR}/{model.name}"
    existing = sh(f"stat -c %s {remote_model} 2>/dev/null || echo 0", serial)
    if existing.strip() != str(model.stat().st_size):
        print(f"  pushing {model.name} ({model.stat().st_size / 1e6:.0f} MB) — one time …")
        adb("push", str(model), remote_model, serial=serial)
    else:
        print(f"  {model.name} already on device, skipping push")

    for label, bindir in VARIANTS.items():
        if not (bindir / "llama-bench").exists():
            sys.exit(f"missing build: {bindir / 'llama-bench'}\nBuild it first (see docs).")
        dest = f"{DEVICE_DIR}/{label}"
        sh(f"mkdir -p {dest}", serial)
        for f in bindir.iterdir():
            if f.suffix == ".so" or f.name == "llama-bench":
                adb("push", str(f), f"{dest}/{f.name}", serial=serial)
        sh(f"chmod 755 {dest}/llama-bench", serial)
    print("  staged.")


def run_variant(
    serial: str, variant: str, model: Path, threads: list[int], prompt: int, gen: int, reps: int
) -> list[dict]:
    """Run llama-bench for one build variant; returns llama-bench's JSON rows."""
    workdir = f"{DEVICE_DIR}/{variant}"
    thread_arg = ",".join(str(t) for t in threads)
    cmd = (
        f"cd {workdir} && LD_LIBRARY_PATH=. ./llama-bench "
        f"-m ../{model.name} -p {prompt} -n {gen} -t {thread_arg} -r {reps} -o json"
    )
    raw = sh(cmd, serial)
    start = raw.find("[")
    if start == -1:
        sys.exit(f"llama-bench produced no JSON for {variant}:\n{raw}")
    try:
        return json.loads(raw[start:])
    except json.JSONDecodeError as exc:
        sys.exit(f"could not parse llama-bench JSON for {variant}: {exc}\n{raw[:2000]}")


def summarize(rows: list[dict]) -> dict[str, dict[str, float]]:
    """Collapse llama-bench rows into {test: {threads: tok/s}}."""
    out: dict[str, dict[str, float]] = {}
    for row in rows:
        # llama-bench reports e.g. "pp128" (prefill) and "tg64" (decode)
        label = f"pp{row['n_prompt']}" if row.get("n_prompt") else f"tg{row['n_gen']}"
        out.setdefault(label, {})[str(row["n_threads"])] = row["avg_ts"]
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="PocketTune on-device benchmark harness")
    ap.add_argument("--list", action="store_true", help="list connected devices and exit")
    ap.add_argument("--device", help="adb serial (default: the only connected device)")
    ap.add_argument("--model", type=Path, help="path to a .gguf model")
    ap.add_argument("--threads", type=int, nargs="+", default=[2, 4, 6],
                    help="thread counts to sweep (default: 2 4 6)")
    ap.add_argument("--prompt", type=int, default=128, help="prefill tokens (default: 128)")
    ap.add_argument("--gen", type=int, default=64, help="tokens to generate (default: 64)")
    ap.add_argument("--reps", type=int, default=5, help="repetitions per config (default: 5)")
    ap.add_argument("--cooldown", type=int, default=120,
                    help="seconds between variants, to shed heat (default: 120)")
    ap.add_argument("--variants", nargs="+", default=DEFAULT_VARIANTS,
                    choices=list(BUILDS), metavar="NAME",
                    help=f"build variants to compare, in order. options: {', '.join(BUILDS)}")
    args = ap.parse_args()

    VARIANTS.clear()
    for name in args.variants:
        VARIANTS[name] = REPO / "vendor/llama.cpp" / BUILDS[name] / "bin"

    devices = list_devices()
    if args.list or not devices:
        print("connected devices:", ", ".join(devices) if devices else "(none)")
        if not devices:
            print("\nPlug a phone in, enable USB debugging, and accept the prompt.")
        return

    serial = args.device or devices[0]
    if not args.model:
        sys.exit("--model is required (path to a .gguf)")
    if not args.model.exists():
        sys.exit(f"model not found: {args.model}")

    profile = device_profile(serial)
    print(f"\n▸ {profile['manufacturer']} {profile['model']}  ({profile['soc']})")
    print(f"  i8mm={profile['has_i8mm']}  dotprod={profile['has_dotprod']}  sve2={profile['has_sve2']}")
    print(f"  big cores: cpu{profile['big_cores']}")

    batt = battery(serial)
    if batt["level_pct"] is not None and batt["level_pct"] < 30:
        print(f"  ⚠ battery {batt['level_pct']}% — charge above 30% for trustworthy numbers")
    print(f"  battery {batt['level_pct']}% @ {batt['temperature_c']}°C\n")

    push_payload(serial, args.model)

    runs = {}
    for i, variant in enumerate(VARIANTS):
        if i > 0 and args.cooldown:
            print(f"\n  cooling down {args.cooldown}s (thermal parity between variants) …")
            time.sleep(args.cooldown)
        print(f"\n▸ running variant: {variant}")
        pre = battery(serial)
        rows = run_variant(serial, variant, args.model, args.threads, args.prompt, args.gen, args.reps)
        post = battery(serial)
        runs[variant] = {
            "rows": rows,
            "summary": summarize(rows),
            "battery_before": pre,
            "battery_after": post,
        }
        for label, by_thread in runs[variant]["summary"].items():
            for t, ts in by_thread.items():
                print(f"    {label:>8}  {t} threads:  {ts:7.2f} tok/s")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    payload = {
        "schema": "pockettune.bench.v1",
        "timestamp_utc": stamp,
        "device": profile,
        "model": {"file": args.model.name, "size_bytes": args.model.stat().st_size},
        "params": {
            "prompt_tokens": args.prompt,
            "gen_tokens": args.gen,
            "repetitions": args.reps,
            "threads_swept": args.threads,
            "cooldown_s": args.cooldown,
        },
        "runs": runs,
    }

    RESULTS.mkdir(exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", profile["model"].lower()).strip("-")
    out = RESULTS / f"{slug}-{stamp}.json"
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"\n✓ raw results → {out.relative_to(REPO)}")

    # Attribution ladder: best tok/s per variant, and the gain each lever adds.
    def best(variant: str, label: str) -> float:
        return max(runs.get(variant, {}).get("summary", {}).get(label, {}).values(), default=0.0)

    labels = sorted({lbl for v in runs.values() for lbl in v["summary"]})
    order = [v for v in args.variants if v in runs]
    if len(order) > 1:
        print("\n  Attribution (best thread count per variant):")
        for label in labels:
            print(f"\n    {label}:")
            first = best(order[0], label)
            prev = first
            for variant in order:
                cur = best(variant, label)
                if not cur:
                    continue
                step = f"{cur / prev:.2f}× step" if prev else ""
                total = f"{cur / first:.2f}× total" if first else ""
                print(f"      {variant:>9}: {cur:7.2f} tok/s   {step:>12}   {total:>12}")
                prev = cur


if __name__ == "__main__":
    main()
