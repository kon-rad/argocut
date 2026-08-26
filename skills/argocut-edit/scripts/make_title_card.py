#!/usr/bin/env python3
"""Render a brand title card as a transparent-or-solid PNG for the timeline.

Konrad Gnat brand — Space Ink base, Cosmic Wash (violet -> cyan) accent rule,
Space Grotesk display over JetBrains Mono label. See
Areas/konradgnat/style-guide.md.

Usage:
  make_title_card.py out.png --title "The Last Few Standing" \
      --label "VLOG 443 · FOREST CITY" [--subtitle "..."] [--end]
"""

import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONTS = Path.home() / "Library" / "Fonts"
DISPLAY = FONTS / "SpaceGrotesk.ttf"
MONO = FONTS / "JetBrainsMono-Medium.ttf"
SERIF = FONTS / "Newsreader-SemiBold.ttf"

SPACE_INK = (10, 10, 18)
DEEP_VOID = (18, 16, 28)
ELECTRIC_VIOLET = (123, 63, 228)
QUANTUM_CYAN = (56, 225, 255)
STARLIGHT = (242, 240, 255)
NEBULA_GREY = (167, 163, 194)


def load(path, size):
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.load_default(size)


def void_depth(size):
    """Space Ink -> Deep Void vertical wash. The 60% of the 60/30/10 ratio."""
    width, height = size
    base = Image.new("RGB", size, SPACE_INK)
    draw = ImageDraw.Draw(base)
    for y in range(height):
        t = y / max(1, height - 1)
        draw.line(
            [(0, y), (width, y)],
            fill=tuple(
                round(SPACE_INK[i] + (DEEP_VOID[i] - SPACE_INK[i]) * t) for i in range(3)
            ),
        )
    return base


def cosmic_wash_bar(size, width_px, height_px):
    """Violet -> cyan gradient bar. The signature brand mark."""
    bar = Image.new("RGB", (width_px, height_px))
    draw = ImageDraw.Draw(bar)
    for x in range(width_px):
        t = x / max(1, width_px - 1)
        draw.line(
            [(x, 0), (x, height_px)],
            fill=tuple(
                round(ELECTRIC_VIOLET[i] + (QUANTUM_CYAN[i] - ELECTRIC_VIOLET[i]) * t)
                for i in range(3)
            ),
        )
    return bar


def centred(draw, text, font, y, fill, width, tracking=0):
    if tracking == 0:
        box = draw.textbbox((0, 0), text, font=font)
        draw.text(((width - (box[2] - box[0])) / 2, y), text, font=font, fill=fill)
        return box[3] - box[1]

    widths = [draw.textbbox((0, 0), ch, font=font)[2] for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = (width - total) / 2
    height = 0
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking
        box = draw.textbbox((0, 0), ch, font=font)
        height = max(height, box[3] - box[1])
    return height


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    parser.add_argument("--title", required=True)
    parser.add_argument("--label", default="")
    parser.add_argument("--subtitle", default="")
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--end", action="store_true",
                        help="end-card layout: serif title, channel handle below")
    args = parser.parse_args()

    size = (args.width, args.height)
    card = void_depth(size)
    draw = ImageDraw.Draw(card)
    centre_y = args.height // 2

    if args.label:
        label_font = load(MONO, round(args.height * 0.019))
        centred(draw, args.label.upper(), label_font,
                centre_y - round(args.height * 0.13), NEBULA_GREY,
                args.width, tracking=round(args.height * 0.006))

    title_font = load(SERIF if args.end else DISPLAY, round(args.height * 0.072))
    centred(draw, args.title, title_font,
            centre_y - round(args.height * 0.055), STARLIGHT, args.width)

    bar_width = round(args.width * 0.14)
    bar = cosmic_wash_bar(size, bar_width, max(2, round(args.height * 0.004)))
    card.paste(bar, ((args.width - bar_width) // 2, centre_y + round(args.height * 0.055)))

    if args.subtitle:
        sub_font = load(MONO, round(args.height * 0.021))
        centred(draw, args.subtitle, sub_font,
                centre_y + round(args.height * 0.095), NEBULA_GREY, args.width)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    card.save(out)
    print(f"-> {out}  {args.width}x{args.height}")


if __name__ == "__main__":
    main()
