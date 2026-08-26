#!/usr/bin/env python3
"""Find shot boundaries and sample thumbnails for each source clip.

Answers "what is actually in this footage" for clips with no speech, where the
transcript tells you nothing. Runs one ffmpeg pass per clip:

  * scene-change detection (`select=gt(scene,THRESH)`) -> shot boundaries
  * a thumbnail at the midpoint of every shot -> thumbs/<clip>-<n>.jpg
  * mean brightness per shot, to flag dark or blown-out material

Writes shots.json next to the footage and prints a per-clip summary.

Usage:
    analyze_shots.py <folder-or-files...> [--threshold 0.30] [--min-shot 1.0]
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}
SHOWINFO_TIME = re.compile(r"pts_time:([0-9.]+)")


def collect(args):
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


def duration_of(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def scene_times(path, threshold):
    """Timestamps where the picture changes enough to count as a new shot."""
    result = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", str(path),
         "-filter:v", f"select='gt(scene,{threshold})',showinfo",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return [float(m) for m in SHOWINFO_TIME.findall(result.stderr)]


def mean_brightness(path, at):
    """Mean luma 0-255 of the frame at `at` seconds. Flags unusable material.

    `metadata=print` writes at info level, so the loglevel must stay at info —
    `-v error` suppresses the very line this parses.
    """
    result = subprocess.run(
        ["ffmpeg", "-v", "info", "-ss", f"{at:.3f}", "-i", str(path),
         "-frames:v", "1", "-filter:v", "signalstats,metadata=print:key=lavfi.signalstats.YAVG",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    match = re.search(r"YAVG=([0-9.]+)", result.stderr + result.stdout)
    return round(float(match.group(1)), 1) if match else None


def grab_thumb(path, at, out):
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-ss", f"{at:.3f}", "-i", str(path),
         "-frames:v", "1", "-vf", "scale=480:-2", str(out)],
        capture_output=True, text=True,
    )


def build_shots(path, threshold, min_shot, thumb_dir):
    total = duration_of(path)
    cuts = [0.0] + [t for t in scene_times(path, threshold) if t > min_shot]
    cuts.append(total)

    shots = []
    for index in range(len(cuts) - 1):
        start, end = cuts[index], cuts[index + 1]
        if end - start < min_shot:
            continue
        middle = start + (end - start) / 2
        thumb = thumb_dir / f"{path.stem}-{len(shots) + 1:02d}.jpg"
        grab_thumb(path, middle, thumb)
        shots.append({
            "index": len(shots) + 1,
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(end - start, 3),
            "brightness": mean_brightness(path, middle),
            "thumbnail": str(thumb),
        })
    return {"path": str(path), "name": path.name,
            "durationSeconds": round(total, 3), "shots": shots}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--threshold", type=float, default=0.30,
                        help="scene-change sensitivity, 0-1 (lower finds more cuts)")
    parser.add_argument("--min-shot", type=float, default=1.0,
                        help="ignore shots shorter than this many seconds")
    args = parser.parse_args()

    paths = collect(args.inputs)
    thumb_dir = paths[0].parent / "analysis" / "thumbs"
    thumb_dir.mkdir(parents=True, exist_ok=True)

    clips = []
    for path in paths:
        print(f"scanning {path.name} ...", file=sys.stderr)
        clips.append(build_shots(path, args.threshold, args.min_shot, thumb_dir))

    out = paths[0].parent / "analysis" / "shots.json"
    out.write_text(json.dumps(clips, indent=2) + "\n")

    for clip in clips:
        print(f"\n{clip['name']}  ({clip['durationSeconds']:.1f}s, "
              f"{len(clip['shots'])} shots)")
        for shot in clip["shots"]:
            dark = ""
            if shot["brightness"] is not None:
                if shot["brightness"] < 40:
                    dark = "  [DARK]"
                elif shot["brightness"] > 215:
                    dark = "  [BLOWN]"
            print(f"  {shot['index']:>2}. {shot['start']:>7.2f} - {shot['end']:>7.2f}"
                  f"  ({shot['duration']:>5.1f}s)  luma {shot['brightness']}{dark}")

    print(f"\n-> {out}")


if __name__ == "__main__":
    main()
