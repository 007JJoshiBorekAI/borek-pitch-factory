#!/usr/bin/env python
"""
make_master_deck.py - build a client presentation from the "Borek Master Presentation" layouts.

Inputs (any combination):
    --pitch FILE        what we pitch: offer, products, prices, key messages      (.txt .md .docx .pptx .pdf .html .json)
    --client FILE       who the client is: company, industry, size, pains, goals  (same formats)
    --transcript FILE   uploaded call / meeting transcript                        (.txt .md .vtt .srt .docx .json ...)
    --text "..."        free text typed on the command line (repeatable)
    --text-file FILE    free text from a file (repeatable)
    --image KEY=PATH    images the layouts need, e.g.  --image case_study=screenshot.png
                        --image "Dr. Jane Doe=jane.png"  (photo for a contact who is not in the Borek roster)

Flow:  materials -> LLM (OPENAI_API_KEY / ANTHROPIC_API_KEY) -> slide plan (JSON) -> python-pptx deck
       The plan is saved next to the deck (<name>.plan.json) - edit it and re-run with --spec to re-render.

Without an API key:
    python make_master_deck.py --pitch p.docx --client c.md --transcript t.vtt --prompt-only
    -> paste the written prompt into any chat model, save its JSON reply as plan.json, then
    python make_master_deck.py --spec plan.json -o deck.pptx

Hand-written plan (no LLM at all): --spec my_deck.txt  (see examples/all_layouts_demo.txt for every layout)

Missing images (case-study screenshot, photos of non-roster people) are asked for interactively; with
--no-interactive a placeholder is drawn instead.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import zipfile
from pathlib import Path

import borek_pptx as bp
import deck_text

HERE = Path(__file__).resolve().parent
REFERENCE = HERE / "Ai Tech Borek Presentation EN.pptx"
FOOTERS = {"EN": "Borek Solutions Group · boreksolutions.de · Confidential",
           "DE": "Borek Solutions Group · boreksolutions.de · Vertraulich"}
MAX_CHARS = 60000        # per source, keeps the prompt inside any model's context


# ------------------------------------------------------------------------------------------
# readers
# ------------------------------------------------------------------------------------------
def _docx_text(path: Path) -> str:
    from lxml import etree
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(path) as z:
        root = etree.fromstring(z.read("word/document.xml"))
    paras = []
    for p in root.iter("{%s}p" % ns["w"]):
        t = "".join(x.text or "" for x in p.iter("{%s}t" % ns["w"]))
        if t.strip():
            paras.append(t)
    return "\n".join(paras)


def _pptx_text(path: Path) -> str:
    from pptx import Presentation
    out = []
    for i, sl in enumerate(Presentation(str(path)).slides, 1):
        out.append(f"[slide {i}]")
        out += [sh.text_frame.text for sh in sl.shapes if sh.has_text_frame and sh.text_frame.text.strip()]
    return "\n".join(out)


def _pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        raise SystemExit(f"{path.name}: reading PDF needs  pip install pypdf  (or export the PDF to .txt/.docx)")
    return "\n".join((p.extract_text() or "") for p in PdfReader(str(path)).pages)


def _caption_text(raw: str) -> str:
    """WebVTT / SRT -> 'text' lines without cue numbers and timestamps; merges consecutive lines of one speaker."""
    lines = []
    for ln in raw.splitlines():
        ln = ln.strip()
        if (not ln or ln == "WEBVTT" or re.fullmatch(r"\d+", ln) or "-->" in ln or ln.startswith(("NOTE", "STYLE"))):
            continue
        ln = re.sub(r"<[^>]+>", "", ln)
        lines.append(ln)
    return "\n".join(lines)


def read_source(path) -> str:
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"file not found: {p}")
    ext = p.suffix.lower()
    if ext == ".docx":
        txt = _docx_text(p)
    elif ext == ".pptx":
        txt = _pptx_text(p)
    elif ext == ".pdf":
        txt = _pdf_text(p)
    elif ext in (".html", ".htm"):
        txt = html.unescape(re.sub(r"<(script|style).*?</\1>|<[^>]+>", " ", p.read_text(encoding="utf-8", errors="ignore"),
                                   flags=re.S))
        txt = re.sub(r"[ \t]+", " ", txt)
    else:
        raw = p.read_text(encoding="utf-8-sig", errors="ignore")
        if ext in (".vtt", ".srt"):
            txt = _caption_text(raw)
        elif ext == ".json":                       # e.g. Teams / Zoom / Otter exports
            try:
                txt = json.dumps(json.loads(raw), ensure_ascii=False, indent=1)
            except json.JSONDecodeError:
                txt = raw
        else:
            txt = raw
    txt = re.sub(r"\n{3,}", "\n\n", txt).strip()
    if len(txt) > MAX_CHARS:
        keep = MAX_CHARS // 2
        print(f"  ! {p.name}: {len(txt):,} characters - keeping the first and last {keep:,}")
        txt = txt[:keep] + "\n[... middle of the document omitted ...]\n" + txt[-keep:]
    return txt


# ------------------------------------------------------------------------------------------
# images
# ------------------------------------------------------------------------------------------
def _ask(prompt: str) -> str:
    try:
        return input(prompt).strip().strip('"')
    except EOFError:
        return ""


def resolve_images(spec: list[dict], image_args: dict, interactive: bool):
    """Fill image slots: case-study screenshots and photos of people who are not in the official roster."""
    given = {k.lower(): v for k, v in image_args.items()}

    def pick(key: str, label: str):
        path = given.get(key.lower())
        if path and Path(path).exists():
            return path
        if path:
            print(f"  ! image not found: {path}")
        if interactive and sys.stdin.isatty():
            ans = _ask(f"  -> {label}\n     path to an image file (Enter = placeholder): ")
            if ans and Path(ans).exists():
                return ans
            if ans:
                print("     file not found - using a placeholder")
        return None

    n_case = 0
    for sl in spec:
        lay = sl["layout"]
        if lay == "case_study":
            n_case += 1
            if not (sl.get("image") and Path(sl["image"]).exists()):
                key = "case_study" if n_case == 1 else f"case_study{n_case}"
                img = pick(key, f"Case study '{sl.get('title', '')[:60]}' needs a product screenshot (820 x 600 px)")
                sl["image"] = img or ""
        for fld in ("people", "contacts"):
            if lay in ("team", "closing", "who_we_are") and isinstance(sl.get(fld), list):
                for i, p in enumerate(sl[fld]):
                    name = p if isinstance(p, str) else p.get("name", "")
                    if name in bp.ROSTER:
                        continue
                    rec = {"name": name} if isinstance(p, str) else dict(p)
                    if not rec.get("photo"):
                        img = pick(name, f"'{name}' is not in the Borek roster - photo needed (square, >= 300 px)")
                        if img:
                            rec["photo"] = img
                    sl[fld][i] = rec


# ------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pitch", action="append", default=[], help="pitch / offer description file (repeatable)")
    ap.add_argument("--client", action="append", default=[], help="client profile file (repeatable)")
    ap.add_argument("--transcript", action="append", default=[], help="call / meeting transcript file (repeatable)")
    ap.add_argument("--text", action="append", default=[], help="free text input (repeatable)")
    ap.add_argument("--text-file", action="append", default=[], help="free text from a file (repeatable)")
    ap.add_argument("--form", help="JSON with the intake-form fields (see examples/first_deck_form.json)")
    ap.add_argument("--image", action="append", default=[], metavar="KEY=PATH",
                    help="image for a slot: case_study=shot.png  |  'Person Name=photo.png'")
    ap.add_argument("--lang", choices=["EN", "DE", "en", "de"], default="EN")
    ap.add_argument("--audience", help="e.g. 'client – CFO and head of operations'")
    ap.add_argument("--slides", type=int, help="target / maximum number of slides")
    ap.add_argument("--structure", help="layout order, e.g. 'cover,who_we_are,contrast,offers,packages,closing'")
    ap.add_argument("--contacts", help="closing-slide contacts, comma separated official names")
    ap.add_argument("--no-f2", action="store_true", help="do not force the fixed 'Who we are' slide")
    ap.add_argument("--spec", help="skip the LLM: use this plan (.json or the text format of deck_text.py)")
    ap.add_argument("--prompt-only", action="store_true", help="write the LLM prompt to <output>.prompt.txt and stop")
    ap.add_argument("--provider", choices=["auto", "anthropic", "openai"], default="auto")
    ap.add_argument("--model")
    ap.add_argument("--no-interactive", action="store_true", help="never ask for files, use placeholders")
    ap.add_argument("--template", default=str(REFERENCE) if REFERENCE.exists() else None)
    ap.add_argument("--preview", action="store_true", help="also render PNG previews")
    ap.add_argument("--list-layouts", action="store_true")
    ap.add_argument("-o", "--output", default="out/presentation.pptx")
    a = ap.parse_args()
    lang = a.lang.upper()

    if a.list_layouts:
        for k, v in bp.LAYOUT_DOCS.items():
            print(f"{k:14s} {v}")
        return 0

    out = Path(a.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    contacts = [c.strip() for c in a.contacts.split(",")] if a.contacts else None

    # ---- 1. the plan ---------------------------------------------------------------------
    if a.form and not a.spec:       # form may set language before planning
        lang = str(json.loads(Path(a.form).read_text(encoding="utf-8-sig")).get("options", {}).get("lang", lang)).upper()
    if a.spec:
        spec = deck_text.load_spec(a.spec)
    else:
        mats = {}
        for key, files in (("Pitch brief", a.pitch), ("Client profile", a.client), ("Call transcript", a.transcript),
                           ("Additional notes (files)", a.text_file)):
            if files:
                mats[key] = "\n\n".join(f"--- {Path(f).name} ---\n{read_source(f)}" for f in files)
        if a.text:
            mats["Additional notes"] = "\n\n".join(a.text)
        if a.form:
            fm = json.loads(Path(a.form).read_text(encoding="utf-8-sig"))
            ci, pi = fm.get("client_information", {}), fm.get("pitch_information", {})
            opt = fm.get("options", {})
            lang = str(opt.get("lang", lang)).upper()
            a.audience = a.audience or opt.get("audience")
            a.slides = a.slides or opt.get("slides")
            client = [f"Client name: {ci.get('client_name', '')}", f"Website: {ci.get('website', '')}",
                      f"Point of contact: {ci.get('point_of_contact', '')} ({ci.get('poc_position', '')})",
                      f"Background: {ci.get('relevant_client_information', '')}"]
            mats["Client profile"] = "\n".join(x for x in client if x.split(": ", 1)[-1].strip(" ()"))
            pitch = [f"Sales opportunity: {pi.get('sales_opportunity', '')}"]
            if pi.get("additional_opportunity_information"):
                pitch.append(f"Additional opportunity information: {pi['additional_opportunity_information']}")
            files = [str((Path(a.form).parent / f)) for f in pi.get("pitch_files", [])]
            if files:
                pitch.append("\n\n".join(f"--- {Path(f).name} ---\n{read_source(f)}" for f in files))
            mats["Pitch brief"] = "\n".join(pitch)
            if pi.get("notes"):
                mats["Sales notes"] = pi["notes"]
        if not mats:
            ap.error("give at least one of --pitch / --client / --transcript / --text / --text-file, or --spec")
        import llm_planner
        system, user = llm_planner.build_prompt(mats, a.slides, lang, a.structure, a.audience, contacts)
        if a.prompt_only:
            pf = out.with_suffix(".prompt.txt")
            pf.write_text("##### SYSTEM #####\n" + system + "\n\n##### USER #####\n" + user, encoding="utf-8")
            print(f"prompt written to {pf}\nPaste it into a chat model, save the JSON answer as plan.json and run:\n"
                  f"  python make_master_deck.py --spec plan.json -o {out}")
            return 0
        print(f"reading {sum(len(v) for v in mats.values()):,} characters of source material")
        try:
            spec = llm_planner.plan_deck(mats, a.slides, lang, a.structure, a.audience, contacts, a.provider, a.model,
                                         ensure_f2=not a.no_f2)
        except RuntimeError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1

    if isinstance(spec, dict):
        spec = spec.get("slides", [])
    if contacts:
        for sl in spec:
            if sl["layout"] == "closing":
                sl["contacts"] = contacts

    # ---- 2. images -----------------------------------------------------------------------
    image_args = {}
    for it in a.image:
        if "=" not in it:
            ap.error(f"--image expects KEY=PATH, got {it!r}")
        k, v = it.split("=", 1)
        image_args[k.strip()] = v.strip().strip('"')
    resolve_images(spec, image_args, interactive=not a.no_interactive)

    # ---- 3. render -----------------------------------------------------------------------
    plan_file = out.with_suffix(".plan.json")
    plan_file.write_text(json.dumps({"slides": spec}, indent=2, ensure_ascii=False), encoding="utf-8")
    if lang == "DE":
        print("  note: the bundled world map has English labels (no German map file in the master assets)")
    warnings = bp.build_deck(spec, out, template=a.template, footer_text=FOOTERS[lang])
    for i, w in warnings:
        print(f"  warning slide {i} ({spec[i - 1]['layout']}): {w}")
    print(f"OK  {len(spec)} slides -> {out}\n    plan saved to {plan_file}  (edit + re-run with --spec)")
    if a.preview:
        import preview_pptx
        preview_pptx.render(str(out), str(out.with_suffix("")) + "_preview", contact=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
