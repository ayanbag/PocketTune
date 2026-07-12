# PocketTune

**The fastest local-LLM setup for *your* phone — found and applied in one tap.**

PocketTune is an Android app that detects your phone's Arm CPU features, benchmarks a sweep of
LLM inference configurations **on the device itself**, then recommends and applies the fastest
one — and gives you a fully offline chat app running on it.

Built for the [Arm Create: AI Optimization Challenge 2026](https://arm-ai-optimization-challenge.devpost.com/) (Mobile AI track).

> Every Arm phone is different silicon. Some cores have `i8mm` matrix instructions, some only
> `dotprod`. The right quantization, kernel path, and thread layout differ per device — and
> almost nobody tunes for it. PocketTune closes the loop: **detect → sweep → recommend → apply.**

## Status

🚧 **Week 1 — feasibility spike in progress.** Toolchain and devices verified; llama.cpp +
KleidiAI cross-compile and first benchmarks underway. See [PLAN.md](PLAN.md) for the full plan.

## What makes it different

- **It applies the optimization**, rather than just reporting a number.
- **Tokens per joule**, not just tokens per second — battery-aware config selection via Android's `BatteryManager`.
- **big.LITTLE speculative decoding** — draft model on the little cores, verification on the big cores.
- **Every claim is reproducible**: raw benchmark JSON is committed to [results/](results/), and a
  headless harness runs the same sweep on any Android phone over `adb`.

## Test devices (CPU features verified on-device)

| | Nothing Phone 2a | Pixel 7a |
|---|---|---|
| SoC | MediaTek MT6886 (Dimensity 7200 Pro) | Google Tensor G2 (GS201) |
| `asimddp` (dotprod) | ✅ | ✅ |
| **`i8mm`** | **✅ KleidiAI int8 fast path** | **❌ absent** |
| `sve2` / `bf16` | ✅ | ❌ |
| Cores | 6× A510 @ 2.0 GHz + 2× A715 @ 2.8 GHz | 4× A55 + 2× A78 + 2× X1 @ 2.85 GHz |
| RAM | 7.24 GiB | 7.29 GiB |

The `i8mm` split is the point: the same APK takes the KleidiAI fast path on one phone and cannot
on the other — which is exactly what feature-aware dispatch has to handle.

## Repository layout

```
app/       React Native app (TypeScript)
harness/   adb-driven benchmark scripts — reproduce the numbers yourself
tools/     Python model-quantization scripts (uv)
results/   Raw benchmark JSON — every published claim links here
docs/      Project brief and benchmark schema
```

## Setup

Full setup instructions land at the end of Week 1, once the build is reproducible end-to-end.
See [PLAN.md](PLAN.md) meanwhile.

## License

[MIT](LICENSE)
