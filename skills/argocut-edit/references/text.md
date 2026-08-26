# Text on the ArgoCut timeline

## fontSize is not pixels

The renderer computes the on-screen size as:

```
renderedPx = fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE)   // reference = 90
```

So at **1080p one unit is 12px**, and at 4K it is 24px. The param default of `15`
renders at **180px** — a full-screen headline, not a subtitle.

| Intent | px at 1080p | fontSize |
|---|---|---|
| Subtitle / caption | 42–52 | **3.5 – 4.3** |
| Statement card | 55–70 | 4.6 – 5.8 |
| Title | 90–130 | 7.5 – 11 |

Setting `fontSize: 38` because "38px looks right" produces 456px text that runs
off both edges of the frame. Convert first, every time.

## Position is pixels from the canvas centre

`transform.positionX` / `positionY` offset from the middle of the canvas, y
positive downward. Text defaults to dead centre, which is over the speaker's
face. A caption belongs in the lower third:

```
positionY = canvasHeight * 0.34      // 1080p -> ~370
```

## Padding scales with the font

`background.paddingX/Y` are multiplied by `fontSize / 15`. At a caption size of
4 that factor is 0.27, so the default padding of 30 becomes 8px and the plate
hugs the glyphs. Multiply the padding you actually want by roughly 3.7 at caption
size — the presets already do.

## Legibility over video

Turn `background.enabled` on for anything sitting over moving footage. A plate in
the brand's base colour reads at every frame; white text alone disappears the
moment the shot goes bright.

## Presets

`assets/brand-presets.json` holds per-brand `caption`, `statement` and
`lowerThird` blocks. Apply one with `set_params` across every text element rather
than hand-setting keys — consistency is the whole point of a brand.

Fonts come from the app's Google Fonts atlas (1920 families). `JetBrains Mono`,
`Space Grotesk` and `Newsreader` are all present, so the Konrad Gnat pairing
works without embedding anything.
