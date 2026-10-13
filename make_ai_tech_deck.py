#!/usr/bin/env python
"""
make_ai_tech_deck.py - generate a MAX-8-SLIDE deck in the look of "Ai Tech Borek Presentation EN.pptx"
(same theme, logos, Inter font, grid and layouts) from a plain-text description.

    python make_ai_tech_deck.py examples/ai_tech_deck.txt -o out/ai_tech_8.pptx
    python make_ai_tech_deck.py my_notes.txt --auto            # free prose -> layouts via an LLM (needs API key)
    python make_ai_tech_deck.py --list-layouts

Input (see deck_text.py for the syntax): one `=== layout` block per slide, `key: value` lines.
The slide master (theme, 16:9 size, fonts) is taken from the reference PPTX when it sits next to this
script; otherwise a blank 20 x 11.25 in deck is created - the slides look identical.
"""
import argparse
import sys
from pathlib import Path

import borek_pptx as bp
import deck_text

HERE = Path(__file__).resolve().parent
REFERENCE = HERE / "Ai Tech Borek Presentation EN.pptx"
MAX_SLIDES = 8
FOOTER = "Borek Solutions Group · boreksolutions.de"        # same footer as the reference deck
AITECH_TEAM = ["Konstantin Borek", "Fiona Oldenburg", "Kushal Rao", "Viktoria Schünemann", "Elena Manovska",
               "Muhamet Abdullahu"]


def apply_reference_defaults(spec):
    """Fixed slides keep the reference deck's wording."""
    for sl in spec:
        if sl["layout"] == "who_we_are":
            sl.setdefault("timeline", bp.F2_TIMELINE_AITECH)
            sl.setdefault("people", AITECH_TEAM)
        if sl["layout"] == "closing":
            sl.setdefault("long_roles", False)
            sl.setdefault("contacts", ["Konstantin Borek", "Viktoria Schünemann", "Fiona Oldenburg", "Max Fichtner"])
    return spec


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?", help="text file (.txt/.md, or .json) describing the slides")
    ap.add_argument("-o", "--output", default="ai_tech_deck.pptx")
    ap.add_argument("--template", default=str(REFERENCE) if REFERENCE.exists() else None,
                    help="PPTX whose theme/size is reused (default: the reference deck if present)")
    ap.add_argument("--auto", action="store_true",
                    help="input is free prose; let an LLM (OPENAI_API_KEY or ANTHROPIC_API_KEY) pick layouts")
    ap.add_argument("--save-spec", help="write the resolved slide spec as JSON")
    ap.add_argument("--preview", action="store_true", help="also render PNG previews next to the output")
    ap.add_argument("--list-layouts", action="store_true")
    a = ap.parse_args()

    if a.list_layouts:
        for k, v in bp.LAYOUT_DOCS.items():
            print(f"{k:14s} {v}")
        return 0
    if not a.input:
        ap.error("input file required")

    if a.auto:
        import llm_planner
        try:
            spec = llm_planner.plan_deck(
                materials={"Text": Path(a.input).read_text(encoding="utf-8-sig")},
                max_slides=MAX_SLIDES, lang="EN", preset="aitech")
        except RuntimeError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1
    else:
        spec = deck_text.load_spec(a.input)

    if len(spec) > MAX_SLIDES:
        print(f"ERROR: {len(spec)} slides requested, the limit is {MAX_SLIDES}. Remove {len(spec) - MAX_SLIDES}.",
              file=sys.stderr)
        return 2
    spec = apply_reference_defaults(spec)
    if a.save_spec:
        import json
        Path(a.save_spec).write_text(json.dumps({"slides": spec}, indent=2, ensure_ascii=False), encoding="utf-8")

    out = Path(a.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    warnings = bp.build_deck(spec, out, template=a.template, footer_text=FOOTER)
    for i, w in warnings:
        print(f"  warning slide {i}: {w}")
    print(f"OK  {len(spec)} slides -> {out}")
    if a.preview:
        import preview_pptx
        preview_pptx.render(str(out), str(out.with_suffix("")) + "_preview", contact=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
