#!/usr/bin/env python3
"""Emit `set_params` ops applying a brand text preset to elements.

Text defaults in ArgoCut are a full-screen headline in Arial, dead centre. That
is wrong for every caption, so a preset is applied across all of them at once
rather than key by key.

Usage:
  apply_preset.py elements.json --brand konradgnat-vlog --preset caption \
      [--exclude-name "Sadly"] > ops.json

`elements.json` is the output of the `find_elements` tool.
"""

import argparse
import json
import sys
from pathlib import Path

PRESETS = Path(__file__).resolve().parent.parent / "assets" / "brand-presets.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("elements")
    parser.add_argument("--brand", required=True)
    parser.add_argument("--preset", default="caption")
    parser.add_argument("--exclude-name", action="append", default=[],
                        help="skip elements whose name contains this substring")
    parser.add_argument("--only-name", action="append", default=[],
                        help="restrict to elements whose name contains this substring")
    parser.add_argument("--presets-file", default=str(PRESETS))
    args = parser.parse_args()

    presets = json.loads(Path(args.presets_file).read_text())
    brand = presets.get(args.brand)
    if brand is None:
        raise SystemExit(
            f"unknown brand '{args.brand}'. Known: "
            f"{', '.join(k for k in presets if not k.startswith('_'))}"
        )
    block = brand.get(args.preset)
    if block is None:
        raise SystemExit(
            f"brand '{args.brand}' has no preset '{args.preset}'. Known: "
            f"{', '.join(k for k in brand if not k.startswith('_'))}"
        )

    params = {k: v for k, v in block.items() if not k.startswith("_")}
    elements = json.loads(Path(args.elements).read_text())

    ops, skipped = [], 0
    for element in elements:
        name = element.get("name", "")
        if any(token in name for token in args.exclude_name):
            skipped += 1
            continue
        if args.only_name and not any(token in name for token in args.only_name):
            skipped += 1
            continue
        ops.append({
            "op": "set_params",
            "target": {"elementId": element["id"]},
            "params": params,
        })

    print(json.dumps(ops, indent=1, ensure_ascii=False))
    print(f"{len(ops)} elements styled with {args.brand}/{args.preset}, "
          f"{skipped} skipped", file=sys.stderr)


if __name__ == "__main__":
    main()
