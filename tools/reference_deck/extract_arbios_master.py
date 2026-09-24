#!/usr/bin/env python3
"""Extract Arbios HTML master metadata into reviewable JSON (TSK-014 Phase 4)."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def extract_layouts(html_path: Path) -> dict:
    text = html_path.read_text(encoding="utf-8")
    match = re.search(r'<script type="__bundler/template">(.*?)</script>', text, re.S)
    if not match:
        raise RuntimeError("Could not locate __bundler/template in HTML master")
    template = json.loads(match.group(1))
    if not isinstance(template, str):
        raise RuntimeError("Expected bundled template HTML string")

    layouts = []
    for section in re.split(r"(?=<section )", template):
        label_match = re.search(r'data-label="([^"]+)"', section)
        if not label_match:
            continue
        notes_match = re.search(r'data-speaker-notes="([^"]*)"', section)
        layouts.append(
            {
                "data_label": label_match.group(1).replace("&amp;", "&"),
                "speaker_notes": notes_match.group(1) if notes_match else "",
            }
        )

    hexes = sorted({value.upper() for value in re.findall(r"#([0-9A-Fa-f]{6})\b", template)})
    return {
        "source_html": str(html_path.resolve()),
        "section_count": len(layouts),
        "layouts": layouts,
        "unique_hex_colors": hexes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--html",
        type=Path,
        default=Path.home() / "Downloads" / "Borek Master Presentation.html",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("packages/contracts/arbios_master_layout_registry.extract.json"),
    )
    args = parser.parse_args()
    payload = extract_layouts(args.html)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {args.output} ({payload['section_count']} sections)")


if __name__ == "__main__":
    main()
