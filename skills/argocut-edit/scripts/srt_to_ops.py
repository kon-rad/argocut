#!/usr/bin/env python3
"""Turn an SRT into `add_text` ops positioned on the timeline.

Subtitle timings are relative to the **source clip**. A clip on the timeline
starts somewhere else and may be trimmed, so each cue has to be shifted by
`timelineStart - trimStart` and dropped if it falls outside the visible span.

Emitting text elements rather than burning captions keeps every line editable in
the GUI — which is the point of assembling in an editor at all.

Usage:
  srt_to_ops.py sub.srt --timeline-start 78.27 --trim-start 0 --span 109 \
      [--font-size 38] [--max-chars 42] > ops.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

TIME = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
)


def to_seconds(h, m, s, ms):
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def parse(path):
    cues = []
    for block in Path(path).read_text(encoding="utf-8").strip().split("\n\n"):
        lines = [line for line in block.strip().split("\n") if line.strip()]
        if len(lines) < 2:
            continue
        match = next((TIME.match(line) for line in lines if TIME.match(line)), None)
        if not match:
            continue
        start = to_seconds(*match.groups()[:4])
        end = to_seconds(*match.groups()[4:])
        text = " ".join(
            line.strip() for line in lines if not TIME.match(line) and not line.strip().isdigit()
        ).strip()
        if text:
            cues.append((start, end, text))
    return cues


def wrap(text, limit):
    words, lines, current = text.split(), [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= limit or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("srt")
    parser.add_argument("--timeline-start", type=float, required=True,
                        help="where the clip sits on the timeline, in seconds")
    parser.add_argument("--trim-start", type=float, default=0.0,
                        help="seconds trimmed off the head of the source")
    parser.add_argument("--span", type=float, required=True,
                        help="visible length of the clip on the timeline")
    parser.add_argument("--font-size", type=int, default=38)
    parser.add_argument("--max-chars", type=int, default=42)
    parser.add_argument("--track", default=None)
    parser.add_argument("--min-duration", type=float, default=0.6)
    args = parser.parse_args()

    offset = args.timeline_start - args.trim_start
    window_start, window_end = args.trim_start, args.trim_start + args.span

    ops, dropped = [], 0
    for start, end, text in parse(args.srt):
        # Clip the cue to the part of the source that is actually on screen.
        visible_start = max(start, window_start)
        visible_end = min(end, window_end)
        if visible_end - visible_start < args.min_duration:
            dropped += 1
            continue

        op = {
            "op": "add_text",
            "text": wrap(text, args.max_chars),
            "startTime": round(visible_start + offset, 3),
            "duration": round(visible_end - visible_start, 3),
            "params": {"fontSize": args.font_size},
        }
        if args.track:
            op["track"] = args.track
        ops.append(op)

    print(json.dumps(ops, indent=1, ensure_ascii=False))
    print(f"{len(ops)} cues placed, {dropped} dropped (outside the visible span "
          f"or shorter than {args.min_duration}s)", file=sys.stderr)


if __name__ == "__main__":
    main()
