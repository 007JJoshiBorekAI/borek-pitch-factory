"""
llm_planner.py - turns raw material (pitch brief, client profile, call transcript, notes) into a slide spec
that borek_pptx.build_deck can render.

Providers (plain HTTPS, no extra packages):
    ANTHROPIC_API_KEY  (+ optional ANTHROPIC_MODEL)
    OPENAI_API_KEY     (+ optional OPENAI_MODEL, OPENAI_BASE_URL for Azure/Ollama/other compatible servers)

No API key?  Use  --prompt-only  to write the prompt, paste it into any chat model, save the JSON answer
and feed it back with  --spec answer.json.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

import borek_pptx as bp

STANDARD_RECIPE = """Standard sales / product deck (adapt to the brief, a layout may be repeated or skipped):
 cover -> who_we_are (FIXED, always right after the cover) -> contrast / four_cards (why now, problem) -> matrix (market gap)
 -> offers (the entry) -> pillars (why us) -> divider per section followed by its detail layouts
 (process, matrix_notes, data_table, big_number, flow_facts, faq, two_models, phased, packages, capabilities,
 certificates, options, price_tables, case_study) -> team / locations (optional) -> closing (always last)."""

RULES = """You are the presentation designer of Borek Solutions Group. You fill the slide layouts of the
"Borek Master Presentation" with content. You NEVER invent a new layout, you NEVER change the design.

OUTPUT: one JSON object {"slides":[ {"layout": "<name>", ...fields...}, ... ]} and nothing else (no prose, no code fence).

CONTENT RULES
- Use only facts, numbers, prices, names and quotes that appear in the SOURCE MATERIAL or in the fixed Borek facts below.
  If something is missing, leave the field out or write a neutral phrase - never make up figures, customers or prices.
  Illustrative numbers must be labelled "EXAMPLE · ILLUSTRATIVE" (EN) / "BEISPIEL · ILLUSTRATIV" (DE).
- Tailor the story to the client: their industry, their pains and goals from the profile and the transcript;
  reuse their own words (short quotes) where it helps. Plain language, one idea per sentence, no buzzwords.
- Kickers are short (1-4 words). Slide titles state ONE key message: max 2 lines (about 34 characters per line);
  layouts marked (1 line) allow max ~38 characters. Lead texts: max 2 lines. Card texts: max ~120 characters,
  bullets: max ~65 characters, stat values: max ~8 characters.
- Respect the item counts of every layout (e.g. 4 cards = exactly 4). Fill every field of a layout you use.
- Team members / contacts: use ONLY these official names (exact spelling), never invent people:
  %(roster)s
- Prices: "net, excl. VAT · indicative" (EN) / "netto, zzgl. MwSt. · Richtpreise" (DE). Currency EN: €8,600 - DE: 8.600 €.
- who_we_are is a FIXED slide (history, locations, management, client logos): include it unchanged as slide 2: {"layout":"who_we_are"}.
- case_study: set "image": "" (the user supplies the screenshot separately).
- cover: kicker_right "Family-owned since 1781" (EN) / "Familiengeführt seit 1781" (DE), kicker "Borek <unit> · <subtitle>",
  title with "\\n" between the two lines, intro max 3 lines, 0-3 columns.
- closing: title "Let’s talk" (EN) / "Sprechen wir" (DE), contacts (<= 4 official names), tagline one sentence.
- Language EN: "you"; DE: formal "Sie", quotes „…“, section kicker "Abschnitt 01 · Produkt".

FIXED BOREK FACTS (may be used freely)
- Family-owned since 1781, 7th generation; 250+ employees at four locations: Braunschweig (HQ, Germany), Prishtina (AI-Hub, Kosovo),
  Bulgaria (AI-Hub), Vadodara (AI-Operations-Hub, India). ISO 27001, TISAX, GDPR, EU hosting, no model training on client data.
- Products: Borek AI Suite (capture, build, operate - licence + setup), Borek AI Projects (fixed price, Tier 1-4, from EUR 20,000),
  Borek AI Department (permanent team from the hub, from EUR 8,600 per month, 3 months notice). Own AI Academy (3 months + exam).

%(recipe)s

AVAILABLE LAYOUTS (field reference)
%(layouts)s
"""


def build_prompt(materials: dict, max_slides: int | None, lang: str, structure: str | None, audience: str | None,
                 contacts: list[str] | None, n_slides_hint: int | None = None, extra_rules: str | None = None):
    layouts = "\n".join(f"- {k}: {v}" for k, v in bp.LAYOUT_DOCS.items())
    system = RULES % {"roster": ", ".join(bp.ROSTER), "recipe": STANDARD_RECIPE, "layouts": layouts}
    if extra_rules and extra_rules.strip():
        # caller-specific rules (e.g. the backend's pre-/post-meeting prompts) win over the generic rules above
        system += "\nADDITIONAL RULES FOR THIS DECK (these override any conflicting rule above)\n" + extra_rules.strip() + "\n"
    parts = []
    for title, body in materials.items():
        if body and body.strip():
            parts.append(f"===== {title.upper()} =====\n{body.strip()}")
    brief = [f"Language: {lang}"]
    if audience:
        brief.append(f"Audience: {audience}")
    if max_slides:
        brief.append(f"Length: at most {max_slides} slides in total (cover and closing included)")
    elif n_slides_hint:
        brief.append(f"Length: about {n_slides_hint} slides")
    if structure:
        brief.append(f"Structure (layout order to follow): {structure}")
    if contacts:
        brief.append("Contacts on the closing slide: " + ", ".join(contacts))
    user = ("Build the presentation described below.\n\n" + "\n".join(brief) + "\n\n" + "\n\n".join(parts) +
            "\n\nReturn the JSON object now.")
    return system, user


# ------------------------------------------------------------------------------------------
def _post(url, headers, payload, timeout=300):
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"LLM request failed: HTTP {e.code} {e.read().decode('utf-8', 'ignore')[:500]}")


def call_llm(system: str, user: str, provider: str = "auto", model: str | None = None) -> str:
    ak, ok = os.environ.get("ANTHROPIC_API_KEY"), os.environ.get("OPENAI_API_KEY")
    if provider == "auto":
        provider = "anthropic" if ak else ("openai" if ok else "")
    if provider == "anthropic":
        if not ak:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        out = _post("https://api.anthropic.com/v1/messages",
                    {"x-api-key": ak, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    {"model": model or os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5"), "max_tokens": 16000,
                     "system": system, "messages": [{"role": "user", "content": user}]})
        return "".join(b.get("text", "") for b in out["content"])
    if provider == "openai":
        if not ok:
            raise RuntimeError("OPENAI_API_KEY is not set")
        base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        out = _post(f"{base}/chat/completions", {"Authorization": f"Bearer {ok}", "content-type": "application/json"},
                    {"model": model or os.environ.get("OPENAI_MODEL", "gpt-4o"),
                     "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                     "response_format": {"type": "json_object"}})
        return out["choices"][0]["message"]["content"]
    raise RuntimeError("No LLM configured: set ANTHROPIC_API_KEY or OPENAI_API_KEY, or use --prompt-only / --spec.")


def extract_json(reply: str):
    t = reply.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.S)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", t, flags=re.S)
        if not m:
            raise ValueError("the model reply contains no JSON object")
        return json.loads(m.group(0))


def normalise(data, max_slides=None, ensure_f2=True) -> list[dict]:
    slides = data["slides"] if isinstance(data, dict) else data
    out = []
    for sl in slides:
        if sl.get("layout") not in bp.LAYOUTS:
            print(f"  ! skipping unknown layout {sl.get('layout')!r}")
            continue
        out.append(sl)
    if not out:
        raise ValueError("no usable slides in the plan")
    if out[0]["layout"] != "cover":
        out.insert(0, {"layout": "cover", "title": "Borek Solutions Group"})
    if ensure_f2 and not any(s["layout"] == "who_we_are" for s in out):
        out.insert(1, {"layout": "who_we_are"})
    if out[-1]["layout"] != "closing":
        out.append({"layout": "closing"})
    if max_slides and len(out) > max_slides:
        print(f"  ! plan has {len(out)} slides, trimming to {max_slides} (closing kept)")
        out = out[:max_slides - 1] + [out[-1]]
    return out


def plan_deck(materials: dict, max_slides: int | None = None, lang: str = "EN", structure: str | None = None,
              audience: str | None = None, contacts: list[str] | None = None, provider: str = "auto",
              model: str | None = None, preset: str | None = None, ensure_f2: bool = True,
              llm=None, extra_rules: str | None = None) -> list[dict]:
    """Materials -> normalised slide spec.

    llm:         optional callable (system, user) -> reply text. The Borek backend injects its own transport so every
                 call is egress-filtered and logged; the CLI scripts leave it None and use call_llm (plain HTTPS).
    extra_rules: extra prompt rules appended to the system prompt (see build_prompt).
    """
    system, user = build_prompt(materials, max_slides, lang, structure, audience, contacts, extra_rules=extra_rules)
    print("  asking the model for a slide plan ...")
    reply = llm(system, user) if llm is not None else call_llm(system, user, provider, model)
    return normalise(extract_json(reply), max_slides, ensure_f2)
