"""Distill results/*.json into the compact evidence dataset bundled inside the app.

The app's Lab tab visualizes the spike findings (attribution ladder, thread
scaling). Rather than shipping megabytes of raw llama-bench rows, this script
collapses each run to its summary and provenance, so every number rendered
in-app traces back to a raw file in results/.

Usage:
    uv run tools/make_app_evidence.py
"""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RESULTS = REPO / "results"
OUT = REPO / "app" / "src" / "data" / "evidence.json"

# Human-readable lever descriptions, keyed by harness variant name.
VARIANT_INFO = {
    "generic": {
        "label": "Generic arm64",
        "detail": "Plain armv8-a build — what a non-optimized app ships",
    },
    "baseline": {
        "label": "Baseline",
        "detail": "Default build, no arch flags",
    },
    "arch": {
        "label": "Arch-tuned",
        "detail": "armv8.2-a + dotprod + i8mm flags, Q4_0 online repack",
    },
    "arch-norepack": {
        "label": "Arch, no repack",
        "detail": "Arch flags with llama.cpp's Q4_0 repack disabled",
    },
    "kleidiai": {
        "label": "KleidiAI",
        "detail": "Arch flags + Arm KleidiAI microkernels",
    },
    "kleidiai-norepack": {
        "label": "KleidiAI, no repack",
        "detail": "KleidiAI without llama.cpp's own repack — standalone value",
    },
    "dp-arch": {
        "label": "Arch (dotprod only)",
        "detail": "armv8.2-a + dotprod, the non-i8mm path (Pixel 7a)",
    },
    "dp-kleidiai": {
        "label": "KleidiAI (dotprod)",
        "detail": "Dotprod-only KleidiAI build",
    },
}


def main() -> None:
    runs = []
    for path in sorted(RESULTS.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("schema") != "pockettune.bench.v1":
            continue
        device = data["device"]
        variants = []
        for name, run in data["runs"].items():
            info = VARIANT_INFO.get(name, {"label": name, "detail": ""})
            variants.append(
                {
                    "name": name,
                    "label": info["label"],
                    "detail": info["detail"],
                    "summary": run["summary"],
                    "battery_before": run.get("battery_before"),
                    "battery_after": run.get("battery_after"),
                }
            )
        runs.append(
            {
                "source": path.name,
                "timestamp_utc": data["timestamp_utc"],
                "device": {
                    "manufacturer": device["manufacturer"],
                    "model": device["model"],
                    "soc": device["soc"],
                    "has_i8mm": device["has_i8mm"],
                    "has_dotprod": device["has_dotprod"],
                    "has_sve2": device["has_sve2"],
                },
                "model_file": data["model"]["file"],
                "params": data["params"],
                "variants": variants,
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"schema": "pockettune.evidence.v1", "runs": runs}, indent=2), encoding="utf-8")
    print(f"wrote {OUT.relative_to(REPO)} ({len(runs)} runs)")


if __name__ == "__main__":
    main()
