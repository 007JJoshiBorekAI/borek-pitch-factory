"""
deck_text.py - plain-text deck description  ->  slide spec (list of dicts) for borek_pptx.build_deck

Format (one block per slide, blocks start with  === <layout>  ):

    === contrast
    kicker: Why now
    title: In three to five years your competitor is an autonomous company
    lead: Every company will have to automate ...
    left.label: Attackers
    left.title: AI-native attackers
    left.bullets[]: Automated from day one
    left.bullets[]: Small teams, machine speed
    statement.kicker: The question
    statement.text: The question is not whether you automate.

    === four_cards
    cards[].title: Resource scarcity          <- "[]" appends to a list; a new element starts
    cards[].text: AI engineers are scarce ...      when a field repeats
    cards[].title: Consultants deliver slides
    cards[].text: ...

Rules
  * `key: value`, dotted paths for nesting, `name[]` = append to list, `\\n` inside a value = line break.
  * A line that starts with whitespace continues the previous value.
  * Lines starting with `#` and blank lines are ignored.
  * `rows[]: a | b | c` and `locations[]: a | b` append a list of cells (pipe separated).
  * `headers`, `columns`, `options`, `steps`, `people`, `contacts`, `cells`: `a | b | c` becomes a list.
  * Any layout name from borek_pptx.LAYOUTS is allowed (cover, who_we_are, contrast, four_cards, ...).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

PIPE_LIST_KEYS = {"headers", "columns", "options", "steps", "people", "contacts", "cells", "bullets"}
LIST_OF_LIST_KEYS = {"rows", "locations"}
NUMERIC_KEYS = {"highlight", "pct"}
BOOL_KEYS = {"on", "long_roles"}

_TOKEN = re.compile(r"^([A-Za-z_]\w*)(\[(\d*)\])?$")


def _convert(key, value):
    value = value.replace("\\n", "\n")
    if key in NUMERIC_KEYS:
        try:
            f = float(value)
            return int(f) if f.is_integer() and key == "highlight" else f
        except ValueError:
            return value
    if key in BOOL_KEYS:
        return value.strip().lower() in ("1", "true", "yes", "on")
    return value


def _set(root: dict, path: str, raw: str):
    toks = path.split(".")
    node = root
    for i, tok in enumerate(toks):
        m = _TOKEN.match(tok)
        if not m:
            raise ValueError(f"bad key '{path}'")
        name, is_list, idx = m.group(1), m.group(2), m.group(3)
        last = i == len(toks) - 1
        if not is_list:
            if last:
                if name in PIPE_LIST_KEYS and " | " in raw:
                    node[name] = [p.strip() for p in raw.split("|")]
                else:
                    node[name] = _convert(name, raw)
            else:
                node = node.setdefault(name, {})
            continue
        lst = node.setdefault(name, [])
        if last:
            if name in LIST_OF_LIST_KEYS or (name in PIPE_LIST_KEYS and " | " in raw and False):
                lst.append([p.strip() for p in raw.split("|")])
            else:
                lst.append(_convert(name, raw))
            return
        nt = _TOKEN.match(toks[i + 1])
        nxt = nt.group(1)
        if idx:                                   # explicit 1-based index
            k = int(idx) - 1
            while len(lst) <= k:
                lst.append({})
            node = lst[k]
        else:                                     # a repeated scalar field starts the next element
            if not lst or (not nt.group(2) and nxt in lst[-1]):
                lst.append({})
            node = lst[-1]


def parse_text(text: str) -> list[dict]:
    slides: list[dict] = []
    cur = None
    last = None                                    # (path, raw) of the last key, for continuation lines
    pending: list = []

    def flush():
        nonlocal last
        if cur is not None and last:
            _set(cur, last[0], last[1].strip())
        last = None

    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#") and not line.startswith(" "):
            continue
        m = re.match(r"^===\s*([A-Za-z_]\w*)\s*$", line)
        if m:
            flush()
            cur = {"layout": m.group(1)}
            slides.append(cur)
            continue
        if cur is None:
            raise ValueError(f"text before the first '=== layout' line: {line[:60]!r}")
        if line[0] in " \t" and last:
            last = (last[0], last[1] + " " + line.strip())
            continue
        m = re.match(r"^([A-Za-z_][\w\[\]\.]*)\s*:\s*(.*)$", line)
        if not m:
            raise ValueError(f"cannot parse line: {line[:80]!r}")
        flush()
        last = (m.group(1), m.group(2))
    flush()
    return slides


def load_spec(path) -> list[dict]:
    p = Path(path)
    raw = p.read_text(encoding="utf-8-sig")
    if p.suffix.lower() == ".json":
        data = json.loads(raw)
        return data["slides"] if isinstance(data, dict) else data
    return parse_text(raw)


if __name__ == "__main__":
    import sys
    print(json.dumps(load_spec(sys.argv[1]), indent=2, ensure_ascii=False))
