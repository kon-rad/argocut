#!/usr/bin/env python3
"""Probe source clips with ffprobe and write clips.json next to them.

Reads what the edit plan needs to be correct: duration, frame rate, resolution,
whether there is an audio track at all, and rotation. Prints a table and exits
non-zero if any file could not be probed.

Usage:
    probe_clips.py <folder>
    probe_clips.py clip-a.mp4 clip-b.mov ...
"""

import json
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}


def collect(args):
    if not args:
        raise SystemExit("usage: probe_clips.py <folder-or-files...>")

    paths = []
    for arg in args:
        path = Path(arg).expanduser()
        if path.is_dir():
            paths.extend(
                sorted(p for p in path.iterdir() if p.suffix.lower() in VIDEO_SUFFIXES)
            )
        elif path.is_file():
            paths.append(path)
        else:
            raise SystemExit(f"not found: {path}")

    if not paths:
        raise SystemExit("no video files found")
    return paths


def probe(path):
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-print_format", "json",
            "-show_format", "-show_streams",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return {"path": str(path), "error": result.stderr.strip() or "ffprobe failed"}

    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    fps = None
    if video and video.get("avg_frame_rate", "0/0") not in ("0/0", None):
        try:
            fps = float(Fraction(video["avg_frame_rate"]))
        except (ZeroDivisionError, ValueError):
            fps = None

    rotation = 0
    for side in (video or {}).get("side_data_list", []) or []:
        if "rotation" in side:
            rotation = int(side["rotation"])

    return {
        "path": str(path),
        "name": path.name,
        "durationSeconds": float(data.get("format", {}).get("duration", 0.0)),
        "sizeBytes": int(data.get("format", {}).get("size", 0)),
        "videoCodec": (video or {}).get("codec_name"),
        "width": (video or {}).get("width"),
        "height": (video or {}).get("height"),
        "fps": round(fps, 4) if fps else None,
        "rotation": rotation,
        "hasAudio": audio is not None,
        "audioCodec": (audio or {}).get("codec_name"),
    }


def human_time(seconds):
    seconds = int(seconds)
    return f"{seconds // 3600:d}:{(seconds % 3600) // 60:02d}:{seconds % 60:02d}"


def main():
    paths = collect(sys.argv[1:])
    clips = [probe(path) for path in paths]

    out = paths[0].parent / "clips.json"
    out.write_text(json.dumps(clips, indent=2) + "\n")

    print(f"{'clip':<22}{'duration':>10}{'fps':>8}{'resolution':>13}"
          f"{'codec':>8}{'audio':>7}")
    print("-" * 68)
    total = 0.0
    failed = 0
    for clip in clips:
        if "error" in clip:
            print(f"{Path(clip['path']).name:<22}  FAILED: {clip['error'][:40]}")
            failed += 1
            continue
        total += clip["durationSeconds"]
        resolution = f"{clip['width']}x{clip['height']}"
        print(
            f"{clip['name']:<22}{human_time(clip['durationSeconds']):>10}"
            f"{clip['fps'] or '?':>8}{resolution:>13}"
            f"{clip['videoCodec'] or '?':>8}{'yes' if clip['hasAudio'] else 'no':>7}"
        )
    print("-" * 68)
    print(f"{len(clips) - failed} clips, {human_time(total)} total  ->  {out}")

    rates = {c.get("fps") for c in clips if c.get("fps")}
    if len(rates) > 1:
        print(f"\nNOTE: mixed frame rates {sorted(rates)} — importing the highest "
              "will ratchet the project fps.")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
