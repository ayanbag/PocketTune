# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=10"]
# ///
"""Compose a Devpost gallery slide from a raw phone screenshot.

The gallery is a set of 2160x1440 slides: the phone on the left, a copper
eyebrow + headline + two-line subhead on the right. The originals were made
outside the repo, so this script was reverse-engineered from them
(devpost/screenshots/06-sweep-chart.png) to keep later slides from drifting
away from the first thirteen. Every constant below is measured, not guessed:

    canvas          2160x1440, ground #f4f1ec
    phone screen    x=150 y=105 w=552 h=1230, corner radius 54
    shadow          black 22%, offset (26, 23), gaussian sigma 18
    eyebrow         Segoe UI Bold 34 in #b4531f, pen (832, 565)
    headline        Segoe UI Bold 77 in #1a1512, pen (832, 639)
    subhead         Segoe UI Regular 42 in #575047, pen (832, 753), leading 58

The palette is the app's own light theme (app/src/theme.ts) — ground = page,
copper = accent, inks = inkPrimary/inkSecondary — so the slides and the UI
inside them are the same design system.

    uv run tools/make_devpost_slide.py --raw devpost/raw/foo.png \
        --out devpost/screenshots/14-core-load.png \
        --eyebrow TUNE --headline "..." --sub "line one" --sub "line two"
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

CANVAS = (2160, 1440)
GROUND = (244, 241, 236)

SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H = 150, 105, 552, 1230
RADIUS = 54

SHADOW_ALPHA = 56
SHADOW_OFFSET = (26, 23)
SHADOW_SIGMA = 18

TEXT_X = 832
EYEBROW_Y, HEADLINE_Y, SUBHEAD_Y = 565, 639, 753
SUBHEAD_LEADING = 58

COPPER = (180, 83, 31)
INK = (26, 21, 18)
INK_2 = (87, 80, 71)

FONTS = Path("C:/Windows/Fonts")
BOLD = FONTS / "segoeuib.ttf"
REGULAR = FONTS / "segoeui.ttf"


def compose(raw: Path, eyebrow: str, headline: str, subs: list[str]) -> Image.Image:
    canvas = Image.new("RGB", CANVAS, GROUND)

    # Shadow first, so the phone lands on top of it.
    shadow = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(shadow).rounded_rectangle(
        [
            SCREEN_X + SHADOW_OFFSET[0],
            SCREEN_Y + SHADOW_OFFSET[1],
            SCREEN_X + SCREEN_W + SHADOW_OFFSET[0],
            SCREEN_Y + SCREEN_H + SHADOW_OFFSET[1],
        ],
        radius=RADIUS,
        fill=SHADOW_ALPHA,
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(SHADOW_SIGMA))
    canvas.paste(Image.new("RGB", CANVAS, (0, 0, 0)), (0, 0), shadow)

    # The screenshot, resized into the measured rect and clipped to the radius.
    shot = Image.open(raw).convert("RGB").resize((SCREEN_W, SCREEN_H), Image.LANCZOS)
    mask = Image.new("L", (SCREEN_W, SCREEN_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, SCREEN_W - 1, SCREEN_H - 1], radius=RADIUS, fill=255
    )
    canvas.paste(shot, (SCREEN_X, SCREEN_Y), mask)

    draw = ImageDraw.Draw(canvas)
    draw.text((TEXT_X, EYEBROW_Y), eyebrow, font=ImageFont.truetype(str(BOLD), 34), fill=COPPER)
    draw.text((TEXT_X, HEADLINE_Y), headline, font=ImageFont.truetype(str(BOLD), 77), fill=INK)
    sub_font = ImageFont.truetype(str(REGULAR), 42)
    for i, line in enumerate(subs):
        draw.text((TEXT_X, SUBHEAD_Y + i * SUBHEAD_LEADING), line, font=sub_font, fill=INK_2)
    return canvas


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raw", type=Path, required=True, help="raw phone screenshot")
    ap.add_argument("--out", type=Path, required=True, help="slide to write")
    ap.add_argument("--eyebrow", required=True)
    ap.add_argument("--headline", required=True)
    ap.add_argument("--sub", action="append", default=[], help="subhead line (repeatable)")
    args = ap.parse_args()

    slide = compose(args.raw, args.eyebrow, args.headline, args.sub)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    slide.save(args.out)
    print(f"wrote {args.out} {slide.size[0]}x{slide.size[1]}")


if __name__ == "__main__":
    main()
